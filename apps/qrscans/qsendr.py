"""QSendr: a room on this laptop where phones and the laptop pass files and text to each other, by QR code.

    py qsendr.py [files...] [--port 8000] [--ip 192.168.43.10] [--minutes 30] [--max-mb 2048]
    py qsendr.py --install-sendto      adds QSendr to Explorer's right-click "Send to" menu

Opens a control page in your browser. Phones scan its QR code, then send and download.
Files go phone -> laptop -> phone; the phones never talk to each other directly.
"""
import argparse
import functools
import glob
import http.cookies
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

import segno

IDLE_MINUTES = 10
SHARE_MINUTES = 10  # the main screen's one-file QR closes after this
SHARE_BYTES = 100 * 1024 * 1024  # largest file for the main screen's QR
MAX_PIN_TRIES = 5
SPARE_BYTES = 200 * 1024 * 1024  # disk space left free after an upload
MAX_TEXT = 100_000
MAX_PREVIEW = 15 * 1024 * 1024  # images up to this size are shown as thumbnails (the original file; no resizing)
CHUNK = 1024 * 1024
UPLOAD_STALL = 15  # seconds without data before an upload is paused (kept, so the phone can resume it)
RUNNING = os.path.join(tempfile.gettempdir(), "qsendr.json")  # how a second launch finds the one already running
TEMP_PREFIX = "qsendr-room-"
# Opening one of these runs code. QSendr flags them and never opens anything itself.
RISKY = {".exe", ".bat", ".cmd", ".com", ".msi", ".msix", ".appx", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse",
         ".wsf", ".wsh", ".scr", ".pif", ".lnk", ".reg", ".hta", ".cpl", ".msc", ".jar", ".dll", ".iso", ".img", ".vhd"}
RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}
PREVIEWABLE = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".avif", ".heic"}


class Ended(Exception):
    """The room is closed, or this is an old room's link."""


def local_ip():
    """The address other devices on the network reach this laptop at."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))  # UDP connect sends nothing; it only picks the outgoing interface
            return s.getsockname()[0]
        except OSError:
            return socket.gethostbyname(socket.gethostname())


def safe_name(name):
    """A file name from a phone, made safe to save on Windows: no folders, no reserved names or characters."""
    name = re.split(r"[\\/]", str(name))[-1]
    name = re.sub(r'[\x00-\x1f<>:"|?*]', "_", name).strip(" .")
    root, ext = os.path.splitext(name)
    name = root[:120] + ext[:20]
    if not name or name.split(".")[0].upper() in RESERVED:
        name = "_" + name if name else "file"
    return name


def is_inside(path, folder):
    try:
        folder = os.path.abspath(folder)
        return os.path.commonpath([os.path.abspath(path), folder]) == folder
    except ValueError:  # different drives
        return False


def unique_path(folder, name):
    root, ext = os.path.splitext(name)
    path, n = os.path.join(folder, name), 2
    while os.path.exists(path):
        path, n = os.path.join(folder, f"{root} ({n}){ext}"), n + 1
    assert is_inside(path, folder)
    return path


def mark_from_internet(path):
    """Give a received file Windows' "came from the internet" mark, as a browser download would get."""
    if os.name == "nt":
        try:
            with open(path + ":Zone.Identifier", "w") as f:
                f.write("[ZoneTransfer]\r\nZoneId=3\r\n")
        except OSError:
            pass  # not NTFS (a FAT USB stick); QSendr's own program-file warning still shows


def is_risky(name):
    return os.path.splitext(name)[1].lower() in RISKY


def disposition(kind, name):
    """Content-Disposition with a plain fallback name for old browsers and the exact UTF-8 name for the rest."""
    plain = re.sub(r'[^\x20-\x7e]|["\\]', "_", name)
    return f"{kind}; filename=\"{plain}\"; filename*=UTF-8''{quote(name)}"


def clean_temp():
    """Deletes temporary room folders, including any left by a QSendr that was closed by force."""
    for d in glob.glob(os.path.join(tempfile.gettempdir(), TEMP_PREFIX + "*")):
        shutil.rmtree(d, ignore_errors=True)


# Network help

NETWORK_PS = r"""
$ErrorActionPreference = 'SilentlyContinue'
[pscustomobject]@{
  addresses = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
                Select-Object IPAddress, InterfaceAlias)
  profiles = @(Get-NetConnectionProfile | Select-Object Name, InterfaceAlias, @{ n = 'Category'; e = { "$($_.NetworkCategory)" } })
  rules = @(Get-NetFirewallApplicationFilter -Program 'EXE' | Get-NetFirewallRule | Where-Object { "$($_.Direction)" -eq 'Inbound' } |
            Select-Object @{ n = 'Enabled'; e = { "$($_.Enabled)" } }, @{ n = 'Action'; e = { "$($_.Action)" } }, @{ n = 'Profile'; e = { "$($_.Profile)" } })
} | ConvertTo-Json -Depth 3 -Compress
"""


def network_info():
    """This laptop's addresses, network names and categories, and firewall rules for this Python, from Windows.
    {} elsewhere or if Windows won't say. Takes a few seconds, so it runs in the background."""
    if os.name != "nt":
        return {}
    script = NETWORK_PS.replace("EXE", sys.executable.replace("'", "''"))
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], capture_output=True,
                             text=True, timeout=30, creationflags=subprocess.CREATE_NO_WINDOW).stdout
        info = json.loads(out)
        return info if isinstance(info, dict) else {}
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {}


def as_list(x):
    return x if isinstance(x, list) else [x] if isinstance(x, dict) else []


def addresses(info, current):
    """[(ip, label)] a phone might reach this laptop at, the current one first."""
    found = [(a.get("IPAddress"), a.get("InterfaceAlias") or "") for a in as_list(info.get("addresses"))]
    if not found:
        try:
            found = [(ip, "") for ip in dict.fromkeys(i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET))
                     if not ip.startswith(("127.", "169.254."))]
        except OSError:
            found = []
    names = {p.get("InterfaceAlias"): p.get("Name") for p in as_list(info.get("profiles"))}
    out = []
    for ip, alias in found:
        label = " · ".join(x for x in [alias, names.get(alias)] if x)
        if ip.startswith("192.168.137."):
            label = "This laptop's hotspot"  # Windows Mobile Hotspot always uses this range
        out.append((ip, label))
    out.sort(key=lambda a: a[0] != current)
    if current and current not in [ip for ip, _ in out]:
        out.insert(0, (current, ""))
    return out


def assess(info, ip, phone_seen):
    """Plain-language findings about why a phone might not reach this laptop: [(level, text, fix or "")]."""
    alias = next((a.get("InterfaceAlias") for a in as_list(info.get("addresses")) if a.get("IPAddress") == ip), None)
    profile = next((p for p in as_list(info.get("profiles")) if p.get("InterfaceAlias") == alias), {})
    network, category = profile.get("Name"), profile.get("Category")
    found = []
    if phone_seen:
        found.append(("ok", "A phone has reached this laptop, so the network and firewall let phones in.", ""))
    if category == "Public":
        found.append(("warn", f'Windows treats "{network}" as a public network. On shared Wi-Fi others could watch the '
                              "transfers, so prefer your phone's hotspot. If this is your own Wi-Fi, set it to Private.", "network"))
    elif category:
        found.append(("ok", f'Connected to "{network}" ({"private" if category == "Private" else "work"} network).', ""))
    zone = {"DomainAuthenticated": "Domain"}.get(category, category)
    rules = [r for r in as_list(info.get("rules")) if r.get("Enabled") == "True"
             and (r.get("Profile") == "Any" or (zone and zone in str(r.get("Profile"))))]
    if any(r.get("Action") == "Block" for r in rules):
        found.append(("bad", "Windows Firewall blocks Python on this network (often from choosing Cancel when it asked). "
                             "Allow Python in the firewall's allowed apps, for this network type.", "firewall"))
    elif any(r.get("Action") == "Allow" for r in rules):
        found.append(("ok", "Windows Firewall lets Python accept phones on this network.", ""))
    elif info and not phone_seen:
        found.append(("warn", "Windows Firewall has no rule for Python on this network yet. If Windows asks, choose Allow. "
                              "If it doesn't ask and phones can't connect, allow Python in the firewall's allowed apps.", "firewall"))
    if len(as_list(info.get("addresses"))) > 1:
        found.append(("info", "This laptop has more than one network address. If the phone can't open the page, try another under Address.", ""))
    found.append(("info", "Check the phone is on the same Wi-Fi as the laptop. Some Wi-Fi (schools, hotels, cafés) keeps "
                          "devices apart; then use your phone's hotspot and connect the laptop to it.", ""))
    return network, category, found


def open_settings(what):
    """Opens the Windows page that fixes a finding. Shows settings only; changes nothing itself."""
    if os.name != "nt":
        return
    if what == "firewall":
        subprocess.Popen(["control.exe", "/name", "Microsoft.WindowsFirewall", "/page", "pageConfigureApps"])
    elif what == "network":
        os.startfile("ms-settings:network-status")


def wifi_svg(ssid, password):
    """The QR that phone cameras read as "join this Wi-Fi"."""
    esc = lambda s: re.sub(r'([\\;,:"])', r"\\\1", str(s))
    kind = "WPA" if password else "nopass"
    return segno.make(f"WIFI:T:{kind};S:{esc(ssid)};P:{esc(password)};;", error="m").svg_inline(border=2, omitsize=True)


@functools.lru_cache(maxsize=8)
def qr_svg(url):
    return segno.make(url, error="m").svg_inline(border=2, dark="#000", light="#fff", omitsize=True)  # viewBox only, so CSS sizes it


class Counted:
    """A writer that counts what passes through, so a transfer's progress can be shown."""

    def __init__(self, f, transfer):
        self.f, self.t = f, transfer

    def write(self, b):
        self.f.write(b)
        self.t["done"] += len(b)
        return len(b)

    def flush(self):
        self.f.flush()


