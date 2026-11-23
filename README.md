# Foz Atlântica — scroll-driven property film

A single-page marketing site for an oceanfront real-estate investment in
Foz do Douro, Porto. The seven source videos were decomposed into JPEG image
sequences and are played back on one fixed `<canvas>` that the scroll position
scrubs — so the whole tour behaves like a film you can rewind by scrolling,
with a button at each chapter that plays the next clip at its real speed.

## Structure

```
index.html         markup + all copy
css/site.css       styling
js/site.js         the film engine
assets/hero.jpg    poster image (from 1.jpg)
assets/og.jpg      social preview
assets/frames/
  c1/0001.jpg …    121 frames  ← 1.mp4
  c2/…             145 frames  ← 2.mp4
  c3/…             145 frames  ← 3.mp4
  c4/…             121 frames  ← 4.mp4
  c5/…             121 frames  ← 5.mp4
  c6/…             121 frames  ← 6.mp4
  c7/…             169 frames  ← 7.mp4
```

943 frames, ~54 MB total.

**The source `.mp4` masters are not in this repository.** They are full-quality
originals, this repo is public so the site can be shared, and the site never
loads them — it runs entirely on `assets/frames/`. They are listed in
`.gitignore`, so they sit in the working folder without ever being committed.
They were purged from the history as well, not merely deleted going forward.
Keep your own backup of them; git is not holding one for you.

## How the tour works

| Screen | Sequence | Behaviour |
|---|---|---|
| Hero | `c1` frame 0 (identical to `1.jpg`) | Static. **Begin the tour** plays chapter 1. |
| Chapters 1–6 | `c1`–`c6` | Scroll scrubs the frames. Each chapter opens on a gate panel with a button that plays the clip. |
| Finale | `c7` | Loops continuously at 24fps behind the investment content. |

- Each chapter spacer is `frames × 1.9vh` tall, so scroll position maps
  linearly onto frame index.
- A play button animates `scrollY` from the chapter's start to its end over
  exactly the source clip's duration — clicking plays the video at 1×, and the
  tween lands on the next chapter's gate. Any wheel, touch or key input cancels
  the tween and hands control straight back to the user.
- Frames load progressively, chapter by chapter, in narrative order. The hero
  button stays disabled with a progress meter until chapter 1 is fully decoded.
  While a later chapter is still loading, scrubbing falls back to the nearest
  decoded frame rather than blanking.

## Running it

### In VS Code (easiest)

Open this folder in VS Code and press **Cmd+Shift+B**. That runs the default
task: it starts the local server and opens the site in your browser.

Every other action is a task too — **Terminal → Run Task…** from the menu:

| Task | What it does |
|---|---|
| ▶︎ Start the site | Serves on localhost:8123 and opens the browser (Cmd+Shift+B) |
| ■ Stop the site | Shuts the server down |
| ↻ Open the site in the browser | Reopens the tab if you closed it |
| 📱 Show the address for my phone | Prints the Wi-Fi address — it changes between networks |
| 🚀 Publish to the web | Deploys to Vercel for a permanent public address |
| ⬆︎ Save my changes to GitHub | Commits and pushes, asking you for a message |

VS Code will also offer to install the **Live Server** extension. With it you get
a **Go Live** button in the status bar that does the same thing on the same port,
and reloads the page automatically whenever you save a file.

### Without VS Code

Double-click `start.command`, or run from this folder:

```bash
python3 serve.py
```

Then open http://localhost:8123.

The site needs a server because it loads 943 image files by relative path.
Double-clicking `index.html` itself is not reliable — browsers restrict what a
page opened from `file://` may load, and it varies by browser.

`serve.py` is a thin wrapper around Python's own static server. The one thing
it adds is cache headers: HTML, CSS and JS are sent `no-store`, so an edit
always shows up on an ordinary refresh, while images keep a normal cache so the
54MB of frames are not refetched every time. Plain `python3 -m http.server`
leaves code cached, which repeatedly made edits look like they had not landed.

**The local server stops when you close its panel, quit VS Code or restart the
machine.** That is normal, and it is why the address goes dead — just start it
again. To get an address that does not depend on your computer being on, run the
*Publish to the web* task.

## Where it is published

The site is live at **https://rut1001.github.io/foz-atlantica/**, served by
GitHub Pages from `main` at the repository root. Pushing to `main` rebuilds it;
the build takes a minute or two.

The repository is public, which is what makes that address work on a free
account. Two consequences worth being deliberate about:

- **Everything in the repository is downloadable by anyone**, including all 943
  frames. That is unavoidable for any public site — a browser cannot display an
  image without first fetching it. The frames are 1440px JPEGs at quality 5,
  deliberately not the masters.
- **`vercel.json` does nothing here.** Pages will not read it, so the response
  headers it defines — `nosniff`, `Referrer-Policy`, `X-Frame-Options`, HSTS,
  `Permissions-Policy` and the CSP — are not sent. What still applies is the
  `<meta http-equiv="Content-Security-Policy">` in `index.html`, which is why
  that tag exists separately rather than relying on the host. GitHub Pages does
  enforce HTTPS on its own. If the site ever moves to Vercel, the full header
  set comes back with it.

`foz-atlantica-archive` is a private repository holding the original history,
including the `.mp4` masters. It is kept private on purpose; do not publish it.

## Regenerating the frames

This needs the `.mp4` masters present in this folder — see above, they are not
in the repository, so copy them back in first. Then re-run (1080p sources at
1440px, 720p sources kept at native width):

