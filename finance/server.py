"""Local web UI for the financial baseline.

    python -m finance.server        then open http://localhost:8000

Stdlib only -- no Flask, no pip install, one less thing to break on a
teammate's machine ten minutes before a demo.

The page posts raw CSV text and this calls finance.budget.analyze(), the same
function the CLI uses. Reimplementing the allocation in JavaScript would have
avoided the server but guaranteed the two drift apart.

Local demo tool: binds to localhost, holds nothing on disk, and is not
hardened for exposure to a network.
"""

from __future__ import annotations

import json
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

from finance.budget import analyze, load_config

STATIC = Path("finance/static")
MAX_UPLOAD = 1_000_000  # a P&L is a few KB; anything larger is a mistake


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/index.html"):
            return self._send(200, "text/html", (STATIC / "index.html").read_bytes())
        if self.path == "/sample.csv":
            return self._send(200, "text/csv", Path("data/in/pnl.csv").read_bytes())
        if self.path == "/sample-distressed.csv":
            return self._send(
                200, "text/csv", Path("data/in/pnl_distressed.csv").read_bytes()
            )
        return self._send(404, "text/plain", b"not found")

    def do_POST(self):
        if self.path != "/analyze":
            return self._send(404, "text/plain", b"not found")

        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_UPLOAD:
            return self._json(413, {"error": "File too large; expected a P&L CSV."})

        body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            result = analyze(body, load_config(), source="web upload")
        except ValueError as exc:
            # Input problems are the user's to fix, so the message goes to them.
            return self._json(400, {"error": str(exc)})
        except Exception as exc:  # noqa: BLE001 - a demo server should not 500 blank
            return self._json(500, {"error": f"Unexpected error: {exc}"})

        return self._json(200, result)

    def _json(self, code: int, payload: dict):
        self._send(code, "application/json", json.dumps(payload).encode())

    def _send(self, code: int, ctype: str, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        pass  # default logging buries the startup message in request noise


def main() -> int:
    server = HTTPServer(("127.0.0.1", 8000), Handler)
    print("MiseEnVue financial baseline -> http://localhost:8000  (ctrl-c to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
