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

943 frames, ~54 MB total. The original `.mp4` files are kept at the repo root
as masters; they are not loaded by the site.

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
python3 -m http.server 8123
```

Then open http://localhost:8123.

The site needs a server because it loads 943 image files by relative path.
Double-clicking `index.html` itself is not reliable — browsers restrict what a
page opened from `file://` may load, and it varies by browser.

**The local server stops when you close its panel, quit VS Code or restart the
machine.** That is normal, and it is why the address goes dead — just start it
again. To get an address that does not depend on your computer being on, run the
*Publish to the web* task.

## Regenerating the frames

If the source videos change, re-run (1080p sources at 1440px, 720p sources
kept at native width):

```bash
for i in 1 2 3 7; do mkdir -p assets/frames/c$i && ffmpeg -i $i.mp4 -vf scale=1440:-2 -q:v 5 assets/frames/c$i/%04d.jpg; done
```

```bash
for i in 4 5 6; do mkdir -p assets/frames/c$i && ffmpeg -i $i.mp4 -vf scale=1280:-2 -q:v 5 assets/frames/c$i/%04d.jpg; done
```

Then update the `frames` and `dur` values in the `CH` table at the top of
`js/site.js` to match `ffprobe`'s reported frame count and duration.

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
