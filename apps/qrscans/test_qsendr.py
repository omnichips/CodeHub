"""py test_qsendr.py — runs a real QSendr room on this laptop with two pretend phones and checks what each can reach."""
import http.cookiejar
import json
import os
import shutil
import socket
import tempfile
import threading
import time
import urllib.error
import urllib.request
from urllib.parse import quote

import qsendr


class Phone:
    """A browser with its own cookies."""

    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def get(self, url, data=None, raw=None, headers=None):
        body = raw if raw is not None else json.dumps(data).encode() if data is not None else None
        req = urllib.request.Request(url, body, headers or {}, method="POST" if body is not None else "GET")
        try:
            with self.opener.open(req) as r:
                self.headers = r.headers
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            self.headers = e.headers
            return e.code, e.read()

    def json(self, url, data=None):
        code, body = self.get(url, data)
        return code, json.loads(body or b"null")

    def send(self, room_url, name, blob, uid="abcdef0123456789", offset=0):
        """Uploads as the phone page does: the file's id, name and size, and where this piece starts."""
        return self.get(f"{room_url}upload?id={uid}&name={quote(name)}&total={len(blob)}&offset={offset}", raw=blob[offset:])

    def cookie(self):
        return next(iter(self.jar)).value


def settle(room):
    """Waits until the server has finished its bookkeeping for transfers the client already sees as done."""
    for _ in range(100):
        with room.lock:  # the server holds it until its bookkeeping is done
            if room.busy == 0:
                return
        time.sleep(0.05)
    raise AssertionError("a transfer never finished")


laptop = Phone()  # the control page; no cookies needed
qsendr.UPLOAD_STALL = 1  # so the stuck-upload check doesn't wait 15 seconds

