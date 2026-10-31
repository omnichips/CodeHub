"""Tray volume booster: writes a device-scoped preamp to Equalizer APO's config."""
import ctypes
import ctypes.wintypes as wt
import functools
import math
import random
import shutil
import sys
import threading
import time
import tkinter as tk
import winreg
from pathlib import Path

import pystray
from PIL import Image, ImageDraw

APO = Path(r"C:\Program Files\EqualizerAPO\config")
CONFIG = APO / "config.txt"
LIMITER = APO / "LoudMax64.dll"  # optional; used only if present
# Words matched against the endpoint's device + connection name. Laptop speakers only.
DEVICE = "Realtek Speakers"
MAX_PERCENT = 300
STEP = 5
# Laptop speakers can't play deep bass; cutting it while boosted delays distortion. Tune by ear.
HIGHPASS_HZ = 150
MUTE_DB = -150  # below the 24-bit noise floor
HOTKEYS = {1: 0x26, 2: 0x28}  # Ctrl+Alt + VK_UP / VK_DOWN
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"


def percent_to_db(percent):
    percent = max(0, min(MAX_PERCENT, percent))
    return MUTE_DB if percent == 0 else 20 * math.log10(percent / 100)


def config_text(percent):
    lines = [f"Device: {DEVICE}", f"Preamp: {percent_to_db(percent):.2f} dB"]
    if percent > 100:
        lines.append(f"Filter: ON HP Fc {HIGHPASS_HZ} Hz")
        if LIMITER.exists():
            lines.append(f'VSTPlugin: Library "{LIMITER}"')
    return "\n".join(lines) + "\n"


def write_gain(percent):
    CONFIG.write_text(config_text(percent))


def describe(percent):
    return "Muted" if percent == 0 else f"{percent}%  ({percent_to_db(percent):+.1f} dB)"


def arc(center, r, a1, a2):
    return [(center[0] + r * math.cos(math.radians(a)), center[1] + r * math.sin(math.radians(a)))
            for a in range(a1, a2 + 1, 10)]


