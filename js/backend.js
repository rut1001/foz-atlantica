/* ============================================================
   Foz Atlântica — backend bridge (Supabase)
   ------------------------------------------------------------
   Everything the site needs from Supabase, over plain fetch.

   There is deliberately no supabase-js here. The library would
   be a third-party script, and this project already went to the
   trouble of self-hosting its fonts so that the page makes no
   external request and its Content-Security-Policy can stay
   'self' throughout. Pulling in a CDN bundle would undo that
   for the sake of three REST calls. The only thing the policy
   has to allow is connect-src to the project URL below.

   On the key: PUBLIC_KEY is meant to be public. It identifies
   the project and grants the `anon` role, nothing more. Every
   actual permission lives in the row-level-security policies on
   the database, which allow an anonymous insert into
   `enquiries` and no read whatsoever. Reading is pinned to one
   specific authenticated user id. So this file being readable —
   and it is, the repository is public — gives a stranger the
   ability to submit an enquiry, which is what the form is for,
   and nothing else.
   ============================================================ */
window.FA_BACKEND = (function () {
  'use strict';

  const URL_BASE   = 'https://iwqbszwucnhsfccfuzyr.supabase.co';
  const PUBLIC_KEY = 'sb_publishable_zTT_AWLqwSaQuoYfaNWqbQ___MN8J6F';

  /* The admin account's identifier. Not a secret and not a second
     factor — it is written here in plain sight. The password is the
     only thing guarding the enquiries, and it is never in this file:
     it is typed into the login box and checked by Supabase. */
  const ADMIN_EMAIL = 'admin@fozatlantica.com';

  const SESSION_KEY = 'fa_admin_session';

  function headers(token) {
    const h = { 'apikey': PUBLIC_KEY, 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  /* ── Session, held in sessionStorage ──────────────────────────
     sessionStorage rather than localStorage: the token dies with
     the tab, so an admin session cannot outlive the sitting on a
     shared or borrowed machine. */
  function saveSession(s) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (_) {}
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
  }

  async function signIn(password) {
    const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ email: ADMIN_EMAIL, password: password })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) {
      const e = new Error(d.error_description || d.msg || 'Sign-in failed');
      e.code = d.error_code || String(r.status);
      throw e;
    }
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token });
    return d;
  }

  async function refresh() {
    const s = loadSession();
    if (!s || !s.refresh_token) return null;
    const r = await fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.access_token) { clearSession(); return null; }
    saveSession({ access_token: d.access_token, refresh_token: d.refresh_token });
    return d.access_token;
  }

  /* Runs a request, and on a 401 refreshes the token once and retries.
     An access token lasts an hour; without this, leaving the admin page
     open over lunch would silently start returning nothing. */
  async function authed(path, init) {
    const s = loadSession();
    if (!s) throw Object.assign(new Error('Not signed in'), { code: 'no_session' });

    let r = await fetch(URL_BASE + path, Object.assign({}, init, {
      headers: Object.assign(headers(s.access_token), (init && init.headers) || {})
    }));

    if (r.status === 401) {
      const t = await refresh();
      if (!t) throw Object.assign(new Error('Session expired'), { code: 'expired' });
      r = await fetch(URL_BASE + path, Object.assign({}, init, {
        headers: Object.assign(headers(t), (init && init.headers) || {})
      }));
    }
    return r;
  }

  return {
    isSignedIn: () => !!loadSession(),
    signIn,
    signOut: clearSession,

    /* Anonymous. This is the only thing a visitor's key can do. */
    async submitEnquiry(payload) {
      const r = await fetch(URL_BASE + '/rest/v1/enquiries', {
        method: 'POST',
        headers: Object.assign(headers(), { 'Prefer': 'return=minimal' }),
        body: JSON.stringify(payload)
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message || ('HTTP ' + r.status));
      }
      return true;
    },

    async listEnquiries() {
      const r = await authed('/rest/v1/enquiries?select=*&order=created_at.desc', { method: 'GET' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    },

    async setHandled(id, handled) {
      const r = await authed('/rest/v1/enquiries?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify({ handled: !!handled })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = await r.json();
      /* PostgREST answers 200 with [] when row-level security hid the row
         rather than refusing outright, so an empty result is a failure
         here, not a success. */
      if (!rows.length) throw new Error('Not permitted');
      return rows[0];
    },

    async deleteEnquiry(id) {
      const r = await authed('/rest/v1/enquiries?id=eq.' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { 'Prefer': 'return=representation' }
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = await r.json();
      if (!rows.length) throw new Error('Not permitted');
      return true;
    }
  };
})();
