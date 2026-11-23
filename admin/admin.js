/* ============================================================
   Foz Atlântica — enquiries console
   ------------------------------------------------------------
   Everything in a row — a name, an email, a message — was typed
   by a stranger on the open internet. It is written to the page
   with textContent and never with innerHTML, so a submission
   reading `<img src=x onerror=alert(1)>` is displayed as those
   characters rather than run. The same discipline applies to
   the CSV export, where a leading =, +, - or @ is prefixed so a
   spreadsheet treats it as text instead of a formula.
   ============================================================ */
(function () {
  'use strict';

  const B = window.FA_BACKEND;

  const gate      = document.getElementById('gate');
  const panel     = document.getElementById('panel');
  const loginForm = document.getElementById('loginForm');
  const pw        = document.getElementById('pw');
  const loginBtn  = document.getElementById('loginBtn');
  const loginMsg  = document.getElementById('loginMsg');
  const panelMsg  = document.getElementById('panelMsg');
  const rows      = document.getElementById('rows');
  const tablewrap = document.getElementById('tablewrap');
  const empty     = document.getElementById('empty');
  const signout   = document.getElementById('signout');
  const refreshBtn= document.getElementById('refresh');
  const exportBtn = document.getElementById('exportCsv');
  const hideDone  = document.getElementById('hideHandled');
  const countTotal= document.getElementById('countTotal');
  const countNew  = document.getElementById('countNew');

  let data = [];

  /* ── helpers ─────────────────────────────────────────────── */

  function say(el, text, kind) {
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso || '';
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function cell(row, text, cls, label) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    if (label) td.setAttribute('data-label', label);
    td.textContent = text == null || text === '' ? '—' : String(text);
    if (text == null || text === '') td.classList.add('muted');
    row.appendChild(td);
    return td;
  }

  /* ── render ──────────────────────────────────────────────── */

  function render() {
    const list = hideDone.checked ? data.filter(r => !r.handled) : data;

    countTotal.textContent = String(data.length);
    countNew.textContent   = String(data.filter(r => !r.handled).length);

    rows.textContent = '';

    if (!list.length) {
      tablewrap.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tablewrap.hidden = false;

    list.forEach(r => {
      const tr = document.createElement('tr');
      if (r.handled) tr.className = 'done';

      cell(tr, fmtDate(r.created_at), 'when', 'Received');
      cell(tr, r.name, 'who', 'Name');

      /* Contact: email as a mailto link, phone beneath it. The link's text
         and href both come from the stored value, so it is set as a property
         rather than interpolated into markup. */
      const contact = document.createElement('td');
      contact.className = 'contact';
      contact.setAttribute('data-label', 'Contact');
      const a = document.createElement('a');
      a.textContent = r.email;
      a.href = 'mailto:' + r.email;
      contact.appendChild(a);
      if (r.phone) {
        contact.appendChild(document.createElement('br'));
        const tel = document.createElement('a');
        tel.textContent = r.phone;
        tel.href = 'tel:' + r.phone.replace(/[^\d+]/g, '');
        tel.className = 'muted';
        contact.appendChild(tel);
      }
      tr.appendChild(contact);

      const interest = document.createElement('td');
      interest.className = 'interest';
      interest.setAttribute('data-label', 'Interest');
      if (r.intent) {
        const i = document.createElement('span');
        i.textContent = r.intent;
        interest.appendChild(i);
      }
      if (r.budget) {
        if (r.intent) interest.appendChild(document.createElement('br'));
        const b = document.createElement('span');
        b.className = 'muted';
        b.textContent = r.budget;
        interest.appendChild(b);
      }
      if (!r.intent && !r.budget) { interest.textContent = '—'; interest.classList.add('muted'); }
      tr.appendChild(interest);

      cell(tr, r.message, 'message', 'Message');

      /* Actions */
      const act = document.createElement('td');
      act.className = 'actions';
      act.setAttribute('data-label', '');

      const mark = document.createElement('button');
      mark.className = 'ghost small';
      mark.textContent = r.handled ? 'Reopen' : 'Mark handled';
      mark.addEventListener('click', async () => {
        mark.disabled = true;
        try {
          const updated = await B.setHandled(r.id, !r.handled);
          r.handled = updated.handled;
          say(panelMsg, '');
          render();
        } catch (e) {
          mark.disabled = false;
          say(panelMsg, 'Could not update that enquiry. ' + e.message, 'err');
        }
      });
      act.appendChild(mark);

      const del = document.createElement('button');
      del.className = 'ghost small danger';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete the enquiry from ' + r.name + '? This cannot be undone.')) return;
        del.disabled = true;
        try {
          await B.deleteEnquiry(r.id);
          data = data.filter(x => x.id !== r.id);
          say(panelMsg, 'Deleted.', 'ok');
          render();
        } catch (e) {
          del.disabled = false;
          say(panelMsg, 'Could not delete that enquiry. ' + e.message, 'err');
        }
      });
      act.appendChild(del);

      tr.appendChild(act);
      rows.appendChild(tr);
    });
  }

  /* ── load ────────────────────────────────────────────────── */

  async function load() {
    say(panelMsg, 'Loading…');
    try {
      data = await B.listEnquiries();
      say(panelMsg, '');
      render();
    } catch (e) {
      if (e.code === 'expired' || e.code === 'no_session') {
        lock('Your session expired. Please unlock again.');
        return;
      }
      say(panelMsg, 'Could not load enquiries. ' + e.message, 'err');
    }
  }

  function unlock() {
    gate.hidden = true;
    panel.hidden = false;
    signout.hidden = false;
    load();
  }

  function lock(message) {
    B.signOut();
    data = [];
    panel.hidden = true;
    signout.hidden = true;
    gate.hidden = false;
    pw.value = '';
    say(loginMsg, message || '', message ? 'err' : '');
    pw.focus();
  }

  /* ── events ──────────────────────────────────────────────── */

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const value = pw.value;
    if (!value) { say(loginMsg, 'Enter the password.', 'err'); pw.focus(); return; }

    loginBtn.disabled = true;
    say(loginMsg, 'Checking…');
    try {
      await B.signIn(value);
      pw.value = '';                 // do not leave it sitting in the field
      say(loginMsg, '');
      unlock();
    } catch (err) {
      /* Supabase rate-limits repeated failures itself; say so plainly rather
         than hinting at which part was wrong. */
      say(loginMsg, err.code === 'invalid_credentials'
        ? 'That password is not right.'
        : 'Could not sign in. ' + err.message, 'err');
      pw.select();
    } finally {
      loginBtn.disabled = false;
    }
  });

  signout.addEventListener('click', () => lock());
  refreshBtn.addEventListener('click', load);
  hideDone.addEventListener('change', render);

  exportBtn.addEventListener('click', () => {
    const cols = ['created_at','name','email','phone','intent','budget','message','handled'];
    const esc = v => {
      let s = v == null ? '' : String(v);
      /* A cell beginning =, +, - or @ is executed as a formula by Excel and
         Sheets. Prefixing a tab keeps it inert without altering the text. */
      if (/^[=+\-@]/.test(s)) s = '\t' + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [cols.join(',')]
      .concat(data.map(r => cols.map(c => esc(r[c])).join(',')))
      .join('\r\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'foz-atlantica-enquiries-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ── boot ────────────────────────────────────────────────── */
  if (!B) {
    say(loginMsg, 'The backend bridge failed to load. Check js/backend.js.', 'err');
    loginBtn.disabled = true;
  } else if (B.isSignedIn()) {
    unlock();                        // same tab, still within the session
  } else {
    pw.focus();
  }
})();
