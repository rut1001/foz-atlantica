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


# connect-src names the Supabase project the enquiry form writes to and the
# admin console reads from. It is the single external origin this site talks
# to; everything else stays 'self'. If the project ever changes, this string,
# the one in vercel.json and the <meta> in index.html and admin/index.html all
# have to change together or the requests are blocked.
CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "font-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self' https://iwqbszwucnhsfccfuzyr.supabase.co; "
    "form-action 'none'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'none'"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    def _is_allowed(self):
        """Decide on the resolved filesystem path, never on the URL.

        Checking the URL text is not enough: the handler percent-decodes it
        afterwards, so `/%2egit/config` sails past a check for a leading dot
        and still lands on `.git/config`. Resolving the path first means the
        decoding and any `..` have already happened, and realpath collapses
        symlinks, so a link pointing out of the project cannot be followed
        either.
        """
        try:
            target = os.path.realpath(self.translate_path(self.path))
        except (OSError, ValueError):
            return False

        if target != ROOT and not target.startswith(ROOT + os.sep):
            return False  # escaped the project directory

        rel = os.path.relpath(target, ROOT)
        return not any(
            seg.startswith('.') for seg in rel.split(os.sep) if seg not in ('', '.')
        )

    def send_head(self):
        if not self._is_allowed():
            self.send_error(404, 'Not Found')
            return None
        return super().send_head()

    def version_string(self):
        # Default advertises the exact Python and handler version.
        return 'Foz'

    def list_directory(self, path):
        # No directory indexes; they hand out the whole file tree.
        self.send_error(404, 'Not Found')
        return None

    def end_headers(self):
        path = self.path.split('?')[0].split('#')[0].lower()
        if path.endswith('/') or path.endswith(CODE):
            self.send_header('Cache-Control', 'no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        else:
            self.send_header('Cache-Control', 'public, max-age=86400')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        super().end_headers()

    def log_message(self, fmt, *args):
        # 943 frame requests would bury everything useful
        if not self.path.startswith('/assets/frames/'):
            super().log_message(fmt, *args)


os.chdir(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.realpath(os.getcwd())
socketserver.TCPServer.allow_reuse_address = True

try:
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print('')
        print(f'  Foz Atlântica   →   http://localhost:{PORT}')
        print('')
        print('  Code is served uncached, so a normal refresh is enough.')
        print('  Reachable by everyone on your network, so dotfiles (.git and')
        print('  friends) and directory listings are blocked.')
        print('  Press Ctrl+C to stop.')
        print('')
        httpd.serve_forever()
except OSError as e:
    print(f'\n  Could not start on port {PORT}: {e}')
    print(f'  Something may already be running there. Try: python3 serve.py {PORT + 1}\n')
    sys.exit(1)
except KeyboardInterrupt:
    print('\n  Stopped.\n')