with tempfile.TemporaryDirectory() as d:
    big = os.path.join(d, "café photo.bin")
    data = os.urandom(25 * 1024 * 1024)
    with open(big, "wb") as f:
        f.write(data)
    folder = os.path.join(d, "trip")
    os.makedirs(os.path.join(folder, "day 1"))
    for name in ["a.txt", os.path.join("day 1", "b.txt")]:
        with open(os.path.join(folder, name), "w") as f:
            f.write(name)
    pic = os.path.join(d, "beach.jpg")
    with open(pic, "wb") as f:
        f.write(b"\xff\xd8 not really a jpeg")

    room = qsendr.Room(30, max_mb=30)
    server = qsendr.make_server(room, 0, "SECRET")
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    base = f"http://127.0.0.1:{port}"
    room.base = base
    room.add([big, folder, big, pic])  # the duplicate is ignored, and folders are never shared
    sent = lambda name: next(it["path"] for it in room.items.values() if it["name"] == name)  # where a phone's file is kept
    r = f"{base}/r/{room.token}/"
    control = f"{base}/c/SECRET/"

    # Joining: asks the laptop first; a phone that isn't in sees nothing.
    a, b, stranger = Phone(), Phone(), Phone()
    assert a.get(r)[0] == 200  # the page itself
    assert a.json(r + "state") == (200, {"state": "new", "pin": False})
    assert a.json(r + "join", {"name": "iPhone"})[0] == 200
    assert a.json(r + "state")[1]["state"] == "waiting"
    assert a.get(r + "f/1")[0] == 403 and a.send(r, "x", b"x")[0] == 403
    assert stranger.get(r + "f/1")[0] == 403 and stranger.get(r + "p/3")[0] == 403
    s = laptop.json(control + "state")[1]
    assert [dev["name"] for dev in s["devices"] if not dev["in"]] == ["iPhone"]
    laptop.get(control + "let_in", {"id": s["devices"][0]["id"]})
    state = a.json(r + "state")[1]
    assert state["state"] == "in" and [i["name"] for i in state["items"]] == ["café photo.bin", "beach.jpg"], state
    assert [i["preview"] for i in state["items"]] == [False, True]
    assert state["id"] > 0 and all(i["from_id"] == 0 for i in state["items"])  # its own id picks its shape; 0 is the laptop

    # Without asking: the next phone is straight in, and a second "iPhone" gets a number.
    laptop.get(control + "settings", {"approve": False})
    assert b.json(r + "join", {"name": "iPhone"})[0] == 200
    assert b.json(r + "state")[1]["name"] == "iPhone 2"

    # Downloads: the big file intact, and a broken download resumed from the middle.
    code, body = b.get(r + "f/1")
    assert code == 200 and body == data and b.headers["Accept-Ranges"] == "bytes"
    assert "filename*=UTF-8''caf%C3%A9%20photo.bin" in b.headers["Content-Disposition"]
    assert 'filename="caf_ photo.bin"' in b.headers["Content-Disposition"]
    code, body = b.get(r + "f/1", headers={"Range": "bytes=1000000-"})
    assert code == 206 and body == data[1000000:] and b.headers["Content-Range"] == f"bytes 1000000-{len(data) - 1}/{len(data)}"
    code, body = b.get(r + "f/1", headers={"Range": "bytes=0-99"})
    assert code == 206 and body == data[:100]
    assert b.get(r + "f/1", headers={"Range": f"bytes={len(data)}-"})[0] == 416

    # Previews: images only, and they don't count as downloads.
    settle(room)
    logged = len(room.log)
    pic_id = next(i for i, it in room.items.items() if it["name"] == "beach.jpg")
    assert b.get(r + f"p/{pic_id}") == (200, b"\xff\xd8 not really a jpeg") and b.headers["Content-Type"] == "image/jpeg"
    assert b.get(r + "p/1")[0] == 404 and laptop.get(control + f"p/{pic_id}")[0] == 200
    assert len(room.log) == logged

    # Phone A sends a file with a sneaky name: it stays in the room's temp folder (nothing lands on the laptop by itself),
    # renamed, flagged and marked.
    downloads = os.path.join(os.path.expanduser("~"), "Downloads", "QSendr")
    before = set(os.listdir(downloads)) if os.path.isdir(downloads) else set()
    assert a.send(r, "..\\..\\something.exe", b"MZ fake program", uid="sneaky00")[0] == 200
    saved = sent("something.exe")
    assert os.path.basename(saved) == "something.exe" and qsendr.is_inside(saved, room.dir)
    assert (set(os.listdir(downloads)) if os.path.isdir(downloads) else set()) == before
    if os.name == "nt":
        with open(saved + ":Zone.Identifier") as f:
            assert "ZoneId=3" in f.read()
    items = b.json(r + "state")[1]["items"]
    exe = next(i for i in items if i["name"] == "something.exe")
    assert exe["risky"] and exe["from"] == "iPhone", exe
    assert next(i for i in a.json(r + "state")[1]["items"] if i["name"] == "something.exe")["from"] == "You"
    assert b.get(r + f"f/{exe['id']}") == (200, b"MZ fake program")
    assert exe["from_id"] == a.json(r + "state")[1]["id"]  # the sender's shape shows next to the file
    # The laptop downloads it only when asked, the same way (an ordinary browser download).
    assert laptop.get(control + f"f/{exe['id']}") == (200, b"MZ fake program") and "attachment" in laptop.headers["Content-Disposition"]
    assert laptop.get(control + "f/999")[0] == 404

    # A name in any language survives the round trip.
    assert a.send(r, "日本語 🎉.jpg", b"emoji", uid="unicode0")[0] == 200
    uni = next(i for i in b.json(r + "state")[1]["items"] if i["name"] == "日本語 🎉.jpg")
    assert b.get(r + f"f/{uni['id']}") == (200, b"emoji") and quote("日本語 🎉.jpg") in b.headers["Content-Disposition"]

    # Names that would be trouble on Windows.
    assert qsendr.safe_name("../../etc/passwd") == "passwd"
    assert qsendr.safe_name("CON.txt") == "_CON.txt" and qsendr.safe_name("a<b>:c?.jpg") == "a_b__c_.jpg"
    assert qsendr.safe_name("...") == "file" and qsendr.safe_name("photo.jpg. ") == "photo.jpg"
    assert a.get(r + "upload?id=../../x&name=a&total=1&offset=0", raw=b"x")[0] == 400  # upload ids are letters and digits

    # Text both ways.
    assert a.json(r + "text", {"text": "https://example.com"})[0] == 200
    laptop.get(control + "text", {"text": "wifi password: hunter2"})
    texts = [i["text"] for i in b.json(r + "state")[1]["items"] if i["kind"] == "text"]
    assert texts == ["https://example.com", "wifi password: hunter2"], texts
    assert a.get(r + "text", {"text": "   "})[0] == 400

    # Too big is refused before anything is saved (the phone page checks max_bytes first; this is the backstop).
    assert a.json(r + "state")[1]["max_bytes"] == 30 * 1024 * 1024
    try:
        code = a.send(r, "huge.bin", os.urandom(31 * 1024 * 1024), uid="huge0000")[0]
    except OSError:
        code = 413  # refused without reading the body, so the connection drops
    assert code == 413 and not os.path.exists(os.path.join(room.dir, "huge.bin"))

    # A cut-off upload is kept, and the phone sends only the rest.
    blob = os.urandom(1000)
    with socket.create_connection(("127.0.0.1", port)) as s:
        s.sendall((f"POST /r/{room.token}/upload?id=resume00&name=cut.bin&total=1000&offset=0 HTTP/1.1\r\nHost: x\r\n"
                   f"Content-Length: 1000\r\nCookie: qsendr={a.cookie()}\r\n\r\n").encode() + blob[:300])
        time.sleep(0.3)
    settle(room)
    assert a.json(r + "upload?id=resume00") == (200, {"received": 300})
    assert b.json(r + "upload?id=resume00") == (200, {"received": 0})  # another phone can't see it
    assert a.send(r, "cut.bin", blob, uid="resume00", offset=0)[0] == 409  # wrong start: told where to resume
    assert a.send(r, "cut.bin", blob, uid="resume00", offset=300)[0] == 200
    with open(sent("cut.bin"), "rb") as f:
        assert f.read() == blob

    # A stuck upload (the phone gave up but the connection still hangs): the retry is told to wait, then resumes.
    stuck = socket.create_connection(("127.0.0.1", port))
    stuck.sendall((f"POST /r/{room.token}/upload?id=stuck000&name=stuck.bin&total=1000&offset=0 HTTP/1.1\r\nHost: x\r\n"
                   f"Content-Length: 1000\r\nCookie: qsendr={a.cookie()}\r\n\r\n").encode() + blob[:200])
    time.sleep(0.3)
    code, body = a.send(r, "stuck.bin", blob, uid="stuck000", offset=200)
    assert code == 409 and json.loads(body)["busy"], body
    settle(room)  # the stuck one pauses after UPLOAD_STALL instead of holding on for a minute
    stuck.close()
    assert a.send(r, "stuck.bin", blob, uid="stuck000", offset=200)[0] == 200
    # Someone else can't add to another phone's upload.
    assert b.send(r, "x.bin", blob, uid="otherone")[0] == 200
    assert a.send(r, "x.bin", blob, uid="otherone")[0] in (200, 403)  # finished uploads are forgotten, so this is a new one

    # Two phones sending a same-named file at once: both arrive, neither overwrites the other.
    blobs = [os.urandom(3 * 1024 * 1024) for _ in range(2)]
    results = []
    sends = [threading.Thread(target=lambda p, blob, uid: results.append(p.send(r, "IMG_0001.jpg", blob, uid=uid)[0]), args=(p, blob, uid))
             for p, blob, uid in zip([a, b], blobs, ["sameA000", "sameB000"])]
    for t in sends:
        t.start()
    for t in sends:
        t.join()
    settle(room)
    assert results == [200, 200]
    got = []
    for n in ["IMG_0001.jpg", "IMG_0001 (2).jpg"]:
        with open(os.path.join(room.dir, n), "rb") as f:
            got.append(f.read())
    assert sorted(got) == sorted(blobs)

    # Auto-delete: a temp file leaves the room (and the disk) once the other phone has it.
    laptop.get(control + "settings", {"autodelete": True})
    assert a.send(r, "once.jpg", b"jpeg", uid="once0000")[0] == 200
    once = next(i for i in a.json(r + "state")[1]["items"] if i["name"] == "once.jpg")
    temp_path = room.items[once["id"]]["path"]
    assert qsendr.is_inside(temp_path, room.dir)
    assert b.get(r + f"f/{once['id']}", headers={"Range": "bytes=0-1"})[0] == 206
    settle(room)
    assert once["id"] in room.items  # part of a file doesn't count
    assert b.get(r + f"f/{once['id']}") == (200, b"jpeg")
    settle(room)
    assert once["id"] not in room.items and not os.path.exists(temp_path)
    laptop.get(control + "settings", {"autodelete": False})

    # Dropping a file on the control page shares a copy; removing it deletes only the copy.
    assert laptop.get(control + "drop?name=" + quote("dropped.txt"), raw=b"dropped")[0] == 200
    dropped = next(it for it in room.items.values() if it["name"] == "dropped.txt")
    assert dropped["from_name"] == "Laptop" and qsendr.is_inside(dropped["path"], room.drop_dir)
    laptop.get(control + "remove", {"id": dropped["id"]})
    assert not os.path.exists(dropped["path"])

    # Laptop progress: nothing is moving now, and the address picker only takes this laptop's addresses.
    s = laptop.json(control + "state")[1]
    assert s["transfers"] == [] and s["ip"] == "127.0.0.1"
    assert laptop.get(control + "address", {"ip": "8.8.8.8"})[0] == 400
    lan = qsendr.local_ip()
    if not lan.startswith("127."):
        assert laptop.get(control + "address", {"ip": lan})[0] == 200 and room.base == f"http://{lan}:{port}"
        assert lan in laptop.json(control + "state")[1]["url"]
        room.base = base
    code, body = laptop.json(control + "wifi", {"ssid": 'My "Wi-Fi";', "password": "p:a,ss"})
    assert code == 200 and body["qr"].startswith("<svg")

    # Removing a phone cuts it off at once.
    dev_b = next(dev for dev in laptop.json(control + "state")[1]["devices"] if dev["name"] == "iPhone 2")
    laptop.get(control + "kick", {"id": dev_b["id"]})
    assert b.json(r + "state")[1]["state"] == "refused" and b.get(r + "f/1")[0] == 403

    # Nothing outside the room is reachable, and the control page answers this laptop only.
    for bad in ["/", "/r/wrong/state", f"/r/{room.token}/f/99", f"/r/{room.token}/f/../../qsendr.py",
                "/c/WRONG/state", "/c/SECRET/../r", "/qsendr.py"]:
        assert a.get(base + bad)[0] in (403, 404, 410), bad
    assert a.get(f"{base}/r/wrong/state")[0] == 410
    if not lan.startswith("127."):
        assert a.get(f"http://{lan}:{port}/c/SECRET/state")[0] == 404

    # Closing the room: what phones sent goes with it, the laptop's own files stay for the next room, old links die.
    assert a.send(r, "temp.jpg", b"x", uid="temp0000")[0] == 200
    old_dir = room.dir
    laptop.get(control + "close", {})
    assert a.get(r + "state")[0] == 410 and not os.path.exists(old_dir) and not os.path.exists(saved)
    assert os.path.exists(big)  # the laptop's originals are never deleted
    laptop.get(control + "open", {"minutes": 30})
    assert [i["name"] for i in room.items.values()] == ["café photo.bin", "beach.jpg"]
    assert a.get(r + "state")[0] == 410
    r = f"{base}/r/{room.token}/"

    # PIN: five wrong tries lock the room.
    laptop.get(control + "settings", {"use_pin": True})
    wrong = "0000" if room.pin != "0000" else "1111"
    assert stranger.json(r + "state")[1] == {"state": "new", "pin": True}
    for left in [4, 3, 2, 1]:
        assert stranger.json(r + "join", {"name": "x", "pin": wrong}) == (403, {"error": "pin", "left": left})
    assert stranger.json(r + "join", {"name": "x", "pin": wrong})[0] == 410
    assert a.get(r + "state")[0] == 410
    laptop.get(control + "open", {"minutes": 30})
    r = f"{base}/r/{room.token}/"
    assert a.json(r + "join", {"name": "iPhone", "pin": room.pin})[0] == 200

    # Time is up, and idle for too long.
    room.deadline = time.time() - 1
    assert a.get(r + "state")[0] == 410
    laptop.get(control + "open", {"minutes": 30})
    room.last_activity = time.time() - qsendr.IDLE_MINUTES * 60 - 1
    assert a.get(f"{base}/r/{room.token}/state")[0] == 410

    # The main screen: one file and one QR. Anyone who scans gets it, no joining; it closes after 10 minutes or at once.
    assert laptop.get(control + "share?name=" + quote("holiday.jpg"), raw=b"jpeg bytes")[0] == 200
    sh = laptop.json(control + "state")[1]["share"]
    assert sh["name"] == "holiday.jpg" and sh["size"] == 10 and sh["downloads"] == 0 and "<svg" in sh["qr"]
    assert qsendr.SHARE_MINUTES * 60 - 5 < sh["seconds_left"] <= qsendr.SHARE_MINUTES * 60
    s_url, scanner = sh["url"], Phone()
    assert scanner.get(s_url)[0] == 200 and scanner.json(s_url + "info")[1]["name"] == "holiday.jpg"
    assert scanner.get(s_url + "file") == (200, b"jpeg bytes") and "holiday.jpg" in scanner.headers["Content-Disposition"]
    assert scanner.get(s_url + "file", headers={"Range": "bytes=5-"}) == (206, b"bytes")  # a broken download resumes
    settle(room)
    assert laptop.json(control + "state")[1]["share"]["downloads"] == 2  # each finished download, resumed ones included
    copy = room.share["path"]
    assert qsendr.is_inside(copy, room.drop_dir)
    with socket.create_connection(("127.0.0.1", port)) as s:  # over 100 MB: refused before any of it is read
        s.sendall(f"POST /c/SECRET/share?name=big.bin HTTP/1.1\r\nHost: x\r\nContent-Length: {qsendr.SHARE_BYTES + 1}\r\n\r\n".encode())
        assert b" 413 " in s.recv(200)
    assert room.share["name"] == "holiday.jpg"
    laptop.get(control + "unshare", {})  # Close now: the link dies and QSendr's copy goes
    assert scanner.get(s_url + "file")[0] == 410 and scanner.get(s_url + "info")[0] == 410 and not os.path.exists(copy)
    assert laptop.get(control + "share?name=a.txt", raw=b"a")[0] == 200
    s_url = laptop.json(control + "state")[1]["share"]["url"]
    room.share["deadline"] = time.time() - 1  # ten minutes up
    assert scanner.get(s_url + "file")[0] == 410 and laptop.json(control + "state")[1]["share"] is None
    room.take([big])  # Explorer's "Send to" with one file: shared by path, nothing copied, never deleted
    assert room.share["path"] == big and not room.share["copy"]
    room.stop_share(None)
    assert os.path.exists(big)
    room.take([pic, big])  # several: into the room, and the main screen says so
    assert room.share is None and "Room" in laptop.json(control + "state")[1]["notice"]
    room.take([folder])  # a folder: not shared at all
    assert room.share is None and "Folders" in room.notice and not any(it["name"].startswith("trip") for it in room.items.values())

    # A second launch hands its files to this one instead of starting another server.
    qsendr.RUNNING = os.path.join(d, "running.json")
    qsendr.webbrowser.open = lambda url: None
    with open(qsendr.RUNNING, "w") as f:
        json.dump({"port": port, "secret": "SECRET"}, f)
    note = os.path.join(d, "note.txt")
    open(note, "w").close()
    assert qsendr.hand_off([note]) and room.share["path"] == note
    os.remove(qsendr.RUNNING)
    assert not qsendr.hand_off([note])

    try:  # a second copy must not silently share the port
        qsendr.make_server(room, port, "other")
        raise AssertionError("second server bound the same port")
    except OSError:
        pass

    server.shutdown()
    server.server_close()
    room.close("test over")
    shutil.rmtree(room.drop_dir, ignore_errors=True)

