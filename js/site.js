/* ============================================================
   Foz Atlântica — scroll-driven image-sequence film engine
   ------------------------------------------------------------
   Seven MP4s were decomposed into JPEG image sequences at 24fps
   (assets/frames/cN/0001.jpg …). One fixed canvas plays all of
   them: chapters 1–6 are scrubbed by scroll position, chapter 7
   loops on a timer behind the investment content.
   ============================================================ */
(function () {
  'use strict';

  /* ── Where enquiry submissions should POST. Leave null for a
        demo build; set to a Formspree / API URL to go live.   ── */
  const FORM_ENDPOINT = null;

  /* ── Chapter table ───────────────────────────────────────── */
  const CH = [
    { n: 1, frames: 121, dur: 5.04, name: 'The Arrival' },
    { n: 2, frames: 145, dur: 6.05, name: 'The Living Floor' },
    { n: 3, frames: 145, dur: 6.05, name: 'The Kitchen' },
    { n: 4, frames: 121, dur: 5.04, name: 'The Master Suite' },
    { n: 5, frames: 121, dur: 5.04, name: 'The Spa' },
    { n: 6, frames: 121, dur: 5.06, name: 'Wellness' },
    { n: 7, frames: 169, dur: 7.07, name: 'The Investment' }
  ];

  const VH_PER_FRAME = 1.9;   // scroll distance allotted to each frame
  const FPS = 24;
  const CONCURRENCY = 8;

  /* ── DOM ─────────────────────────────────────────────────── */
  const canvas   = document.getElementById('film');
  const ctx      = canvas.getContext('2d', { alpha: false });
  const scrim    = document.getElementById('scrim');
  const side     = document.getElementById('side');
  const overlay  = document.getElementById('overlay');
  const finale   = document.getElementById('finale');
  const finGate  = document.getElementById('finGate');
  const track    = document.getElementById('track');
  const railEl   = document.getElementById('rail');
  const heroScene= document.getElementById('s-hero');
  const startBtn = document.getElementById('startBtn');
  const loadMeter= document.getElementById('loadMeter');
  const scrollLine = document.getElementById('scrollLine');
  const chapNum  = document.getElementById('chapNum');
  const chapName = document.getElementById('chapName');

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Sequence store ──────────────────────────────────────── */
  const SEQ = CH.map(c => ({
    n: c.n, total: c.frames, imgs: new Array(c.frames),
    loaded: 0, started: false, done: false, promise: null
  }));

  function frameURL(n, i) {
    return 'assets/frames/c' + n + '/' + String(i + 1).padStart(4, '0') + '.jpg';
  }

  function loadSeq(n) {
    const s = SEQ[n - 1];
    if (s.started) return s.promise;
    s.started = true;
    s.promise = new Promise(resolve => {
      let next = 0, active = 0;
      function pump() {
        while (active < CONCURRENCY && next < s.total) {
          const i = next++;
          active++;
          const img = new Image();
          img.decoding = 'async';
          img.onload = img.onerror = () => {
            if (img.naturalWidth) s.imgs[i] = img;
            s.loaded++; active--;
            if (n === 1) paintLoadMeter();
            if (s.loaded >= s.total) { s.done = true; resolve(); }
            else pump();
          };
          img.src = frameURL(n, i);
        }
      }
      pump();
    });
    return s.promise;
  }

  /* Nearest already-decoded frame, so scrubbing never blanks out. */
  function pick(seq, i) {
    if (seq.imgs[i]) return seq.imgs[i];
    for (let d = 1; d < seq.total; d++) {
      if (seq.imgs[i - d]) return seq.imgs[i - d];
      if (seq.imgs[i + d]) return seq.imgs[i + d];
    }
    return null;
  }

  /* ── Canvas ──────────────────────────────────────────────── */
  let cw = 0, chh = 0;
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = window.innerWidth; chh = window.innerHeight;
    canvas.width  = Math.round(cw * dpr);
    canvas.height = Math.round(chh * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastDrawn = null;
  }

  let lastDrawn = null;
  function drawFrame(n, i) {
    const seq = SEQ[n - 1];
    const img = pick(seq, i);
    if (!img) return;
    const key = img.src + '|' + cw + 'x' + chh;
    if (key === lastDrawn) return;
    lastDrawn = key;
    const s = Math.max(cw / img.naturalWidth, chh / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (cw - w) / 2, (chh - h) / 2, w, h);
  }

  /* ── Layout / scroll ranges ──────────────────────────────── */
  const spacers = Array.from(track.querySelectorAll('.spacer[data-ch]'));
  let ranges = [];       // [{start,end}] one per chapter 1–6
  let finaleStart = 0, docMax = 1;

  function layout() {
    spacers.forEach((el, k) => { el.style.height = (CH[k].frames * VH_PER_FRAME) + 'vh'; });
    sizeCanvas();
    measure();
  }

  function measure() {
    ranges = spacers.map(el => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      return { start: top, end: top + el.offsetHeight };
    });
    finaleStart = finale.getBoundingClientRect().top + window.scrollY;
    docMax = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  }

  /* ── Overlay scene wiring ────────────────────────────────── */
  /* fade(p, a,b,c,d): 0 before a, ramps to 1 by b, holds, 0 after d */
  function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
  function fade(p, a, b, c, d) {
    if (p <= a) return 0;
    if (p < b)  return smooth((p - a) / (b - a));
    if (p <= c) return 1;
    if (p < d)  return 1 - smooth((p - c) / (d - c));
    return 0;
  }

  const CUES = {
    /* chapter : [ {el, window} ] — windows in chapter progress 0–1 */
    1: [['cap0', 0.10, 0.20, 0.34, 0.46], ['cap1', 0.58, 0.68, 0.86, 0.96]],
    2: [['gate', -1, -1, 0.055, 0.14], ['cap0', 0.46, 0.56, 0.78, 0.90]],
    3: [['gate', -1, -1, 0.055, 0.14], ['cap0', 0.52, 0.62, 0.80, 0.92]],
    4: [['gate', -1, -1, 0.055, 0.14], ['cap0', 0.44, 0.54, 0.74, 0.88]],
    5: [['gate', -1, -1, 0.055, 0.14], ['cap0', 0.50, 0.60, 0.80, 0.92]],
    6: [['gate', -1, -1, 0.055, 0.14], ['cap0', 0.52, 0.62, 0.82, 0.94]]
  };

  const scenes = [];     // {el, ch, win:[a,b,c,d], op}
  Object.keys(CUES).forEach(k => {
    const ch = +k;
    CUES[k].forEach(cue => {
      const role = cue[0];
      const sel = role === 'gate'
        ? '.scene-gate[data-ch="' + ch + '"]'
        : '.scene-cap[data-ch="' + ch + '"][data-role="' + role + '"]';
      const el = overlay.querySelector(sel);
      if (el) scenes.push({ el, ch, win: cue.slice(1), op: -1, right: !!el.querySelector('.cap-right') });
    });
  });

  function setOpacity(rec, v) {
    if (Math.abs(v - rec.op) < 0.004) return;
    rec.op = v;
    rec.el.style.opacity = v.toFixed(3);
    rec.el.style.visibility = v < 0.005 ? 'hidden' : 'visible';
    rec.el.style.pointerEvents = v > 0.55 ? 'auto' : 'none';
    /* a little parallax lift so text isn't dead-flat */
    rec.el.style.transform = 'translateY(' + ((1 - v) * 16).toFixed(1) + 'px)';
  }

  /* ── Chapter rail ────────────────────────────────────────── */
  const railBtns = CH.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<span class="r-label">' + c.name + '</span><span class="r-dot"></span>';
    b.setAttribute('aria-label', 'Chapter ' + c.n + ' — ' + c.name);
    b.addEventListener('click', () => playChapter(c.n));
    railEl.appendChild(b);
    return b;
  });

  /* ── Finale loop ─────────────────────────────────────────── */
  let loopOn = false, loopT0 = 0;
  function startLoop() {
    if (loopOn) return;
    loopOn = true; loopT0 = performance.now();
    loadSeq(7);
  }

  /* ── Scroll tweening ("press play") ──────────────────────── */
  let tween = null;
  function cancelTween() { if (tween) { tween.cancelled = true; tween = null; } }
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(ev =>
    window.addEventListener(ev, e => {
      if (e.type === 'mousedown' && e.target.closest('button, a')) return;
      cancelTween();
    }, { passive: true })
  );

  function scrollTween(to, dur, ease) {
    cancelTween();
    const from = window.scrollY;
    const dist = to - from;
    if (Math.abs(dist) < 2 || dur <= 0) { window.scrollTo(0, to); return Promise.resolve(true); }
    const t0 = performance.now();
    const self = { cancelled: false };
    tween = self;
    return new Promise(resolve => {
      (function step(now) {
        if (self.cancelled) return resolve(false);
        const t = Math.min(1, (now - t0) / dur);
        window.scrollTo(0, from + dist * ease(t));
        if (t < 1) requestAnimationFrame(step);
        else { if (tween === self) tween = null; resolve(true); }
      })(performance.now());
    });
  }

  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /* Playback easing: essentially linear, with just enough softening
     at the head and tail that the cut in and out doesn't jolt. */
  const easeFilm  = t => 0.86 * t + 0.14 * smooth(t);

  /* ── Buttons ─────────────────────────────────────────────── */
  const playButtons = Array.from(document.querySelectorAll('.btn-play'));

  function buttonBusy(btn, seq) {
    const label = btn.querySelector('.btn-play-label');
    const meter = btn.querySelector('.btn-play-meter i');
    const original = label.textContent;
    btn.disabled = true;
    label.textContent = 'Loading';
    const id = setInterval(() => {
      if (meter) meter.style.width = Math.round(seq.loaded / seq.total * 100) + '%';
    }, 90);
    return () => {
      clearInterval(id);
      btn.disabled = false;
      label.textContent = original;
      if (meter) meter.style.width = '0%';
    };
  }

  let playing = false;
  async function playChapter(n) {
    if (playing) return;
    playing = true;
    const btn = playButtons.find(b => +b.dataset.ch === n);
    const seq = SEQ[n - 1];

    if (!seq.done) {
      const restore = btn ? buttonBusy(btn, seq) : null;
      await loadSeq(n);
      if (restore) restore();
    }
    if (btn) btn.classList.add('is-playing');

    if (n === 7) {
      startLoop();
      const target = document.getElementById('numbers').getBoundingClientRect().top + window.scrollY;
      await scrollTween(target, 1400, easeInOut);
    } else {
      const r = ranges[n - 1];
      const y = window.scrollY;
      if (Math.abs(y - r.start) > 4) {
        const d = Math.min(1100, 240 + Math.abs(y - r.start) * 0.4);
        const ok = await scrollTween(r.start, reduceMotion ? 0 : d, easeInOut);
        if (!ok) { playing = false; if (btn) btn.classList.remove('is-playing'); return; }
      }
      await scrollTween(r.end, reduceMotion ? 0 : CH[n - 1].dur * 1000, easeFilm);
    }

    if (btn) btn.classList.remove('is-playing');
    playing = false;
    /* keep the pipeline warm for the next chapter */
    if (n < 7) loadSeq(n + 1);
  }

  playButtons.forEach(b => b.addEventListener('click', () => playChapter(+b.dataset.ch)));

  /* smooth in-page anchors */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      if (id === 'top') { e.preventDefault(); scrollTween(0, 1000, easeInOut); return; }
      const t = document.getElementById(id);
      if (!t) return;
      e.preventDefault();
      scrollTween(t.getBoundingClientRect().top + window.scrollY, 1100, easeInOut);
    });
  });

  /* ── Render loop ─────────────────────────────────────────── */
  let lastScrim = -1, lastRail = -1, lastSide = -1, lastSideFlip = null, lastRailOp = -1;

  function render() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    /* 2px bias: scrollY and the measured range edges are both fractional, so a
       play-tween that lands exactly on a chapter boundary would otherwise read
       as "still 99.9% through the previous chapter" and skip the next gate. */
    const ys = y + 2;
    let active = 0, prog = 0, inFinale = false, preTour = false;

    if (ys >= finaleStart) {
      inFinale = true; active = 7;
      loadSeq(7);
      const fp = (ys - finaleStart) / Math.max(1, vh);
      if (!loopOn && SEQ[6].loaded > 8) startLoop();
      if (loopOn) {
        const f = Math.floor((performance.now() - loopT0) / (1000 / FPS)) % CH[6].frames;
        drawFrame(7, f);
      } else {
        drawFrame(7, 0);
      }
      prog = Math.max(0, Math.min(1, fp));
    } else if (ys < ranges[0].start) {
      active = 1; prog = 0; preTour = true;
      drawFrame(1, 0);
    } else {
      for (let i = 0; i < ranges.length; i++) {
        if (ys < ranges[i].end || i === ranges.length - 1) {
          active = i + 1;
          prog = Math.max(0, Math.min(1, (ys - ranges[i].start) / (ranges[i].end - ranges[i].start)));
          drawFrame(active, Math.min(CH[i].frames - 1, Math.round(prog * (CH[i].frames - 1))));
          break;
        }
      }
    }

    /* hero */
    const heroOp = 1 - smooth(y / (vh * 0.62));
    if (heroScene.dataset.op !== heroOp.toFixed(2)) {
      heroScene.dataset.op = heroOp.toFixed(2);
      heroScene.style.opacity = heroOp.toFixed(3);
      heroScene.style.visibility = heroOp < 0.01 ? 'hidden' : 'visible';
      heroScene.style.pointerEvents = heroOp > 0.6 ? 'auto' : 'none';
      heroScene.style.transform = 'translateY(' + ((1 - heroOp) * -26).toFixed(1) + 'px)';
    }

    /* scenes */
    let peak = 0, peakRight = false;
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      let v = 0;
      if (!inFinale && !preTour && s.ch === active) {
        v = fade(prog, s.win[0], s.win[1], s.win[2], s.win[3]);
      }
      setOpacity(s, v);
      if (v > peak) { peak = v; peakRight = s.right; }
    }
    if (heroOp > peak) { peak = heroOp; peakRight = false; }

    /* the finale gate is left-aligned copy too — hold the wash, then release
       it as the investment content scrolls up over the loop */
    const sideOp = inFinale ? Math.max(0, 0.9 - prog * 2.2) : peak * 0.9;
    if (Math.abs(sideOp - lastSide) > 0.006) {
      lastSide = sideOp;
      side.style.opacity = sideOp.toFixed(3);
    }
    if (peakRight !== lastSideFlip && peak > 0.02) {
      lastSideFlip = peakRight;
      side.classList.toggle('flip', peakRight);
    }

    /* scrim: darken behind text, and behind the finale content */
    const target = inFinale
      ? Math.min(0.56, 0.46 + prog * 0.20)
      : 0.4 + peak * 0.33;
    if (Math.abs(target - lastScrim) > 0.006) {
      lastScrim = target;
      scrim.style.opacity = target.toFixed(3);
    }

    /* The chapter rail navigates the film. Once the finale's reading content
       scrolls up, it has nothing to point at and its labels collide with the
       body text, so fade it out and let it return on the way back up. */
    const railOp = inFinale ? Math.max(0, 1 - prog * 1.6) : 1;
    if (Math.abs(railOp - lastRailOp) > 0.01) {
      lastRailOp = railOp;
      railEl.style.opacity = railOp.toFixed(3);
      railEl.style.pointerEvents = railOp < 0.1 ? 'none' : 'auto';
    }

    /* chrome */
    scrollLine.style.width = (y / docMax * 100).toFixed(2) + '%';
    if (active !== lastRail) {
      lastRail = active;
      chapNum.textContent = String(active).padStart(2, '0');
      chapName.textContent = CH[active - 1].name;
      railBtns.forEach((b, i) => b.classList.toggle('is-on', i + 1 === active));
    }

    requestAnimationFrame(render);
  }

  /* ── Finale gate reveal ──────────────────────────────────── */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(es => {
      es.forEach(e => e.target.classList.toggle('is-in', e.isIntersecting));
    }, { threshold: 0.35 }).observe(finGate);
  } else {
    finGate.classList.add('is-in');
  }

  /* ── Loading choreography ────────────────────────────────── */
  function paintLoadMeter() {
    const s = SEQ[0];
    const pct = s.loaded / s.total;
    loadMeter.style.width = Math.round(pct * 100) + '%';
    startBtn.querySelector('.btn-play-label').textContent =
      'Preparing the tour · ' + Math.round(pct * 100) + '%';
  }

  function heroReady() {
    startBtn.disabled = false;
    startBtn.querySelector('.btn-play-label').textContent = 'Begin the tour';
    loadMeter.style.width = '0%';
  }

  /* ── Floor-plan tabs ─────────────────────────────────────── */
  const planTabs = Array.from(document.querySelectorAll('.plan-tab'));
  function showPlan(tab) {
    planTabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  }
  planTabs.forEach((tab, i) => {
    tab.tabIndex = i === 0 ? 0 : -1;
    tab.addEventListener('click', () => showPlan(tab));
    /* arrow keys move between tabs, as a tablist should */
    tab.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = planTabs[(i + d + planTabs.length) % planTabs.length];
      showPlan(next);
      next.focus();
    });
  });

  /* ── Enquiry form ────────────────────────────────────────── */
  const form = document.getElementById('enquiryForm');
  const note = document.getElementById('formNote');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = document.getElementById('f-name'), email = document.getElementById('f-email');
    let bad = false;
    [name, email].forEach(f => {
      const ok = f.value.trim() && (f.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.value.trim()));
      f.classList.toggle('invalid', !ok);
      if (!ok) bad = true;
    });
    if (bad) {
      note.className = 'form-note err';
      note.textContent = 'Please add your name and a valid email address.';
      return;
    }
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.submittedAt = new Date().toISOString();

    if (FORM_ENDPOINT) {
      note.className = 'form-note'; note.textContent = 'Sending…';
      try {
        const r = await fetch(FORM_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error(r.status);
      } catch (err) {
        note.className = 'form-note err';
        note.textContent = 'That didn’t send. Please email us directly and we’ll pick it up.';
        return;
      }
      form.classList.add('sent');
      note.className = 'form-note ok';
      note.textContent = 'Thank you, ' + payload.name.trim().split(' ')[0] +
        '. The investment deck is on its way to ' + payload.email.trim() + '.';
    } else {
      /* Demo build: nothing is transmitted. Set FORM_ENDPOINT above to go live. */
      try {
        const log = JSON.parse(localStorage.getItem('fa_enquiries') || '[]');
        log.push(payload);
        localStorage.setItem('fa_enquiries', JSON.stringify(log));
      } catch (_) {}
      console.warn('[Foz Atlântica] FORM_ENDPOINT is not configured — enquiry was stored locally only.', payload);
      form.classList.add('sent');
      note.className = 'form-note ok';
      note.innerHTML = 'Thank you, ' + payload.name.trim().split(' ')[0].replace(/[<>&]/g, '') +
        '. Your request has been recorded.<br>' +
        '<i style="opacity:.6;font-size:12.5px">Demo build — no delivery endpoint is configured yet ' +
        '(set <code>FORM_ENDPOINT</code> in js/site.js).</i>';
    }
  });

  /* ── Boot ────────────────────────────────────────────────── */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    sizeCanvas();
    resizeT = setTimeout(measure, 140);
  });
  window.addEventListener('orientationchange', () => setTimeout(() => { sizeCanvas(); measure(); }, 260));

  layout();
  window.scrollTo(0, 0);
  requestAnimationFrame(render);
  document.body.classList.add('ready');

  /* Chapter 1 first, then everything else in narrative order. */
  loadSeq(1).then(() => {
    heroReady();
    return CH.slice(1).reduce((p, c) => p.then(() => loadSeq(c.n)), Promise.resolve());
  });

  /* Some browsers restore the old scroll offset after load even with manual
     restoration; a scroll film should always open on the hero. */
  window.addEventListener('load', () => { window.scrollTo(0, 0); measure(); lastDrawn = null; });
})();
