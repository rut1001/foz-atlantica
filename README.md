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
assets/hero.jpg    unused — nothing references it
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

943 frames, ~133 MB total.

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

## Enquiries and the admin page

Submissions from the form go to a Supabase project (`foz-atlantica`,
eu-central-1) and are read back at **`/admin/`**, which nothing on the site
links to.

### How it is secured

The site is static. There is no server of ours between a visitor and the
database, so the Supabase publishable key sits in `js/backend.js` in plain
sight — that is the intended shape, not an oversight. Every real control is in
the database:

| | |
|---|---|
| `enquiries` | RLS on |
| INSERT | allowed to `anon`, with `handled` forced to false |
| SELECT | allowed only where `auth.uid()` equals the one admin user id |
| UPDATE / DELETE | same single user id |
| Column limits | CHECK constraints on every text column, and an email shape |

The SELECT policy names a **user id**, not the `authenticated` role. That
distinction is the whole security model: GoTrue's signup endpoint accepts the
publishable key, so a stranger can mint themselves an account and arrive
holding `authenticated`. A policy written `to authenticated` would hand them
every name, email and phone number in the table.

This was tested rather than assumed. With a second account signed in and
genuinely authenticated, `SELECT` returned `[]`, and a blanket `DELETE` and a
blanket `UPDATE` both reported success while changing nothing — PostgREST
answers 204/200 when RLS has simply hidden every row from them.

### The password

`/admin/` is unlisted, not secret: it carries `noindex` and nothing links to
it, but anyone who types the address gets the login box. That is fine, because
the password is not what hides the page — it is what Supabase checks before
issuing a token, and no token means no rows.

The password is **not in this repository** and must never be put here. A
password written into client-side JavaScript is readable by everyone,
doubly so in a public repo. To change it, use the Supabase dashboard:
Authentication → Users → `admin@fozatlantica.com` → Reset password.

That email address is an identifier only. No mail is ever sent to it, and the
domain is fictional like the rest of the project.

### Email notification on a new lead

A new row in `enquiries` sends an email. The chain is:

```
form → enquiries (INSERT) → trigger → pg_net → Edge Function → Resend → inbox
```

`supabase/functions/notify-lead/index.ts` and `supabase/sql/notifications.sql`
hold both ends of it.

**Why the database sends it, not the page.** The email fires on the row
actually being written, so a notification can never announce a lead that was
not stored, and there is no endpoint the site can be made to call in a loop to
flood the inbox. It also means the notification works the same from any host
the site is served on.

**The trigger cannot cost you a lead.** It runs AFTER INSERT, pg_net queues
rather than blocks, and the whole body is wrapped in an exception handler that
warns and returns rather than raising. If it raised, the INSERT would roll
back and the enquiry would be lost to spare an email.

**No secrets anywhere in this repository.** Three values live in Supabase
Vault — the Resend key, the recipient address and a 32-byte shared secret. The
recipient is in Vault for the same reason as the key: this repository is
public, and hardcoding it would publish the owner's inbox. `public.get_secret`
is the only door into the vault and is executable by `service_role` alone;
verified that both `anon` and a signed-in admin get `permission denied`.

**The function is open to the internet and that is fine.** `verify_jwt` is off,
because the caller is Postgres and this project's service role key is not
available to embed in a trigger. It authenticates on the shared secret
instead, compared in constant time. Verified that a request with no secret and
a request with a guessed one both get 403 before any work happens.

Everything the visitor typed is escaped before it goes into the email —
checked with `<img src=x onerror=...>` in the name and `<script>` in the
message; both arrived as text.

#### Two limits worth knowing

**No verified domain.** Resend therefore allows exactly one sender,
`onboarding@resend.dev`, and will only deliver to the Resend account owner's
own address. That is the right behaviour for a lead alert and the wrong
behaviour for anything else — autoresponders to the visitor, or alerts to a
colleague, both need a verified domain first. Add one in Resend, then change
`FROM` in the function and `LEAD_NOTIFY_TO` in Vault.

**Deliverability is `onboarding@resend.dev`'s, not yours.** Fine for a demo.
For anything real, a verified domain with SPF, DKIM and DMARC is what keeps
these out of spam.

#### Checking on it

```sql
select status_code, left(content, 200), error_msg, created
  from net._http_response order by created desc limit 5;
```

200 with `{"ok":true}` means Resend accepted it; 403 means the shared secret
does not match; an empty table right after an insert means nothing was
queued — look for the trigger's warning in the Postgres logs.

### Known gaps

- **Anyone may insert.** The form endpoint is open by design, so the table can
  be flooded. The CHECK constraints cap the size of each row; there is no rate
  limit. If that becomes a problem the fix is an edge function with a captcha
  or a per-IP limit, not a change to these policies.
- **Leaked-password protection is off** in the project's auth settings.
  Turning it on (Authentication → Policies) makes Supabase refuse passwords
  known to HaveIBeenPwned.
- **No privacy notice and no consent checkbox.** The form now stores real
  personal data. Before any real launch, say who holds it, why, and for how
  long, and ask the visitor to agree.
- **No backup.** Enquiries exist only in Supabase. The notification email is
  a second copy of each lead in practice, but it is not an export — take the
  CSV from /admin/ periodically.

## Where it is published

The site is deployed twice, from the same `main` branch, and a push updates
both:

| | |
|---|---|
| **Vercel** (primary) | https://foz-atlantica.vercel.app |
| GitHub Pages | https://rut1001.github.io/foz-atlantica/ |

Vercel is the one to hand out. The difference is not cosmetic:

- **`vercel.json` is only read by Vercel.** On Pages it is inert, so the CSP
  header, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS and
  `Permissions-Policy` are simply not sent there. The `<meta>` CSP in the two
  HTML files is the only protection that survives on Pages, which is why it
  exists separately rather than relying on the host.
- **Pages caches HTML for ten minutes** (`max-age=600`). That is not a
  theoretical problem: a deploy went out, the browser kept serving the
  previous `index.html`, and a form submission silently went nowhere because
  the old build had no backend wired in. Vercel sends
  `max-age=0, must-revalidate` for HTML, so a deploy is live on the next
  ordinary refresh, while `/assets/*` still gets a year of `immutable`.

`page_path` on each enquiry records which deployment it came from — `/` from
Vercel, `/foz-atlantica/` from Pages — so it is easy to tell them apart.

Keeping both is harmless. To retire Pages, turn it off in the repository's
Settings → Pages; nothing in the project depends on it.

## Regenerating the frames

This needs the `.mp4` masters present in this folder — see above, they are not
in the repository, so copy them back in first. No scaling: every chapter is
extracted at the source's own resolution, which is 1920x1080 for 1, 2, 3 and 7
and 1280x720 for 4, 5 and 6.

```bash
for i in 1 2 3 4 5 6 7; do mkdir -p assets/frames/c$i && ffmpeg -i $i.mp4 -q:v 2 assets/frames/c$i/%04d.jpg; done
```

`-q:v 2` is mjpeg's near-lossless end (the scale runs 1 to 31). An earlier
build used `-q:v 5` and downscaled the 1080p chapters to 1440px, which is
where the softness came from: the canvas backing store is already 2x the CSS
size on a retina screen, so a 1440px frame was being enlarged by about 1.8x
before anything was drawn.

**After re-extracting, bump `FRAME_VERSION` in `js/site.js` and the matching
`?v=` on the preload link in `index.html`.** Both must agree. `/assets/*` is
served `immutable` for a year, so without a new query string the re-encode
never reaches anyone who has already visited, and a mismatched preload fetches
the opening frame twice.

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
