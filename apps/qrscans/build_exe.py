"""py build_exe.py — builds dist/QSendr.exe and puts its size and SHA-256 on the hub page (index.html).

dist/ is skipped by the hub build and by git, so the exe is neither deployed with the site nor committed: attach it to
a GitHub Release (the hub page links there) and publish the fingerprint this prints.

Needs, once:  py -m pip install pyinstaller pystray pillow segno
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
exe = os.path.join(here, "dist", "QSendr.exe")
os.makedirs(os.path.dirname(exe), exist_ok=True)

with tempfile.TemporaryDirectory() as work:
    ico = os.path.join(work, "qsendr.ico")
    Image.open(os.path.join(here, "logo.png")).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    subprocess.run([sys.executable, "-m", "PyInstaller", "--onefile", "--windowed", "--noconfirm", "--clean",
                    "--name", "QSendr", "--icon", ico, "--add-data", f"{os.path.join(here, 'logo.png')}{os.pathsep}.",
                    "--distpath", work, "--workpath", os.path.join(work, "build"), "--specpath", work,
                    os.path.join(here, "qsendr.py")], check=True)
    shutil.copy(os.path.join(work, "QSendr.exe"), exe)

with open(exe, "rb") as f:
    digest = hashlib.sha256(f.read()).hexdigest().upper()
mb = os.path.getsize(exe) / 1e6

page = os.path.join(here, "index.html")
with open(page, encoding="utf-8") as f:
    html = f.read()
html, n = re.subn(r"<!--size-->.*?<!--/size-->", f"<!--size-->{mb:.0f} MB<!--/size-->", html)
html, m = re.subn(r"<!--sha256-->.*?<!--/sha256-->", f"<!--sha256-->{digest}<!--/sha256-->", html)
assert n and m, "index.html lost its <!--size--> or <!--sha256--> marker"
with open(page, "w", encoding="utf-8") as f:
    f.write(html)
print(f"Built {exe} ({mb:.1f} MB)\nSHA-256 {digest}")
