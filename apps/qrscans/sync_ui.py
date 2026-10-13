"""py sync_ui.py — writes ui.css and ui.js, the look and the room screens the phone app (index.html) shares with the laptop page.

They come from qsendr.py, so there is one copy to edit. test_qsendr.py fails if these files are out of date.
"""
import os

import qsendr

here = os.path.dirname(os.path.abspath(__file__))


def build():
    return {"ui.css": qsendr.CSS.lstrip() + qsendr.APP_CSS, "ui.js": qsendr.JS.lstrip() + qsendr.APP_JS}


def main():
    for name, text in build().items():
        with open(os.path.join(here, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print(f"wrote {name} ({len(text) // 1024} KB)")


if __name__ == "__main__":
    main()
