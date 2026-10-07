"""Style preview server: the real app from web/, with one theme stylesheet injected.

  python docs/superpowers/design-review/styles/serve.py [port]     (default 8150)

  /t/<theme>/            the app with styles/<theme>.css after style.css ("base" = no theme)
  /t/<theme>/?real       the same without the demo state (keeps whatever this browser saved)
  /                      the gallery (gallery.html)
Nothing in web/ changes; every response is sent with Cache-Control: no-store.
"""
import http.server, os, re, sys
from urllib.parse import urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..', 'web'))


class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
                      '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def translate_path(self, path):
        p = urlsplit(path).path
        m = re.match(r'^/t/[\w-]+/(.*)$', p)
        if m:
            return os.path.join(WEB, m.group(1) or 'index.html')
        if p == '/':
            return os.path.join(HERE, 'gallery.html')
        return os.path.join(HERE, p.lstrip('/'))

    def do_GET(self):
        u = urlsplit(self.path)
        m = re.match(r'^/t/([\w-]+)/(index\.html)?$', u.path)
        if not m:
            return super().do_GET()
        theme = m.group(1)
        html = open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
        link = '' if theme == 'base' else f'<link rel="stylesheet" href="/{theme}.css">\n'
        html = html.replace('</head>', link + '</head>', 1)
        if u.query != 'real':
            html = html.replace('<script type="module"', '<script src="/seed.js"></script>\n<script type="module"', 1)
        body = html.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8150
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
