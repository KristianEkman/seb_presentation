"""Local dev server for the deck.

Serves the folder with Cache-Control: no-cache (so edited files are picked up;
unchanged ones still come back as a quick 304), and accepts PUT /notes so the
presenter view can save speaker notes straight into notes.json.

Usage: python3 server.py [port]
"""
import json
import os
import sys
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

ROOT = os.path.dirname(os.path.abspath(__file__))
NOTES = os.path.join(ROOT, "notes.json")
notes_lock = Lock()


def slide_key(k):
    return (0, int(k)) if k.isdigit() else (1, k)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_PUT(self):
        if self.path != "/notes":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            slide = str(int(body["slide"]))
            text = body["text"]
            if not isinstance(text, str):
                raise ValueError("text must be a string")
        except (ValueError, KeyError, TypeError) as e:
            self.send_error(400, str(e))
            return

        with notes_lock:
            try:
                with open(NOTES, encoding="utf-8") as f:
                    notes = json.load(f)
            except FileNotFoundError:
                notes = {}
            if text.strip():
                notes[slide] = text
            else:
                notes.pop(slide, None)
            notes = {k: notes[k] for k in sorted(notes, key=slide_key)}
            # Write to a temp file and rename, so a crash never leaves a half-written notes.json.
            fd, tmp = tempfile.mkstemp(dir=ROOT, prefix=".notes.", suffix=".json")
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(notes, f, ensure_ascii=False, indent=2)
                f.write("\n")
            os.replace(tmp, NOTES)

        self.send_response(204)
        self.end_headers()


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # The browser often drops a video/audio download partway (reload, seeking,
        # switching slides). That's harmless, so don't print a traceback for it.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    Server(("", port), Handler).serve_forever()