class Room:
    """Who is in the room and what is on offer. One lock guards all of it."""

    def __init__(self, minutes, max_mb=2048, start_open=True):
        self.lock = threading.Lock()  # ponytail: one lock for everything; fine for a handful of phones
        self.items = {}  # id -> {"id", "kind": "file"|"text", "name", "path", "size", "text", "from_key", "from_name", "risky"}
        self.next_id = 1  # ids for items, devices and transfers
        self.log = []  # [("14:02", "text")], memory only
        self.transfers = {}  # id -> {"name", "who", "dir": "up"|"down", "done", "total", "start", "from"}
        self.base = ""  # http://<ip>:<port> that goes in the QR code
        self.netinfo = {}  # from network_info(), filled in the background
        self.phone_seen = False  # a phone has reached this laptop at least once
        self.max_bytes = max_mb * 1024 * 1024
        self.approve = True  # ask on the laptop before a new phone gets in
        self.use_pin = False
        self.autodelete = False  # take a file out of the room once someone else downloads it
        self.drop_dir = tempfile.mkdtemp(prefix=TEMP_PREFIX)  # copies of files dropped on the control page
        self.alert = None  # (title, text) -> shows a Windows notification; set by the tray
        self.share = None  # the main screen's one-file QR: {"token", "path", "name", "size", "deadline", "downloads", "copy"}
        self.notice = ""  # a one-off message for the main screen
        self.token = None
        self.devices, self.refused, self.partials, self.dir = {}, set(), {}, self.drop_dir  # until a room opens
        if start_open:
            self.open(minutes)

    @property
    def busy(self):
        return len(self.transfers)

    def _alert(self, title, text):
        if self.alert:
            try:
                self.alert(title, text)
            except Exception:  # a notification must never break the transfer it is about
                pass

    def note(self, text):
        try:
            print(text)
        except (OSError, UnicodeError):
            pass  # a console that can't show a name (an emoji) must not break the transfer it is about
        self.log = (self.log + [(time.strftime("%H:%M"), text)])[-50:]

    # Opening and closing

    def open(self, minutes):
        """Open a new room, or change when the open one closes."""
        with self.lock:
            minutes = max(1, min(int(minutes), 240))
            if not self.token:
                self.token = secrets.token_urlsafe(8)  # a new QR each time, so an old photo of it stops working
                self.devices = {}  # cookie key -> {"id", "name", "ip", "in"}
                self.refused = set()  # keys denied or removed, so their page can say so
                self.partials = {}  # upload id -> {"path", "received", "total", "key", "name", "active"}
                self.pin = f"{secrets.randbelow(10000):04d}"
                self.wrong_pins = 0
                self.dir = tempfile.mkdtemp(prefix=TEMP_PREFIX)  # uploads arrive here, and stay if not kept
                self.note("Room opened")
            self.deadline = time.time() + minutes * 60
            self.last_activity = time.time()

    def close(self, why):
        with self.lock:
            self._close(why)

    def _close(self, why):
        if not self.token:
            return
        self.token = None
        self.devices = {}
        self.partials = {}
        # The laptop's own files stay on offer for the next room; what phones sent leaves with this one.
        self.items = {i: it for i, it in self.items.items() if it["from_key"] is None and it["kind"] == "file"}
        shutil.rmtree(self.dir, ignore_errors=True)  # a file still downloading is cleaned at exit instead
        self.note(why)

    def _active(self):
        now = time.time()
        if self.token and now > self.deadline:
            self._close("Room closed: time is up")
        elif self.token and not self.busy and now > self.last_activity + IDLE_MINUTES * 60:
            self._close(f"Room closed after {IDLE_MINUTES} minutes with nothing happening")
        return self.token is not None

    def _room(self, token):
        if not self._active() or not secrets.compare_digest(token, self.token):
            raise Ended
        self.last_activity = time.time()

    # Phones

    def phone_state(self, token, key):
        with self.lock:
            self._room(token)
            d = self.devices.get(key)
            if not d:
                return {"state": "refused" if key in self.refused else "new", "pin": self.use_pin}
            if not d["in"]:
                return {"state": "waiting", "name": d["name"]}
            return {"state": "in", "name": d["name"], "id": d["id"], "max_bytes": self._max_upload(), "items": self._listing(key)}

    def _max_upload(self):
        """Largest file a phone may send now, so it can say "too big" before sending anything."""
        try:
            return max(0, min(self.max_bytes, shutil.disk_usage(self.dir).free - SPARE_BYTES))
        except OSError:
            return self.max_bytes

    def join(self, token, ip, name, pin):
        """Returns (http code, reply, cookie key for the new device or None)."""
        with self.lock:
            self._room(token)
            if self.use_pin and not secrets.compare_digest(str(pin), self.pin):
                self.wrong_pins += 1
                self.note(f"Wrong PIN from {ip} ({self.wrong_pins} of {MAX_PIN_TRIES})")
                if self.wrong_pins >= MAX_PIN_TRIES:
                    self._close(f"Room locked after {MAX_PIN_TRIES} wrong PINs. Start a new room to continue.")
                    raise Ended
                return 403, {"error": "pin", "left": MAX_PIN_TRIES - self.wrong_pins}, None
            label = re.sub(r"[\x00-\x1f]", "", str(name or "")).strip()[:30] or "Phone"
            taken = {d["name"] for d in self.devices.values()} | {"Laptop", "You"}
            name, n = label, 2
            while name in taken:
                name, n = f"{label} {n}", n + 1
            key = secrets.token_urlsafe(16)
            self.devices[key] = {"id": self.next_id, "name": name, "ip": ip, "in": not self.approve}
            self.next_id += 1
            self.note(f"{name} ({ip}) is asking to join" if self.approve else f"{name} ({ip}) joined")
            if self.approve:
                self._alert(f"{name} wants to join", "Open QSendr to let them in.")
            return 200, {"ok": True}, key

    def member(self, token, key):
        """The device behind this cookie if it is in the room, else None."""
        with self.lock:
            self._room(token)
            d = self.devices.get(key)
            return d if d and d["in"] else None

    # Items

    def _add_item(self, kind, from_key, from_name, **fields):
        it = {"id": self.next_id, "kind": kind, "from_key": from_key, "from_name": from_name,
              "risky": kind == "file" and is_risky(fields["name"]), **fields}
        self.items[it["id"]] = it
        self.next_id += 1
        return it

    def _listing(self, key=None):
        """What is in the room. `key` is the phone asking, so its own items say "You"."""
        out = []
        for it in self.items.values():
            e = {k: it.get(k) for k in ("id", "kind", "name", "size", "text", "risky")}
            e["from"] = "You" if key and it["from_key"] == key else it["from_name"]
            sender = self.devices.get(it["from_key"])
            e["from_id"] = sender["id"] if sender else 0
            e["preview"] = bool(it.get("size") and it["size"] <= MAX_PREVIEW and os.path.splitext(it["name"])[1].lower() in PREVIEWABLE)
            out.append(e)
        return out

    def add(self, paths):
        """The laptop shares files (by path; nothing is copied). Folders are not shared."""
        with self.lock:
            have = {it.get("path") for it in self.items.values()}
            for p in map(os.path.abspath, paths):
                if not os.path.isfile(p) or p in have:
                    continue
                self._add_item("file", None, "Laptop", path=p, name=os.path.basename(p), size=os.path.getsize(p))
                have.add(p)
                self.note(f"Laptop shared {os.path.basename(p)}")
            self.last_activity = time.time()

    def add_text(self, text, from_key, from_name):
        text = str(text)
        if not text.strip() or len(text) > MAX_TEXT:
            raise ValueError
        with self.lock:
            self._add_item("text", from_key, from_name, name="Text", text=text)
            self.note(f"{from_name} sent text")
            if from_key:
                self._alert(f"{from_name} sent text", text[:140])
            self.last_activity = time.time()

    def remove(self, item_id):
        with self.lock:
            self._remove(int(item_id))

    def _remove(self, item_id):
        it = self.items.pop(item_id, None)
        path = it and it.get("path")
        if path and (is_inside(path, self.dir) or is_inside(path, self.drop_dir)):  # only ever delete QSendr's own copies
            try:
                os.remove(path)
            except OSError:
                pass  # still downloading somewhere; cleaned when the room closes or at exit

    def item(self, item_id):
        with self.lock:
            it = self.items.get(int(item_id)) if str(item_id).isdigit() else None
            return dict(it) if it else None

    # Transfers

    def _track(self, name, who, direction, total, done=0, dev=0):
        t = {"id": self.next_id, "name": name, "who": who, "dir": direction, "done": done, "from": done,
             "total": total, "start": time.time(), "dev": dev}
        self.transfers[t["id"]] = t
        self.next_id += 1
        return t

    def track(self, *args):
        with self.lock:
            return self._track(*args)

    def partial(self, uid, key):
        """How much of an interrupted upload already arrived, so the phone can send only the rest."""
        with self.lock:
            p = self.partials.get(uid)
            return p["received"] if p and p["key"] == key else 0

    def begin_upload(self, uid, key, name, total, offset, who):
        """Start or resume receiving a phone's file. Returns (partial, transfer, None) or (None, None, (code, reply))."""
        with self.lock:
            p = self.partials.get(uid)
            if p is None:
                if offset:
                    return None, None, (409, {"received": 0})
                try:
                    if shutil.disk_usage(self.dir).free < total + SPARE_BYTES:
                        return None, None, (413, {"error": "The laptop is almost out of disk space."})
                    path = os.path.join(self.dir, uid + ".part")  # uid is checked to be letters and digits
                    open(path, "xb").close()
                except OSError:
                    return None, None, (500, {"error": "The laptop could not save the file."})
                p = self.partials[uid] = {"path": path, "received": 0, "total": total, "key": key, "name": name, "active": False}
            if p["key"] != key or p["total"] != total:
                return None, None, (403, {"error": "That upload belongs to someone else."})
            if p["active"]:  # the phone gave up on its last try before this side noticed; it pauses within UPLOAD_STALL
                return None, None, (409, {"received": p["received"], "busy": True})
            if p["received"] != offset:
                return None, None, (409, {"received": p["received"]})  # the phone re-sends from there
            p["active"] = True
            return p, self._track(name, who, "up", total, offset, self.devices.get(key, {}).get("id", 0)), None

    def end_upload(self, token, uid, p, t, from_name):
        """Called when a phone's upload request ends. True once the whole file is in the room."""
        with self.lock:
            p["active"] = False
            self.transfers.pop(t["id"], None)
            self.last_activity = time.time()
            if p["received"] < p["total"]:
                self.note(f"{from_name} paused sending {p['name']}")  # kept, so the phone can resume
                return False
            self.partials.pop(uid, None)
            if self.token != token:  # the room closed meanwhile
                return False
            try:
                # Stays in the room's temp folder: nothing a phone sends lands on the laptop unless the host downloads it.
                final = unique_path(self.dir, p["name"])
                shutil.move(p["path"], final)  # ponytail: under the lock; instant when temp and the folder share a drive
            except OSError:
                self.note(f"Could not save {p['name']} from {from_name}")
                return False
            mark_from_internet(final)
            it = self._add_item("file", p["key"], from_name, path=final, name=os.path.basename(final), size=p["total"])
            self.note(f"{from_name} sent {it['name']}" + (" (a program file: don't open it unless you trust them)" if it["risky"] else ""))
            self._alert(f"{from_name} sent a file", it["name"] + (" (a program file: only open it if you trust them)" if it["risky"] else ""))
            return True

    def downloaded(self, item, t, key, by, ok):
        with self.lock:
            self.transfers.pop(t["id"], None)
            self.last_activity = time.time()
            self.note(f"{by} {'downloaded' if ok else 'stopped downloading'} {item['name']}")
            if ok and self.autodelete and item["from_key"] != key and item["id"] in self.items:
                self._remove(item["id"])
                self.note(f"{item['name']} left the room after its download")

    # The main screen: one file, one QR, anyone who scans it gets the file

    def share_file(self, path, copy):
        """Shows `path` as the main screen's QR for SHARE_MINUTES. `copy`: QSendr's own copy, deleted when sharing stops."""
        with self.lock:
            self._stop_share(None)
            name = os.path.basename(path)
            self.share = {"token": secrets.token_urlsafe(8), "path": path, "name": name, "size": os.path.getsize(path),
                          "deadline": time.time() + SHARE_MINUTES * 60, "downloads": 0, "copy": copy}
            self.notice = ""
            self.note(f"Sharing {name} by QR code for {SHARE_MINUTES} minutes")

    def stop_share(self, why):
        with self.lock:
            self._stop_share(why)

    def _stop_share(self, why):
        sh, self.share = self.share, None
        if not sh:
            return
        if sh["copy"]:
            try:
                os.remove(sh["path"])
            except OSError:
                pass  # still downloading; cleaned at exit
        if why:
            self.note(why)

    def _shared(self):
        if self.share and time.time() > self.share["deadline"]:
            self._stop_share(f"Stopped sharing {self.share['name']}: {SHARE_MINUTES} minutes are up")
        return self.share

    def shared(self, token):
        """The shared file behind a scanned QR, or None once it has closed."""
        with self.lock:
            sh = self._shared()
            return dict(sh) if sh and secrets.compare_digest(token, sh["token"]) else None

    def share_downloaded(self, sh, t, ip, ok):
        with self.lock:
            self.transfers.pop(t["id"], None)
            if not ok:
                return self.note(f"A phone ({ip}) stopped downloading {sh['name']}")
            if self.share and self.share["token"] == sh["token"]:
                self.share["downloads"] += 1
            self.note(f"A phone ({ip}) downloaded {sh['name']}")
            self._alert("File sent", f"A phone downloaded {sh['name']}")

    def take(self, paths):
        """Files from the command line or Explorer's "Send to": one file goes on the main screen's QR, the rest into the room."""
        if len(paths) == 1 and os.path.isfile(paths[0]) and os.path.getsize(paths[0]) <= SHARE_BYTES:
            return self.share_file(paths[0], copy=False)
        if any(os.path.isdir(p) for p in paths):
            self.notice = "Folders can't be shared. Choose files instead."
        files = [p for p in paths if os.path.isfile(p)]
        self.add(files)
        if files:
            one_big = len(paths) == 1
            self.notice = ("That file is over 100 MB, so it" if one_big else "Those files") + " went into the Room instead (top left)."

    def laptop_downloaded(self, item, t, ok):
        with self.lock:
            self.transfers.pop(t["id"], None)
            if ok:
                self.note(f"Laptop downloaded {item['name']}")

    def dropped(self, name, read, length, limit=None):
        """Bytes of a file chosen or dropped on the control page (the browser gives bytes, not a path), kept as QSendr's copy."""
        if limit and length > limit:
            raise OverflowError
        with self.lock:
            path = unique_path(self.drop_dir, safe_name(name))
            open(path, "xb").close()
        with open(path, "wb") as f:
            left = length
            while left:
                chunk = read(min(left, CHUNK))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)
        if left:
            os.remove(path)
            raise ValueError
        return path

    # The laptop's control page

    def settings(self, s):
        with self.lock:
            for k in ("approve", "use_pin", "autodelete"):
                if k in s:
                    setattr(self, k, bool(s[k]))

    def _device(self, dev_id):
        return next(((k, d) for k, d in self.devices.items() if d["id"] == int(dev_id)), (None, None))

    def let_in(self, dev_id):
        with self.lock:
            _, d = self._device(dev_id)
            if d and not d["in"]:
                d["in"] = True
                self.note(f"{d['name']} joined")

    def kick(self, dev_id):
        with self.lock:
            k, d = self._device(dev_id)
            if d:
                del self.devices[k]
                self.refused.add(k)
                self.note(f"{d['name']} {'removed' if d['in'] else 'was not let in'}")

    def control_state(self):
        with self.lock:
            open_ = self._active()
            devices = list(self.devices.values()) if open_ else []
            if not open_:
                status = "off"
            elif self.busy:
                status = "sending"
            elif any(d["in"] for d in devices):
                status = "connected"
            else:
                status = "waiting"
            now = time.time()
            transfers = []
            for t in self.transfers.values():
                speed = (t["done"] - t["from"]) / max(now - t["start"], 0.001)
                left = (t["total"] - t["done"]) / speed if t["total"] and speed > 0 else None
                transfers.append({k: t[k] for k in ("id", "name", "who", "dir", "done", "total", "dev")} | {"speed": speed, "left": left})
            url = f"{self.base}/r/{self.token}/" if open_ else ""
            ip = urlsplit(self.base).hostname or ""
            network, category, findings = assess(self.netinfo, ip, self.phone_seen)
            return {"status": status, "url": url, "qr": qr_svg(url) if url else "",
                    "seconds_left": int(self.deadline - now) if open_ else 0, "idle_minutes": IDLE_MINUTES,
                    "pin": self.pin if open_ and self.use_pin else "",
                    "settings": {k: getattr(self, k) for k in ("approve", "use_pin", "autodelete")},
                    "devices": [{k: d[k] for k in ("id", "name", "ip", "in")} for d in devices],
                    "items": self._listing(), "transfers": transfers, "log": self.log[::-1],
                    "ip": ip, "addresses": [{"ip": a, "label": label} for a, label in addresses(self.netinfo, ip)],
                    "network": network, "category": category, "findings": findings, "checking": not self.netinfo,
                    "tray": self.alert is not None, "share": self._share_state(), "notice": self.notice,
                    "share_limit": SHARE_BYTES, "share_minutes": SHARE_MINUTES}

    def _share_state(self):
        sh = self._shared()
        if not sh:
            return None
        url = f"{self.base}/s/{sh['token']}/"
        return {"name": sh["name"], "size": sh["size"], "url": url, "qr": qr_svg(url), "downloads": sh["downloads"],
                "seconds_left": int(sh["deadline"] - time.time())}


