(function () {
'use strict';
// ---------- Run the Grid: daily 3x3 team grid, 4 downs ----------
const G = window.GAME_DATA;
const $ = (id) => document.getElementById(id);
const FR = {
  ARI: ['Arizona', 'Cardinals'], ATL: ['Atlanta', 'Falcons'], BAL: ['Baltimore', 'Ravens'], BUF: ['Buffalo', 'Bills'],
  CAR: ['Carolina', 'Panthers'], CHI: ['Chicago', 'Bears'], CIN: ['Cincinnati', 'Bengals'], CLE: ['Cleveland', 'Browns'],
  DAL: ['Dallas', 'Cowboys'], DEN: ['Denver', 'Broncos'], DET: ['Detroit', 'Lions'], GB: ['Green Bay', 'Packers'],
  HOU: ['Houston', 'Texans'], IND: ['Indianapolis', 'Colts'], JAX: ['Jacksonville', 'Jaguars'], KC: ['Kansas City', 'Chiefs'],
  LV: ['Las Vegas', 'Raiders'], LAC: ['Los Angeles', 'Chargers'], LA: ['Los Angeles', 'Rams'], MIA: ['Miami', 'Dolphins'],
  MIN: ['Minnesota', 'Vikings'], NE: ['New England', 'Patriots'], NO: ['New Orleans', 'Saints'], NYG: ['New York', 'Giants'],
  NYJ: ['New York', 'Jets'], PHI: ['Philadelphia', 'Eagles'], PIT: ['Pittsburgh', 'Steelers'], SF: ['San Francisco', '49ers'],
  SEA: ['Seattle', 'Seahawks'], TB: ['Tampa Bay', 'Buccaneers'], TEN: ['Tennessee', 'Titans'], WAS: ['Washington', 'Commanders']
};
const KEYS = Object.keys(FR).filter((k) => G.teams[k]).sort();
const TILE = ['#ff7a1a', '#ffd23f', '#6ee7a0', '#7dd3fc', '#f9a8d4', '#c4b5fd'];
const POSN = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];
const DOWN = ['1ST DOWN', '2ND DOWN', '3RD DOWN', '4TH DOWN'];
const MAX = 4;

// ---------- rng (same as the main game) ----------
function hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }
function rng(seedStr) { let a = hash(seedStr); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
const store = {
  get(k, d) { try { const v = localStorage.getItem('rtt:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rtt:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
};

// ---------- index every player's franchises ----------
const P = new Map(); // pid -> { pid, name, fr:Set, y0, y1, ovr, pos }
// Past seasons (G.teams) plus the season in progress (G.now), which only the grid uses.
const SEASONS = [];
for (const fr of KEYS) for (const y in G.teams[fr]) SEASONS.push([fr, y, G.teams[fr][y]]);
if (G.now) for (const fr of KEYS) if (G.now.teams[fr]) SEASONS.push([fr, String(G.now.season), G.now.teams[fr]]);
for (const [fr, y, list] of SEASONS) {
  for (const tok of list.split(',')) {
    const pid = parseInt(tok.slice(0, -1), 16), yr = +y;
    let p = P.get(pid);
    if (!p) { p = { pid, name: G.players[pid][0], ovr: G.players[pid][1], pos: POSN[+tok.slice(-1)], fr: new Set(), n: {}, y0: yr, y1: yr }; P.set(pid, p); }
    p.fr.add(fr); p.n[fr] = (p.n[fr] || 0) + 1; if (yr < p.y0) p.y0 = yr; if (yr > p.y1) p.y1 = yr;
  }
}
const ALL = [...P.values()];
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(jr|sr|ii|iii|iv)\b/g, '').replace(/\s+/g, ' ').trim();
ALL.forEach((p) => { p.key = norm(p.name); });
const pairCount = {};
for (const p of ALL) { const f = [...p.fr]; for (let i = 0; i < f.length; i++) for (let j = 0; j < f.length; j++) if (i !== j) { const k = f[i] + '|' + f[j]; pairCount[k] = (pairCount[k] || 0) + 1; } }

// ---------- today's grid: same for everyone, new every day ----------
function makeGrid(date) {
  const r = rng('grid|' + date);
  let best = null;
  for (let t = 0; t < 3000; t++) {
    const sh = KEYS.slice();
    for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; }
    const rows = sh.slice(0, 3), cols = sh.slice(3, 6);
    let min = Infinity;
    for (const a of rows) for (const b of cols) min = Math.min(min, pairCount[a + '|' + b] || 0);
    if (min >= 6) return { rows, cols };
    if (!best || min > best.min) best = { rows, cols, min };
  }
  return best;
}
const DATE = today();
const GRID = makeGrid(DATE);
const cellTeams = (i) => [GRID.rows[Math.floor(i / 3)], GRID.cols[i % 3]];
let S = store.get('grid:' + DATE, null);
if (!S || !Array.isArray(S.cells)) S = { cells: Array(9).fill(null), misses: 0, done: null, tries: 0 };
if (!Array.isArray(S.pts)) S.pts = Array(9).fill(null);
// Rarity: how strongly a player is tied to the two teams in his square.
// Association = seasons with those two teams x star power (rating), so a longtime star is a
// household name with those teams and scores low, while a one-year backup is a deep cut worth ~100.
const star = (ovr) => Math.pow(Math.min(1, Math.max(0.05, (ovr - 45) / 50)), 1.5);
function rarityPts(i, p) { const [a, b] = cellTeams(i); const assoc = ((p.n[a] || 0) + (p.n[b] || 0)) * star(p.ovr); return Math.max(1, Math.min(100, Math.round(100 / (1 + assoc / 1.2)))); }
function rarityLabel(pts) { return pts >= 80 ? 'deep cut' : pts >= 50 ? 'rare' : pts >= 25 ? 'solid' : 'household name'; }
S.pts = S.cells.map((pid, i) => pid == null ? null : rarityPts(i, P.get(pid)));
const score = () => S.pts.reduce((t, x) => t + (x || 0), 0);
const save = () => store.set('grid:' + DATE, S);
// Account sync brought in today's grid from another device: reload to show it.
window.addEventListener('rtt:synced', (e) => { if (e.detail.changed.includes('grid:' + DATE)) location.reload(); });

// ---------- ui helpers ----------
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
function toast(t) { const n = $('toast'); n.textContent = t; n.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => n.classList.add('hidden'), 2200); }
function modal(title, body, buttons, onOpen) {
  $('mTitle').textContent = title; $('mBody').replaceChildren(body);
  const bt = $('mBtns'); bt.replaceChildren();
  for (const [label, cls, fn] of buttons) bt.append(el('button', { class: 'btn btn-sm ' + cls, onclick: () => { closeModal(); fn && fn(); } }, label));
  $('modal').classList.remove('hidden');
  if (onOpen) onOpen(); else if (bt.firstChild) bt.firstChild.focus();
}
function closeModal() { $('modal').classList.add('hidden'); }
const yrs = (p) => p.y0 === p.y1 ? String(p.y0) : p.y0 + '–' + p.y1;
const teamName = (k) => FR[k][0] + ' ' + FR[k][1];

// ---------- render ----------
function render() {
  $('gDate').textContent = DATE;
  const left = MAX - S.misses;
  $('downNow').textContent = S.done === 'lose' ? 'TURNOVER' : S.done === 'win' ? 'TOUCHDOWN' : DOWN[S.misses];
  const pips = $('dpips'); pips.replaceChildren();
  for (let i = 0; i < MAX; i++) pips.append(el('span', { class: 'dpip' + (i < S.misses ? ' used' : ''), title: i < S.misses ? 'Down used' : 'Down left' }));
  $('dleft').textContent = left + (left === 1 ? ' down left' : ' downs left');
  $('scoreNow').textContent = score();
  const b = $('board'); b.replaceChildren();
  b.append(el('div', { class: 'corner', text: 'PLAYED FOR BOTH' }));
  GRID.cols.forEach((k, i) => b.append(teamHead(k, i + 3)));
  for (let r = 0; r < 3; r++) {
    b.append(teamHead(GRID.rows[r], r));
    for (let c = 0; c < 3; c++) {
      const i = r * 3 + c, pid = S.cells[i], p = pid != null ? P.get(pid) : null;
      const [a, bb] = cellTeams(i);
      if (p) b.append(el('button', { class: 'cell ok', 'aria-label': `${teamName(a)} and ${teamName(bb)}: ${p.name}`, disabled: '' }, el('span', { class: 'pn', text: p.name }), el('span', { class: 'yr', text: p.pos + ' · ' + yrs(p) }), el('span', { class: 'rar', text: S.pts[i] + ' pts · ' + rarityLabel(S.pts[i]) })));
      else if (S.done) b.append(el('div', { class: 'cell miss', role: 'img', 'aria-label': `${teamName(a)} and ${teamName(bb)}: not filled` }, el('span', { class: 'plus', text: '—' })));
      else b.append(el('button', { class: 'cell', 'aria-label': `Guess a player for ${teamName(a)} and ${teamName(bb)}`, onclick: () => openGuess(i) }, el('span', { class: 'plus', text: '+' })));
    }
  }
  $('shareBtn').classList.toggle('hidden', !S.done);
  $('giveBtn').classList.toggle('hidden', !!S.done);
  const pb = $('postBtn'); pb.classList.toggle('hidden', !S.done); const posted = window.RTTLB && RTTLB.isPosted('grid|' + DATE); pb.disabled = !!posted || !window.RTTLB; pb.textContent = posted ? 'POSTED ✓' : 'POST TO LEADERBOARD';
  const filled = S.cells.filter((x) => x != null).length;
  $('gNote').textContent = S.done ? `${filled}/9 filled · New grid at midnight` : `${filled}/9 filled · Each wrong guess costs a down. A correct guess keeps your drive alive.`;
}
function teamHead(k, i) {
  return el('div', { class: 'thead' }, el('span', { class: 'ab', style: 'background:' + TILE[i % TILE.length], text: k }), el('span', { class: 'nm', text: teamName(k) }));
}

// ---------- guessing ----------
function openGuess(i) {
  if (S.done || S.cells[i] != null) return;
  const [a, b] = cellTeams(i);
  const input = el('input', { class: 'search', type: 'search', placeholder: 'Type a player name', autocomplete: 'off', 'aria-label': 'Player name' });
  const list = el('div', { class: 'res', role: 'list' });
  const used = new Set(S.cells.filter((x) => x != null));
  const draw = () => {
    const q = norm(input.value); list.replaceChildren();
    if (q.length < 2) { list.append(el('p', { style: 'margin:0;color:var(--muted)', text: 'Type at least 2 letters.' })); return; }
    const hits = [];
    for (const p of ALL) {
      const k = p.key; let s = -1;
      if (k.startsWith(q)) s = 0; else if (k.includes(' ' + q)) s = 1; else if (k.includes(q)) s = 2;
      if (s >= 0) hits.push([s, p]);
    }
    hits.sort((x, y) => x[0] - y[0] || y[1].ovr - x[1].ovr);
    if (!hits.length) { list.append(el('p', { style: 'margin:0;color:var(--muted)', text: 'No players match.' })); return; }
    for (const [, p] of hits.slice(0, 30)) {
      list.append(el('button', { class: 'rbtn2' + (used.has(p.pid) ? ' used' : ''), role: 'listitem', onclick: () => { closeModal(); guess(i, p); } },
        el('span', { text: p.name }), el('span', { class: 'yrs', text: p.pos + ' · ' + yrs(p) })));
    }
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = list.querySelector('.rbtn2'); if (f) f.click(); } });
  const body = el('div', {}, el('p', { style: 'margin:0 0 12px', text: `Name a player who played for the ${teamName(a)} and the ${teamName(b)}.` }), input, list);
  draw();
  modal(DOWN[S.misses] + ' · ' + a + ' + ' + b, body, [['CANCEL', 'btn-ghost', null]], () => input.focus());
}
async function guess(i, p) {
  if (S.done) return;
  if (S.cells.includes(p.pid)) { toast('Already on your grid. Pick someone else.'); return; }
  const [a, b] = cellTeams(i);
  S.tries++;
  if (p.fr.has(a) && p.fr.has(b)) {
    S.cells[i] = p.pid; S.pts[i] = rarityPts(i, p);
    if (S.cells.every((x) => x != null)) { S.done = 'win'; save(); render(); touchdown(); return; }
    save(); render(); toast(`First down! ${p.name}: +${S.pts[i]} points (${rarityLabel(S.pts[i])}).`);
  } else {
    S.misses++;
    if (S.misses >= MAX) { S.done = 'lose'; save(); render(); turnover(p, a, b); return; }
    save(); render(); toast(`No gain. ${p.name} never played for both. ${DOWN[S.misses]}.`);
  }
}
function turnover(p, a, b) {
  $('toast').classList.add('hidden');
  const filled = S.cells.filter((x) => x != null).length;
  modal('TURNOVER ON DOWNS', el('div', {},
    el('p', { class: 'tod', text: 'TURNOVER ON DOWNS' }),
    el('p', { style: 'margin:0 0 8px', text: `${p.name} never played for both the ${FR[a][1]} and the ${FR[b][1]}. That was your 4th down.` }),
    el('p', { style: 'margin:0', text: `You filled ${filled} of 9 for ${score()} rarity points. A new grid drops at midnight.` })),
  [['POST TO LEADERBOARD', 'btn-acc', postGrid], ['COPY RESULT', 'btn-gold', share], ['CLOSE', 'btn-ghost', null]]);
}
function touchdown() {
  modal('TOUCHDOWN!', el('div', {},
    el('p', { class: 'tod td', text: 'TOUCHDOWN!' }),
    el('p', { style: 'margin:0', text: `You filled all 9 squares with ${MAX - S.misses} ${MAX - S.misses === 1 ? 'down' : 'downs'} to spare, for ${score()} rarity points. A new grid drops at midnight.` })),
  [['POST TO LEADERBOARD', 'btn-acc', postGrid], ['COPY RESULT', 'btn-gold', share], ['CLOSE', 'btn-ghost', null]]);
}
function giveUp() {
  if (S.done) return;
  modal('GIVE UP?', el('p', { text: 'This ends today\'s grid. Answers stay hidden so nobody can look them up for today.' }), [['GIVE UP', 'btn-acc', () => { S.done = 'lose'; save(); render(); }], ['KEEP PLAYING', 'btn-ghost', null]]);
}
async function share() {
  const rows = [0, 1, 2].map((r) => [0, 1, 2].map((c) => S.cells[r * 3 + c] != null ? '🟩' : '⬜').join('')).join('\n');
  const filled = S.cells.filter((x) => x != null).length;
  const t = `RUN THE GRID · ${DATE}\n${rows}\n${filled}/9 · ${score()} rarity points · ${S.done === 'win' ? 'Touchdown' : 'Turnover on downs'}\nrunthetablenfl.com/grid.html`;
  try { await navigator.clipboard.writeText(t); toast('Result copied'); }
  catch (e) { modal('YOUR RESULT', el('pre', { style: 'white-space:pre-wrap;margin:0;font-family:inherit', text: t }), [['CLOSE', 'btn-gold', null]]); }
}

