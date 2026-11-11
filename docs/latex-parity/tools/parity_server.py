# Serves public/ plus /__parity/: GET/PUT files in the scratch dir, POST /__parity/tex/<name> compiles + rasterises.
import http.server, os, sys, subprocess, json, re
PUB = sys.argv[1]; OUT = sys.argv[2]; PORT = int(sys.argv[3])
os.makedirs(OUT, exist_ok=True)
def safe(n): return re.sub(r'[^A-Za-z0-9_.-]', '_', n)
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=PUB, **k)
    def end_headers(s):
        s.send_header('Cache-Control', 'no-store'); super().end_headers()
    def _body(s): return s.rfile.read(int(s.headers.get('Content-Length', 0)))
    def _send(s, code, data, ctype='application/json'):
        s.send_response(code); s.send_header('Content-Type', ctype); s.send_header('Content-Length', str(len(data))); s.end_headers(); s.wfile.write(data)
    def do_GET(s):
        if s.path.startswith('/__parity/'):
            p = os.path.join(OUT, safe(s.path[10:]))
            if not os.path.exists(p): return s._send(404, b'{}')
            return s._send(200, open(p, 'rb').read(), 'image/png' if p.endswith('.png') else 'text/plain')
        return super().do_GET()
    def do_PUT(s):
        if not s.path.startswith('/__parity/'): return s._send(403, b'{}')
        open(os.path.join(OUT, safe(s.path[10:])), 'wb').write(s._body()); s._send(200, b'{"ok":true}')
    def do_POST(s):
        if not s.path.startswith('/__parity/tex/'): return s._send(403, b'{}')
        name = safe(s.path[14:]); dpi = s.headers.get('X-Dpi', '254')
        eng = s.headers.get('X-Engine', 'pdflatex')
        open(os.path.join(OUT, name + '.tex'), 'wb').write(s._body())
        body = open(os.path.join(OUT, name + '.tex'), 'rb').read()
        # remember picture (\chemmove, overlays) needs a second run to find the marked points
        for _ in range(2 if b'chemmove' in body or b'remember picture' in body else 1):
            r = subprocess.run([eng, '-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', name + '.tex'], cwd=OUT, capture_output=True, timeout=180)
            if r.returncode: break
        ok = r.returncode == 0
        log = r.stdout.decode('utf8', 'replace')[-3000:]
        if ok:
            g = subprocess.run(['gs', '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=png16m', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-r' + dpi, '-sOutputFile=' + name + '.tex.png', name + '.pdf'], cwd=OUT, capture_output=True)
            ok = g.returncode == 0
        s._send(200, json.dumps({'ok': ok, 'log': '' if ok else log}).encode())
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