_picking = threading.Lock()


def pick(kind):
    """Windows' own file picker, opened on this laptop."""
    import tkinter
    from tkinter import filedialog
    with _picking:
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)  # otherwise it can open behind the browser
        try:
            return [os.path.normpath(p) for p in filedialog.askopenfilenames(parent=root, title="Share files")]
        finally:
            root.destroy()


class Server(ThreadingHTTPServer):
    allow_reuse_address = os.name != "nt"  # on Windows it lets a second copy bind the same port and take its requests
    daemon_threads = True

    def quit(self):
        self.shutdown()


def make_server(room, port, secret):
    class Handler(BaseHTTPRequestHandler):
        timeout = 60  # a phone that stops mid-transfer (iPhone screen locked) frees its thread after a minute

        def do_GET(self):
            self.route("GET")

        def do_POST(self):
            self.route("POST")

        def route(self, method):
            parts = urlsplit(self.path).path.strip("/").split("/")
            ip = self.client_address[0]
            if parts == ["icon.png"] and method == "GET":
                return self.icon()
            if parts[0] == "c" and len(parts) > 1 and ip == "127.0.0.1" and secrets.compare_digest(parts[1], secret):
                return self.control(method, "/".join(parts[2:]))
            if parts[0] in ("r", "s") and len(parts) > 1 and not ip.startswith("127."):
                room.phone_seen = True
            if parts[0] == "r" and len(parts) > 1:
                return self.phone(method, parts[1], parts[2:])
            if parts[0] == "s" and len(parts) > 1 and method == "GET":
                return self.shared(parts[1], "/".join(parts[2:]), ip)
            self.send_error(404)

        def query(self, name, default=""):
            return parse_qs(urlsplit(self.path).query).get(name, [default])[0]

        def control(self, method, action):
            if method == "GET" and action == "":
                return self.send(200, CONTROL_HTML, "text/html")
            if method == "GET" and action == "state":
                return self.send_json(room.control_state())
            if method == "GET" and action.startswith("p/"):
                return self.preview(action[2:])
            if method == "GET" and action.startswith("f/"):
                item = room.item(action[2:])
                if not item or item["kind"] != "file":
                    return self.send_error(404)
                return self.stream(item["path"], item["name"], "to this laptop", lambda t, ok: room.laptop_downloaded(item, t, ok))
            if method != "POST":
                return self.send_error(404)
            try:
                if action in ("drop", "share"):
                    length = int(self.headers["Content-Length"])
                    try:
                        path = room.dropped(self.query("name"), self.rfile.read, length, SHARE_BYTES if action == "share" else None)
                    except OverflowError:
                        self.close_connection = True  # the body is not read
                        return self.send_json({"error": "That file is over 100 MB."}, 413)
                    if action == "share":
                        room.share_file(path, copy=True)
                    else:
                        room.add([path])
                    return self.send_json({"ok": True})
                body = self.json_body()
                if action == "pick":
                    room.add(pick(body.get("kind")))
                elif action == "add":
                    room.take(body["paths"])
                elif action == "unshare":
                    room.stop_share("Stopped sharing")
                elif action == "remove":
                    room.remove(body["id"])
                elif action == "text":
                    room.add_text(body["text"], None, "Laptop")
                elif action == "reveal":
                    it = room.item(body["id"])
                    if it and it.get("path") and os.name == "nt":
                        subprocess.Popen(f'explorer /select,"{it["path"]}"')  # shows it in Explorer; never opens it
                elif action == "open":
                    room.open(body.get("minutes", 30))
                elif action == "close":
                    room.close("Room closed")
                elif action == "settings":
                    room.settings(body)
                elif action == "let_in":
                    room.let_in(body["id"])
                elif action == "kick":
                    room.kick(body["id"])
                elif action == "address":
                    ip = str(body["ip"])
                    if ip not in [a for a, _ in addresses(room.netinfo, "")] + [urlsplit(room.base).hostname]:
                        raise ValueError
                    room.base = f"http://{ip}:{self.server.server_address[1]}"
                elif action == "check":
                    room.netinfo = network_info() or room.netinfo
                elif action == "fix":
                    open_settings(body["what"])
                elif action == "quit":
                    threading.Thread(target=self.server.quit, daemon=True).start()
                elif action == "wifi":
                    return self.send_json({"qr": wifi_svg(body["ssid"], body.get("password", ""))})
                else:
                    return self.send_error(404)
            except (ValueError, KeyError, TypeError, AttributeError, OSError):
                return self.send_error(400)
            self.send_json({"ok": True})

        def phone(self, method, token, rest):
            action = "/".join(rest)
            if method == "GET" and action == "":  # the page itself holds nothing secret
                return self.send(200, PHONE_HTML, "text/html")
            key = self.cookie()
            try:
                if method == "GET" and action == "state":
                    return self.send_json(room.phone_state(token, key))
                if method == "POST" and action == "join":
                    body = self.json_body()
                    code, reply, new_key = room.join(token, self.client_address[0], body.get("name"), body.get("pin"))
                    return self.send_json(reply, code, new_key and f"qsendr={new_key}; Path=/r/{token}/; HttpOnly; SameSite=Strict")
                dev = room.member(token, key)
                if not dev:
                    return self.send_json({"error": "This phone is not in the room."}, 403)
                if method == "POST" and action == "text":
                    room.add_text(self.json_body()["text"], key, dev["name"])
                    return self.send_json({"ok": True})
                if action == "upload":
                    uid = self.query("id")
                    if not re.fullmatch(r"[A-Za-z0-9]{8,64}", uid):
                        raise ValueError
                    if method == "GET":
                        return self.send_json({"received": room.partial(uid, key)})
                    return self.upload(token, key, dev, uid)
                if method == "GET" and len(rest) == 2 and rest[0] == "f":
                    return self.download(rest[1], key, dev)
                if method == "GET" and len(rest) == 2 and rest[0] == "p":
                    return self.preview(rest[1])
            except Ended:
                return self.send_json({"error": "ended"}, 410)
            except (ValueError, KeyError, TypeError, AttributeError):
                return self.send_error(400)
            self.send_error(404)

        def upload(self, token, key, dev, uid):
            """Receives a file, or the rest of one: the phone says where it starts, so a broken upload resumes."""
            name, total, offset = safe_name(self.query("name")), int(self.query("total")), int(self.query("offset", "0"))
            length = int(self.headers.get("Content-Length") or -1)
            if length != total - offset or offset < 0:
                raise ValueError
            if total > room.max_bytes:
                self.close_connection = True  # the body is not read
                return self.send_json({"error": f"Too big. The limit is {room.max_bytes // 2 ** 20} MB per file."}, 413)
            p, t, refused = room.begin_upload(uid, key, name, total, offset, f"from {dev['name']}")
            if refused:
                self.close_connection = True
                return self.send_json(refused[1], refused[0])
            try:
                self.connection.settimeout(UPLOAD_STALL)
                with open(p["path"], "ab") as f:
                    left = length
                    while left:
                        chunk = self.rfile.read1(min(left, CHUNK))  # whatever has arrived, so a stall keeps every byte
                        if not chunk:
                            break
                        f.write(chunk)
                        left -= len(chunk)
                        p["received"] += len(chunk)
                        t["done"] = p["received"]
            except OSError:
                pass  # phone stopped sending (screen locked, walked away)
            if room.end_upload(token, uid, p, t, dev["name"]):
                self.send_json({"ok": True})
            elif p["received"] >= p["total"]:
                self.send_json({"error": "The laptop could not save the file."}, 500)
            else:
                self.close_connection = True

        def shared(self, token, action, ip):
            """The main screen's QR: a page that starts the download, and the file itself."""
            if action == "":
                return self.send(200, SHARE_HTML, "text/html")
            sh = room.shared(token)
            if not sh:
                return self.send_json({"error": "ended"}, 410)
            if action == "info":
                return self.send_json({"name": sh["name"], "size": sh["size"], "seconds_left": int(sh["deadline"] - time.time())})
            if action == "file":
                return self.stream(sh["path"], sh["name"], f"to a phone ({ip})", lambda t, ok: room.share_downloaded(sh, t, ip, ok))
            self.send_error(404)

        def download(self, item_id, key, dev):
            item = room.item(item_id)
            if not item or item["kind"] != "file":
                return self.send_error(404)
            self.stream(item["path"], item["name"], f"to {dev['name']}", lambda t, ok: room.downloaded(item, t, key, dev["name"], ok), dev["id"])

        def stream(self, path, name, who, done, dev=0):
            """Sends a file. Honours Range so a broken download resumes. Calls done(transfer, finished)."""
            try:
                size = os.path.getsize(path)
            except OSError:
                return self.send_error(404)
            start, end = 0, (size - 1 if size else 0)
            m = re.fullmatch(r"bytes=(\d+)-(\d*)", self.headers.get("Range", ""))
            if m:  # resuming a broken download
                start, end = int(m[1]), min(int(m[2]) if m[2] else size - 1, size - 1)
                if start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
            self.send_response(206 if m else 200)
            self.send_header("Content-Type", mimetypes.guess_type(path)[0] or "application/octet-stream")
            self.send_header("Content-Length", str(end - start + 1 if size else 0))
            self.send_header("Accept-Ranges", "bytes")
            if m:
                self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Content-Disposition", disposition("attachment", name))
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            t = room.track(name, who, "down", size, start, dev)
            ok = False
            try:
                out = Counted(self.wfile, t)
                if size:
                    with open(path, "rb") as f:
                        f.seek(start)
                        left = end - start + 1
                        while left:
                            chunk = f.read(min(left, CHUNK))
                            if not chunk:
                                raise OSError("file shrank")
                            out.write(chunk)
                            left -= len(chunk)
                ok = not size or end == size - 1  # finished to the last byte
            except OSError:
                pass  # phone cancelled, walked away, or the file vanished
            finally:
                done(t, ok)

        def preview(self, item_id):
            """An image shown as a thumbnail. Not counted as a download."""
            it = room.item(item_id)
            if not it or it["kind"] != "file" or not it.get("size") or it["size"] > MAX_PREVIEW \
                    or os.path.splitext(it["name"])[1].lower() not in PREVIEWABLE:
                return self.send_error(404)
            try:
                with open(it["path"], "rb") as f:
                    data = f.read(MAX_PREVIEW + 1)
            except OSError:
                return self.send_error(404)
            self.send_response(200)
            self.send_header("Content-Type", mimetypes.guess_type(it["name"])[0] or "application/octet-stream")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "private, max-age=3600")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            try:
                self.wfile.write(data)
            except OSError:
                pass

        def icon(self):
            kind = "image/png"
            try:
                with open(asset("logo.png"), "rb") as f:
                    data = f.read()
            except OSError:  # qsendr.py downloaded on its own: a plain chip instead
                kind, data = "image/svg+xml", CHIP_SVG
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "max-age=86400")
            self.end_headers()
            self.wfile.write(data)

        def cookie(self):
            try:
                c = http.cookies.SimpleCookie(self.headers.get("Cookie", ""))
            except http.cookies.CookieError:
                return ""
            return c["qsendr"].value if "qsendr" in c else ""

        def json_body(self):
            n = int(self.headers.get("Content-Length") or 0)
            if n > 4 * MAX_TEXT:
                raise ValueError
            body = json.loads(self.rfile.read(n) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
            return body

        def send(self, code, body, ctype, cookie=None):
            data = body.encode()
            self.send_response(code)
            self.send_header("Content-Type", f"{ctype}; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            if cookie:
                self.send_header("Set-Cookie", cookie)
            self.end_headers()
            self.wfile.write(data)

        def send_json(self, obj, code=200, cookie=None):
            self.send(code, json.dumps(obj), "application/json", cookie)

        def log_message(self, *args):
            pass

    return Server(("0.0.0.0", port), Handler)


CHIP_SVG = (b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#730000"/>'
            b'<circle cx="20" cy="20" r="13" fill="#fff"/><circle cx="20" cy="20" r="11" fill="#0c4271"/></svg>')
FROZEN = getattr(sys, "frozen", False)  # running as QSendr.exe
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def asset(name):
    """A file shipped with QSendr: inside the exe, or next to qsendr.py."""
    return os.path.join(getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__))), name)


def launch(*args):
    """The program and arguments that start this QSendr (the exe, or Python with this script)."""
    return [sys.executable, *args] if FROZEN else [sys.executable, os.path.abspath(__file__), *args]


def fail(message):
    """Says why QSendr can't start: on the console, or in a message box when the exe has none."""
    if FROZEN and os.name == "nt":
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, message, "QSendr", 0x10)
    sys.exit(message)


