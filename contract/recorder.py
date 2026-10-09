"""Forwards Sentry envelopes to the instance and logs each request, so a test can
check what actually left the application (before the instance masks anything)."""
import gzip, http.server, json, os, urllib.error, urllib.request

UPSTREAM = os.environ["UPSTREAM"]
LOG = "/rec/traffic.jsonl"


class H(http.server.BaseHTTPRequestHandler):
    def _body(self):
        """The request body, whether it came with a length or chunked (the Dart SDK sends chunked)."""
        if self.headers.get("transfer-encoding", "").lower() == "chunked":
            out = b""
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    self.rfile.readline()
                    return out
                out += self.rfile.read(size)
                self.rfile.readline()
        return self.rfile.read(int(self.headers.get("content-length", 0)))

    def do_POST(self):
        body = self._body()
        raw = body
        if self.headers.get("content-encoding") == "gzip":
            try:
                raw = gzip.decompress(body)
            except Exception:
                pass
        with open(LOG, "ab") as f:
            f.write(json.dumps({"path": self.path, "body": raw.decode("utf-8", "replace")}).encode() + b"\n")
        req = urllib.request.Request(UPSTREAM + self.path, data=body, method="POST",
                                     headers={**{k: v for k, v in self.headers.items() if k.lower() not in ("host", "content-length", "transfer-encoding")},
                                              "Content-Length": str(len(body))})
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
