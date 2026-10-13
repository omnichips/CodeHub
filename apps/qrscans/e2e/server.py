"""A QSendr laptop server with a fixed secret and room link, for the browser tests in this folder. Not part of the app."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import qsendr

room = qsendr.Room(30, start_open=False)
server = qsendr.make_server(room, 4196, "SECRET")
room.base = "http://127.0.0.1:4196"
server.serve_forever()