def hand_off(paths, show=True):
    """If QSendr is already running, give it these files and show its control page. True if that worked."""
    try:
        with open(RUNNING) as f:
            info = json.load(f)
        control = f"http://127.0.0.1:{info['port']}/c/{info['secret']}/"
        req = urllib.request.Request(control + "add", json.dumps({"paths": paths}).encode(), method="POST")
        urllib.request.urlopen(req, timeout=3).close()
    except (OSError, ValueError, KeyError):
        return False
    if show:
        webbrowser.open(control)
    return True


def sendto_path():
    return os.path.join(os.environ["APPDATA"], "Microsoft", "Windows", "SendTo", "QSendr.lnk")


def set_sendto(on):
    """Adds or removes QSendr in Explorer's right-click "Send to" menu (a shortcut; Explorer adds the chosen files)."""
    old = sendto_path()[:-4] + ".cmd"  # what earlier versions made
    for path in [old] + ([] if on else [sendto_path()]):
        try:
            os.remove(path)
        except OSError:
            pass
    if on:
        q = lambda x: x.replace("'", "''")
        program, *args = launch()
        args = " ".join(f'"{a}"' for a in args)
        icon = sys.executable if FROZEN else asset("logo.png")
        script = (f"$s = (New-Object -ComObject WScript.Shell).CreateShortcut('{q(sendto_path())}'); $s.TargetPath = '{q(program)}'; "
                  f"$s.Arguments = '{q(args)}'; $s.IconLocation = '{q(icon if icon.endswith('.exe') else program)}'; $s.Save()")
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], check=True, capture_output=True,
                       creationflags=subprocess.CREATE_NO_WINDOW)


def startup_enabled():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.QueryValueEx(k, "QSendr")
            return True
    except OSError:
        return False


def set_startup(on):
    """Starts QSendr in the tray when Windows starts, with the room closed until you open one."""
    import winreg
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
        if on:
            winreg.SetValueEx(k, "QSendr", 0, winreg.REG_SZ, subprocess.list2cmdline(launch("--background")))
        else:
            try:
                winreg.DeleteValue(k, "QSendr")
            except FileNotFoundError:
                pass


def run_tray(room, server, control):
    """The exe's window: an icon by the clock. Blocks until Quit."""
    import pystray
    from PIL import Image

    def quit_all():
        server.shutdown()
        icon.stop()

    icon = pystray.Icon("QSendr", Image.open(asset("logo.png")), "QSendr", menu=pystray.Menu(
        pystray.MenuItem("Open QSendr", lambda: webbrowser.open(control), default=True),
        pystray.MenuItem("Start with Windows", lambda: set_startup(not startup_enabled()), checked=lambda item: startup_enabled()),
        pystray.MenuItem('Add to "Send to" menu', lambda: set_sendto(not os.path.exists(sendto_path())),
                         checked=lambda item: os.path.exists(sendto_path())),
        pystray.MenuItem("Quit", quit_all)))
    server.quit = quit_all
    room.alert = lambda title, text: icon.notify(text, title)  # Windows notifications, browser open or not
    icon.run()


def main():
    if sys.stdout:  # the exe has no console
        sys.stdout.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description="A room where phones and this laptop pass files by QR code.")
    p.add_argument("paths", nargs="*", help="files to share")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--ip", help="address to put in the QR code (default: detected)")
    p.add_argument("--minutes", type=int, default=30, help="close the room after this long (default 30)")
    p.add_argument("--max-mb", type=int, default=2048, help="largest file a phone may send, in MB (default 2048)")
    p.add_argument("--install-sendto", action="store_true", help='add QSendr to the "Send to" menu')
    p.add_argument("--tray", action="store_true", help="run with an icon by the clock instead of this console (the exe always does)")
    p.add_argument("--background", action="store_true", help="start in the tray with the room closed (used by Start with Windows)")
    a = p.parse_args()
    if a.install_sendto:
        set_sendto(True)
        return print("Added. Right-click any file > Send to > QSendr.")
    for missing in [x for x in a.paths if not os.path.exists(x)]:
        print(f"No such file: {missing}")
    paths = [os.path.abspath(x) for x in a.paths if os.path.exists(x)]
    if hand_off(paths, show=not a.background):
        return print("Added to the QSendr that is already running.")

    clean_temp()  # no other QSendr is running, so any room folder left is from one closed by force
    room = Room(a.minutes, a.max_mb, start_open=False)  # the main screen's QR needs no room; open one in Settings
    secret = secrets.token_urlsafe(16)
    try:
        server = make_server(room, a.port, secret)
    except OSError:
        fail(f"Port {a.port} is busy, so QSendr can't start. Another program is using it.\n\nTry: QSendr --port {a.port + 1}")
    port = server.server_address[1]
    room.base = f"http://{a.ip or local_ip()}:{port}"
    room.take(paths)
    threading.Thread(target=lambda: setattr(room, "netinfo", network_info()), daemon=True).start()
    with open(RUNNING, "w") as f:
        json.dump({"port": port, "secret": secret}, f)
    control = f"http://127.0.0.1:{port}/c/{secret}/"
    print(f"QSendr is running. Control page: {control}\nKeep this window open. Ctrl+C or close it to quit.\n")
    if not a.background:
        webbrowser.open(control)
    try:
        if FROZEN or a.tray or a.background:
            threading.Thread(target=server.serve_forever, daemon=True).start()
            run_tray(room, server, control)
        else:
            server.serve_forever()
    except KeyboardInterrupt:
        print("Stopped.")
    finally:
        server.server_close()
        room.close("QSendr closed")
        clean_temp()
        try:
            os.remove(RUNNING)
        except OSError:
            pass


DARK = """--accent: #ff8a9a; --bg: #0b1020; --text: #eef1f7; --muted: #a9b3c9; --edge: #55648a;
  --glass: rgba(28, 38, 68, .48); --glass-strong: rgba(34, 46, 80, .72); --glass-edge: rgba(255, 255, 255, .14);
  --line: rgba(255, 255, 255, .1); --soft: rgba(255, 255, 255, .07); --shadow: 0 12px 40px rgba(0, 0, 0, .45);
  --floor: rgba(20, 28, 52, .55); --tile: rgba(255, 255, 255, .05); --table: rgba(120, 140, 200, .22);
  --warn-bg: rgba(255, 200, 80, .16); --warn: #ffd98a; --bad-bg: rgba(255, 90, 110, .18); --bad: #ffb3bd; --ok: #6fd08f;
  --glow1: rgba(179, 38, 58, .55); --glow2: rgba(40, 70, 190, .5); --glow3: rgba(120, 60, 200, .4); --spot: rgba(255, 138, 154, .14);
  color-scheme: dark;"""

CSS = """
:root { --maroon: #8a1f2d; --accent: #8a1f2d; --navy: #1b2a4a; --bg: #eef0f6; --text: #16213a; --muted: #4f5a73; --edge: #9aa3b5;
        --glass: rgba(255, 255, 255, .55); --glass-strong: rgba(255, 255, 255, .8); --glass-edge: rgba(255, 255, 255, .8);
        --line: rgba(27, 42, 74, .12); --soft: rgba(27, 42, 74, .06); --shadow: 0 12px 40px rgba(27, 42, 74, .14);
        --floor: rgba(255, 255, 255, .42); --tile: rgba(27, 42, 74, .06); --table: rgba(27, 42, 74, .1);
        --warn-bg: #fff1c9; --warn: #6b4500; --bad-bg: #fde2e4; --bad: #8a1f2d; --ok: #1f6b3a;
        --glow1: rgba(194, 54, 75, .32); --glow2: rgba(60, 90, 200, .28); --glow3: rgba(140, 90, 220, .26); --spot: rgba(192, 52, 74, .16);
        color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { /*DARK*/ } }
:root[data-theme=dark] { /*DARK*/ }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
html { background: var(--bg); }
body { margin: 0; min-height: 100vh; color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
       padding: max(16px, env(safe-area-inset-top)) 16px max(24px, env(safe-area-inset-bottom)); }
/* The liquid background: soft brand-coloured light drifting behind the glass. */
body::before { content: ""; position: fixed; inset: -25%; z-index: -1; pointer-events: none; filter: blur(30px);
  background: radial-gradient(38% 38% at 22% 22%, var(--glow1), transparent 70%), radial-gradient(42% 42% at 80% 28%, var(--glow2), transparent 70%),
              radial-gradient(40% 40% at 52% 88%, var(--glow3), transparent 70%); }
body::after { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(460px circle at var(--mx, -999px) var(--my, -999px), var(--spot), transparent 70%); }
button, .btn, .drop { position: relative; }
.rip { position: fixed; z-index: 50; overflow: hidden; pointer-events: none; }
.rip i { position: absolute; border-radius: 50%; background: currentColor; opacity: .28; transform: scale(0); }
header { color: var(--text); padding: 4px 0; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
header h1 { margin: 0; font-size: 20px; display: flex; align-items: center; } header h1 span { color: var(--accent); }
header h1 img { width: 28px; height: 28px; margin-right: 8px; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .25)); }
section, .glass { background: var(--glass); -webkit-backdrop-filter: blur(24px) saturate(170%); backdrop-filter: blur(24px) saturate(170%);
                  border: 1px solid var(--glass-edge); box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, .3); border-radius: 22px; }
section { padding: 18px 20px; margin-bottom: 16px; }
h2 { font-size: 18px; margin: 0 0 12px; } h3 { font-size: 16px; margin: 0 0 10px; }
ul, ol { list-style: none; margin: 0; padding: 0; }
button, .btn { min-height: 44px; padding: 0 16px; border-radius: 14px; border: 1px solid var(--glass-edge); background: var(--glass-strong);
               color: var(--text); font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; -webkit-backdrop-filter: blur(12px);
               backdrop-filter: blur(12px); display: inline-flex; align-items: center; justify-content: center; gap: 8px;
               box-shadow: 0 2px 10px rgba(0, 0, 0, .06), inset 0 1px 0 rgba(255, 255, 255, .35); }
button:hover, .btn:hover { filter: brightness(1.05); }
.primary { background: linear-gradient(135deg, #8a1f2d, #c0344a); border-color: rgba(255, 255, 255, .25); color: #fff;
           box-shadow: 0 8px 22px rgba(160, 34, 52, .35), inset 0 1px 0 rgba(255, 255, 255, .35); }
.quiet { border-color: transparent; background: none; box-shadow: none; color: var(--muted); font-weight: 500; }
.quiet:hover { color: var(--text); background: var(--soft); }
.icon { min-width: 44px; padding: 0; }
button:focus-visible, .btn:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible,
summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .6; cursor: wait; }
input[type=text], input[type=password], input[inputmode], textarea, select { font: inherit; color: var(--text); background: var(--glass-strong);
               border: 1px solid var(--glass-edge); border-radius: 12px; padding: 10px 12px; }
input[type=text], input[type=password], input[inputmode], textarea { width: 100%; }
select { min-height: 42px; max-width: 100%; padding: 0 10px; }
textarea { resize: vertical; }
.muted { color: var(--muted); font-size: 14px; }
.status { font-weight: 600; font-size: 18px; margin: 0 0 12px; }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 12px; }
.item { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 12px 0; border-top: 1px solid var(--line); }
.item:first-child { border-top: 0; }
.item .name { flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere; }
.thumb { width: 52px; height: 52px; object-fit: cover; border-radius: 12px; background: var(--soft); flex: none; }
.text { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--soft); border-radius: 12px; padding: 8px 12px; margin: 4px 0 0; }
.warn { background: var(--warn-bg); color: var(--warn); border-radius: 10px; padding: 2px 8px; font-size: 14px; margin-top: 4px; display: inline-block; }
.vh { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
.qr { background: #fff; border-radius: 16px; padding: 10px; box-shadow: var(--shadow); }
.qr svg { display: block; width: 100%; height: auto; shape-rendering: crispEdges; }
.qr:fullscreen { display: flex; align-items: center; justify-content: center; } .qr:fullscreen svg { width: auto; height: 92vh; }
.shape { display: inline-block; vertical-align: middle; line-height: 0; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, .25)); }
.who { display: inline-flex; align-items: center; gap: 6px; }
progress { width: 100%; height: 12px; accent-color: var(--maroon); }
.bar { height: 8px; background: var(--soft); border-radius: 99px; overflow: hidden; }
.bar > i { display: block; height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, #8a1f2d, #e0566a); }
.spin { display: inline-block; width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent;
        border-radius: 50%; vertical-align: -3px; }
@media (prefers-reduced-motion: no-preference) {
  body::before { animation: drift 26s ease-in-out infinite alternate; }
  @keyframes drift { to { transform: translate3d(5%, -4%, 0) rotate(10deg) scale(1.06); } }
  button, .btn { transition: transform .12s, filter .12s, background .2s; } button:active, .btn:active { transform: scale(.97); }
  .enter { animation: enter .3s cubic-bezier(.2, .8, .2, 1) both; }
  @keyframes enter { from { opacity: 0; transform: translateY(8px) scale(.98); } }
  .pop { animation: pop .35s cubic-bezier(.2, .9, .3, 1.3) both; }
  @keyframes pop { from { opacity: 0; transform: scale(.85); } }
  .spin { animation: spin .7s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
  .bar > i { transition: width .4s ease; background-size: 18px 18px;
             background-image: linear-gradient(45deg, rgba(255, 255, 255, .25) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, .25) 50%,
                                rgba(255, 255, 255, .25) 75%, transparent 75%), linear-gradient(90deg, #8a1f2d, #e0566a);
             animation: stripes .7s linear infinite; }
  @keyframes stripes { to { background-position: 18px 0, 0 0; } }
  .bar.unknown > i { width: 35%; animation: stripes .7s linear infinite, slide 1.2s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
  .rip i { animation: ripple .65s ease-out forwards; }
  @keyframes ripple { to { transform: scale(1); opacity: 0; } }
  .pulse { animation: pulse 1.8s ease-out infinite; }
  @keyframes pulse { from { box-shadow: 0 0 0 0 rgba(192, 52, 74, .55); } to { box-shadow: 0 0 0 12px rgba(192, 52, 74, 0); } }
}
""".replace("/*DARK*/", DARK)

