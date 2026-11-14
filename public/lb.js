// Global leaderboard client, shared by Run the Table, Fantasy Draft and Run the Grid.
window.RTTLB = (function () {
  'use strict';
  const API = '/api';
  const GAMES = { table: 'RUN THE TABLE', fantasy: 'FANTASY DRAFT', grid: 'RUN THE GRID' };
  const $ = (id) => document.getElementById(id);
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('rtt:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('rtt:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'class') n.className = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'text') n.textContent = attrs[k];
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) n.append(c);
    return n;
  }
  async function call(path, body) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal, cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    } finally { clearTimeout(t); }
  }
  const pick = (pid) => call('/pick', { pid });
  const board = (game, scope) => call(`/board?game=${encodeURIComponent(game)}&scope=${scope}&date=${today()}`);
  const isPosted = (key) => !!ls.get('posted', {})[key];
  function markPosted(key) { const p = ls.get('posted', {}); p[key] = Date.now(); const ks = Object.keys(p); if (ks.length > 300) delete p[ks[0]]; ls.set('posted', p); }

  // Modal using the page's shared #modal markup
  function modal(title, body, buttons) {
    $('mTitle').textContent = title; $('mBody').replaceChildren(body);
    const bt = $('mBtns'); bt.replaceChildren();
    for (const [label, cls, fn] of buttons) bt.append(el('button', { class: 'btn btn-sm ' + cls, onclick: () => { if (fn && fn() === false) return; $('modal').classList.add('hidden'); } }, label));
    $('modal').classList.remove('hidden');
  }

  // Ask for a name, then post. key stops the same run from being posted twice.
  function postDialog(game, entry, key, onDone) {
    if (isPosted(key)) { modal('ALREADY POSTED', el('p', { text: 'This run is already on the global leaderboard.' }), [['OK', 'btn-gold', null]]); return; }
    const input = el('input', { class: 'search', type: 'text', maxlength: '20', placeholder: 'Your name (20 characters max)', value: ls.get('lbName', ''), 'aria-label': 'Leaderboard name', style: 'width:100%;font:inherit;font-size:16px;padding:12px 14px;background:var(--panel2);color:#fff;border:2px solid var(--line2)' });
    const msg = el('p', { style: 'margin:10px 0 0;color:var(--muted);font-size:13px', text: 'Your name and score are shown publicly to everyone who visits.' });
    let busy = false;
    const send = () => {
      if (busy) return false;
      const name = input.value.trim();
      if (!name) { msg.textContent = 'Enter a name first.'; msg.style.color = 'var(--red)'; input.focus(); return false; }
      busy = true; msg.style.color = 'var(--muted)'; msg.textContent = 'Posting…';
      ls.set('lbName', name);
      call('/score', Object.assign({ game, name, date: today() }, entry)).then(() => {
        markPosted(key); busy = false;
        modal('POSTED!', el('p', { text: `You're on the ${GAMES[game]} leaderboard as ${name}.` }), [['OK', 'btn-gold', null]]);
        if (onDone) onDone();
      }).catch((e) => { busy = false; msg.style.color = 'var(--red)'; msg.textContent = 'Could not post right now (' + e.message + '). Try again in a moment.'; });
      return false;
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    modal('POST TO GLOBAL LEADERBOARD', el('div', {}, el('p', { style: 'margin:0 0 12px', text: GAMES[game] + ' · ' + summary(game, entry) }), input, msg), [['POST SCORE', 'btn-acc', send], ['CANCEL', 'btn-ghost', null]]);
    setTimeout(() => input.focus(), 30);
  }
  function summary(game, e) {
    if (game === 'grid') return `${e.score} points · ${e.filled}/9 filled`;
    if (game === 'fantasy') return `${e.w}-${e.l} · ${Number(e.pf).toFixed(1)} points`;
    return `${e.w}-${e.l} · ${e.result}`;
  }

  const fin = (r) => String(r || '').replace(/^\d+-\d+,?\s*/, '').replace(/^regular season$/, 'Regular season') || '—';
  // Leaderboard widget: game tabs + Today / All-time
  function mount(box, defaultGame) {
    let game = defaultGame || 'table', scope = 'today', seq = 0;
    const tabs = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' });
    const scopes = el('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' });
    const body = el('div', { style: 'overflow-x:auto' });
    const btn = (label, on, fn) => el('button', { class: 'btn btn-sm ' + (on ? 'btn-gold' : 'btn-ghost'), style: on ? '' : 'border-width:2px', 'aria-pressed': String(on), onclick: fn }, label);
    function draw() {
      tabs.replaceChildren(...Object.keys(GAMES).map((g) => btn(GAMES[g], g === game, () => { game = g; draw(); })));
      scopes.replaceChildren(btn('TODAY · ' + today(), scope === 'today', () => { scope = 'today'; draw(); }), btn('ALL-TIME', scope === 'all', () => { scope = 'all'; draw(); }));
      load();
    }
    async function load() {
      const my = ++seq;
      body.replaceChildren(el('p', { style: 'margin:0;color:var(--soft)', text: 'Loading…' }));
      try {
        const data = await board(game, scope);
        if (my !== seq) return;
        const rows = data.entries || [];
        if (!rows.length) { body.replaceChildren(el('p', { style: 'margin:0;color:var(--soft)', text: scope === 'today' ? 'No scores posted today yet. Finish a run and post yours to be first.' : 'No scores posted yet.' })); return; }
        const cols = game === 'grid' ? ['#', 'PLAYER', 'SCORE', 'FILLED', 'DOWNS LEFT'] : game === 'fantasy' ? ['#', 'PLAYER', 'RECORD', 'POINTS', 'FINISH'] : ['#', 'PLAYER', 'TEAM', 'RECORD', 'FINISH', 'OVR'];
        const tb = el('tbody');
        rows.forEach((x, i) => {
          const cells = game === 'grid' ? [x.score, x.filled + '/9', x.result === 'win' ? x.downs : 'Turnover']
            : game === 'fantasy' ? [x.w + '-' + x.l, Number(x.pf).toFixed(1), x.ring ? 'Champs' : fin(x.result)]
              : [x.fr + (x.mode === 'daily' ? ' · Daily' : ''), x.w + '-' + x.l, x.ring ? 'Champs' : fin(x.result), Number(x.ovr).toFixed(1)];
          tb.append(el('tr', {}, el('td', { class: 'px', style: 'font-size:11px;color:var(--gold)', text: i + 1 }), el('td', { text: x.name + (scope === 'all' ? '  ·  ' + x.date : '') }), ...cells.map((c) => el('td', { text: c }))));
        });
        body.replaceChildren(el('table', { class: 'lb' }, el('thead', {}, el('tr', {}, ...cols.map((h) => el('th', { text: h })))), tb));
      } catch (e) {
        if (my === seq) body.replaceChildren(el('p', { style: 'margin:0;color:var(--soft)', text: 'Could not load the leaderboard right now.' }));
      }
    }
    box.replaceChildren(el('div', { style: 'display:flex;flex-direction:column;gap:14px' }, tabs, scopes, body));
    draw();
    return { refresh: load, show(g) { game = g; draw(); } };
  }
  return { pick, board, postDialog, mount, isPosted, today };
})();