# Started by Windows at sign-in: in the tray with the room closed, so nothing is open to the network yet.
room = qsendr.Room(30, start_open=False)
server = qsendr.make_server(room, 0, "SECRET")
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{server.server_address[1]}"
room.base = base
assert laptop.json(base + "/c/SECRET/state")[1]["status"] == "off" and Phone().get(base + "/r/anything/state")[0] == 410
code, body = laptop.get(base + "/icon.png")
assert code == 200 and body[1:4] == b"PNG"
laptop.get(base + "/c/SECRET/open", {"minutes": 30})
assert Phone().json(f"{base}/r/{room.token}/state")[1]["state"] == "new"
laptop.get(base + "/c/SECRET/quit", {})  # the control page's Quit stops the server
for _ in range(50):
    try:
        urllib.request.urlopen(base + "/icon.png", timeout=1)
        time.sleep(0.1)
    except OSError:
        break
else:
    raise AssertionError("Quit did not stop the server")
server.server_close()
room.close("test over")
shutil.rmtree(room.drop_dir, ignore_errors=True)

# Network help, from what Windows reports (this laptop's real answer, then made-up ones).
real = {"addresses": [{"IPAddress": "172.55.8.248", "InterfaceAlias": "Ethernet 2"}, {"IPAddress": "192.168.254.105", "InterfaceAlias": "Wi-Fi"}],
        "profiles": [{"Name": "GlobeAtHome_CE2E5_5", "InterfaceAlias": "Wi-Fi", "Category": "Public"}],
        "rules": [{"Enabled": "True", "Action": "Allow", "Profile": "Public"}]}