# Shared by the pages: DOM helpers, how sizes and times read, the item row, and each phone's shape and colour.
JS = r"""
const $ = (id) => document.getElementById(id);
const post = (action, body = {}) => fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const size = (n) => n < 1e6 ? Math.max(1, Math.ceil(n / 1e3)) + ' KB' : n < 1e9 ? (n / 1e6).toFixed(1) + ' MB' : (n / 1e9).toFixed(2) + ' GB';
const secs = (s) => s == null || !isFinite(s) ? '' : s < 60 ? Math.ceil(s) + ' s left' : Math.ceil(s / 60) + ' min left';
const rate = (done, total, speed) => [total ? Math.floor(100 * done / total) + '%' : size(done), speed > 0 ? size(speed) + '/s' : '', total && speed > 0 ? secs((total - done) / speed) : ''].filter(Boolean).join(' · ');
function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
function button(text, onclick, cls, label) {
  const b = el('button', text, cls); b.type = 'button'; b.onclick = onclick; if (label) b.setAttribute('aria-label', label); return b;
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  // Plain http (the phone page) has no clipboard API; a selected hidden textarea still copies.
  const t = el('textarea'); t.value = text; t.readOnly = true; t.className = 'vh'; document.body.append(t);
  t.select(); t.setSelectionRange(0, text.length);
  const ok = document.execCommand('copy'); t.remove(); return ok;
}
function copyButton(text) {
  const b = button('Copy', async () => { b.textContent = (await copyText(text)) ? 'Copied' : 'Select and copy'; setTimeout(() => (b.textContent = 'Copy'), 1500); });
  return b;
}

// A glow follows the pointer around the page, and a click or tap leaves a ripple where it landed.
const still = matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('pointermove', (e) => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
}, { passive: true });
document.addEventListener('pointerdown', (e) => {
  document.documentElement.style.setProperty('--mx', e.clientX + 'px');
  document.documentElement.style.setProperty('--my', e.clientY + 'px');
  const t = e.target.closest('button, .btn, .drop');
  if (!t || still.matches) return;
  // Drawn over the button, not inside it, so a button that changes its own text on click keeps its ripple.
  const r = t.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, rip = el('span', null, 'rip'), dot = el('i'), css = getComputedStyle(t);
  Object.assign(rip.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: css.borderRadius, color: css.color });
  Object.assign(dot.style, { width: d + 'px', height: d + 'px', left: e.clientX - r.left - d / 2 + 'px', top: e.clientY - r.top - d / 2 + 'px' });
  rip.append(dot); document.body.append(rip);
  setTimeout(() => rip.remove(), 700);
}, { passive: true });

// Every phone in a room gets its own shape and colour, picked from its id, so it looks the same everywhere.
const SHAPES = {
  circle: '<circle cx="20" cy="20" r="16"/>',
  square: '<rect x="5" y="5" width="30" height="30" rx="8"/>',
  triangle: '<path d="M20 4 36 34H4z"/>',
  diamond: '<path d="M20 3 37 20 20 37 3 20z"/>',
  hexagon: '<path d="M12 4h16l9 16-9 16H12L3 20z"/>',
  star: '<path d="m20 3 5 11 12 1.5-9 8.5 2.5 12L20 30l-10.5 6 2.5-12-9-8.5L15 14z"/>',
  pentagon: '<path d="m20 3 17 12.5-6.5 20.5h-21L3 15.5z"/>',
  drop: '<path d="M20 4c7 8 13 14 13 21a13 13 0 0 1-26 0c0-7 6-13 13-21z"/>',
};
const COLORS = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#a78bfa', '#f72585', '#fb8500', '#80ed99', '#4895ef', '#ff9f1c'];
function look(id) {
  const n = Math.imul((id + 1) ^ 0x9e3779b9, 2654435761) >>> 0, kinds = Object.keys(SHAPES);
  return { shape: kinds[n % kinds.length], color: COLORS[(n >>> 7) % COLORS.length] };
}
function shapeEl(id, px = 28) {
  const s = el('span', null, 'shape');
  if (!id) { const img = el('img'); img.src = ICON; img.alt = ''; img.width = img.height = px; s.append(img); return s; } // the laptop
  const { shape, color } = look(id);
  s.innerHTML = `<svg viewBox="0 0 40 40" width="${px}" height="${px}" aria-hidden="true"><g fill="${color}" stroke="${color}" stroke-width="2.5" stroke-linejoin="round">${SHAPES[shape]}</g>` +
    `<ellipse cx="15" cy="13" rx="6" ry="3" fill="#fff" opacity=".35" transform="rotate(-25 15 13)"/></svg>`; // shapes and colours are this page's own
  return s;
}
function itemRow(it, actions) {
  const li = el('li', null, 'item'), name = el('div', null, 'name');
  if (it.preview) {
    const img = el('img', null, 'thumb'); img.src = 'p/' + it.id; img.alt = ''; img.loading = 'lazy';
    img.onerror = () => img.remove(); // e.g. an iPhone HEIC photo on Android
    li.append(img);
  }
  const who = el('span', null, 'who muted');
  who.append(shapeEl(it.from_id, 16), it.from === 'You' ? 'You' : it.from);
  if (it.kind === 'text') name.append(who, el('p', it.text, 'text'));
  else name.append(el('div', it.name), who, el('span', ' · ' + size(it.size), 'muted'));
  if (it.risky) name.append(el('div', "⚠ Program file. Only open it if you trust who sent it.", 'warn'));
  li.append(name, ...actions);
  return li;
}
"""

# The icon's address on the laptop's own server; the phone app (a static page) points at its own file instead.
ICON_DECL = "const ICON = '/icon.png';\n"

APP_CSS = r"""header { max-width: 1180px; display: grid; grid-template-columns: 1fr auto 1fr; }
header h1 { justify-self: center; } header .end { justify-self: end; display: flex; align-items: center; gap: 10px; }
.iconbtn { position: relative; min-height: 46px; min-width: 46px; padding: 0; border-radius: 14px; }
.dot { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 9px; padding: 0 5px; font-size: 11px;
       line-height: 18px; color: #fff; background: #1f9d55; border: 2px solid var(--bg); }
.dot.ask { background: #c0344a; }
.badge { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
/* Main screen */
.home { max-width: 1040px; margin: 0 auto; min-height: calc(100vh - 140px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; }
.drop { width: min(600px, 100%); min-height: 320px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
        border: 2px dashed var(--edge); border-radius: 28px; color: var(--muted); padding: 24px; font-weight: 400; font-size: 15px; }
.drop:hover, .drop.over { border-color: var(--accent); color: var(--accent); }
.drop .big { font-size: 20px; font-weight: 600; color: var(--text); margin-top: 8px; }
.drop.busy { cursor: default; } .drop.busy .bar { width: min(420px, 100%); }
.sharecard { width: min(560px, 100%); display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; padding: 28px; margin: 0; }
.sharecard .qr { width: min(280px, 100%); margin-bottom: 16px; }
.sharecard p { margin: 0; } .fname { font-size: 20px; font-weight: 600; overflow-wrap: anywhere; }
.countdown { font-variant-numeric: tabular-nums; }
/* Panels: the Room and Settings slide over the main screen */
.panel { position: fixed; inset: 0; z-index: 10; overflow-y: auto; padding: max(16px, env(safe-area-inset-top)) 16px 32px; }
body.paneled > header, body.paneled > #home { visibility: hidden; } /* the panel sits on the bare gradient */
.panelbar { max-width: 1180px; margin: 0 auto 16px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.panelbar h2 { font-size: 24px; margin: 0; } .panelbar .end { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.pill { font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 99px; background: var(--soft); color: var(--muted); }
.pill.on { background: rgba(31, 157, 85, .16); color: var(--ok); }
.wrap { max-width: 1180px; margin: 0 auto; }
.roomgrid { display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start; }
@media (max-width: 900px) {
  .roomgrid { grid-template-columns: 1fr; }
  .roomgrid > div:last-child { order: -1; } /* on a phone: who's at the door and the QR to scan come first */
  .roomgrid .qr { max-width: 280px; margin: 0 auto; }
}
.closed { max-width: 560px; margin: 8vh auto 16px; text-align: center; padding: 32px; }
.closed svg { color: var(--accent); }
.closed h3 { font-size: 22px; margin: 12px 0 6px; }
.cta { min-height: 54px; font-size: 17px; padding: 0 28px; }
/* The lunch room, seen from above */
.lunch { position: relative; aspect-ratio: 16 / 10; border-radius: 22px; overflow: hidden; border: 1px solid var(--glass-edge);
         background-color: var(--floor); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), var(--shadow);
         background-image: linear-gradient(var(--tile) 1px, transparent 1px), linear-gradient(90deg, var(--tile) 1px, transparent 1px);
         background-size: 6.25% 10%; }
.counter { position: absolute; left: 30%; width: 40%; top: 4%; height: 15%; border-radius: 14px; display: flex; align-items: center;
           justify-content: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--muted);
           background: var(--glass-strong); border: 1px solid var(--glass-edge); box-shadow: var(--shadow); }
.counter img { width: 34px; height: 34px; }
.table { position: absolute; top: 47%; height: 13%; width: 34%; border-radius: 12px; background: var(--table); border: 1px solid var(--line); }
.bench { position: absolute; height: 3.5%; width: 30%; border-radius: 6px; background: var(--table); opacity: .7; }
.plant { position: absolute; width: 5%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #7bd88f, #2f8f4e); opacity: .85; }
.door { position: absolute; right: 2%; bottom: 0; width: 16%; padding: 2px 0; border-radius: 10px 10px 0 0; background: var(--table);
        font-size: 10px; color: var(--muted); text-align: center; line-height: 1.4; letter-spacing: .1em; text-transform: uppercase; }
.seat { position: absolute; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 2px; width: 13%;
        transition: left .8s cubic-bezier(.4, 0, .2, 1), top .8s cubic-bezier(.4, 0, .2, 1); }
.seat .label { font-size: 12px; font-weight: 600; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
               background: var(--glass-strong); border-radius: 8px; padding: 0 6px; }
.seat .kick { position: absolute; top: -8px; right: 8%; min-height: 24px; min-width: 24px; padding: 0; border-radius: 50%; font-size: 13px; opacity: 0; }
.seat:hover .kick, .seat:focus-within .kick { opacity: 1; }
.seat.waiting .label::after { content: ' ?'; }
.travel { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; box-shadow: 0 0 12px currentColor; background: currentColor; }
@media (prefers-reduced-motion: no-preference) {
  .panel:not([hidden]) { animation: panelin .28s cubic-bezier(.2, .8, .2, 1) both; }
  @keyframes panelin { from { opacity: 0; transform: translateY(14px); } }
  .seat.waiting .shape { animation: bob 1.4s ease-in-out infinite; }
  @keyframes bob { 50% { transform: translateY(-5px); } }
  .travel { animation: travel 1.4s cubic-bezier(.4, 0, .2, 1) infinite; }
  @keyframes travel { from { left: var(--x1); top: var(--y1); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } to { left: var(--x2); top: var(--y2); opacity: 0; } }
}
.travel { left: var(--x2); top: var(--y2); }
.pin { font-size: 15px; margin: 12px 0 0; text-align: center; } .pin b { font-size: 30px; letter-spacing: .25em; font-variant-numeric: tabular-nums; margin-left: 8px; }
.check { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; cursor: pointer; }
.check input { width: 20px; height: 20px; margin: 2px 0 0; flex: none; accent-color: var(--maroon); }
.composer { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.composer .textsend { flex: 1 1 260px; display: flex; gap: 8px; } .composer input { flex: 1; }
.ftype { width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center; flex: none; font-size: 11px; font-weight: 700;
         letter-spacing: .05em; color: #fff; background: linear-gradient(135deg, #1b2a4a, #3c5aa0); }
.ftype.text { background: linear-gradient(135deg, #8a1f2d, #c0344a); }
.moving li { padding: 8px 0; } .moving .bar { margin-top: 6px; }
.asks li { display: flex; align-items: center; gap: 10px; padding: 8px 0; flex-wrap: wrap; } .asks .name { flex: 1 1 120px; min-width: 0; }
/* Settings */
.settings { max-width: 720px; margin: 0 auto; }
.seg { display: inline-flex; padding: 4px; gap: 4px; border-radius: 14px; background: var(--soft); }
.seg label { cursor: pointer; } .seg input { position: absolute; opacity: 0; }
.seg span { display: inline-block; padding: 8px 16px; border-radius: 10px; font-weight: 600; font-size: 14px; color: var(--muted); }
.seg input:checked + span { background: var(--glass-strong); color: var(--text); box-shadow: 0 2px 8px rgba(0, 0, 0, .1); }
.seg input:focus-visible + span { outline: 3px solid var(--accent); }
.finding { padding: 8px 12px; border-radius: 12px; margin-top: 8px; font-size: 15px; }
.finding.bad { background: var(--bad-bg); color: var(--bad); } .finding.warn { background: var(--warn-bg); color: var(--warn); }
.finding.ok::before { content: '✓ '; color: var(--ok); font-weight: 700; } .finding.bad::before { content: '✕ '; font-weight: 700; }
.finding.warn::before { content: '⚠ '; } .finding.info { color: var(--muted); }
.finding button { min-height: 36px; margin-top: 6px; }
#log li { font-size: 14px; padding: 4px 0; } #log time { color: var(--muted); margin-right: 8px; font-variant-numeric: tabular-nums; }
details > summary { cursor: pointer; font-weight: 600; min-height: 32px; }
#wifiqr { max-width: 240px; margin-top: 12px; }
"""