```bash
for i in 1 2 3 7; do mkdir -p assets/frames/c$i && ffmpeg -i $i.mp4 -vf scale=1440:-2 -q:v 5 assets/frames/c$i/%04d.jpg; done
```

```bash
for i in 4 5 6; do mkdir -p assets/frames/c$i && ffmpeg -i $i.mp4 -vf scale=1280:-2 -q:v 5 assets/frames/c$i/%04d.jpg; done
```

Then update the `frames` and `dur` values in the `CH` table at the top of
`js/site.js` to match `ffprobe`'s reported frame count and duration.

## Accessibility

The hard part of a site like this is that the content is a canvas: a screen
reader sees nothing, and the captions only exist while they happen to be
scrolled into view. What's in place:

- **A text version of the tour** (`#tour-text`) carries the whole narrative as
  headings and paragraphs, in order, read once. The canvas is `aria-hidden`
  and the caption scenes are too, so nothing is announced twice. **If you edit
  the chapter copy in the overlay, edit it here as well** — they are kept in
  sync by hand.
- **Skip links** — the page is ~18,000px tall, so the first three tab stops are
  "skip the film", "skip to the figures" and "skip to contact".
- **A visible focus ring** on every control. The buttons are custom-styled, so
  without it a keyboard user has no idea where they are.
- **Form errors** are announced through a `role="status"` region, fields get
  `aria-invalid`, and focus moves to the first field that needs fixing.
- **Reduced motion** — the looping finale holds its first frame instead of
  playing, button-triggered playback jumps rather than animating, and
  transitions are cut. Scroll scrubbing still works, because that is the
  reader's own input rather than something the page does to them.
- The floor-plan tabs are a proper tablist, with arrow-key navigation.
- Headings run in order with no skips, every field has a label, and the play
  buttons and map and plan SVGs all have accessible names.

What has **not** been done: no run through axe or WAVE, and no testing with an
actual screen reader or by anyone who relies on one. Contrast was checked
against the dark content plate and passes, but text over the film sits on a
moving image — the scrim and side wash hold it up, and that is a judgement
rather than a measurement. Treat this as careful work, not as a conformance
claim.

## Security

This is a static site, so the attack surface is small, but a review found four
things worth recording:

- **The dev server was handing out `.git/` to the whole network.** `serve.py`
  binds to every interface so the site can be opened on a phone, which means
  everyone on the Wi-Fi can reach it — and `http://<your-ip>:8123/.git/config`
  returned 200. The full history was downloadable. Dotfiles and directory
  listings are now refused. Path traversal was already blocked by Python's own
  handler.
- **The thank-you message built HTML from the visitor's name**, escaped by
  stripping `<>&`. Blocklist escaping is the wrong shape of fix; the message is
  now assembled from text nodes, and `<img src=x onerror=…>` renders as text.
- **Every submission was written to `localStorage`** — name, email, phone,
  message — and kept indefinitely for no benefit. That is gone, and because
  deleting the code does not delete what it already stored on a visitor's
  browser, the site now clears the old key on load.
- **The dotfile block was bypassable.** The first version of the fix checked
  the URL text, but the handler percent-decodes the path afterwards, so
  `/%2egit/config` walked straight past it and returned the real file. The
  check now runs on the resolved filesystem path, after decoding and after
  `realpath`, which also stops a symlink from leading out of the project.
  Thirteen encoding variants were tried against it; all return 404.
- **Google Fonts was the only third-party dependency.** Every visitor's IP
  reached Google, and the stylesheet could not be pinned with SRI. The two
  families are now self-hosted from `assets/fonts` (6 files, 272KB, Latin and
  Latin-Extended), so the page makes no external request at all and the policy
  below is `'self'` throughout.
- **No Content-Security-Policy.** There is one now, in three places so it
  survives wherever the site is hosted: a `<meta>` tag, `serve.py` response
  headers, and `vercel.json`. Every directive is `'self'`, with no
  form posts permitted at all. Verified that nothing is
  blocked — fonts load, the canvas paints, the film runs.

`vercel.json` also sets `nosniff`, `no-referrer`, `DENY` framing, HSTS and a
`Permissions-Policy` denying geolocation, camera and microphone.

**If you set `FORM_ENDPOINT`**, add that origin to `connect-src` in all three
CSP copies or the request is blocked.

Not done: no dependency scanning (there are no dependencies), no penetration
test, and the site has never been exposed to the public internet.

## Before this goes live

- **The enquiry form is not connected.** `FORM_ENDPOINT` at the top of
  `js/site.js` is `null`, so submissions are only written to `localStorage` and
  the success message says so on screen. Set it to a Formspree / API URL and
  that notice disappears on its own.
- **All figures are placeholders.** Prices, unit mix, availability and the
  completion date are invented for the demo. Search `index.html` for
  `INVENTED` — three blocks — and for the `PLACEHOLDER` comment above the
  footer, which lists everything needing real data: phone, email, AMI licence
  number, developer and architect names, and the specification claims
  (9.2 m of glazing, Estremoz marble, A2 energy target, terrace range).
- No yield or return figure appears anywhere, deliberately. A forward-looking
  return is the least defensible claim on a page like this, and real comparable
  developments publish none. Adding one back is a decision worth taking with
  advice.
- **A demonstration notice sits at the very bottom of the page** (`.demo-notice`
  in `index.html`, styled in `css/site.css`). It states plainly that the project,
  the company and every figure are invented and that the form delivers nowhere.
  If this ever becomes a real development, that block must be removed — and
  everything it currently excuses has to become true first.
- The footer disclaimer is written to be accurate about CGI imagery, indicative
  figures and Portuguese residence-by-investment eligibility. Have it reviewed
  rather than deleted.
