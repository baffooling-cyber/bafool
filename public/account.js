// Player accounts: sign in with Google, Apple or Discord, link several to one account,
// and keep stats in sync across devices. Shared by index.html and grid.html; load before app.js / grid.js.
window.RTTAccount = (function () {
  'use strict';
  const PREFIX = 'rtt:';
  const SCALARS = ['lbName', 'sound', 'quick', 'gridSeenHelp'];
  const LISTS = ['history', 'fhistory'];
  const MAPS = ['perfect', 'rings', 'daily', 'posted'];
  const GRID_RE = /^grid:\d{4}-\d{2}-\d{2}$/;
  const synced = (k) => SCALARS.includes(k) || LISTS.includes(k) || MAPS.includes(k) || k === 'last' || GRID_RE.test(k);
  const LABEL = { email: 'Email', google: 'Google', apple: 'Apple', discord: 'Discord' };
  const ICON = {
    google: '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>',
    apple: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.97.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.52 1.25-2.58-.03-.01-2.4-.92-2.42-3.65zM14.1 5.86c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.95 2.79 1.01.08 2.04-.51 2.67-1.27z"/></svg>',
    email: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14"/><path d="m3 7 9 6 9-6"/></svg>',
    discord: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#5865F2" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.1-.8-9.6-3.6-13.6zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>'
  };

  // ---------- local storage (with change tracking) ----------
  let user = null, providers = { email: true, google: false, apple: false, discord: false }, dirty = false, pushTimer = null, applying = false;
  const raw = {
    get(k) { try { return localStorage.getItem(PREFIX + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) { /* ignore */ } }
  };
  const read = (k) => { const v = raw.get(k); if (v == null) return undefined; try { return JSON.parse(v); } catch (e) { return undefined; } };
  function localKeys() {
    const out = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(PREFIX) && synced(k.slice(PREFIX.length))) out.push(k.slice(PREFIX.length)); } } catch (e) { /* none */ }
    return out;
  }
  function snapshot() {
    const out = {};
    const cutoff = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    for (const k of localKeys()) {
      if (GRID_RE.test(k) && k.slice(5) < cutoff) continue; // only the last ~4 months of daily grids
      const v = read(k); if (v !== undefined) out[k] = v;
    }
    return out;
  }
  // Notice whenever the games save something worth syncing.
  try {
    const proto = Object.getPrototypeOf(localStorage);
    const origSet = proto.setItem, origDel = proto.removeItem;
    proto.setItem = function (k, v) { origSet.call(this, k, v); if (this === localStorage) touched(k); };
    proto.removeItem = function (k) { origDel.call(this, k); if (this === localStorage) touched(k); };
  } catch (e) { /* storage unavailable */ }
  function touched(k) {
    if (applying || !user || typeof k !== 'string' || !k.startsWith(PREFIX) || !synced(k.slice(PREFIX.length))) return;
    dirty = true; clearTimeout(pushTimer); pushTimer = setTimeout(push, 2000);
  }

  // ---------- merging device stats with account stats ----------
  const stable = (x) => JSON.stringify(x);
  function mergeKey(k, a, b) { // a = account copy, b = this device's copy
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (LISTS.includes(k) && Array.isArray(a) && Array.isArray(b)) {
      const seen = new Set(a.map(stable)); const out = a.slice();
      for (const x of b) if (!seen.has(stable(x))) { seen.add(stable(x)); out.push(x); }
      return out.map((x, i) => [x, i]).sort((p, q) => String(p[0] && p[0].date || '').localeCompare(String(q[0] && q[0].date || '')) || p[1] - q[1]).map((p) => p[0]).slice(-200);
    }
    if (MAPS.includes(k) && a && b && typeof a === 'object' && typeof b === 'object') {
      const out = Object.assign({}, b, a);
      if (k === 'perfect' || k === 'rings') for (const fr in b) if (a[fr] && String(b[fr]) < String(a[fr])) out[fr] = b[fr]; // keep the first time it happened
      if (k === 'posted') { const ks = Object.keys(out); while (ks.length > 300) delete out[ks.shift()]; }
      return out;
    }
    if (k === 'last') return (Number(a && a.ts) || 0) > (Number(b && b.ts) || 0) ? a : b;
    if (GRID_RE.test(k)) {
      const prog = (g) => (g && g.done ? 100 : 0) + (g && Number(g.tries) || 0) + (g && Array.isArray(g.cells) ? g.cells.filter((c) => c != null).length : 0);
      return prog(a) > prog(b) ? a : b;
    }
    return b; // simple settings: this device wins
  }
  function apply(server) {
    const local = snapshot(), changed = [];
    const keys = new Set([...Object.keys(server || {}), ...Object.keys(local)]);
    const merged = {};
    applying = true;
    for (const k of keys) {
      if (!synced(k)) continue;
      const m = mergeKey(k, server ? server[k] : undefined, local[k]);
      if (m === undefined) continue;
      merged[k] = m;
      if (stable(m) !== stable(local[k])) { raw.set(k, JSON.stringify(m)); changed.push(k); }
    }
    applying = false;
    return { merged, changed, needsPush: stable(merged) !== stable(server || {}) };
  }

  // ---------- network ----------
  async function api(path, opts) {
    const res = await fetch('/api' + path, Object.assign({ cache: 'no-store', credentials: 'same-origin' }, opts || {}));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  let pushing = null;
  async function push(opts) {
    clearTimeout(pushTimer);
    if (!user || !dirty) return;
    if (pushing) { await pushing.catch(() => {}); if (!dirty) return; }
    dirty = false;
    const body = JSON.stringify({ stats: snapshot() });
    const keepalive = !!(opts && opts.keepalive) && body.length < 60000;
    pushing = fetch('/api/me/stats', { method: 'PUT', headers: { 'content-type': 'application/json' }, body, keepalive, credentials: 'same-origin' })
      .then((r) => { if (!r.ok) throw new Error('save failed'); setStatus('Saved to your account'); })
      .catch(() => { dirty = true; setStatus('Not saved yet. Will retry.'); pushTimer = setTimeout(push, 15000); })
      .finally(() => { pushing = null; });
    return pushing;
  }
  addEventListener('pagehide', () => { if (dirty) push({ keepalive: true }); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) push({ keepalive: true }); });

  // ---------- UI ----------
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  const css = `
.acct-btn{display:inline-flex;align-items:center;gap:8px;font-family:'Press Start 2P',monospace;font-size:10px;line-height:1.4;background:var(--gold);color:var(--ink);border:0;padding:12px 14px;min-height:44px;box-shadow:4px 4px 0 #b8891a;cursor:pointer;max-width:220px}
.acct-btn.in{background:transparent;color:#fff;border:2px solid var(--gold);box-shadow:none}
.acct-btn .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acct-av{width:22px;height:22px;flex:0 0 22px;display:inline-flex;align-items:center;justify-content:center;background:var(--acc);color:var(--ink);font-size:10px}
.acct-ov{position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:70;padding:16px}
.acct-pn{background:var(--panel);border:4px solid var(--line);box-shadow:10px 10px 0 rgba(0,0,0,.45);max-width:520px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:24px;display:flex;flex-direction:column;gap:18px;color:var(--soft);font-size:15px;line-height:1.6}
.acct-pn h2{margin:0;font-family:'Press Start 2P',monospace;font-weight:400;font-size:14px;line-height:1.5;color:var(--gold)}
.acct-pn h3{margin:0;font-family:'Press Start 2P',monospace;font-weight:400;font-size:10px;color:var(--muted)}
.acct-pn p{margin:0}
.acct-prov{display:flex;align-items:center;gap:12px;width:100%;background:#fff;color:#111;border:0;padding:14px 16px;font-family:Inter,system-ui,sans-serif;font-size:16px;font-weight:600;min-height:52px;cursor:pointer;box-shadow:4px 4px 0 #000}
.acct-prov.apple{background:#000;color:#fff;border:2px solid #fff}
.acct-prov:disabled{opacity:.5;cursor:not-allowed}
.acct-row{display:flex;align-items:center;gap:12px;background:var(--panel2);border:2px solid var(--line);padding:10px 12px;min-height:52px}
.acct-row .who{flex:1;min-width:0;display:flex;flex-direction:column}
.acct-row .who b{color:#fff;font-weight:600}
.acct-row .who span{font-size:13px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.acct-mini{font-family:'Press Start 2P',monospace;font-size:9px;background:transparent;color:#fff;border:2px solid var(--line2);padding:10px;min-height:40px;cursor:pointer}
.acct-mini.go{border-color:var(--gold);color:var(--gold)}
.acct-mini:disabled{opacity:.45;cursor:not-allowed}
.acct-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}
.acct-stat{background:var(--panel2);border:2px solid var(--line);padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.acct-stat .v{font-family:'Press Start 2P',monospace;font-size:15px;color:#fff;line-height:1.3}
.acct-stat .l{font-size:12px;color:var(--muted)}
.acct-in{flex:1;min-width:0;background:var(--panel2);border:2px solid var(--line2);color:#fff;font:inherit;font-size:16px;padding:10px 12px}
.acct-err{color:var(--red)}
.acct-foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center}
.acct-link{background:none;border:0;color:var(--muted);text-decoration:underline;font:inherit;font-size:13px;padding:8px 0;cursor:pointer}
.acct-or{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted)}.acct-or::before,.acct-or::after{content:'';flex:1;border-top:2px dashed var(--line2)}
.acct-form{display:flex;flex-direction:column;gap:10px}
.acct-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--muted)}
.acct-tabs{display:flex;gap:6px}
.acct-tab{flex:1;font-family:'Press Start 2P',monospace;font-size:9px;background:var(--panel2);color:#fff;border:2px solid var(--line);padding:10px;min-height:40px;cursor:pointer}
.acct-tab[aria-pressed=true]{background:var(--acc);color:var(--ink);border-color:var(--acc)}
.acct-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--gold);color:var(--ink);font-family:'Press Start 2P',monospace;font-size:11px;line-height:1.5;padding:14px 18px;box-shadow:4px 4px 0 #000;z-index:80;max-width:calc(100vw - 32px);text-align:center}
@media (max-width:640px){.acct-btn{max-width:160px}}`;
  document.head.append(el('style', { text: css }));

  let btn = null, overlay = null, statusLine = null;
  function setStatus(t) { if (statusLine) statusLine.textContent = t; }
  function toast(t, ms) {
    const n = el('div', { class: 'acct-toast', role: 'status', text: t });
    document.body.append(n); setTimeout(() => n.remove(), ms || 3200);
  }
  function close() { if (overlay) { overlay.remove(); overlay = null; statusLine = null; if (btn) btn.focus(); } }
  function open(title, ...kids) {
    close();
    const pn = el('div', { class: 'acct-pn', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('h2', { text: title }), ...kids);
    overlay = el('div', { class: 'acct-ov', onclick: (e) => { if (e.target === overlay) close(); } }, pn);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.append(overlay);
    const f = pn.querySelector('button,input'); if (f) f.focus();
  }
  const here = () => location.pathname + location.search.replace(/[?&](signedin|linked|signin_error)=[^&]*/g, '').replace(/^&/, '?');
  const loginUrl = (p, link) => '/api/auth/login/' + p + '?return=' + encodeURIComponent(here()) + (link ? '&link=1' : '');
  const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();

  function renderButton() {
    if (!btn) {
      const nav = document.querySelector('header .nav');
      if (!nav) return;
      btn = el('button', { class: 'acct-btn', type: 'button', onclick: () => (user ? showAccount() : showSignIn()) });
      nav.append(btn);
    }
    btn.classList.toggle('in', !!user);
    btn.replaceChildren();
    if (user) {
      btn.append(el('span', { class: 'acct-av', 'aria-hidden': 'true', text: initial(user.name) }), el('span', { class: 'nm', text: user.name }));
      btn.setAttribute('aria-label', 'Your account: ' + user.name);
    } else {
      btn.append(el('span', { text: 'SIGN IN' }));
      btn.setAttribute('aria-label', 'Sign in to save your stats');
    }
  }

  function providerButton(p, link) {
    const on = providers[p];
    return el('button', {
      class: 'acct-prov ' + p, type: 'button', disabled: on ? false : 'disabled',
      onclick: () => { location.href = loginUrl(p, link); }
    }, el('span', { html: ICON[p], style: 'display:inline-flex' }), el('span', { text: (link ? 'Link ' : 'Continue with ') + LABEL[p] + (on ? '' : ' (coming soon)') }));
  }
  // Email + password form. mode: 'login' | 'signup' | 'link' (add email to the signed-in account)
  function emailForm(mode, onDone) {
    const emailIn = el('input', { class: 'acct-in', type: 'email', autocomplete: 'email', required: 'required', maxlength: '254' });
    const pwIn = el('input', { class: 'acct-in', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: 'required', minlength: mode === 'login' ? false : '8', maxlength: '200' });
    const nameIn = el('input', { class: 'acct-in', type: 'text', autocomplete: 'nickname', maxlength: '20' });
    const msg = el('p', { class: 'acct-err', 'aria-live': 'polite' });
    const go = el('button', { class: 'btn btn-acc btn-sm', type: 'submit' }, mode === 'login' ? 'SIGN IN' : mode === 'link' ? 'ADD EMAIL' : 'CREATE ACCOUNT');
    const f = el('form', { class: 'acct-form', novalidate: 'novalidate' },
      el('label', {}, 'Email', emailIn),
      mode === 'signup' ? el('label', {}, 'Display name (optional)', nameIn) : null,
      el('label', {}, mode === 'login' ? 'Password' : 'Password (8+ characters)', pwIn),
      msg, el('div', {}, go));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (go.disabled) return;
      msg.textContent = ''; go.disabled = true;
      try {
        const path = mode === 'login' ? '/auth/email/login' : '/auth/email/signup';
        const r = await post(path, { email: emailIn.value, password: pwIn.value, name: nameIn.value, link: mode === 'link' });
        onDone(r.user);
      } catch (err) { msg.textContent = err.message; go.disabled = false; }
    });
    return f;
  }
  function afterEmailSignIn(u, verb) {
    // Same steps as coming back from Google/Apple/Discord: reload so the merge and redraw run fresh.
    const q = new URLSearchParams(location.search); q.set('signedin', 'email');
    location.href = location.pathname + '?' + q.toString() + location.hash;
  }
  function showSignIn(startMode) {
    let mode = startMode || 'login';
    const oauth = ['google', 'apple', 'discord'].filter((p) => providers[p]);
    const box = el('div');
    const tabs = el('div', { class: 'acct-tabs', role: 'group', 'aria-label': 'Email sign-in' });
    function draw() {
      tabs.replaceChildren(
        el('button', { class: 'acct-tab', type: 'button', 'aria-pressed': String(mode === 'login'), onclick: () => { mode = 'login'; draw(); } }, 'SIGN IN'),
        el('button', { class: 'acct-tab', type: 'button', 'aria-pressed': String(mode === 'signup'), onclick: () => { mode = 'signup'; draw(); } }, 'NEW ACCOUNT'));
      box.replaceChildren(emailForm(mode, afterEmailSignIn));
      const f = box.querySelector('input'); if (f) f.focus();
    }
    open('SIGN IN',
      el('p', { text: 'Make a free account to save your seasons, perfect runs, rings and daily results, and pick up on any device.' }),
      oauth.length ? el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, ...oauth.map((p) => providerButton(p, false))) : null,
      oauth.length ? el('div', { class: 'acct-or', text: 'or use email' }) : null,
      tabs, box,
      el('p', { style: 'font-size:13px;color:var(--muted)', text: 'Stats you already have on this device are added to your account when you sign in. You can link more sign-in methods later.' }),
      el('div', { class: 'acct-foot' }, el('button', { class: 'btn btn-ghost btn-sm', style: 'border-width:2px', type: 'button', onclick: close }, 'NOT NOW')));
    draw();
  }
  function showAddEmail() {
    open('ADD EMAIL SIGN-IN',
      el('p', { text: 'Add an email and password so you can sign in to this same account without ' + user.providers.filter((p) => p !== 'email').map((p) => LABEL[p]).join(' or ') + '.' }),
      emailForm('link', (u) => { user = u; renderButton(); toast('Email added to your account'); showAccount(); }),
      el('div', { class: 'acct-foot' }, el('button', { class: 'btn btn-ghost btn-sm', style: 'border-width:2px', type: 'button', onclick: showAccount }, 'BACK')));
  }
  function showPassword() {
    const pwIn = el('input', { class: 'acct-in', type: 'password', autocomplete: 'new-password', minlength: '8', maxlength: '200' });
    const msg = el('p', { class: 'acct-err', 'aria-live': 'polite' });
    const f = el('form', { class: 'acct-form' }, el('label', {}, 'New password (8+ characters)', pwIn), msg,
      el('div', {}, el('button', { class: 'btn btn-acc btn-sm', type: 'submit' }, 'SAVE PASSWORD')));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await post('/me/password', { password: pwIn.value }); toast('Password changed'); showAccount(); } catch (err) { msg.textContent = err.message; }
    });
    open('CHANGE PASSWORD', f, el('div', { class: 'acct-foot' }, el('button', { class: 'btn btn-ghost btn-sm', style: 'border-width:2px', type: 'button', onclick: showAccount }, 'BACK')));
  }

  function summary() {
    const h = read('history') || [], fh = read('fhistory') || [], perfect = read('perfect') || {}, rings = read('rings') || {}, daily = read('daily') || {};
    const best = (arr) => arr.reduce((b, x) => (!b || x.w > b.w || (x.w === b.w && (x.ovr || 0) > (b.ovr || 0))) ? x : b, null);
    const bt = best(h), bf = best(fh);
    const grids = localKeys().filter((k) => GRID_RE.test(k)).map(read).filter((g) => g && g.done);
    const gw = grids.filter((g) => g.done === 'win').length;
    const stat = (v, l) => el('div', { class: 'acct-stat' }, el('span', { class: 'v', text: String(v) }), el('span', { class: 'l', text: l }));
    return [
      el('h3', { text: 'RUN THE TABLE' }),
      el('div', { class: 'acct-stats' },
        stat(h.length, 'Seasons played'), stat(bt ? bt.w + '-' + bt.l : '—', 'Best record'),
        stat(Object.keys(perfect).length + '/32', 'Perfect Run'), stat(Object.keys(rings).length, 'Franchises with a ring'),
        stat(h.filter((x) => x.w === 17).length, '17-0 seasons'), stat(Object.keys(daily).length, 'Daily boards played')),
      el('h3', { text: 'FANTASY DRAFT' }),
      el('div', { class: 'acct-stats' }, stat(fh.length, 'Seasons played'), stat(bf ? bf.w + '-' + bf.l : '—', 'Best record'), stat(fh.filter((x) => x.ring).length, 'Titles')),
      el('h3', { text: 'RUN THE GRID' }),
      el('div', { class: 'acct-stats' }, stat(grids.length, 'Grids played'), stat(gw, 'Touchdowns'), stat(grids.length ? Math.round(gw / grids.length * 100) + '%' : '—', 'Win rate'))
    ];
  }

  function showAccount() {
    const nameIn = el('input', { class: 'acct-in', type: 'text', maxlength: '20', value: user.name, 'aria-label': 'Display name' });
    const nameMsg = el('p', { style: 'font-size:13px;color:var(--muted)', text: 'Shown as your default name on the global leaderboard.' });
    const saveName = async () => {
      const name = nameIn.value.trim();
      if (!name || name === user.name) return;
      try {
        user = (await post('/me/name', { name })).user;
        raw.set('lbName', JSON.stringify(name)); dirty = true; push();
        renderButton(); nameMsg.className = ''; nameMsg.style.cssText = 'font-size:13px;color:var(--green)'; nameMsg.textContent = 'Name saved.';
      } catch (e) { nameMsg.className = 'acct-err'; nameMsg.textContent = e.message; }
    };
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveName(); });
    const linkedCount = user.providers.length;
    const rows = ['email', 'google', 'apple', 'discord'].map((p) => {
      const id = user.identities[p];
      if (p === 'email') {
        const who = el('div', { class: 'who' }, el('b', { text: 'Email' }), el('span', { text: id ? 'Linked · ' + id.email : 'Not linked' }));
        const acts = id
          ? [el('button', { class: 'acct-mini', type: 'button', onclick: showPassword }, 'PASSWORD'),
            el('button', { class: 'acct-mini', type: 'button', disabled: linkedCount < 2 ? 'disabled' : false, title: linkedCount < 2 ? 'Link another sign-in first' : '', onclick: () => unlink(p) }, 'UNLINK')]
          : [el('button', { class: 'acct-mini go', type: 'button', onclick: showAddEmail }, 'ADD')];
        return el('div', { class: 'acct-row', style: 'flex-wrap:wrap' }, el('span', { html: ICON[p], style: 'display:inline-flex;color:#fff' }), who, ...acts);
      }
      const who = el('div', { class: 'who' }, el('b', { text: LABEL[p] }), el('span', { text: id ? ('Linked' + (id.email ? ' · ' + id.email : id.name ? ' · ' + id.name : '')) : (providers[p] ? 'Not linked' : 'Coming soon') }));
      const action = id
        ? el('button', { class: 'acct-mini', type: 'button', disabled: linkedCount < 2 ? 'disabled' : false, title: linkedCount < 2 ? 'Link another sign-in first' : '', onclick: () => unlink(p) }, 'UNLINK')
        : el('button', { class: 'acct-mini go', type: 'button', disabled: providers[p] ? false : 'disabled', onclick: () => { location.href = loginUrl(p, true); } }, 'LINK');
      return el('div', { class: 'acct-row' }, el('span', { html: ICON[p], style: 'display:inline-flex;color:#fff' }), who, action);
    });
    statusLine = null;
    const status = el('p', { style: 'font-size:13px;color:var(--muted)', 'aria-live': 'polite', text: dirty ? 'Saving…' : 'Your stats are saved to your account.' });
    open('YOUR ACCOUNT',
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, el('h3', { text: 'DISPLAY NAME' }),
        el('div', { style: 'display:flex;gap:8px' }, nameIn, el('button', { class: 'btn btn-gold btn-sm', type: 'button', onclick: saveName }, 'SAVE')), nameMsg),
      el('div', { style: 'display:flex;flex-direction:column;gap:10px' }, ...summary()),
      status,
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, el('h3', { text: 'LINKED SIGN-INS' }), ...rows),
      el('div', { class: 'acct-foot' },
        el('button', { class: 'btn btn-acc btn-sm', type: 'button', onclick: signOut }, 'SIGN OUT'),
        el('button', { class: 'btn btn-ghost btn-sm', style: 'border-width:2px', type: 'button', onclick: close }, 'CLOSE')),
      el('button', { class: 'acct-link', type: 'button', onclick: confirmDelete }, 'Delete my account'));
    statusLine = status;
  }
  async function unlink(p) {
    try { user = (await post('/me/unlink', { provider: p })).user; toast(LABEL[p] + ' unlinked'); showAccount(); } catch (e) { toast(e.message, 4500); }
  }
  function clearDevice() {
    applying = true;
    for (const k of localKeys()) raw.del(k);
    applying = false;
  }
  async function signOut() {
    if (dirty) await push();
    try { await post('/auth/logout'); } catch (e) { /* cookie may already be gone */ }
    user = null; clearDevice(); close();
    location.reload();
  }
  function confirmDelete() {
    open('DELETE ACCOUNT?',
      el('p', { text: 'This permanently deletes your account and the stats saved to it. Scores already on the global leaderboard stay there. This cannot be undone.' }),
      el('div', { class: 'acct-foot' },
        el('button', { class: 'btn btn-acc btn-sm', type: 'button', onclick: async () => {
          try { await post('/me/delete'); user = null; dirty = false; clearDevice(); close(); location.reload(); } catch (e) { toast(e.message, 4500); }
        } }, 'DELETE FOREVER'),
        el('button', { class: 'btn btn-ghost btn-sm', style: 'border-width:2px', type: 'button', onclick: showAccount }, 'CANCEL')));
  }

  // ---------- start-up ----------
  function readRedirectResult() {
    const q = new URLSearchParams(location.search);
    const out = { signedin: q.get('signedin'), linked: q.get('linked'), error: q.get('signin_error') };
    if (out.signedin || out.linked || out.error) {
      ['signedin', 'linked', 'signin_error'].forEach((k) => q.delete(k));
      const s = q.toString();
      history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
    }
    return out;
  }
  const ready = (async function init() {
    const result = readRedirectResult();
    const [prov, me] = await Promise.all([api('/auth/providers').catch(() => null), api('/me').catch(() => null)]);
    if (prov) providers = prov;
    if (me && me.user) {
      user = me.user;
      const { changed, needsPush } = apply(me.stats || {});
      if (!read('lbName')) { raw.set('lbName', JSON.stringify(user.name)); }
      if (needsPush) { dirty = true; push(); }
      if (changed.length) window.dispatchEvent(new CustomEvent('rtt:synced', { detail: { changed } }));
    }
    const mount = () => {
      renderButton();
      if (result.error) toast(result.error, 5000);
      else if (result.linked && user) toast(LABEL[result.linked] + ' linked to your account');
      else if (result.signedin && user) toast('Signed in as ' + user.name);
      else if (result.signedin === 'email' && !user) toast('Sign-in did not stick. Check that cookies are allowed for this site.', 5000);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    return user;
  })();

  return { ready, get user() { return user; }, signIn: showSignIn, account: showAccount, _merge: mergeKey };
})();
