"""Forwards Sentry envelopes to the instance and logs each request, so a test can
check what actually left the application (before the instance masks anything)."""
import gzip, http.server, json, os, urllib.error, urllib.request

UPSTREAM = os.environ["UPSTREAM"]
LOG = "/rec/traffic.jsonl"


class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("content-length", 0)))
        raw = body
        if self.headers.get("content-encoding") == "gzip":
            try:
                raw = gzip.decompress(body)
            except Exception:
                pass
        with open(LOG, "ab") as f:
            f.write(json.dumps({"path": self.path, "body": raw.decode("utf-8", "replace")}).encode() + b"\n")
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method="POST",
                                     headers={k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length")})
        try:
            r = urllib.request.urlopen(req)
            code, out = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, out = e.code, e.read()
        self.send_response(code)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


os.makedirs("/rec", exist_ok=True)
http.server.ThreadingHTTPServer(("0.0.0.0", 8091), H).serve_forever()