@functools.lru_cache
def draw_icon(waves, muted=False):
    """A speaker drawn like a kid with crayons; the number of waves shows the level."""
    rnd = random.Random(7)  # same wobble every run
    img = Image.new("RGBA", (256, 256))
    d = ImageDraw.Draw(img)

    def crayon(pts, color, width=14, fill=None, jitter=4):
        if fill:
            d.polygon(pts, fill=fill)  # fill and outline don't line up, like a kid's colouring
            pts = pts + pts[:1]
        wobbly = []
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            n = max(2, int(math.dist((x1, y1), (x2, y2)) // 14))
            wobbly += [(x1 + (x2 - x1) * i / n + rnd.uniform(-jitter, jitter),
                        y1 + (y2 - y1) * i / n + rnd.uniform(-jitter, jitter)) for i in range(n)]
        wobbly.append(pts[-1])
        d.line(wobbly, fill=color, width=width, joint="curve")

    crayon([(30, 92), (98, 86), (104, 170), (26, 164)], "#1d4ed8", fill="#60a5fa")
    crayon([(98, 86), (156, 30), (166, 226), (104, 170)], "#b91c1c", fill="#f87171")
    d.ellipse((46, 108, 60, 122), fill="black")
    d.ellipse((72, 104, 86, 118), fill="black")
    crayon(arc((64, 130), 20, 20, 160), "black", width=7, jitter=1.5)
    for r, color in list(zip((30, 58, 86), ("#16a34a", "#f59e0b", "#a21caf")))[:waves]:
        crayon(arc((160, 128), r, -55, 55), color)
    if muted:
        crayon([(180, 76), (244, 180)], "#dc2626", width=22)
        crayon([(244, 72), (176, 182)], "#dc2626", width=22)
    return img


def icon_for(percent):
    if percent == 0:
        return draw_icon(0, muted=True)
    return draw_icon(1 if percent < 100 else 2 if percent == 100 else 3)


def register_login_reset():
    # A power cut while boosted leaves config.txt boosted; undo it at the next login.
    if getattr(sys, "frozen", False):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as k:
            winreg.SetValueEx(k, "VolumeBoostReset", 0, winreg.REG_SZ, f'"{sys.executable}" --reset')


def hotkey_loop(on_step, on_fail):
    user32 = ctypes.windll.user32
    for hotkey_id, vk in HOTKEYS.items():
        if not user32.RegisterHotKey(None, hotkey_id, 0x1 | 0x2, vk):  # MOD_ALT | MOD_CONTROL
            on_fail()
    msg = wt.MSG()
    while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
        if msg.message == 0x312:  # WM_HOTKEY
            on_step(STEP if msg.wParam == 1 else -STEP)


def main():
    backup = CONFIG.with_suffix(".txt.bak")
    if CONFIG.exists() and not backup.exists():
        shutil.copy2(CONFIG, backup)
    write_gain(100)  # crash-safe: always start at normal volume
    register_login_reset()

    root = tk.Tk()
    root.title("Volume Boost")
    root.attributes("-topmost", True, "-toolwindow", True)
    root.resizable(False, False)

    label = tk.Label(root, font=("Segoe UI", 11))
    label.pack(padx=12, pady=(10, 0))

    pending_write = None

    def on_slide(value):
        nonlocal pending_write
        p = int(float(value))
        label.config(text=describe(p))
        icon.icon = icon_for(p)
        icon.title = f"Volume Boost: {describe(p)}"
        # Equalizer APO reloads on every write; wait for the slider to settle.
        if pending_write:
            root.after_cancel(pending_write)
        pending_write = root.after(100, write_gain, p)

    slider = tk.Scale(root, from_=0, to=MAX_PERCENT, resolution=STEP, orient="horizontal",
                      length=280, showvalue=False, tickinterval=100, command=on_slide)
    slider.pack(padx=12, pady=10)

    def nudge(delta):
        slider.set(int(slider.get()) + delta)

    def wheel(event):
        nudge(STEP if event.delta > 0 else -STEP)
        return "break"

    root.bind("<MouseWheel>", wheel)
    slider.bind("<MouseWheel>", wheel)

    hidden_at = 0.0

    def hide():
        nonlocal hidden_at
        hidden_at = time.monotonic()
        root.withdraw()

    def show():
        work = wt.RECT()
        ctypes.windll.user32.SystemParametersInfoW(0x30, 0, ctypes.byref(work), 0)  # SPI_GETWORKAREA
        root.update_idletasks()
        root.geometry(f"+{work.right - root.winfo_reqwidth() - 24}"
                      f"+{work.bottom - root.winfo_reqheight() - 56}")
        root.deiconify()
        root.lift()
        root.focus_force()

    def toggle():
        if root.state() != "withdrawn":
            hide()
        elif time.monotonic() - hidden_at > 0.3:  # else this tray click already closed it via focus loss
            show()

    def on_focus_out(_):
        root.after(50, lambda: root.focus_get() is None and root.state() != "withdrawn" and hide())

    root.bind("<FocusOut>", on_focus_out)

    def quit_app():
        write_gain(100)
        icon.stop()
        root.destroy()

    icon = pystray.Icon("VolumeBoost", icon_for(100), "Volume Boost", pystray.Menu(
        # pystray callbacks run on its own thread; hop to Tk's thread
        pystray.MenuItem("Show / hide", lambda: root.after(0, toggle), default=True),
        pystray.MenuItem("Quit", lambda: root.after(0, quit_app)),
    ))

    root.protocol("WM_DELETE_WINDOW", hide)
    # Tk maps Windows logoff/shutdown (WM_QUERYENDSESSION) to this protocol.
    root.protocol("WM_SAVE_YOURSELF", lambda: write_gain(100))

    slider.set(100)
    root.withdraw()
    icon.run_detached()
    threading.Thread(target=hotkey_loop, daemon=True, args=(
        lambda delta: root.after(0, nudge, delta),
        lambda: icon.notify("Ctrl+Alt+Up/Down is taken by another app.", "Volume Boost"),
    )).start()
    try:
        root.mainloop()
    finally:
        write_gain(100)


if __name__ == "__main__":
    if "--test" in sys.argv:
        assert percent_to_db(100) == 0
        assert abs(percent_to_db(200) - 6.02) < 0.01
        assert abs(percent_to_db(300) - 9.54) < 0.01
        assert abs(percent_to_db(50) + 6.02) < 0.01
        assert percent_to_db(999) == percent_to_db(300)  # cap holds
        assert percent_to_db(0) == percent_to_db(-5) == MUTE_DB
        assert "HP" not in config_text(100) and "HP" in config_text(150)
        assert "VST" not in config_text(100)
        print("ok")
    elif "--reset" in sys.argv:
        write_gain(100)
    elif "--make-icon" in sys.argv:
        draw_icon(2).save("icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    else:
        main()