APP_JS = r"""
// ---- Shared by the laptop page and the phone app: the main screen, the room and their panels. ----
// Before calling startApp(device), the page defines: act(action, body), refresh(), shareFile(file), roomAddFiles(files)
// and itemActions(item). Everything below draws from one state object `s`, whoever made it (the laptop's server or this phone).
const STATUS = { waiting: 'Open · waiting for phones', connected: 'Open', sending: 'Open · moving files', off: 'Closed' };
let shown = {};
const changed = (k, v) => { const s = JSON.stringify(v); if (shown[k] === s) return false; shown[k] = s; return true; };
const ext = (name) => (name.includes('.') ? name.split('.').pop().slice(0, 4) : 'file').toUpperCase();

const svgIcon = (size, w, d) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONS = {
  room: (n = 24) => svgIcon(n, 2, '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  gear: () => svgIcon(24, 2, '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  upload: () => svgIcon(56, 1.6, '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
  back: () => svgIcon(22, 2.2, '<path d="M15 18l-6-6 6-6"/>'),
};

// The page's fixed parts. `device` is "laptop" or "phone": whatever is hosting.
function shellHTML(device) {
  return `
<header>
  <span><button id="roombtn" class="iconbtn" type="button" aria-label="Room" aria-haspopup="dialog" aria-controls="room">${ICONS.room()}<span id="roomdot" class="dot" hidden></span></button></span>
  <h1><img src="${ICON}" alt="">Q<span>Sendr</span></h1>
  <span class="end"><span id="badge" class="badge" hidden></span>
    <button id="gear" class="iconbtn" type="button" aria-label="Settings" aria-haspopup="dialog" aria-controls="settings">${ICONS.gear()}</button></span>
</header>

<main id="home" class="home">
  <p id="notice" class="warn" role="status" hidden></p>
  <button id="drop" class="drop glass" type="button" aria-describedby="droplimit">
    ${ICONS.upload()}
    <span class="big">Click to choose a file</span>
    <span id="droplimit">or drop it here · up to 100 MB</span>
  </button>
  <input id="file" type="file" hidden>
  <div id="copying" class="drop busy glass" hidden>
    <p id="ctext" class="status" role="status"></p>
    <div id="cbarwrap" class="bar"><i id="cbar"></i></div>
  </div>
  <section id="sharing" class="sharecard" aria-labelledby="sname" hidden>
    <div id="sqr" class="qr"></div>
    <p id="sname" class="fname"></p>
    <p class="muted"><span id="smeta"></span> · <span id="sleft" class="countdown"></span></p>
    <p id="sdl" class="muted" role="status"></p>
    <div id="sbar" class="bar" style="width: min(320px, 100%); margin-top: 8px" hidden><i></i></div>
    <div class="row" style="justify-content: center; margin-top: 16px"><button id="unshare" class="primary" type="button">Close now</button>
      <button id="another" class="quiet" type="button">Share another file</button></div>
  </section>
</main>

<div id="room" class="panel" role="dialog" aria-modal="true" aria-labelledby="room-title" hidden>
  <div class="panelbar">
    <button class="iconbtn" type="button" data-close aria-label="Back to the main screen">${ICONS.back()}</button>
    <h2 id="room-title">Room</h2><span id="rstatus" class="pill"></span>
    <span class="end"><button id="rclose" type="button" hidden>Close room</button></span>
  </div>
  <div class="wrap">
    <section id="rclosed" class="closed">
      <span style="color: var(--accent)">${ICONS.room(64)}</span>
      <h3>Phones send too</h3>
      <p class="muted">Open the room when phones need to send files to this ${device} or to each other. They scan a QR code, pick a seat, and
        everyone shares across the tables. Nothing a phone sends is saved on this ${device} unless you download it.</p>
      <div class="row" style="justify-content: center"><label for="minutes">Open for</label>
        <select id="minutes"><option value="10">10 minutes</option><option value="30" selected>30 minutes</option>
          <option value="60">1 hour</option><option value="120">2 hours</option></select></div>
      <p id="rerror" class="warn" role="alert" hidden></p>
      <div class="row" style="justify-content: center"><button id="ropen" class="primary cta" type="button">Open room</button></div>
      <details style="text-align: left; margin-top: 20px"><summary>Room settings</summary><div class="rset"></div></details>
    </section>
    <div id="ropenview" class="roomgrid" hidden>
      <div>
        <div id="lunch" class="lunch" role="img" aria-label="The room from above">
          <div class="plant" style="left: 2%; top: 3%"></div><div class="plant" style="right: 2%; top: 3%"></div>
          <div class="counter"><img src="${ICON}" alt="">This ${device}</div>
          <div class="bench" style="left: 10%; top: 41%"></div><div class="bench" style="left: 10%; top: 62%"></div>
          <div class="bench" style="left: 60%; top: 41%"></div><div class="bench" style="left: 60%; top: 62%"></div>
          <div class="table" style="left: 8%"></div><div class="table" style="left: 58%"></div>
          <div class="door">door</div>
        </div>
        <section style="margin-top: 16px" aria-labelledby="items-h">
          <h2 id="items-h">On the tables</h2>
          <div class="composer">
            <button class="primary" type="button" id="addfiles">Add files</button>
            <div class="textsend"><label for="text" class="vh">Text or a link to send</label>
              <input id="text" type="text" placeholder="Text or a link to send"><button id="sendtext" type="button">Send</button></div>
          </div>
          <ul id="moving" class="moving"></ul>
          <ul id="items"></ul>
        </section>
      </div>
      <div>
        <section id="asks" class="pulse" aria-labelledby="asks-h" hidden><h3 id="asks-h">At the door</h3><ul id="asklist" class="asks"></ul></section>
        <section aria-labelledby="scan-h">
          <h3 id="scan-h">Scan to join</h3>
          <div id="rqr" class="qr"></div>
          <p id="rpin" class="pin" hidden></p>
          <p id="rleft" class="muted" style="text-align: center; margin: 10px 0 0"></p>
          <div class="row" style="justify-content: center"><button id="rfull" class="quiet" type="button">Full screen QR</button></div>
        </section>
        <section><details><summary>Room settings</summary><div class="rset"></div></details></section>
      </div>
    </div>
  </div>
</div>

<template id="rsettings">
  <label class="check"><input type="checkbox" data-setting="approve"><span>Ask me before a phone joins</span></label>
  <label class="check"><input type="checkbox" data-setting="use_pin"><span>Phones must type a 4-digit PIN</span></label>
  <label class="check"><input type="checkbox" data-setting="autodelete"><span>Take each file off the table once someone downloads it</span></label>
</template>`;
}

// ---- Header ----
function header(s) {
  const asks = s.devices.filter((d) => !d.in).length, open = s.status !== 'off';
  $('roomdot').hidden = !open && !asks;
  $('roomdot').className = 'dot' + (asks ? ' ask pulse' : '');
  $('roomdot').textContent = asks || '';
  $('roombtn').setAttribute('aria-label', asks ? `Room: ${asks} at the door` : open ? 'Room (open)' : 'Room');
  document.title = asks ? `(${asks}) QSendr` : 'QSendr';
  $('badge').hidden = !s.network;
  $('badge').textContent = s.network ? `${s.network}${s.category === 'Public' ? ' · public' : ''}` : '';
}

// ---- Main screen: one file, one QR ----
let shareEnd = 0, hadShare = null, copying = false;
function home(s) {
  const sh = s.share;
  if (hadShare && !sh) showNotice(`Stopped sharing ${hadShare}.`);
  hadShare = sh && sh.name;
  if (s.notice) showNotice(s.notice);
  $('drop').hidden = !!sh || copying;
  $('copying').hidden = !copying;
  $('sharing').hidden = !sh;
  if (!sh) return;
  if (changed('share', sh.url)) { $('sqr').innerHTML = sh.qr; $('sqr').title = sh.url; $('sharing').classList.remove('pop'); void $('sharing').offsetWidth; $('sharing').classList.add('pop'); } // SVG made by the app itself
  $('sname').textContent = sh.name;
  $('smeta').textContent = size(sh.size);
  shareEnd = Date.now() + sh.seconds_left * 1000;
  tick();
  const moving = s.transfers.filter((t) => t.who.startsWith('to a phone'));
  $('sbar').hidden = !moving.length;
  if (moving.length) $('sbar').firstChild.style.width = (100 * moving[0].done / (moving[0].total || 1)) + '%';
  $('sdl').textContent = moving.length ? `↓ Sending to ${moving.length === 1 ? 'a phone' : moving.length + ' phones'} · ${rate(moving[0].done, moving[0].total, moving[0].speed)}`
    : sh.downloads ? `✓ Downloaded ${sh.downloads === 1 ? 'once' : sh.downloads + ' times'}` : 'Scan with a phone camera to download';
}
function tick() {
  const left = Math.max(0, Math.round((shareEnd - Date.now()) / 1000));
  $('sleft').textContent = `closes in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}
function showNotice(text) { $('notice').textContent = text; $('notice').hidden = !text; }

// ---- Panels ----
let opener = null;
function openPanel(id) {
  closePanels(false);
  opener = document.activeElement;
  $(id).hidden = false; document.body.style.overflow = 'hidden'; document.body.classList.add('paneled');
  $(id).querySelector('[data-close]').focus();
}
function closePanels(refocus = true) {
  const was = ['room', 'settings'].some((id) => !$(id).hidden);
  for (const id of ['room', 'settings']) $(id).hidden = true;
  document.body.style.overflow = ''; document.body.classList.remove('paneled');
  if (was && refocus) opener?.focus?.();
}

// ---- The room: a lunch room seen from above ----
const COUNTER = ['50%', '20%']; // the counter's front edge, where files are handed over
const SEATS = [];  // three seats on each side of two long tables
for (const left of [8, 58]) for (const top of [37, 70]) for (const k of [1, 3, 5]) SEATS.push([left + 34 * k / 6, top]);
const DOOR = (i) => [`${86 - i * 11}%`, '88%'];
const seatEls = new Map(), travelEls = new Map();
let seatOf = new Map();

function room(s) {
  const open = s.status !== 'off';
  $('rclosed').hidden = open; $('ropenview').hidden = !open;
  $('rstatus').textContent = STATUS[s.status]; $('rstatus').className = 'pill' + (open ? ' on' : '');
  $('rclose').hidden = !open;
  $('rerror').hidden = !s.room_error; $('rerror').textContent = s.room_error || '';
  for (const c of document.querySelectorAll('[data-setting]')) c.checked = s.settings[c.dataset.setting];
  if (!open) { for (const e of seatEls.values()) e.remove(); seatEls.clear(); seatOf.clear(); return; }
  if (changed('rqr', s.url)) { $('rqr').innerHTML = s.qr; $('rqr').title = s.url; $('rqr').classList.remove('pop'); void $('rqr').offsetWidth; $('rqr').classList.add('pop'); }
  $('rpin').hidden = !s.pin; $('rpin').replaceChildren('PIN', el('b', s.pin));
  const m = Math.ceil(s.seconds_left / 60);
  $('rleft').textContent = `Closes in ${m} min, or after ${s.idle_minutes} quiet minutes`;
  scene(s);
  asks(s);
  moving(s);
  items(s);
}

function scene(s) {
  // Phones keep their seat while they stay; new ones take the first free seat, and those asking wait at the door.
  const inside = s.devices.filter((d) => d.in), waiting = s.devices.filter((d) => !d.in);
  const taken = new Set([...seatOf.entries()].filter(([id]) => inside.some((d) => d.id === id)).map(([, i]) => i));
  seatOf = new Map([...seatOf].filter(([id]) => inside.some((d) => d.id === id)));
  for (const d of inside) if (!seatOf.has(d.id)) { let i = 0; while (taken.has(i)) i++; seatOf.set(d.id, i); taken.add(i); }
  const live = new Set();
  waiting.forEach((d, i) => { live.add(d.id); put(d, DOOR(i), true); });
  for (const d of inside) { live.add(d.id); put(d, SEATS[seatOf.get(d.id) % SEATS.length].map((v) => v + '%'), false); }
  for (const [id, e] of seatEls) if (!live.has(id)) { e.style.opacity = '0'; setTimeout(() => e.remove(), 300); seatEls.delete(id); }
  // A file on the move: a dot of the phone's colour between its seat and the counter.
  const now = new Set();
  for (const t of s.transfers) {
    if (!t.dev || !seatOf.has(t.dev)) continue;
    now.add(t.id);
    if (travelEls.has(t.id)) continue;
    const seat = SEATS[seatOf.get(t.dev) % SEATS.length].map((v) => v + '%');
    const [x1, y1, x2, y2] = t.dir === 'up' ? [...seat, ...COUNTER] : [...COUNTER, ...seat];
    const dot = el('div', null, 'travel');
    dot.style.color = look(t.dev).color;
    for (const [k, v] of Object.entries({ x1, y1, x2, y2 })) dot.style.setProperty('--' + k, v);
    $('lunch').append(dot); travelEls.set(t.id, dot);
  }
  for (const [id, e] of travelEls) if (!now.has(id)) { e.remove(); travelEls.delete(id); }
  $('lunch').setAttribute('aria-label', `The room from above: ${inside.length} phone${inside.length === 1 ? '' : 's'} at the tables` +
    (waiting.length ? `, ${waiting.length} at the door` : ''));
}
function put(d, [x, y], waiting) {
  let e = seatEls.get(d.id);
  if (!e) {
    e = el('div', null, 'seat pop');
    e.append(shapeEl(d.id, 40), el('span', d.name, 'label'),
      button('×', () => act('kick', { id: d.id }), 'kick', (waiting ? 'Deny ' : 'Remove ') + d.name));
    e.title = d.ip ? `${d.name} (${d.ip})` : d.name;
    e.style.left = x; e.style.top = y;
    $('lunch').append(e); seatEls.set(d.id, e);
  }
  e.classList.toggle('waiting', waiting);
  e.lastChild.setAttribute('aria-label', (waiting ? 'Deny ' : 'Remove ') + d.name);
  e.style.left = x; e.style.top = y; // walks from the door to a seat when let in
}

function asks(s) {
  const waiting = s.devices.filter((d) => !d.in);
  $('asks').hidden = !waiting.length;
  if (!changed('asks', waiting)) return;
  $('asklist').replaceChildren(...waiting.map((d) => {
    const li = el('li', null, 'enter'), name = el('span', null, 'name who');
    name.append(shapeEl(d.id, 24), `${d.name}`, ...(d.ip ? [el('span', d.ip, 'muted')] : []));
    li.append(name, button('Let in', () => act('let_in', { id: d.id }), 'primary', 'Let ' + d.name + ' in'),
      button('Deny', () => act('kick', { id: d.id }), 'quiet', 'Deny ' + d.name));
    return li;
  }));
}

const moveEls = new Map();
function moving(s) {
  const list = s.transfers.filter((t) => t.dev);
  const ids = new Set(list.map((t) => t.id));
  for (const [id, e] of moveEls) if (!ids.has(id)) { e.remove(); moveEls.delete(id); }
  for (const t of list) {
    let e = moveEls.get(t.id);
    if (!e) {
      e = el('li', null, 'enter');
      const top = el('div', null, 'who');
      top.append(shapeEl(t.dev, 18), `${t.dir === 'up' ? 'Arriving' : 'Leaving'}: ${t.name}`);
      e.append(top, el('div', '', 'muted'), Object.assign(el('div', null, 'bar' + (t.total ? '' : ' unknown')), { innerHTML: '<i></i>' }));
      $('moving').append(e); moveEls.set(t.id, e);
    }
    e.children[1].textContent = `${t.who} · ${rate(t.done, t.total, t.speed)}`;
    if (t.total) e.lastChild.firstChild.style.width = (100 * t.done / t.total) + '%';
  }
}

const seenItems = new Set();
function items(s) {
  if (!changed('items', s.items)) return;
  $('items').replaceChildren(...(s.items.length ? s.items.map((it) => {
    const li = el('li', null, 'item' + (seenItems.has(it.id) ? '' : ' enter')); seenItems.add(it.id);
    if (it.preview) { const img = el('img', null, 'thumb'); img.src = it.thumb || 'p/' + it.id; img.alt = ''; img.loading = 'lazy'; img.onerror = () => img.replaceWith(el('span', ext(it.name), 'ftype')); li.append(img); }
    else li.append(el('span', it.kind === 'text' ? 'Aa' : ext(it.name), 'ftype' + (it.kind === 'text' ? ' text' : '')));
    const name = el('div', null, 'name'), who = el('span', null, 'who muted');
    who.append(shapeEl(it.from_id, 16), it.from);
    if (it.kind === 'text') name.append(who, el('p', it.text, 'text'));
    else name.append(el('div', it.name), who, el('span', ' · ' + size(it.size), 'muted'));
    if (it.risky) name.append(el('div', '⚠ Program file. Only open it if you trust who sent it.', 'warn'));
    li.append(name, ...itemActions(it), button('×', () => act('remove', { id: it.id }), 'icon quiet', 'Take ' + it.name + ' off the table'));
    return li;
  }) : [el('li', 'The tables are empty. Add a file, or wait for the phones.', 'muted')]));
}

// Puts the fixed parts on the page and wires the buttons they hold.
function startApp(device) {
  $('shell').outerHTML = shellHTML(device);
  for (const box of document.querySelectorAll('.rset')) box.append($('rsettings').content.cloneNode(true));
  $('roombtn').onclick = () => openPanel('room');
  $('gear').onclick = () => openPanel('settings');
  for (const b of document.querySelectorAll('[data-close]')) b.onclick = () => closePanels();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });

  $('drop').onclick = () => $('file').click();
  $('file').onchange = () => { shareFile($('file').files[0]); $('file').value = ''; };
  $('unshare').onclick = async () => { hadShare = null; await act('unshare'); $('drop').focus(); };
  $('another').onclick = async () => { hadShare = null; await act('unshare'); $('file').click(); };
  $('sqr').ondblclick = () => $('sqr').requestFullscreen?.(); // double-click: full screen, to scan from across a table

  document.addEventListener('change', (e) => { if (e.target.dataset.setting) act('settings', { [e.target.dataset.setting]: e.target.checked }); });
  $('ropen').onclick = async () => {
    $('ropen').disabled = true; $('ropen').replaceChildren(el('span', null, 'spin'), ' Opening…');
    try { await act('open', { minutes: +$('minutes').value }); } finally { $('ropen').disabled = false; $('ropen').textContent = 'Open room'; }
  };
  $('rclose').onclick = () => act('close');
  $('rfull').onclick = () => $('rqr').requestFullscreen?.();
  const sendText = async () => { if ($('text').value.trim()) { const text = $('text').value; $('text').value = ''; await act('text', { text }); } };
  $('sendtext').onclick = sendText;
  $('text').onkeydown = (e) => { if (e.key === 'Enter') sendText(); };

  // Appearance (the radios live in each page's Settings).
  let theme = 'system'; try { theme = localStorage.getItem('qsendr-theme') || 'system'; } catch {}
  for (const r of document.querySelectorAll('input[name=theme]')) {
    r.checked = r.value === theme;
    r.onchange = () => {
      if (r.value === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = r.value;
      try { localStorage.setItem('qsendr-theme', r.value); } catch {}
    };
  }

  // Drag and drop: on the main screen a file is shared by QR; with the room open it goes on the tables.
  document.addEventListener('dragover', (e) => { e.preventDefault(); $('drop').classList.add('over'); });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('drop').classList.remove('over'); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); $('drop').classList.remove('over');
    const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry?.());
    const files = [...e.dataTransfer.files].filter((f, i) => !entries[i]?.isDirectory);
    if (files.length < e.dataTransfer.files.length) showNotice('Folders can’t be shared. Choose files instead.');
    if (!$('room').hidden) return roomAddFiles(files);
    if (!$('settings').hidden || !files.length) return;
    await shareFile(files[0]);
    if (files.length > 1) showNotice(`One file at a time: shared ${files[0].name}.`);
  });
  setInterval(tick, 1000);
}
"""