function postGrid() {
  if (!S.done || !window.RTTLB) return;
  const filled = S.cells.filter((x) => x != null).length;
  RTTLB.postDialog('grid', { score: score(), filled, downs: MAX - S.misses, result: S.done }, 'grid|' + DATE, () => { render(); if (lbw) lbw.refresh(); });
}
$('shareBtn').addEventListener('click', share);
$('postBtn').addEventListener('click', postGrid);
const lbw = window.RTTLB ? RTTLB.mount($('gridBoard'), 'grid') : null;
$('giveBtn').addEventListener('click', giveUp);
$('helpBtn').addEventListener('click', () => modal('HOW TO PLAY', el('div', {},
  el('p', { style: 'margin:0 0 10px', text: 'Fill every square with a player who played for both the team on his row and the team on his column, at any point from 1970 through this season.' }),
  el('p', { style: 'margin:0 0 10px', text: 'You get 4 downs. Every wrong guess uses one. Use all 4 and it\'s a turnover on downs. Correct guesses are free.' }),
  el('p', { style: 'margin:0 0 10px', text: 'Rarity scoring: every correct pick earns up to 100 points based on how strongly that player is tied to the two teams in his square. Longtime stars with those teams (household names) earn only a few points. Backups and short stints (deep cuts) earn up to 100. Max score is 900, and you can post it to the global leaderboard.' }),
  el('p', { style: 'margin:0', text: 'Each player can only be used once. Franchises count across moves, so the Oakland Raiders are the Raiders and the Houston Oilers are the Titans. Everyone gets the same grid, and a new one drops every day at midnight.' })),
  [['GOT IT', 'btn-gold', null]]));
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
render();
if (!store.get('gridSeenHelp', false)) { store.set('gridSeenHelp', true); $('helpBtn').click(); }
window.__grid = { GRID, S: () => S, DATE };
})();