network, category, found = qsendr.assess(real, "192.168.254.105", False)
levels = [level for level, _, _ in found]
assert (network, category) == ("GlobeAtHome_CE2E5_5", "Public") and levels[:2] == ["warn", "ok"], found
assert "public network" in found[0][1] and found[0][2] == "network"
blocked = real | {"rules": [{"Enabled": "True", "Action": "Allow", "Profile": "Public"}, {"Enabled": "True", "Action": "Block", "Profile": "Any"}]}
assert any(level == "bad" and fix == "firewall" for level, _, fix in qsendr.assess(blocked, "192.168.254.105", False)[2])
private_only = real | {"profiles": [{"Name": "Home", "InterfaceAlias": "Wi-Fi", "Category": "Private"}]}
found = qsendr.assess(private_only, "192.168.254.105", False)[2]  # the Allow rule is for Public, so not this network
assert any(level == "warn" and fix == "firewall" for level, _, fix in found), found
assert qsendr.assess(private_only, "192.168.254.105", True)[2][0][0] == "ok"  # a phone got through: say so first
assert qsendr.assess({}, "10.0.0.2", False)[2][-1][0] == "info"  # Windows said nothing: still give the general advice
assert qsendr.assess({"rules": {"Enabled": "True", "Action": "Allow", "Profile": "Any"},  # PowerShell's lone object, not a list
                      "addresses": {"IPAddress": "10.0.0.2", "InterfaceAlias": "Wi-Fi"},
                      "profiles": {"Name": "Home", "InterfaceAlias": "Wi-Fi", "Category": "Private"}}, "10.0.0.2", False)[2][1][0] == "ok"
hotspot = {"addresses": [{"IPAddress": "192.168.137.1", "InterfaceAlias": "Local Area Connection* 10"}, {"IPAddress": "192.168.254.105", "InterfaceAlias": "Wi-Fi"}],
           "profiles": real["profiles"]}
assert qsendr.addresses(hotspot, "192.168.254.105") == [("192.168.254.105", "Wi-Fi · GlobeAtHome_CE2E5_5"), ("192.168.137.1", "This laptop's hotspot")]
# The phone app's copy of the shared look and room screens matches qsendr.py (py sync_ui.py rewrites it).
import sync_ui
for name, text in sync_ui.build().items():
    with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), name), encoding="utf-8") as f:
        assert f.read() == text, f"{name} is out of date: run py sync_ui.py"
print("ok")