CONTROL_HTML = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>QSendr</title>
<link rel="icon" href="/icon.png">
<script>try { const t = localStorage.getItem('qsendr-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch {}</script>
<style>/*CSS*//*APPCSS*/</style></head>
</style></head>
<body>
<div id="shell"></div>

<div id="settings" class="panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" hidden>
  <div class="panelbar settings">
    <button class="iconbtn" type="button" data-close aria-label="Back to the main screen">/*BACK*/</button>
    <h2 id="settings-title">Settings</h2>
  </div>
  <div class="settings">
    <section aria-labelledby="look-h">
      <h3 id="look-h">Appearance</h3>
      <div class="seg" role="radiogroup" aria-labelledby="look-h">
        <label><input type="radio" name="theme" value="system"><span>System</span></label>
        <label><input type="radio" name="theme" value="light"><span>Light</span></label>
        <label><input type="radio" name="theme" value="dark"><span>Dark</span></label>
      </div>
    </section>
    <section aria-labelledby="notif-h">
      <h3 id="notif-h">Notifications</h3>
      <p id="notifytray" class="muted" hidden>Shown by the chip next to the clock.</p>
      <button id="notify" type="button" hidden>Notify me when something arrives</button>
      <p id="notifyon" class="muted" hidden>On: you'll see a notification when a file arrives or a phone asks to join.</p>
      <p id="notifyoff" class="muted" hidden>Blocked for this page in your browser's site settings.</p>
    </section>
    <section aria-labelledby="net-h">
      <h3 id="net-h">Network</h3>
      <div class="row" style="margin-top: 0"><label for="address">Address in the QR codes</label><select id="address"></select></div>
      <details id="conn" style="margin-top: 12px"><summary>Phone can't connect?</summary>
        <ul id="findings"></ul>
        <div class="row"><button id="check" type="button">Check again</button></div>
      </details>
      <details style="margin-top: 8px"><summary>Wi-Fi QR for a phone</summary>
        <p class="muted">A phone camera reading this joins the Wi-Fi in one tap. Handy when the laptop is the hotspot. Nothing is saved.</p>
        <label class="muted" for="ssid">Network name</label><input id="ssid" type="text" autocomplete="off">
        <label class="muted" for="wpass">Password</label><input id="wpass" type="password" autocomplete="off">
        <div class="row"><button id="wifi" type="button">Show Wi-Fi QR</button></div>
        <div id="wifiqr" class="qr" hidden></div>
      </details>
    </section>
    <section aria-labelledby="log-h"><h3 id="log-h">Activity</h3><ol id="log"></ol></section>
    <section aria-labelledby="app-h"><h3 id="app-h">QSendr</h3>
      <p class="muted">Closing this browser tab leaves QSendr running by the clock. Quit stops sharing and the room.</p>
      <button id="quit" type="button">Quit QSendr</button></section>
  </div>
</div>

<script>/*JS*/

const act = async (action, body) => { await post(action, body); refresh(); };

async function refresh() {
  let s;
  try { s = await (await fetch('state')).json(); }
  catch { $('notice').textContent = '✕ QSendr is closed. Start it again on this laptop.'; $('notice').hidden = false; return; }
  notify(s); home(s); header(s); room(s); settings(s);
}

// ---- What the shared screens ask of this page ----
function send(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url + encodeURIComponent(file.name));
    x.upload.onprogress = (e) => onProgress(e.loaded / (e.total || 1));
    x.onload = () => (x.status === 200 ? resolve() : reject(new Error(x.status === 413 ? 'That file is over 100 MB.' : 'QSendr could not take that file.')));
    x.onerror = () => reject(new Error('QSendr is not running.'));
    x.send(file);
  });
}
async function shareFile(file) {
  if (!file) return;
  showNotice('');
  if (file.size > 100 * 1024 * 1024) return showNotice(`${file.name} is ${size(file.size)}. Files up to 100 MB can be shared.`);
  copying = true; $('drop').hidden = true; $('copying').hidden = false;
  $('ctext').replaceChildren(el('span', null, 'spin'), ` Getting ${file.name} ready…`);
  $('cbar').style.width = '0%';
  try { await send('share?name=', file, (f) => ($('cbar').style.width = 100 * f + '%')); } catch (err) { showNotice(err.message); }
  copying = false;
  refresh();
}
async function roomAddFiles(files) {
  for (const f of files) await fetch('drop?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
  refresh();
}
function itemActions(it) {
  if (it.kind === 'text') return [copyButton(it.text)];
  if (it.from === 'Laptop') return [button('Show in folder', () => post('reveal', { id: it.id }), 'quiet', 'Show ' + it.name + ' in its folder')];
  const a = el('a', 'Download', 'btn primary'); a.href = 'f/' + it.id; a.download = it.name; a.setAttribute('aria-label', 'Download ' + it.name + ' to this laptop');
  return [a];
}

startApp('laptop');
$('addfiles').onclick = async () => {
  const b = $('addfiles'); b.disabled = true; b.replaceChildren(el('span', null, 'spin'), ' Choose in the window that opened…');
  try { await post('pick', { kind: 'files' }); } finally { b.disabled = false; b.textContent = 'Add files'; refresh(); }
};

// ---- Settings: the app's own ----
const FIX = { firewall: 'Open allowed apps', network: 'Open network settings' };
function settings(s) {
  if (changed('addr', [s.ip, s.addresses])) {
    $('address').replaceChildren(...s.addresses.map((a) => { const o = el('option', a.label ? `${a.ip} (${a.label})` : a.ip); o.value = a.ip; o.selected = a.ip === s.ip; return o; }));
  }
  if (changed('findings', [s.findings, s.checking])) {
    $('findings').replaceChildren(...(s.checking ? [(() => { const li = el('li', null, 'finding info'); li.append(el('span', null, 'spin'), ' Checking this laptop’s network and firewall…'); return li; })()] : []),
      ...s.findings.map(([level, text, fix]) => {
        const li = el('li', text, 'finding ' + level);
        if (fix) li.append(el('br'), button(FIX[fix], () => post('fix', { what: fix })));
        return li;
      }));
    if (s.findings.some(([level]) => level === 'bad')) $('conn').open = true;
  }
  if (changed('log', s.log)) $('log').replaceChildren(...s.log.map(([t, text]) => { const li = el('li'); li.append(el('time', t), text); return li; }));
  showNotify(s);
}
$('address').onchange = () => act('address', { ip: $('address').value });
$('check').onclick = async () => {
  $('check').disabled = true; $('check').replaceChildren(el('span', null, 'spin'), ' Checking…');
  try { await post('check'); } finally { $('check').disabled = false; $('check').textContent = 'Check again'; refresh(); }
};
$('wifi').onclick = async () => {
  if (!$('ssid').value) return $('ssid').focus();
  const r = await post('wifi', { ssid: $('ssid').value, password: $('wpass').value });
  $('wifiqr').innerHTML = (await r.json()).qr; // SVG made by the app itself
  $('wifiqr').hidden = false; $('wifiqr').classList.add('pop');
};
$('quit').onclick = async () => {
  if (!confirm('Quit QSendr? Sharing stops, phones lose the room, and files they sent that you did not download are deleted.')) return;
  await post('quit');
  clearInterval(timer);
  document.body.replaceChildren(el('p', 'QSendr has quit. You can close this tab.', 'status'));
};

// Windows shows these as normal notifications while this page is open (the exe's tray icon shows its own instead).
let knownItems = null, knownAsks = null;
function showNotify(s) {
  const p = 'Notification' in window ? Notification.permission : 'denied';
  $('notifytray').hidden = !s.tray;
  $('notify').hidden = s.tray || p !== 'default';
  $('notifyon').hidden = s.tray || p !== 'granted';
  $('notifyoff').hidden = s.tray || p !== 'denied';
}
$('notify').onclick = async () => { await Notification.requestPermission(); refresh(); };
function notify(s) {
  const items = new Set(s.items.map((i) => i.id)), asks = new Set(s.devices.filter((d) => !d.in).map((d) => d.id));
  if (!s.tray && knownItems && 'Notification' in window && Notification.permission === 'granted') {
    for (const it of s.items) if (!knownItems.has(it.id) && it.from !== 'Laptop') {
      const n = new Notification(`${it.from} sent ${it.kind === 'text' ? 'text' : it.name}`, { body: it.kind === 'text' ? it.text.slice(0, 140) : 'Open the room to download it.', tag: 'qsendr-' + it.id });
      n.onclick = () => { window.focus(); openPanel('room'); n.close(); };
    }
    for (const d of s.devices) if (!d.in && !knownAsks.has(d.id)) {
      const n = new Notification(`${d.name} wants to join`, { body: 'Open the room to let them in.', tag: 'qsendr-ask-' + d.id });
      n.onclick = () => { window.focus(); openPanel('room'); n.close(); };
    }
  }
  knownItems = items; knownAsks = asks;
}


refresh();
const timer = setInterval(refresh, 1500);
</script>
</body></html>
""".replace("/*CSS*/", CSS).replace("/*APPCSS*/", APP_CSS).replace("/*JS*/", ICON_DECL + JS + APP_JS)

PHONE_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1b2a4a">
<title>QSendr</title>
<link rel="icon" href="/icon.png"><link rel="apple-touch-icon" href="/icon.png">
<style>/*CSS*/
main, header { max-width: 560px; margin-left: auto; margin-right: auto; }
#me { font-size: 14px; font-weight: 600; overflow-wrap: anywhere; display: inline-flex; align-items: center; gap: 8px; }
.big { width: 100%; min-height: 60px; font-size: 18px; }
.item .btn, .item button { min-height: 48px; min-width: 112px; }
progress { height: 14px; }
label.field { display: block; font-weight: 600; margin: 12px 0 4px; }
details summary { cursor: pointer; font-weight: 600; padding: 12px 0 4px; min-height: 44px; }
</style></head>
<body>
<header><h1><img src="/icon.png" alt="">Q<span>Sendr</span></h1><span id="me"></span></header>
<main>
  <section id="message" hidden><p id="msgtext" class="status" role="status"></p></section>

  <section id="join" hidden>
    <h2>Join the room</h2>
    <form id="joinform">
      <label class="field" for="name">Your name, as others see it</label>
      <input id="name" type="text" maxlength="30" autocomplete="nickname" required>
      <div id="pinbox" hidden>
        <label class="field" for="pinput">PIN shown on the laptop</label>
        <input id="pinput" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off">
      </div>
      <p id="joinerror" class="warn" role="alert" hidden></p>
      <div class="row"><button class="primary big" type="submit">Join</button></div>
    </form>
  </section>

  <div id="room" hidden>
    <section>
      <input id="pick" class="vh" type="file" multiple>
      <label for="pick" class="btn primary big">Send files</label>
      <div id="progress" hidden>
        <p id="ptext" class="status" style="margin: 12px 0 4px" role="status"></p>
        <progress id="bar" max="1" value="0"></progress>
        <p id="pspeed" class="muted"></p>
        <p class="muted">Keep this screen open while sending.</p>
      </div>
      <p id="senderror" class="warn" role="alert" hidden></p>
      <details>
        <summary>Send text or a link</summary>
        <label for="text" class="vh">Text or a link</label>
        <textarea id="text" rows="3"></textarea>
        <div class="row"><button id="sendtext" type="button">Send text</button></div>
      </details>
    </section>
    <section>
      <h2>On the tables</h2>
      <ul id="items"></ul>
    </section>
    <p class="muted">New files appear here on their own while this page is open.</p>
  </div>
</main>
<script>/*JS*/
const ua = navigator.userAgent;
const guess = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
  : /Windows/.test(ua) ? 'Windows PC' : /Mac/.test(ua) ? 'Mac' : 'Phone';
let saved = ''; try { saved = localStorage.getItem('qsendr-name') || ''; } catch {}
$('name').value = saved || guess;
let shownItems = '', timer, maxBytes = Infinity, sending = false, meId = 0;
const seenItems = new Set();

function show(view, message) {
  for (const id of ['message', 'join', 'room']) $(id).hidden = id !== view;
  if (message) $('msgtext').textContent = message;
}

async function refresh() {
  let r;
  try { r = await fetch('state', { cache: 'no-store' }); }
  catch { if (!sending) show('message', "✕ Can't reach the laptop. Check that both are on the same Wi-Fi."); return; }
  if (r.status === 410) { clearInterval(timer); return show('message', '■ This room has closed. Ask for a new QR code.'); }
  const s = await r.json();
  if (s.id && meId !== s.id) { $('me').replaceChildren(shapeEl(s.id, 26), s.name); meId = s.id; } // this phone's own shape and colour
  else if (!s.id) $('me').textContent = s.name || '';
  if (s.state === 'refused') return show('message', '✕ The laptop did not let this phone in.');
  if (s.state === 'waiting') { show('message'); $('msgtext').replaceChildren(el('span', null, 'spin'), ' Waiting at the door for the laptop to let you in…'); return; }
  if (s.state === 'new') { $('pinbox').hidden = !s.pin; $('pinput').required = s.pin; if ($('join').hidden) show('join'); return; }
  show('room');
  maxBytes = s.max_bytes;
  const now = JSON.stringify(s.items);
  if (now === shownItems) return; // keep the list still while someone is about to tap it
  shownItems = now;
  $('items').replaceChildren(...(s.items.length ? s.items.map((it) => {
    const a = el('a', 'Download', 'btn primary');
    a.href = 'f/' + it.id; a.download = it.name; a.setAttribute('aria-label', 'Download ' + it.name);
    const li = itemRow(it, it.kind === 'text' ? [copyButton(it.text)] : it.from === 'You' ? [] : [a]);
    if (!seenItems.has(it.id)) { li.classList.add('enter'); seenItems.add(it.id); } // new arrivals fade in
    return li;
  }) : [el('li', 'Nothing on the tables yet. Send something, or wait for the others.', 'muted')]));
}

$('joinform').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('name').value.trim() || guess;
  try { localStorage.setItem('qsendr-name', name); } catch {}
  const r = await post('join', { name, pin: $('pinput').value });
  const reply = await r.json().catch(() => ({}));
  $('joinerror').hidden = r.ok;
  if (r.status === 403) $('joinerror').textContent = `Wrong PIN. ${reply.left} tr${reply.left === 1 ? 'y' : 'ies'} left before the room locks.`;
  refresh();
};

// One try at sending from `offset` to the end. Rejects with .received when the laptop wants a different start.
function sendFrom(file, id, offset, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `upload?id=${id}&name=${encodeURIComponent(file.name)}&total=${file.size}&offset=${offset}`);
    x.upload.onprogress = (e) => onProgress(offset + e.loaded);
    x.onload = () => {
      let reply = {}; try { reply = JSON.parse(x.responseText); } catch {}
      if (x.status === 200) return resolve();
      const err = new Error(reply.error || 'The laptop refused the file.');
      if (x.status === 409) { err.received = reply.received; err.busy = reply.busy; } else err.fatal = true;
      reject(err);
    };
    x.onerror = () => reject(new Error('lost'));
    x.send(file.slice(offset));
  });
}
const visible = () => new Promise((ok) => document.visibilityState === 'visible' ? ok() : document.addEventListener('visibilitychange', ok, { once: true }));
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
const newId = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

// Sends one file, picking up where it stopped if the connection drops (an iPhone screen locking, a weak signal).
async function sendFile(file, onProgress, onRetry) {
  const id = newId();
  let offset = 0, waits = 0;
  for (let tries = 0; ; tries++) {
    try { return await sendFrom(file, id, offset, onProgress); }
    catch (err) {
      if (err.fatal) throw err;
      if (tries >= 12) throw new Error('Sending stopped. Check the Wi-Fi and try again.');
      if (err.received != null) {
        offset = err.received;
        if (err.busy) { if (++waits > 15) throw new Error('Sending stopped. Try again.'); tries--; await pause(2000); }
        continue;
      }
      onRetry();
      await visible();
      await pause(Math.min(2000 * (tries + 1), 10000));
      try { offset = (await (await fetch('upload?id=' + id, { cache: 'no-store' })).json()).received; } catch {}
    }
  }
}

$('pick').onchange = async () => {
  const files = [...$('pick').files];
  $('pick').value = '';
  const tooBig = files.filter((f) => f.size > maxBytes);
  const go = files.filter((f) => f.size <= maxBytes);
  $('senderror').hidden = !tooBig.length;
  $('senderror').textContent = tooBig.length ? `Too big to send: ${tooBig.map((f) => f.name).join(', ')} (limit ${size(maxBytes)}).` : '';
  if (!go.length) return;
  const total = go.reduce((n, f) => n + f.size, 0) || 1;
  let done = 0, mark = { t: performance.now(), bytes: 0 }, speed = 0;
  sending = true; $('progress').hidden = false;
  try {
    for (const [i, f] of go.entries()) {
      const label = `Sending ${go.length > 1 ? `${i + 1} of ${go.length}: ` : ''}${f.name}`;
      $('ptext').textContent = label;
      await sendFile(f, (n) => {
        const all = done + n, now = performance.now();
        $('bar').value = all / total;
        if (now - mark.t > 700) { speed = (all - mark.bytes) / ((now - mark.t) / 1000); mark = { t: now, bytes: all }; }
        $('pspeed').textContent = rate(all, total, speed);
        $('ptext').textContent = label;
      }, () => { $('ptext').textContent = 'Connection lost. Picking up where it stopped…'; });
      done += f.size;
    }
    $('ptext').textContent = `✓ Sent ${go.length === 1 ? go[0].name : go.length + ' files'}`;
    $('pspeed').textContent = '';
  } catch (err) {
    $('progress').hidden = true;
    $('senderror').hidden = false; $('senderror').textContent = err.message;
  } finally {
    sending = false; refresh();
    setTimeout(() => { if (!sending) $('progress').hidden = true; }, 4000);
  }
};

$('sendtext').onclick = async () => {
  if (!$('text').value.trim()) return;
  const r = await post('text', { text: $('text').value });
  if (r.ok) $('text').value = '';
  refresh();
};

refresh();
timer = setInterval(refresh, 2000);
</script>
</body></html>
""".replace("/*CSS*/", CSS).replace("/*JS*/", ICON_DECL + JS)


SHARE_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f6f4f2" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0f1626" media="(prefers-color-scheme: dark)">
<title>QSendr</title>
<link rel="icon" href="/icon.png"><link rel="apple-touch-icon" href="/icon.png">
<style>/*CSS*/
header, main { max-width: 480px; margin-left: auto; margin-right: auto; }
main { min-height: calc(100vh - 120px); display: flex; flex-direction: column; justify-content: center; text-align: center; gap: 6px; }
main p { margin: 0; }
#name { font-size: 22px; font-weight: 600; overflow-wrap: anywhere; }
#get { width: 100%; min-height: 56px; font-size: 18px; margin-top: 24px; }
</style></head>
<body>
<header><h1><img src="/icon.png" alt="">Q<span>Sendr</span></h1></header>
<main>
  <p id="name"></p>
  <p id="meta" class="muted" role="status">Getting the file…</p>
  <a id="get" class="btn primary" href="file" download hidden>Download</a>
</main>
<script>/*JS*/
(async () => {
  let r;
  try { r = await fetch('info', { cache: 'no-store' }); }
  catch { return ($('meta').textContent = "Can't reach the laptop. Check that both are on the same Wi-Fi."); }
  if (!r.ok) return ($('meta').textContent = 'This file is no longer shared. Ask for a new QR code.');
  const f = await r.json();
  $('name').textContent = f.name;
  $('meta').textContent = `${size(f.size)} · downloading… If nothing happens, tap Download.`;
  $('get').download = f.name;
  $('get').hidden = false;
  $('get').click(); // scanning is the request: start the download right away
})();
</script>
</body></html>
""".replace("/*CSS*/", CSS).replace("/*JS*/", ICON_DECL + JS)


if __name__ == "__main__":
    main()
