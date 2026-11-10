#!/usr/bin/env python3
"""Local development server for the Foz Atlântica site.

Plain `python3 -m http.server` lets the browser keep cached copies of
index.html, site.css and site.js, so an edit looks like it did not land until
you hard-refresh. That bit us three times.

This serves code files with `no-store` and leaves the images cacheable, which
is the combination you actually want: the code is always fresh on an ordinary
refresh, and the 54MB of frames are still only fetched once.
"""

import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
CODE = ('.html', '.css', '.js', '.json', '.map')


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        path = self.path.split('?')[0].split('#')[0].lower()
        if path.endswith('/') or path.endswith(CODE):
            self.send_header('Cache-Control', 'no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=86400')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 943 frame requests would bury everything useful
        if not self.path.startswith('/assets/frames/'):
            super().log_message(fmt, *args)


os.chdir(os.path.dirname(os.path.abspath(__file__)))
socketserver.TCPServer.allow_reuse_address = True

try:
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print('')
        print(f'  Foz Atlântica   →   http://localhost:{PORT}')
        print('')
        print('  Code is served uncached, so a normal refresh is enough.')
        print('  Press Ctrl+C to stop.')
        print('')
        httpd.serve_forever()
except OSError as e:
    print(f'\n  Could not start on port {PORT}: {e}')
    print(f'  Something may already be running there. Try: python3 serve.py {PORT + 1}\n')
    sys.exit(1)
except KeyboardInterrupt:
    print('\n  Stopped.\n')
