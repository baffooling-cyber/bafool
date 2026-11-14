(function () {
'use strict';
const G = window.GAME_DATA;
const $ = (id) => document.getElementById(id);
const POS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'K', 'P'];
const NEED = { QB: 3, RB: 4, WR: 6, TE: 3, OL: 9, DL: 9, LB: 7, DB: 9, K: 1, P: 1 };
const START = { QB: [1, 4], RB: [1, 1.5], WR: [3, 1.5], TE: [1, 1], OL: [5, 1], DL: [4, 1.2], LB: [3, 1], DB: [4, 1.2], K: [1, .5], P: [1, .3] };
const TOTAL = 52;
// ---------- fantasy mode: 9-man PPR lineup ----------
const FSLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST'];
const FPOS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];
const FLEXOK = ['RB', 'WR', 'TE'];
const isF = () => !!(S && S.mode === 'fantasy');
const total = () => isF() ? FSLOTS.length : TOTAL;
const slotTakes = (slot, pos) => slot === pos || (slot === 'FLEX' && FLEXOK.includes(pos));
// Fills exact slots first, then FLEX, in draft order
function fAssign(picks) {
  const slots = FSLOTS.map((s) => ({ s, p: null }));
  for (const p of picks) {
    const sl = slots.find((x) => !x.p && x.s === p.pos) || slots.find((x) => !x.p && slotTakes(x.s, p.pos));
    if (sl) sl.p = p;
  }
  return slots;
}
function posOpen(pos) {
  if (!isF()) return filledCount(pos) < NEED[pos];
  return fAssign(S.picks).some((x) => !x.p && slotTakes(x.s, pos));
}

// ---------- franchises ----------
const FR = {
  ARI: ['Arizona', 'Cardinals', 'NFC'], ATL: ['Atlanta', 'Falcons', 'NFC'], BAL: ['Baltimore', 'Ravens', 'AFC'], BUF: ['Buffalo', 'Bills', 'AFC'],
  CAR: ['Carolina', 'Panthers', 'NFC'], CHI: ['Chicago', 'Bears', 'NFC'], CIN: ['Cincinnati', 'Bengals', 'AFC'], CLE: ['Cleveland', 'Browns', 'AFC'],
  DAL: ['Dallas', 'Cowboys', 'NFC'], DEN: ['Denver', 'Broncos', 'AFC'], DET: ['Detroit', 'Lions', 'NFC'], GB: ['Green Bay', 'Packers', 'NFC'],
  HOU: ['Houston', 'Texans', 'AFC'], IND: ['Indianapolis', 'Colts', 'AFC'], JAX: ['Jacksonville', 'Jaguars', 'AFC'], KC: ['Kansas City', 'Chiefs', 'AFC'],
  LV: ['Las Vegas', 'Raiders', 'AFC'], LAC: ['Los Angeles', 'Chargers', 'AFC'], LA: ['Los Angeles', 'Rams', 'NFC'], MIA: ['Miami', 'Dolphins', 'AFC'],
  MIN: ['Minnesota', 'Vikings', 'NFC'], NE: ['New England', 'Patriots', 'AFC'], NO: ['New Orleans', 'Saints', 'NFC'], NYG: ['New York', 'Giants', 'NFC'],
  NYJ: ['New York', 'Jets', 'AFC'], PHI: ['Philadelphia', 'Eagles', 'NFC'], PIT: ['Pittsburgh', 'Steelers', 'AFC'], SF: ['San Francisco', '49ers', 'NFC'],
  SEA: ['Seattle', 'Seahawks', 'NFC'], TB: ['Tampa Bay', 'Buccaneers', 'NFC'], TEN: ['Tennessee', 'Titans', 'AFC'], WAS: ['Washington', 'Commanders', 'NFC']
};
const FR_KEYS = Object.keys(FR).sort();
function histName(fr, y) {
  switch (fr) {
    case 'ARI': return y <= 1987 ? 'St. Louis Cardinals' : y <= 1993 ? 'Phoenix Cardinals' : 'Arizona Cardinals';
    case 'LA': return y <= 1994 || y >= 2016 ? 'Los Angeles Rams' : 'St. Louis Rams';
    case 'IND': return y <= 1983 ? 'Baltimore Colts' : 'Indianapolis Colts';
    case 'TEN': return y <= 1996 ? 'Houston Oilers' : y <= 1998 ? 'Tennessee Oilers' : 'Tennessee Titans';
    case 'LV': return (y >= 1982 && y <= 1994) ? 'Los Angeles Raiders' : y >= 2020 ? 'Las Vegas Raiders' : 'Oakland Raiders';
    case 'LAC': return y <= 2016 ? 'San Diego Chargers' : 'Los Angeles Chargers';
    case 'NE': return y <= 1970 ? 'Boston Patriots' : 'New England Patriots';
    case 'WAS': return y <= 2019 ? 'Washington' : y <= 2021 ? 'Washington Football Team' : 'Washington Commanders';
    case 'TB': return 'Tampa Bay Buccaneers';
    default: return FR[fr][0] + ' ' + FR[fr][1];
  }
}
const fullName = (fr) => FR[fr][0] + ' ' + FR[fr][1];
const YEARS = {};
for (const fr of FR_KEYS) YEARS[fr] = Object.keys(G.teams[fr] || {}).map(Number).sort((a, b) => a - b);

const dstCache = {};
// A team-season's defense as one draftable unit: rated on its top 4 DL, 3 LB and 4 DB
function dstOf(fr, y) {
  const k = fr + y;
  if (!dstCache[k]) {
    const ros = roster(fr, y);
    const top = (pos, n) => ros.filter((x) => x.pos === pos).map((x) => x.ovr).sort((a, b) => b - a).concat(Array(n).fill(40)).slice(0, n);
    const all = [...top('DL', 4), ...top('LB', 3), ...top('DB', 4)];
    dstCache[k] = { pid: -(1000000 + FR_KEYS.indexOf(fr) * 1000 + (y - 1900)), pos: 'DST', name: histName(fr, y) + ' D/ST', ovr: Math.round(all.reduce((a, b) => a + b, 0) / all.length) };
  }
  return dstCache[k];
}
function fRoster(fr, y) { return roster(fr, y).filter((x) => FPOS.includes(x.pos)).concat([dstOf(fr, y)]); }
function draftRoster(fr, y) { return isF() ? fRoster(fr, y) : roster(fr, y); }
const rosterCache = {};
function roster(fr, y) {
  const k = fr + y;
  if (!rosterCache[k]) {
    rosterCache[k] = G.teams[fr][y].split(',').map((tok) => {
      const pos = POS[+tok.slice(-1)], pid = parseInt(tok.slice(0, -1), 16);
      return { pid, pos, name: G.players[pid][0], ovr: G.players[pid][1] };
    });
  }
  return rosterCache[k];
}

// ---------- rng ----------
function hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }
function rng(seedStr) { let a = hash(seedStr); return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function gauss(r) { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function todayStr() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

// ---------- storage ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('rtt:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('rtt:' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem('rtt:' + k); } catch (e) { /* ignore */ } }
};

// ---------- sound ----------
let soundOn = store.get('sound', false), actx = null;
function beep(freq, dur, type) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.value = freq; g.gain.value = 0.04;
    o.connect(g); g.connect(actx.destination); o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur); o.stop(actx.currentTime + dur);
  } catch (e) { /* no audio */ }
}

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
function modal(title, body, buttons, wide) {
$('mBody').parentElement.classList.toggle('rtt-wide', !!wide);
  $('mTitle').textContent = title; const b = $('mBody'); b.replaceChildren(body);
  const bt = $('mBtns'); bt.replaceChildren();
  for (const [label, cls, fn] of buttons) bt.append(el('button', { class: 'btn btn-sm ' + cls, onclick: () => { $('modal').classList.add('hidden'); fn && fn(); } }, label));
  $('modal').classList.remove('hidden'); bt.firstChild && bt.firstChild.focus();
}
function show(view) {
  for (const v of ['home', 'draft', 'season']) $('view-' + v).classList.toggle('hidden', v !== view);
  window.scrollTo(0, 0);
}
const pad2 = (n) => String(n).padStart(2, '0');
const shortYr = (y) => "'" + String(y).slice(2);

// ---------- team strength & sim ----------
function teamRating(picks) {
  const by = {}; POS.forEach((p) => by[p] = []);
  picks.forEach((p) => by[p.pos].push(p.ovr));
  let s = 0, w = 0; const dep = [];
  for (const p of POS) {
    const lst = by[p].sort((a, b) => b - a).concat(Array(NEED[p]).fill(40));
    const [n, wt] = START[p];
    lst.slice(0, n).forEach((o) => { s += o * wt; w += wt; });
    dep.push(...lst.slice(n, NEED[p]));
  }
  return 0.85 * s / w + 0.15 * dep.reduce((a, b) => a + b, 0) / dep.length;
}
const oppRating = (t) => 78 + 0.5 * (G.strength[t] || 0);
function playGame(r, T, opp, home, bump) {
  const diff = T - (oppRating(opp) + (bump || 0)) + (home === 1 ? 1.5 : home === 0 ? -1.5 : 0);
  const margin = diff + 13.5 * gauss(r);
  let them = Math.max(0, Math.round(20 + 7 * gauss(r)));
  let us = Math.max(0, Math.round(them + margin));
  if (us === them) { if (r() < 1 / (1 + Math.exp(-diff / 8))) us += 3; else them += 3; }
  return { opp, home, us, them, W: us > them };
}

// ---------- state ----------
let S = null; // current run
const freshSpin = () => ({ fr: null, y: null, yearUsed: false, teamUsed: false, pending: null, phase: 'ready', free: 0 });
function newRun(mode, fr) {
  const date = todayStr();
  const seed = mode === 'daily' ? 'daily|' + date : 'free|' + Date.now() + '|' + Math.random();
  if (mode === 'daily') fr = pick(rng(seed + '|franchise'), FR_KEYS);
  S = { mode, date, seed, fr, picks: [], spin: freshSpin(), showRatings: $('showRatingsHome').checked, done: false };
  save(); openDraft();
}
function save() { if (S && !S.done) store.set('run', S); }
function filledCount(pos) { return S.picks.filter((p) => p.pos === pos).length; }
function spinResult(tag) {
  const i = S.picks.length;
  const r = rng(S.seed + '|spin|' + i + '|' + tag);
  const fr = pick(r, FR_KEYS);
  return { fr, y: pick(r, YEARS[fr]) };
}
function eligible(pl) { return posOpen(pl.pos) && !S.picks.some((p) => p.pid === pl.pid); }

// ---------- home ----------
function renderHome() {
  const perfect = store.get('perfect', {});
  const grid = $('teamGrid'); grid.replaceChildren();
  for (const fr of FR_KEYS) {
    grid.append(el('button', { class: 'tbtn' + (perfect[fr] ? ' done' : ''), 'aria-label': fullName(fr) + (perfect[fr] ? ', 17-0 completed' : ''), onclick: () => startFree(fr) },
      el('span', { class: 'ab', text: fr }), el('span', { class: 'cf', text: FR[fr][1] + ' · ' + FR[fr][2] })));
  }
  const n = Object.keys(perfect).length;
  $('prCount').textContent = n + '/32'; $('prBar').style.width = (n / 32 * 100) + '%';
  const saved = store.get('run', null);
  $('resumeRow').classList.toggle('hidden', !saved);
  if (saved) $('resumeInfo').textContent = saved.mode === 'fantasy' ? 'Fantasy draft · ' + saved.picks.length + '/' + FSLOTS.length + ' picks' : (saved.mode === 'daily' ? 'Daily · ' : '') + fullName(saved.fr) + ' · ' + saved.picks.length + '/52 picks';
  const daily = store.get('daily', {});
  $('dailyBtn').textContent = daily[todayStr()] ? "✓ TODAY'S DAILY DONE" : "▶ PLAY TODAY'S DAILY";
  const last = store.get('last', null);
  const pips = $('lastPips'); pips.replaceChildren();
  for (let i = 0; i < 17; i++) pips.append(el('div', { class: 'pip' + (last ? (last.seq[i] === 'W' ? ' w' : ' l') : '') }));
  if (last) {
    $('lastW').textContent = pad2(last.w); $('lastL').textContent = pad2(last.l); $('lastTeam').textContent = last.fr;
    $('lastCap').textContent = last.result.toUpperCase();
  }
  $('lastStatsBtn').classList.toggle('hidden', !(last && last.stats));
renderRecords(); renderFRecords(); loadLeaderboard();
}
function renderRecords() {
  const h = store.get('history', []), perfect = store.get('perfect', {}), rings = store.get('rings', {});
  const best = h.reduce((b, x) => (!b || x.w > b.w || (x.w === b.w && x.ovr > b.ovr)) ? x : b, null);
  const box = $('myRecords'); box.replaceChildren();
  if (!h.length) { box.textContent = 'No seasons played yet. Your best record, perfect seasons and rings show up here.'; return; }
  box.append(el('div', { text: `Seasons played: ${h.length} · Perfect seasons: ${Object.keys(perfect).length} franchises · Rings: ${Object.keys(rings).length} franchises` }));
  if (best) box.append(el('div', { text: `Best season: ${best.w}-${best.l} with the ${fullName(best.fr)} (team OVR ${best.ovr.toFixed(1)}) · ${best.result}` }));
}
function startFree(fr) {
  const go = () => newRun('free', fr);
  if (store.get('run', null)) modal('START A NEW DRAFT?', el('p', { text: 'You have a draft in progress. Starting a new one will replace it.' }), [['START NEW', 'btn-acc', go], ['CANCEL', 'btn-ghost', null]]);
  else go();
}
function startDaily() {
  const daily = store.get('daily', {});
  const saved = store.get('run', null);
  if (saved && saved.mode === 'daily' && saved.date === todayStr()) { S = saved; openDraft(); return; }
  if (daily[todayStr()]) {
    const d = daily[todayStr()];
    modal("TODAY'S DAILY IS DONE", el('p', { text: `You went ${d.w}-${d.l} with the ${fullName(d.fr)}. ${d.result}. A new board opens at midnight.` }), [['OK', 'btn-gold', null]]);
    return;
  }
  const go = () => newRun('daily');
  if (saved) modal('START THE DAILY?', el('p', { text: 'You have a free-play draft in progress. Starting the daily will replace it.' }), [['START DAILY', 'btn-acc', go], ['CANCEL', 'btn-ghost', null]]);
  else go();
}

// ---------- wheel ----------
const COLORS = ['#ff7a1a', '#ffd23f', '#6ee7a0', '#7dd3fc'];
let wheelRot = 0;
function buildWheel() {
  const svg = $('wheel'), ns = 'http://www.w3.org/2000/svg', n = FR_KEYS.length, R = 156;
  svg.replaceChildren();
  FR_KEYS.forEach((fr, i) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`);
    p.setAttribute('fill', i % 2 ? '#151c18' : COLORS[(i / 2) % 4 | 0]);
    p.setAttribute('stroke', '#0a0f0c'); p.setAttribute('stroke-width', '2');
    svg.append(p);
    const mid = (i + 0.5) / n * 360;
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('transform', `rotate(${mid}) translate(0 -118) rotate(90)`);
    t.setAttribute('fill', i % 2 ? '#ffffff' : '#0a0f0c'); t.setAttribute('font-size', '9');
    t.setAttribute('font-family', "'Press Start 2P', monospace"); t.setAttribute('text-anchor', 'middle'); t.setAttribute('dominant-baseline', 'middle');
    t.textContent = fr; svg.append(t);
  });
  const ring = document.createElementNS(ns, 'circle'); ring.setAttribute('r', R); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#fff'); ring.setAttribute('stroke-width', '4'); svg.append(ring);
}
function spinWheelTo(fr, quick) {
  const i = FR_KEYS.indexOf(fr), seg = 360 / FR_KEYS.length;
  const target = 360 - (i + 0.5) * seg;
  const cur = ((wheelRot % 360) + 360) % 360;
  let delta = target - cur; if (delta < 0) delta += 360;
  wheelRot += delta + (quick ? 360 : 360 * 5);
  const w = $('wheel');
  w.style.transitionDuration = quick ? '0.5s' : '2.2s';
  w.style.transform = `rotate(${wheelRot}deg)`;
  return quick ? 550 : 2250;
}
function rollYear(years, final, ms) {
  return new Promise((res) => {
    const box = $('rYear'); const t0 = performance.now();
    (function tick() {
      const el2 = performance.now() - t0;
      if (el2 >= ms) { box.textContent = final; beep(880, .12); res(); return; }
      box.textContent = years[Math.floor(Math.random() * years.length)]; beep(300 + Math.random() * 300, .03);
      setTimeout(tick, 40 + 160 * (el2 / ms) ** 2);
    })();
  });
}

// ---------- draft ----------
let posFilter = 'OPEN', busy = false;
function openDraft() {
  show('draft');
  $('dMode').textContent = S.mode === 'fantasy' ? 'FANTASY DRAFT · PPR · 9 SPINS' : S.mode === 'daily' ? 'DAILY BOARD · ' + S.date : 'FREE PLAY';
  $('dTitle').textContent = isF() ? 'YOUR FANTASY LINEUP' : fullName(S.fr).toUpperCase();
  const dh = $('filled').previousElementSibling; if (dh) dh.textContent = isF() ? 'LINEUP' : 'DEPTH CHART';
  $('showRatings').checked = !!S.showRatings;
  $('quickSpin').checked = store.get('quick', false);
  const sp = S.spin;
  if (sp.fr) { $('rTeam').textContent = sp.fr; $('rYear').textContent = sp.y; spinWheelTo(sp.fr, true); }
  else { $('rTeam').textContent = '—'; $('rYear').textContent = '—'; }
  if (sp.phase === 'spinning') sp.phase = sp.fr ? 'picking' : 'ready';
  posFilter = 'OPEN';
  renderDraft();
}
function renderDraft() {
  const sp = S.spin, n = S.picks.length;
  $('dSpin').textContent = Math.min(n + 1, total()) + '/' + total();
  $('rName').textContent = sp.fr ? `${sp.y} ${histName(sp.fr, sp.y)}` : '';
  $('hub').textContent = sp.fr ? sp.fr : 'SPIN';
  const sb = $('spinBtn');
  if (n >= total() || (n === total() - 1 && sp.phase === 'picked')) { sb.textContent = isF() ? '▶ PLAY FANTASY SEASON' : '▶ PLAY THE SEASON'; sb.disabled = false; }
  else if (sp.phase === 'picked') { sb.textContent = '▶ LOCK IN & SPIN'; sb.disabled = false; }
  else if (sp.phase === 'ready') { sb.textContent = '▶ SPIN'; sb.disabled = false; }
  else { sb.textContent = '▶ SPIN'; sb.disabled = true; }
  if (busy) sb.disabled = true;
  const canYear = !busy && !sp.yearUsed && (sp.phase === 'picking' || sp.phase === 'picked') && YEARS[sp.fr] && YEARS[sp.fr].length > 1;
  $('resetYearBtn').disabled = !canYear; $('ryCt').textContent = sp.yearUsed ? '0' : '1';
  $('resetTeamBtn').disabled = busy || sp.teamUsed || !(sp.phase === 'picking' || sp.phase === 'picked'); $('rtCt').textContent = sp.teamUsed ? '0' : '1';
  const msg = $('dMsg');
  let elig = 0;
  if (sp.fr && sp.phase !== 'ready') elig = draftRoster(sp.fr, sp.y).filter(eligible).length;
  if (busy) msg.textContent = 'Spinning…';
else if (n >= total()) msg.textContent = isF() ? 'Lineup set. Hit Play Fantasy Season.' : 'Roster full. Hit Play the Season.';
  else if (sp.phase === 'ready') msg.textContent = n === 0 ? 'Spin to see who you draft from first.' : 'Spin for your next team and season.';
  else if (sp.phase === 'picking' && elig === 0) msg.textContent = sp.yearUsed && sp.teamUsed ? 'Nobody on this roster fits an open spot. Take a free re-spin.' : 'Nobody on this roster fits an open spot. Use a Year Reset or Team Reset.';
  else if (sp.phase === 'picking') msg.textContent = 'Pick one player for an open spot on your roster.';
  else if (sp.phase === 'picked') msg.textContent = `Drafted ${sp.pending.name} (${sp.pending.pos}). Lock it in, or use a reset.`;
  renderFreeSpin(sp.phase === 'picking' && elig === 0 && sp.yearUsed && sp.teamUsed);
const af = $('autoFillBtn');
if (af) { af.disabled = busy || openSpots() <= 0; af.textContent = (n === 0 && !sp.pending) ? '⚡ RANDOM ROSTER' : '⚡ AUTO-FILL REST'; }
  renderList(); renderDepth(); save();
}
function renderFreeSpin(on) {
  let b = $('freeSpinBtn');
  if (on && !b) { b = el('button', { id: 'freeSpinBtn', class: 'btn btn-gold btn-sm', onclick: freeSpin }, 'FREE RE-SPIN'); $('spinBtn').after(b); }
  if (!on && b) b.remove();
}
function renderList() {
  const sp = S.spin, list = $('plist'), tabs = $('ptabs');
  list.replaceChildren(); tabs.replaceChildren();
  if (!sp.fr || sp.phase === 'ready') {
    $('pickTitle').textContent = 'ROSTER'; $('pickSub').textContent = '';
    list.append(el('p', { style: 'margin:0;color:var(--muted)', text: 'Spin the wheel to load a roster.' })); return;
  }
  const ros = draftRoster(sp.fr, sp.y);
  $('pickTitle').textContent = `${sp.y} ${sp.fr} ROSTER`;
  $('pickSub').textContent = ros.length + ' players';
  const counts = { OPEN: ros.filter(eligible).length, ALL: ros.length };
  const TABS = isF() ? FPOS : POS;
  TABS.forEach((p) => counts[p] = ros.filter((x) => x.pos === p).length);
  for (const t of ['OPEN', 'ALL', ...TABS]) {
    if (TABS.includes(t) && !counts[t]) continue;
    tabs.append(el('button', { class: 'ptab', 'aria-pressed': posFilter === t ? 'true' : 'false', onclick: () => { posFilter = t; renderList(); } },
      t === 'OPEN' ? 'OPEN SPOTS' : t, el('span', { class: 'c', text: counts[t] })));
  }
  const q = $('search').value.trim().toLowerCase();
  let rows = ros.filter((x) => posFilter === 'ALL' ? true : posFilter === 'OPEN' ? eligible(x) : x.pos === posFilter);
  if (q) rows = rows.filter((x) => x.name.toLowerCase().includes(q));
  // Random order every spin (stable while you browse this spin), never by rating or position
  const shuf = S.seed + '|order|' + S.picks.length + '|' + sp.fr + sp.y + '|' + (sp.free || 0);
  rows = rows.map((x) => [hash(shuf + '|' + x.pid), x]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const locked = (sp.phase !== 'picking' && sp.phase !== 'picked') || busy;
  for (const pl of rows) {
    const taken = S.picks.some((p) => p.pid === pl.pid), full = !posOpen(pl.pos);
    const isSel = sp.pending && sp.pending.pid === pl.pid;
    const why = taken ? 'on your roster' : full ? pl.pos + ' full' : '';
    list.append(el('button', { class: 'pbtn' + (isSel ? ' sel' : ''), disabled: (locked || taken || full) ? '' : false, 'aria-label': `${pl.name}, ${pl.pos}${why ? ', ' + why : ''}`, onclick: () => choose(pl) },
      el('span', { class: 'pos', text: pl.pos }), el('span', { class: 'nm', text: pl.name }),
      why ? el('span', { class: 'why', text: why }) : (S.showRatings ? el('span', { class: 'ov', text: pl.ovr }) : null)));
  }
  if (!rows.length) list.append(el('p', { style: 'margin:0;color:var(--muted)', text: q ? 'No matching players.' : 'No players here fit an open spot.' }));
}
function renderDepth() {
  const box = $('depth'); box.replaceChildren();
  if (isF()) {
    const fall = S.picks.slice(); if (S.spin.pending) fall.push(Object.assign({ isNew: true }, S.spin.pending));
    $('filled').textContent = fall.length + '/' + FSLOTS.length;
    const g = el('div', { class: 'dgroup' }, el('h4', {}, el('span', { text: 'STARTERS' }), el('span', { text: fall.length + '/' + FSLOTS.length })));
    const sl = el('div', { class: 'slots' });
    for (const x of fAssign(fall)) {
      sl.append(x.p ? el('div', { class: 'slot' + (x.p.isNew ? ' new' : '') }, el('span', { text: x.s + ' · ' + x.p.name + (S.showRatings ? ' · ' + x.p.ovr : '') }), el('span', { class: 'src', text: shortYr(x.p.y) + ' ' + x.p.fr })) : el('div', { class: 'slot empty', text: x.s + (x.s === 'FLEX' ? ' (RB/WR/TE)' : '') + ' · Open' }));
    }
    g.append(sl); box.append(g); return;
  }
  const all = S.picks.slice(); if (S.spin.pending) all.push(Object.assign({ isNew: true }, S.spin.pending));
  $('filled').textContent = all.length + '/' + TOTAL;
  for (const p of POS) {
    const mine = all.filter((x) => x.pos === p); if (S.showRatings) mine.sort((a, b) => b.ovr - a.ovr);
    const g = el('div', { class: 'dgroup' }, el('h4', {}, el('span', { text: p }), el('span', { text: mine.length + '/' + NEED[p] })));
    const slots = el('div', { class: 'slots' });
    for (let i = 0; i < NEED[p]; i++) {
      const x = mine[i];
      slots.append(x ? el('div', { class: 'slot' + (x.isNew ? ' new' : '') }, el('span', { text: x.name + (S.showRatings ? ' · ' + x.ovr : '') }), el('span', { class: 'src', text: shortYr(x.y) + ' ' + x.fr })) : el('div', { class: 'slot empty', text: 'Open' }));
    }
    g.append(slots); box.append(g);
  }
}
async function doSpin(tag) {
  const sp = S.spin; const res = spinResult(tag);
  busy = true; sp.phase = 'spinning'; sp.pending = null; renderDraft();
  beep(520, .08);
  const quick = $('quickSpin').checked;
  const ms = spinWheelTo(res.fr, quick);
  $('rTeam').textContent = '…';
  await Promise.all([new Promise((r) => setTimeout(r, ms)), rollYear(YEARS[res.fr], res.y, ms + (quick ? 100 : 300))]);
  $('rTeam').textContent = res.fr;
  sp.fr = res.fr; sp.y = res.y; sp.phase = 'picking'; busy = false;
  posFilter = 'OPEN'; $('search').value = ''; renderDraft();
}
function lockPending() {
  const sp = S.spin;
  if (sp.pending) { S.picks.push(sp.pending); }
  S.spin = freshSpin();
}
function onSpinBtn() {
  if (busy) return;
  const sp = S.spin;
  if (sp.phase === 'picked') {
    lockPending();
    if (S.picks.length >= total()) { finishDraft(); return; }
    doSpin('main');
  } else if (sp.phase === 'ready') {
    if (S.picks.length >= total()) { finishDraft(); return; }
    doSpin('main');
  }
}
function choose(pl) {
  const sp = S.spin;
  if (busy || (sp.phase !== 'picking' && sp.phase !== 'picked') || !eligible(pl)) return;
  // Clicking the currently selected player unselects them
  if (sp.pending && sp.pending.pid === pl.pid) {
    sp.pending = null; sp.phase = 'picking'; beep(440, .08); renderDraft();
    return;
  }
  // Otherwise select (or switch to) this player
  sp.pending = { pid: pl.pid, name: pl.name, pos: pl.pos, ovr: pl.ovr, fr: sp.fr, y: sp.y };
  sp.phase = 'picked'; beep(660, .1); renderDraft();
  $('spinBtn').focus();
}
async function resetYear() {
  const sp = S.spin;
  if (busy || sp.yearUsed || !(sp.phase === 'picking' || sp.phase === 'picked')) return;
  const years = YEARS[sp.fr].filter((y) => y !== sp.y);
  const r = rng(S.seed + '|spin|' + S.picks.length + '|year|' + sp.free);
  const ny = pick(r, years);
  sp.yearUsed = true; sp.pending = null; busy = true; sp.phase = 'spinning'; renderDraft();
  await rollYear(years, ny, $('quickSpin').checked ? 500 : 1200);
  sp.y = ny; sp.phase = 'picking'; busy = false; posFilter = 'OPEN'; $('search').value = ''; renderDraft();
}
// Team Reset: once per spin, re-spin the franchise but keep the same season
async function resetTeam() {
  const sp = S.spin;
  if (busy || sp.teamUsed || !(sp.phase === 'picking' || sp.phase === 'picked')) return;
  const r = rng(S.seed + '|spin|' + S.picks.length + '|team|' + (sp.free || 0));
  const others = FR_KEYS.filter((f) => f !== sp.fr && YEARS[f] && YEARS[f].length);
  const sameYear = others.filter((f) => YEARS[f].includes(sp.y));
  // Only fall back to a different season if no other franchise has this one
  const nf = pick(r, sameYear.length ? sameYear : others), ny = sameYear.length ? sp.y : pick(r, YEARS[nf]);
  sp.teamUsed = true; sp.pending = null; busy = true; sp.phase = 'spinning'; renderDraft();
  beep(520, .08);
  const quick = $('quickSpin').checked, ms = spinWheelTo(nf, quick);
  $('rTeam').textContent = '…';
  await Promise.all([new Promise((res) => setTimeout(res, ms)), ny !== sp.y ? rollYear(YEARS[nf], ny, ms + (quick ? 100 : 300)) : null]);
  $('rTeam').textContent = nf;
  sp.fr = nf; sp.y = ny; sp.phase = 'picking'; busy = false; posFilter = 'OPEN'; $('search').value = ''; renderDraft();
}
function freeSpin() { const sp = S.spin; sp.free++; doSpin('free' + sp.free); }
function finishDraft() {
  if (S.spin.pending) lockPending();
  S.done = true; store.del('run');
  if (isF()) runFantasy(); else runSeason();
}

// ---------- auto-draft (random team / fill open spots) ----------
// Every open slot gets a random franchise, a random season of that franchise, and a random
// player at that position from that roster. Ratings are never looked at, so you get a true
// grab bag. Once every DREAM_ODDS generations it goes the other way and hands out the best
// available player at every open slot.
const DREAM_ODDS = 1200;
const AUTO_FR = FR_KEYS.filter((f) => YEARS[f] && YEARS[f].length);
let poolCache = null;
function poolByPos() {
if (poolCache) return poolCache;
poolCache = {}; POS.forEach((p) => poolCache[p] = []);
const seen = new Set();
for (const fr of AUTO_FR) for (const y of YEARS[fr]) for (const pl of roster(fr, y)) {
if (seen.has(pl.pid)) continue; seen.add(pl.pid);
poolCache[pl.pos].push({ pid: pl.pid, name: pl.name, pos: pl.pos, ovr: pl.ovr, fr, y });
}
POS.forEach((p) => poolCache[p].sort((a, b) => b.ovr - a.ovr));
return poolCache;
}
// Fills every open slot on S. Keeps picks already made (and locks in a selected-but-unlocked pick).
// Seeded from the run, so the daily board can't be re-rolled by quitting and trying again.
function randomFill() {
if (S.spin.pending) S.picks.push(S.spin.pending);
S.spin = freshSpin();
const r = rng(S.seed + '|auto|' + S.picks.map((p) => p.pid).join('.'));
const dream = r() < 1 / DREAM_ODDS;
const taken = new Set(S.picks.map((p) => p.pid));
const slots = [];
if (isF()) fAssign(S.picks).forEach((x) => { if (!x.p) slots.push(x.s); });
else for (const p of POS) for (let i = filledCount(p); i < NEED[p]; i++) slots.push(p);
for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
let added = 0;
for (const pos of slots) {
let got = null;
if (dream) got = dreamPick(pos, taken);
for (let t = 0; !got && t < 80; t++) {
const fr = pick(r, AUTO_FR), y = pick(r, YEARS[fr]);
const opts = draftRoster(fr, y).filter((x) => slotTakes(pos, x.pos) && !taken.has(x.pid));
if (opts.length) { const x = pick(r, opts); got = { pid: x.pid, name: x.name, pos: x.pos, ovr: x.ovr, fr, y }; }
}
if (!got) { const left = (poolByPos()[pos] || []).filter((x) => !taken.has(x.pid)); if (left.length) got = pick(r, left); }
if (got) { S.picks.push(Object.assign({}, got)); taken.add(got.pid); added++; }
}
S.auto = true;
return { dream, added };
}
function afterFill(res) {
posFilter = 'OPEN'; $('search').value = '';
$('rTeam').textContent = '—'; $('rYear').textContent = '—';
renderDraft();
if (res.dream) {
beep(523, .12); setTimeout(() => beep(659, .12), 130); setTimeout(() => beep(784, .12), 260); setTimeout(() => beep(1047, .3), 390);
modal('★ DREAM TEAM ★', el('p', { text: 'The 1-in-1,200 roll hit. Every open spot just got the best player available. Go run the table.' }), [['LET\'S GO', 'btn-gold', null]]);
} else { beep(880, .12); toast(`Filled ${res.added} spot${res.added === 1 ? '' : 's'} at random`); }
}
function dreamPick(pos, taken) {
if (pos === 'DST') {
let best = null;
for (const fr of AUTO_FR) for (const y of YEARS[fr]) { const d = dstOf(fr, y); if (!taken.has(d.pid) && (!best || d.ovr > best.ovr)) best = Object.assign({ fr, y }, d); }
return best;
}
const cands = (pos === 'FLEX' ? FLEXOK : [pos]).map((p) => poolByPos()[p].find((x) => !taken.has(x.pid))).filter(Boolean);
return cands.sort((a, b) => b.ovr - a.ovr)[0] || null;
}
function openSpots() { return S ? total() - S.picks.length - (S.spin.pending ? 1 : 0) : 0; }
function autoFill() {
if (busy || !S || S.done) return;
const open = openSpots(); if (open <= 0) return;
const fresh = !S.picks.length && !S.spin.pending;
modal(fresh ? 'RANDOM TEAM?' : 'AUTO-FILL OPEN SPOTS?',
el('p', { text: fresh ? 'Fill all 52 spots with random players from random teams and seasons. No ratings involved.' : `Fill your ${open} open spot${open === 1 ? '' : 's'} with random players from random teams and seasons. Everyone you already drafted stays.` }),
[[fresh ? 'GENERATE' : 'FILL IT', 'btn-acc', () => afterFill(randomFill())], ['CANCEL', 'btn-ghost', null]]);
}
function autoDraftNew() {
const go = () => { newRun('free', pick(Math.random, AUTO_FR)); afterFill(randomFill()); };
if (store.get('run', null)) modal('START A NEW DRAFT?', el('p', { text: 'You have a draft in progress. Generating a random team will replace it.' }), [['GENERATE', 'btn-acc', go], ['CANCEL', 'btn-ghost', null]]);
else go();
}

// ---------- season ----------
let skip = false;
async function runSeason() {
  show('season'); skip = false; $('skipBtn').classList.remove('hidden'); seasonLabels(false);
  const T = teamRating(S.picks);
  const r = rng(S.seed + '|season|' + S.picks.map((p) => p.pid).join('.'));
  const sched = G.schedule[S.fr];
  $('sMode').textContent = (S.mode === 'daily' ? 'DAILY · ' + S.date + ' · ' : '') + '2026 SEASON';
  $('sTitle').textContent = fullName(S.fr).toUpperCase();
  $('sOvr').textContent = T.toFixed(1);
  const games = $('games'); games.replaceChildren(); $('pgames').replaceChildren();
  $('playoffs').classList.add('hidden'); $('banner').classList.add('hidden');
  let w = 0, l = 0; const seq = [];
const ST = statsInit(S.picks), sr = rng(S.seed + '|stats|' + S.picks.length + '|' + S.fr);
  for (const [wk, opp, home] of sched) {
    const g = playGame(r, T, opp, home); gameStats(sr, ST, g, false);
    g.W ? w++ : l++; seq.push(g.W ? 'W' : 'L');
    const card = el('div', { class: 'game ' + (g.W ? 'W' : 'L') },
      el('span', { class: 'wk', text: 'WK ' + wk }), el('span', { class: 'res', text: g.W ? 'W' : 'L' }),
      el('span', { text: (home ? 'vs ' : '@ ') + fullName(opp) }), el('span', { class: 'sc', text: g.us + '-' + g.them }));
    games.append(card);
    await reveal(card, g.W);
    $('sRec').textContent = w + '-' + l;
  }
  // playoffs
  let result = w === 17 ? 'Perfect regular season' : `${w}-${l} regular season`, ring = false, exitRound = null;
  const conf = FR[S.fr][2];
  if (w >= 10) {
    $('playoffs').classList.remove('hidden');
    const ranked = Object.keys(G.strength).filter((t) => t !== S.fr).sort((a, b) => G.strength[b] - G.strength[a]);
    const confT = ranked.filter((t) => FR[t] && FR[t][2] === conf), other = ranked.filter((t) => FR[t] && FR[t][2] !== conf);
    const rounds = [];
    if (w < 13) rounds.push(['WILD CARD', pick(r, confT.slice(3, 7)), w >= 12 ? 1 : 0, 0]);
    rounds.push(['DIVISIONAL', pick(r, confT.slice(1, 5)), w >= 11 ? 1 : 0, 1]);
    rounds.push(['CONFERENCE', pick(r, confT.slice(0, 3)), w >= 12 ? 1 : 0, 2]);
    rounds.push(['SUPER BOWL', pick(r, other.slice(0, 4)), 2, 3]);
    if (w >= 13) {
      const bye = el('div', { class: 'game W' }, el('span', { class: 'wk', text: 'WC' }), el('span', { class: 'res', text: '—' }), el('span', { text: 'First-round bye' }));
      $('pgames').append(bye); await reveal(bye, true);
    }
    ring = true;
    for (const [name, opp, home, bump] of rounds) {
      const g = playGame(r, T, opp, home === 2 ? -1 : home, bump); gameStats(sr, ST, g, true);
      const card = el('div', { class: 'game ' + (g.W ? 'W' : 'L') },
        el('span', { class: 'wk', text: name.split(' ')[0].slice(0, 4) }), el('span', { class: 'res', text: g.W ? 'W' : 'L' }),
        el('span', { text: (home === 2 ? 'vs ' : home ? 'vs ' : '@ ') + fullName(opp) }), el('span', { class: 'sc', text: g.us + '-' + g.them }));
      $('pgames').append(card); await reveal(card, g.W);
      if (!g.W) { ring = false; exitRound = name; break; }
    }
  } else exitRound = 'missed';
  if (ring) result = w === 17 ? 'Perfect season and Super Bowl champions' : 'Super Bowl champions';
  else if (exitRound === 'missed') result = `${w}-${l}, missed the playoffs`;
  else result = `${w}-${l}, lost in the ${exitRound.toLowerCase().replace('wild card', 'wild card round').replace('conference', 'conference championship').replace('divisional', 'divisional round').replace('super bowl', 'Super Bowl')}`;
  // banner
  $('bTitle').textContent = w === 17 && ring ? 'YOU RAN THE TABLE!' : w === 17 ? '17-0 · PERFECT SEASON!' : ring ? 'SUPER BOWL CHAMPS!' : w >= 13 ? 'SO CLOSE.' : w >= 10 ? 'PLAYOFF TEAM' : 'BACK TO THE DRAFT BOARD';
  $('bSub').textContent = result + ' · Team OVR ' + T.toFixed(1);
  $('banner').classList.remove('hidden'); syncPostBtn();
  $('skipBtn').classList.add('hidden');
  // records
  const rec = { fr: S.fr, w, l, ovr: T, result, seq: seq.join(''), date: S.date, mode: S.mode, ring };
  S.stats = statsPack(ST); store.set('last', Object.assign({ stats: S.stats, ts: Date.now() }, rec));
  const h = store.get('history', []); h.push(rec); store.set('history', h.slice(-200));
  if (w === 17) { const p = store.get('perfect', {}); p[S.fr] = S.date; store.set('perfect', p); }
  if (ring) { const p = store.get('rings', {}); p[S.fr] = S.date; store.set('rings', p); }
  let note = '';
  if (S.mode === 'daily') {
    const d = store.get('daily', {}); d[S.date] = rec; store.set('daily', d);
    note = await submitScore(rec);
  }
  $('bNote').textContent = note;
  S.result = rec;
}
function reveal(card, win) {
  return new Promise((res) => {
    const go = () => { card.classList.add('show'); beep(win ? 760 : 180, .08); res(); };
    if (skip) { card.classList.add('show'); res(); } else setTimeout(go, 260);
  });
}
function shareText() {
  if (S && S.mode === 'fantasy') return fShareText();
  const r = S.result; if (!r) return '';
  return `RUN THE TABLE · 52-man roster\n${r.mode === 'daily' ? 'Daily ' + r.date : 'Free play'} · ${fullName(r.fr)}\n${r.result}\n${r.seq}\nTeam OVR ${r.ovr.toFixed(1)}`;
}
function viewRoster() {
  if (isF()) return viewLineup();
  const box = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  for (const p of POS) {
    const mine = S.picks.filter((x) => x.pos === p).sort((a, b) => b.ovr - a.ovr);
    box.append(el('div', {}, el('b', { text: p + ': ' }), mine.map((x) => `${x.name} (${shortYr(x.y)} ${x.fr}, ${x.ovr})`).join(', ')));
  }
  modal('YOUR 52-MAN ROSTER', box, [['CLOSE', 'btn-gold', null]]);
}

// ---------- player stats ----------
(function () {
const st = document.createElement('style');
st.textContent = `
.rtt-wide{max-width:920px!important;max-height:90vh;overflow-y:auto}
.st-sub{margin:0 0 12px;color:var(--soft);font-size:13px}
.st-seg,.st-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.st-tab{font-family:'Press Start 2P',monospace;font-size:9px;line-height:1.4;padding:9px 10px;background:transparent;color:#fff;border:2px solid var(--line2);box-shadow:none}
.st-tab[aria-pressed=true]{background:var(--gold);color:var(--ink);border-color:var(--gold)}
.st-seg .st-tab[aria-pressed=true]{background:var(--green);border-color:var(--green)}
.st-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:2px solid var(--line)}
.st-tbl{width:100%;border-collapse:collapse;font-size:13px;white-space:nowrap}
.st-tbl th{font-family:'Press Start 2P',monospace;font-weight:400;font-size:8px;color:var(--muted);text-align:right;padding:9px 7px;border-bottom:2px solid var(--line);background:var(--panel)}
.st-tbl td{text-align:right;padding:7px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.st-tbl th:first-child,.st-tbl td:first-child{text-align:left;position:sticky;left:0;background:var(--panel);z-index:1}
.st-tbl .src{color:var(--muted);font-size:11px;margin-left:6px}
.st-tbl .ps{display:inline-block;min-width:24px;color:var(--acc);font-size:11px;font-weight:700;margin-right:6px}
.st-tbl tr:first-child td{color:var(--gold)}
.st-sum{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px}
.st-card{border:2px solid var(--line);padding:10px;background:var(--panel2)}
.st-card .k{font-family:'Press Start 2P',monospace;font-size:8px;color:var(--muted);line-height:1.5}
.st-card .v{font-size:20px;font-weight:800;color:var(--gold);margin-top:6px}
.st-card .n{font-size:12px;color:var(--soft);margin-top:4px}
.st-empty{margin:0;color:var(--muted)}
.st-note{color:var(--muted);font-size:12px;margin:10px 0 0}
#lastStatsBtn{margin-top:12px}
`;
document.head.append(st);
})();
function poisson(r, lam) { if (lam <= 0) return 0; const L = Math.exp(-lam); let k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 50); return k - 1; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function binom(r, n, p) { let k = 0; for (let i = 0; i < n; i++) if (r() < p) k++; return k; }
// Hand out `total` units across `arr` in proportion to weight (with randomness)
function deal(r, total, arr, wf) {
const out = arr.map(() => 0); if (!arr.length || total <= 0) return out;
const ws = arr.map((x, i) => Math.max(0, wf(x, i))); const tot = ws.reduce((a, b) => a + b, 0); if (!tot) return out;
for (let n = 0; n < total; n++) { let u = r() * tot; for (let i = 0; i < ws.length; i++) { u -= ws[i]; if (u <= 0 || i === ws.length - 1) { out[i]++; break; } } }
return out;
}
const q = (o, e) => Math.pow(Math.max(o, 30) / 75, e || 2);
function statsInit(picks) {
const by = {}; POS.forEach((p) => by[p] = []);
const list = picks.map((p) => ({ pid: p.pid, name: p.name, pos: p.pos, fr: p.fr, y: p.y, ovr: p.ovr, gp: 0, gs: 0, pgp: 0, pgs: 0, s: {}, ps: {} }));
list.forEach((p) => by[p.pos].push(p));
POS.forEach((p) => by[p].sort((a, b) => b.ovr - a.ovr));
return { by, list };
}
function scoring(r, pts) {
let best = null; const tdTarget = pts / 7 * (0.84 + 0.18 * r());
for (let td = Math.floor(pts / 6); td >= 0; td--) for (let fg = 0; fg <= 7; fg++) for (let miss = 0; miss <= Math.min(td, 1); miss++) for (let two = 0; two <= Math.min(td - miss, 1); two++) for (let saf = 0; saf <= 1; saf++) {
if (6 * td + (td - miss - two) + 2 * two + 3 * fg + 2 * saf !== pts) continue;
const cost = Math.abs(td - tdTarget) + miss * 1.6 + two * 0.9 + saf * 3 + Math.max(0, fg - 2) * 0.2;
if (!best || cost < best.cost) best = { td, fg, xp: td - miss - two, xpa: td - two, saf, cost };
}
return best || { td: 0, fg: 0, xp: 0, xpa: 0, saf: 0 };
}
function gameStats(r, ST, g, post) {
const B = ST.by, K = post ? 'ps' : 's', pts = g.us, win = g.W, margin = g.us - g.them;
const played = new Set();
const add = (p, k, v) => { if (!p || !v) return; p[K][k] = (p[K][k] || 0) + v; played.add(p); };
const avg = (a, n) => { const s = a.slice(0, n); return s.length ? s.reduce((t, x) => t + x.ovr, 0) / s.length : 40; };
const starters = (pos) => B[pos].slice(0, START[pos][0]);
for (const pos of POS) starters(pos).forEach((p) => { p[post ? 'pgs' : 'gs']++; played.add(p); });
const qbO = B.QB[0] ? B.QB[0].ovr : 40, ol = avg(B.OL, 5), dl = avg(B.DL, 4), lb = avg(B.LB, 3), db = avg(B.DB, 4);
const rec = avg(B.WR, 3) * 0.75 + avg(B.TE, 1) * 0.25, rb1 = B.RB[0] ? B.RB[0].ovr : 40;
const sc = scoring(r, pts);
// --- defense (first, so a pick-six can come out of the TD count)
const D = [...B.DL.map((p, i) => [p, i < 4 ? 1 : 0.3]), ...B.LB.map((p, i) => [p, i < 3 ? 1 : 0.3]), ...B.DB.map((p, i) => [p, i < 4 ? 1 : 0.3])];
const role = (x) => x[0].pos;
const tkl = Math.round(clamp(60 + 6 * gauss(r) + (win ? -3 : 3), 40, 85));
deal(r, tkl, D, (x) => x[1] * q(x[0].ovr, 1) * (role(x) === 'LB' ? 2.6 : role(x) === 'DB' ? 1.7 : 1)).forEach((n, i) => add(D[i][0], 'tkl', n));
const sk = poisson(r, clamp(2.4 + (dl - 75) * 0.06 + (lb - 75) * 0.02, 0.4, 6));
deal(r, sk, D, (x) => x[1] * q(x[0].ovr, 3) * (role(x) === 'DL' ? 1 : role(x) === 'LB' ? 0.4 : 0.08)).forEach((n, i) => add(D[i][0], 'sck', n));
const ints = poisson(r, clamp(0.7 + (db - 75) * 0.02 + (win ? 0.2 : -0.1), 0.2, 1.8));
const intBy = deal(r, ints, D, (x) => x[1] * q(x[0].ovr, 2) * (role(x) === 'DB' ? 1 : role(x) === 'LB' ? 0.3 : 0.03));
intBy.forEach((n, i) => add(D[i][0], 'int', n));
deal(r, poisson(r, 5), D, (x) => x[1] * q(x[0].ovr, 2) * (role(x) === 'DB' ? 1 : role(x) === 'LB' ? 0.35 : 0.1)).forEach((n, i) => add(D[i][0], 'pd', n + intBy[i]));
deal(r, poisson(r, 0.9), D, (x) => x[1] * q(x[0].ovr, 2) * (role(x) === 'DB' ? 0.7 : 1)).forEach((n, i) => add(D[i][0], 'ff', n));
let dtd = 0;
if (sc.td > 0 && ints > 0 && r() < 0.12) { const i = intBy.findIndex((n) => n > 0); add(D[i][0], 'dtd', 1); dtd = 1; }
// --- offense
const otd = sc.td - dtd;
const passTD = binom(r, otd, clamp(0.58 + (qbO - 75) * 0.008, 0.4, 0.75)), rushTD = otd - passTD;
const att = Math.round(clamp(33 + 4.5 * gauss(r) + (win ? -2 : 3), 18, 54));
const cmp = Math.round(att * clamp(0.61 + (qbO - 75) * 0.004 + (rec - 75) * 0.002 + 0.05 * gauss(r), 0.4, 0.84));
const pYds = Math.max(0, Math.round(cmp * clamp(10.6 + (qbO - 75) * 0.05 + (rec - 75) * 0.05 + (pts - 21) * 0.06 + 1.5 * gauss(r), 5.5, 17)));
const pInt = poisson(r, clamp(0.95 - (qbO - 75) * 0.025 + (win ? -0.25 : 0.35), 0.15, 2.8));
const sacked = poisson(r, clamp(2.3 - (ol - 75) * 0.05, 0.5, 5.5));
const QBs = B.QB.slice(0, 2);
const relief = QBs[1] && Math.abs(margin) >= 24 && r() < 0.6 ? 0.22 : 0;
const qbShare = [1 - relief, relief];
QBs.forEach((p, i) => {
const sh = qbShare[i]; if (!sh) return;
add(p, 'att', i === 0 ? att - Math.round(att * relief) : Math.round(att * relief));
add(p, 'cmp', i === 0 ? cmp - Math.round(cmp * relief) : Math.round(cmp * relief));
add(p, 'pyd', i === 0 ? pYds - Math.round(pYds * relief) : Math.round(pYds * relief));
add(p, 'sk', i === 0 ? sacked - Math.round(sacked * relief) : Math.round(sacked * relief));
});
const tdQ2 = relief ? binom(r, passTD, relief) : 0, intQ2 = relief ? binom(r, pInt, relief) : 0;
add(QBs[0], 'ptd', passTD - tdQ2); add(QBs[1], 'ptd', tdQ2);
add(QBs[0], 'int', pInt - intQ2); add(QBs[1], 'int', intQ2);
// rushing
const car = Math.round(clamp(26 + 4 * gauss(r) + (win ? 4 : -3), 12, 46));
const ypc = clamp(4.2 + (rb1 - 75) * 0.025 + (ol - 75) * 0.03 + 0.6 * gauss(r), 2, 7.5);
const R = [[B.RB[0], 0.62], [B.RB[1], 0.22], [B.RB[2], 0.05], [B.QB[0], 0.07 * q(qbO, 1)], [B.WR[0], 0.03]].filter((x) => x[0]);
const carBy = deal(r, car, R, (x) => x[1]);
carBy.forEach((n, i) => { if (!n) return; add(R[i][0], 'car', n); add(R[i][0], 'ryd', Math.round(n * ypc * (R[i][0].pos === 'QB' ? 1.1 : 1) * (0.7 + 0.6 * r()))); });
deal(r, rushTD, R, (x, i) => carBy[i] * (x[0].pos === 'RB' ? 1 : 0.6)).forEach((n, i) => add(R[i][0], 'rtd', n));
// receiving
const T = [];
B.WR.forEach((p, i) => T.push([p, [0.24, 0.18, 0.12, 0.03, 0.015, 0.01][i] || 0, 13]));
B.TE.forEach((p, i) => T.push([p, [0.16, 0.04, 0.01][i] || 0, 10.5]));
B.RB.forEach((p, i) => T.push([p, [0.11, 0.05, 0.02, 0.01][i] || 0, 7.8]));
const recBy = deal(r, cmp, T, (x) => x[1] * q(x[0].ovr, 2));
const raw = recBy.map((n, i) => n * T[i][2] * q(T[i][0].ovr, 0.5) * (0.6 + 0.8 * r()));
const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
const yds = raw.map((x) => Math.round(x * pYds / rawSum));
const diff = pYds - yds.reduce((a, b) => a + b, 0);
if (diff && cmp) { const top = yds.indexOf(Math.max(...yds)); yds[top] += diff; }
recBy.forEach((n, i) => { if (n) { add(T[i][0], 'rec', n); add(T[i][0], 'yds', yds[i]); } });
deal(r, passTD, T, (x, i) => recBy[i] * (x[0].pos === 'TE' ? 1.25 : x[0].pos === 'RB' ? 0.6 : 1)).forEach((n, i) => add(T[i][0], 'rctd', n));
// offensive line: sacks allowed go to the starting five
const O = B.OL.slice(0, 5);
deal(r, sacked, O, (p) => Math.max(5, 100 - p.ovr)).forEach((n, i) => add(O[i], 'ska', n));
// kicking
const k = B.K[0];
if (k) {
const fga = sc.fg + poisson(r, clamp(0.35 - (k.ovr - 75) * 0.02, 0.05, 1));
add(k, 'fgm', sc.fg); add(k, 'fga', fga); add(k, 'xpm', sc.xp); add(k, 'xpa', sc.xpa);
for (let i = 0; i < sc.fg; i++) { const d = Math.round(clamp(22 + 32 * r() * r() + 16 * r() + (k.ovr - 75) * 0.25, 19, 63)); if (d > (k[K].lng || 0)) k[K].lng = d; }
}
const pn = B.P[0];
if (pn) {
const punts = poisson(r, clamp(4.8 - pts / 11, 0.8, 8));
if (punts) {
const a = 44.5 + (pn.ovr - 75) * 0.12 + 2.2 * gauss(r);
add(pn, 'punt', punts); add(pn, 'puy', Math.round(punts * a));
const l = Math.round(a + 5 + 9 * r()); if (l > (pn[K].plng || 0)) pn[K].plng = l;
}
}
played.forEach((p) => p[post ? 'pgp' : 'gp']++);
}
function statsPack(ST) { return ST.list.map((p) => ({ n: p.name, pos: p.pos, fr: p.fr, y: p.y, o: p.ovr, gp: p.gp, gs: p.gs, pgp: p.pgp, pgs: p.pgs, s: p.s, ps: p.ps })); }
function passerRating(c, a, y, t, i) {
if (!a) return 0;
const f = (x) => clamp(x, 0, 2.375);
return (f((c / a - 0.3) * 5) + f((y / a - 3) * 0.25) + f(t / a * 20) + f(2.375 - i / a * 25)) / 6 * 100;
}
function viewStats(pack, rec) {
const hasPost = pack.some((p) => p.pgp);
let seg = 'reg', tab = 'LEADERS';
const box = el('div', {});
const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const who = (p, showPos) => el('td', {}, showPos ? el('span', { class: 'ps', text: p.pos }) : null, document.createTextNode(p.n), el('span', { class: 'src', text: shortYr(p.y) + ' ' + p.fr }));
function table(cols, rows) {
if (!rows.length) return el('p', { class: 'st-empty', text: 'No stats recorded.' });
const tb = el('tbody');
rows.forEach((cells) => tb.append(el('tr', {}, ...cells.map((c) => c instanceof Node ? c : el('td', { text: c })))));
return el('div', { class: 'st-wrap' }, el('table', { class: 'st-tbl' }, el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { text: c })))), tb));
}
function render() {
const S2 = (p) => (seg === 'reg' ? p.s : p.ps) || {};
const G2 = (p) => seg === 'reg' ? p.gp : p.pgp, GS = (p) => seg === 'reg' ? p.gs : p.pgs;
const v = (p, k) => S2(p)[k] || 0;
const kids = [];
if (rec) kids.push(el('p', { class: 'st-sub', text: `${fullName(rec.fr)} · ${rec.w}-${rec.l} · ${rec.result}` }));
if (hasPost) kids.push(el('div', { class: 'st-seg' }, ...[['reg', 'REGULAR SEASON'], ['post', 'PLAYOFFS']].map(([id, lbl]) => el('button', { class: 'st-tab', 'aria-pressed': String(seg === id), onclick: () => { seg = id; render(); } }, lbl))));
kids.push(el('div', { class: 'st-tabs' }, ...['LEADERS', 'PASSING', 'RUSHING', 'RECEIVING', 'DEFENSE', 'KICKING', 'O-LINE'].map((t) => el('button', { class: 'st-tab', 'aria-pressed': String(tab === t), onclick: () => { tab = t; render(); } }, t))));
const by = (k, f) => pack.filter((p) => (f ? f(p) : v(p, k)) > 0).sort((a, b) => (f ? f(b) - f(a) : v(b, k) - v(a, k)));
if (tab === 'LEADERS') {
const tot = (p) => v(p, 'rtd') + v(p, 'rctd') + v(p, 'dtd');
const scrim = (p) => v(p, 'ryd') + v(p, 'yds');
const cards = [
['PASSING YARDS', 'pyd', null, (p) => `${v(p, 'cmp')}/${v(p, 'att')} · ${v(p, 'ptd')} TD · ${v(p, 'int')} INT`],
['RUSHING YARDS', 'ryd', null, (p) => `${v(p, 'car')} car · ${fmt1(v(p, 'ryd') / Math.max(1, v(p, 'car')))} avg · ${v(p, 'rtd')} TD`],
['RECEIVING YARDS', 'yds', null, (p) => `${v(p, 'rec')} rec · ${v(p, 'rctd')} TD`],
['SCRIMMAGE YARDS', null, scrim, (p) => `${v(p, 'ryd')} rush · ${v(p, 'yds')} rec`],
['TOUCHDOWNS', null, tot, (p) => `${v(p, 'rtd')} rush · ${v(p, 'rctd')} rec${v(p, 'dtd') ? ' · ' + v(p, 'dtd') + ' def' : ''}`],
['TACKLES', 'tkl', null, (p) => `${v(p, 'sck')} sacks · ${v(p, 'int')} INT`],
['SACKS', 'sck', null, (p) => `${v(p, 'tkl')} tackles · ${v(p, 'ff')} FF`],
['INTERCEPTIONS', 'int', (p) => p.pos === 'QB' ? 0 : v(p, 'int'), (p) => `${v(p, 'pd')} passes defended`],
['POINTS (K)', null, (p) => p.pos === 'K' ? v(p, 'fgm') * 3 + v(p, 'xpm') : 0, (p) => `${v(p, 'fgm')}/${v(p, 'fga')} FG · long ${S2(p).lng || 0}`]
];
const grid = el('div', { class: 'st-sum' });
for (const [lbl, key, f, sub] of cards) {
const top = by(key, f)[0];
grid.append(el('div', { class: 'st-card' }, el('div', { class: 'k', text: lbl }),
el('div', { class: 'v', text: top ? String(f ? f(top) : v(top, key)) : '—' }),
el('div', { class: 'n', text: top ? `${top.n} (${top.pos}, ${shortYr(top.y)} ${top.fr})` : 'Nobody yet' }),
top ? el('div', { class: 'n', style: 'color:var(--muted)', text: sub(top) }) : null));
}
kids.push(grid);
} else if (tab === 'PASSING') {
kids.push(table(['PLAYER', 'GP', 'CMP', 'ATT', 'PCT', 'YDS', 'Y/A', 'TD', 'INT', 'SK', 'RTG'], by('att').map((p) => [who(p), G2(p), v(p, 'cmp'), v(p, 'att'), fmt1(v(p, 'cmp') / v(p, 'att') * 100), v(p, 'pyd'), fmt1(v(p, 'pyd') / v(p, 'att')), v(p, 'ptd'), v(p, 'int'), v(p, 'sk'), fmt1(passerRating(v(p, 'cmp'), v(p, 'att'), v(p, 'pyd'), v(p, 'ptd'), v(p, 'int')))])));
} else if (tab === 'RUSHING') {
kids.push(table(['PLAYER', 'GP', 'CAR', 'YDS', 'AVG', 'Y/G', 'TD'], by('ryd', (p) => v(p, 'car') ? v(p, 'ryd') + 10000 : 0).map((p) => [who(p, true), G2(p), v(p, 'car'), v(p, 'ryd'), fmt1(v(p, 'ryd') / v(p, 'car')), fmt1(v(p, 'ryd') / Math.max(1, G2(p))), v(p, 'rtd')])));
} else if (tab === 'RECEIVING') {
kids.push(table(['PLAYER', 'GP', 'REC', 'YDS', 'AVG', 'Y/G', 'TD'], by('yds', (p) => v(p, 'rec') ? v(p, 'yds') + 10000 : 0).map((p) => [who(p, true), G2(p), v(p, 'rec'), v(p, 'yds'), fmt1(v(p, 'yds') / v(p, 'rec')), fmt1(v(p, 'yds') / Math.max(1, G2(p))), v(p, 'rctd')])));
} else if (tab === 'DEFENSE') {
const d = pack.filter((p) => ['DL', 'LB', 'DB'].includes(p.pos) && G2(p)).sort((a, b) => v(b, 'tkl') - v(a, 'tkl') || v(b, 'sck') - v(a, 'sck'));
kids.push(table(['PLAYER', 'GP', 'GS', 'TKL', 'SCK', 'INT', 'PD', 'FF', 'TD'], d.map((p) => [who(p, true), G2(p), GS(p), v(p, 'tkl'), v(p, 'sck'), v(p, 'int'), v(p, 'pd'), v(p, 'ff'), v(p, 'dtd')])));
} else if (tab === 'KICKING') {
const ks = pack.filter((p) => p.pos === 'K' && G2(p)), ps = pack.filter((p) => p.pos === 'P' && G2(p));
kids.push(table(['KICKER', 'GP', 'FGM', 'FGA', 'PCT', 'LNG', 'XPM', 'XPA', 'PTS'], ks.map((p) => [who(p), G2(p), v(p, 'fgm'), v(p, 'fga'), v(p, 'fga') ? fmt1(v(p, 'fgm') / v(p, 'fga') * 100) : '—', S2(p).lng || '—', v(p, 'xpm'), v(p, 'xpa'), v(p, 'fgm') * 3 + v(p, 'xpm')])));
kids.push(el('div', { style: 'height:12px' }));
kids.push(table(['PUNTER', 'GP', 'PUNTS', 'YDS', 'AVG', 'LNG'], ps.map((p) => [who(p), G2(p), v(p, 'punt'), v(p, 'puy'), v(p, 'punt') ? fmt1(v(p, 'puy') / v(p, 'punt')) : '—', S2(p).plng || '—'])));
} else if (tab === 'O-LINE') {
const o = pack.filter((p) => p.pos === 'OL').sort((a, b) => GS(b) - GS(a) || b.o - a.o);
kids.push(table(['PLAYER', 'GP', 'GS', 'SACKS ALLOWED'], o.map((p) => [who(p), G2(p), GS(p), GS(p) ? v(p, 'ska') : '—'])));
}
const benched = pack.filter((p) => !G2(p)).length;
if (benched && tab !== 'LEADERS') kids.push(el('p', { class: 'st-note', text: `${benched} of your 52 didn't log a stat ${seg === 'reg' ? 'this season' : 'in the playoffs'}. Starters are your highest-rated players at each spot.` }));
box.replaceChildren(...kids);
}
render();
modal('SEASON STATS', box, [['CLOSE', 'btn-gold', null]], true);
}


// ---------- fantasy season (PPR, head-to-head) ----------
// Weekly PPR points per position: [base, points per OVR above 75, spread, floor]
const FMEAN = { QB: [17, 0.3, 7, -2], RB: [12, 0.3, 7, 0], WR: [11.5, 0.3, 7, 0], TE: [8, 0.25, 5.5, 0], K: [8, 0.08, 3.5, 0], DST: [7, 0.18, 5, -4] };
const FCPU = ['Gridiron Ghosts', 'Sunday Scaries', 'Waiver Wire Warriors', 'Fourth & Long', 'Blitz Brigade', 'Hail Mary Heroes', 'Red Zone Raiders', 'Pylon Pirates', 'Two-Point Tyrants', 'Bye Week Bandits', 'Fumble Fanatics'];
const r1 = (x) => Math.round(x * 10) / 10;
function fPts(r, pos, ovr) { const [m, k, sd, lo] = FMEAN[pos]; return r1(Math.max(lo, m + k * (ovr - 75) + sd * gauss(r))); }
function cpuScore(r, ovr) { return r1(FSLOTS.reduce((t, s) => t + fPts(r, s === 'FLEX' ? 'WR' : s, ovr + 4 * gauss(r)), 0)); }
function seasonLabels(f) {
  const lbl = $('sOvr').previousElementSibling; if (lbl) lbl.textContent = f ? 'LINEUP OVR ' : 'TEAM OVR ';
  $('rosterBtn').textContent = f ? 'VIEW LINEUP' : 'VIEW ROSTER';
  const pl = $('playoffs').firstElementChild; if (pl) pl.textContent = f ? 'FANTASY PLAYOFFS' : 'PLAYOFFS';
}
function startFantasy() {
  const go = () => newRun('fantasy');
  if (store.get('run', null)) modal('START A FANTASY DRAFT?', el('p', { text: 'You have a draft in progress. Starting a fantasy draft will replace it.' }), [['START', 'btn-acc', go], ['CANCEL', 'btn-ghost', null]]);
  else go();
}
async function runFantasy() {
  show('season'); skip = false; $('skipBtn').classList.remove('hidden'); seasonLabels(true);
  const lineup = fAssign(S.picks).map((x) => x.p);
  const ovr = lineup.reduce((t, p) => t + p.ovr, 0) / lineup.length;
  const r = rng(S.seed + '|fantasy|' + S.picks.map((p) => p.pid).join('.'));
  $('sMode').textContent = '2026 FANTASY SEASON · PPR';
  $('sTitle').textContent = 'FANTASY LEAGUE';
  $('sOvr').textContent = ovr.toFixed(1); $('sRec').textContent = '0-0';
  $('games').replaceChildren(); $('pgames').replaceChildren();
  $('playoffs').classList.add('hidden'); $('banner').classList.add('hidden');
  const rivals = FCPU.map((name) => ({ name, ovr: 72 + 10 * r() }));
  const order = [];
  while (order.length < 17) { const sh = rivals.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [sh[i], sh[j]] = [sh[j], sh[i]]; } order.push(...sh); }
  order.length = 17;
  const FS = lineup.map((p, i) => ({ slot: FSLOTS[i], n: p.name, pos: p.pos, fr: p.fr, y: p.y, o: p.ovr, wk: [], po: [] }));
  const game = (oppOvr, post) => {
    const pts = lineup.map((p) => fPts(r, p.pos, p.ovr));
    pts.forEach((v, i) => FS[i][post ? 'po' : 'wk'].push(v));
    const us = r1(pts.reduce((a, b) => a + b, 0));
    let them = cpuScore(r, oppOvr); if (them === us) them = r1(them - 0.1);
    return { us, them, W: us > them };
  };
  const card = (wk, txt, g) => el('div', { class: 'game ' + (g.W ? 'W' : 'L') }, el('span', { class: 'wk', text: wk }), el('span', { class: 'res', text: g.W ? 'W' : 'L' }), el('span', { text: txt }), el('span', { class: 'sc', text: g.us.toFixed(1) + '-' + g.them.toFixed(1) }));
  let w = 0, l = 0, pf = 0; const seq = [];
  for (let i = 0; i < 17; i++) {
    const opp = order[i], g = game(opp.ovr, false);
    g.W ? w++ : l++; seq.push(g.W ? 'W' : 'L'); pf += g.us;
    const c = card('WK ' + (i + 1), 'vs ' + opp.name, g);
    $('games').append(c); await reveal(c, g.W);
    $('sRec').textContent = w + '-' + l;
  }
  // playoffs: 6 of 12 teams get in, top 2 get a bye
  let ring = false, exitRound = null;
  if (w >= 10) {
    $('playoffs').classList.remove('hidden');
    const top = rivals.slice().sort((a, b) => b.ovr - a.ovr);
    const rounds = [];
    if (w < 12) rounds.push(['QUARTERFINAL', 'QF', 80 + 4 * r(), top.slice(2, 6)]);
    rounds.push(['SEMIFINAL', 'SEMI', 82 + 4 * r(), top.slice(1, 4)]);
    rounds.push(['CHAMPIONSHIP', 'FINAL', 84 + 4 * r(), top.slice(0, 2)]);
    if (w >= 12) {
      const bye = el('div', { class: 'game W' }, el('span', { class: 'wk', text: 'QF' }), el('span', { class: 'res', text: '—' }), el('span', { text: 'First-round bye' }));
      $('pgames').append(bye); await reveal(bye, true);
    }
    ring = true;
    for (const [name, short, o, pool] of rounds) {
      const opp = pick(r, pool), g = game(Math.max(o, opp.ovr), true);
      const c = card(short, 'vs ' + opp.name, g);
      $('pgames').append(c); await reveal(c, g.W);
      if (!g.W) { ring = false; exitRound = name; break; }
    }
  } else exitRound = 'missed';
  const result = ring ? (w === 17 ? 'Perfect season and fantasy champions' : 'Fantasy league champions')
    : exitRound === 'missed' ? `${w}-${l}, missed the fantasy playoffs` : `${w}-${l}, lost in the ${exitRound.toLowerCase()}`;
  pf = r1(pf);
  $('bTitle').textContent = w === 17 && ring ? 'YOU RAN THE TABLE!' : w === 17 ? '17-0 · PERFECT SEASON!' : ring ? 'LEAGUE CHAMPS!' : w >= 12 ? 'SO CLOSE.' : w >= 10 ? 'PLAYOFF TEAM' : 'BACK TO THE WAIVER WIRE';
  $('bSub').textContent = result + ' · ' + pf.toFixed(1) + ' points';
  const tops = FS.map((p) => [p, p.wk.reduce((a, b) => a + b, 0)]).sort((a, b) => b[1] - a[1])[0];
  $('bNote').textContent = `MVP: ${tops[0].n} (${tops[0].slot}) with ${r1(tops[1]).toFixed(1)} points. ${(pf / 17).toFixed(1)} points per week.`;
  $('banner').classList.remove('hidden'); syncPostBtn();
  $('skipBtn').classList.add('hidden');
  const rec = { mode: 'fantasy', w, l, ovr, result, seq: seq.join(''), date: S.date, ring, pf };
  S.fstats = FS; S.result = rec;
  const h = store.get('fhistory', []); h.push(rec); store.set('fhistory', h.slice(-200));
}
function fShareText() {
  const r = S.result; if (!r) return '';
  return `RUN THE TABLE · Fantasy draft (PPR)\n${r.result}\n${r.seq}\n${r.pf.toFixed(1)} points · Lineup OVR ${r.ovr.toFixed(1)}`;
}
function viewLineup() {
  const box = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  for (const x of fAssign(S.picks)) if (x.p) box.append(el('div', {}, el('b', { text: x.s + ': ' }), `${x.p.name} (${shortYr(x.p.y)} ${x.p.fr}, ${x.p.ovr})`));
  modal('YOUR FANTASY LINEUP', box, [['CLOSE', 'btn-gold', null]]);
}
function viewFStats() {
  const FS = S.fstats, hasPost = FS.some((p) => p.po.length);
  const sum = (a) => a.reduce((t, x) => t + x, 0), f1 = (x) => r1(x).toFixed(1);
  const cols = ['PLAYER', 'PTS', 'AVG', 'BEST', 'LOW'].concat(hasPost ? ['PLAYOFFS'] : []);
  const tb = el('tbody');
  for (const p of FS) {
    tb.append(el('tr', {}, el('td', {}, el('span', { class: 'ps', text: p.slot }), document.createTextNode(p.n), el('span', { class: 'src', text: shortYr(p.y) + ' ' + p.fr })),
      ...[f1(sum(p.wk)), f1(sum(p.wk) / p.wk.length), f1(Math.max(...p.wk)), f1(Math.min(...p.wk))].concat(hasPost ? [f1(sum(p.po))] : []).map((t) => el('td', { text: t }))));
  }
  const tot = FS.reduce((t, p) => t + sum(p.wk), 0);
  tb.append(el('tr', {}, el('td', { text: 'TEAM' }), el('td', { text: f1(tot) }), el('td', { text: f1(tot / 17) }), el('td', { text: '' }), el('td', { text: '' }), ...(hasPost ? [el('td', { text: f1(FS.reduce((t, p) => t + sum(p.po), 0)) })] : [])));
  const r = S.result;
  const body = el('div', {},
    r ? el('p', { class: 'st-sub', text: `${r.result.startsWith(r.w + '-') ? '' : r.w + '-' + r.l + ' · '}${r.result} · PPR scoring` }) : null,
    el('div', { class: 'st-wrap' }, el('table', { class: 'st-tbl' }, el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { text: c })))), tb)));
  modal('FANTASY POINTS', body, [['CLOSE', 'btn-gold', null]], true);
}
function renderFRecords() {
  const fh = store.get('fhistory', []); if (!fh.length) return;
  const box = $('myRecords');
  if (!store.get('history', []).length) box.replaceChildren();
  const best = fh.reduce((b, x) => (!b || x.w > b.w || (x.w === b.w && x.pf > b.pf)) ? x : b, null);
  const titles = fh.filter((x) => x.ring).length;
  box.append(el('div', { text: `Fantasy: ${fh.length} season${fh.length === 1 ? '' : 's'} · ${titles} league title${titles === 1 ? '' : 's'} · Best ${best.w}-${best.l} with ${best.pf.toFixed(1)} points` }));
}

// ---------- global leaderboard ----------
let lbWidget = null;
function initShared() { loadLeaderboard(); }
function loadLeaderboard() {
  $('lbDate').textContent = '';
  if (!window.RTTLB) return;
  if (!lbWidget) lbWidget = RTTLB.mount($('lbBody'), 'table'); else lbWidget.refresh();
}
async function submitScore() { return ''; }
const runKey = () => (S.mode === 'fantasy' ? 'fantasy|' : 'table|') + S.seed;
function syncPostBtn() {
  const b = $('postBtn'); if (!b) return;
  const done = window.RTTLB && RTTLB.isPosted(runKey());
  b.disabled = !!done || !window.RTTLB; b.textContent = done ? 'POSTED ✓' : 'POST TO LEADERBOARD';
}
function postRun() {
  if (!S || !S.result || !window.RTTLB) return;
  const r = S.result, f = S.mode === 'fantasy';
  const entry = f ? { w: r.w, l: r.l, ring: r.ring ? 1 : 0, pf: r.pf, ovr: r.ovr, result: r.result }
    : { w: r.w, l: r.l, ring: r.ring ? 1 : 0, ovr: r.ovr, fr: r.fr, mode: r.mode, result: r.result };
  RTTLB.postDialog(f ? 'fantasy' : 'table', entry, runKey(), () => { syncPostBtn(); if (lbWidget) lbWidget.show(f ? 'fantasy' : 'table'); });
}

// ---------- wiring ----------
function goSection(id) { if ($('view-home').classList.contains('hidden')) { goHome(); } setTimeout(() => $(id).scrollIntoView({ behavior: 'smooth' }), 30); }
function goHome() { if (S && !S.done) save(); show('home'); renderHome(); }
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goSection(b.dataset.go)));
$('homeBtn').addEventListener('click', goHome);
$('homeBtn2').addEventListener('click', goHome);
$('dailyBtn').addEventListener('click', startDaily);
$('randomTeamBtn').addEventListener('click', () => startFree(pick(Math.random, FR_KEYS)));
$('resumeBtn').addEventListener('click', () => { S = store.get('run', null); if (S) openDraft(); });
$('spinBtn').addEventListener('click', onSpinBtn);
$('resetYearBtn').addEventListener('click', resetYear);
$('resetTeamBtn').addEventListener('click', resetTeam);
$('search').addEventListener('input', renderList);
$('showRatings').addEventListener('change', (e) => { S.showRatings = e.target.checked; renderDraft(); });
$('quickSpin').addEventListener('change', (e) => store.set('quick', e.target.checked));
$('quitBtn').addEventListener('click', () => { save(); goHome(); toast('Draft saved'); });
$('skipBtn').addEventListener('click', () => { skip = true; });
$('againBtn').addEventListener('click', () => { if (S.mode === 'daily') { goHome(); goSection('play'); } else if (S.mode === 'fantasy') newRun('fantasy'); else newRun('free', S.fr); });
$('rosterBtn').addEventListener('click', viewRoster);
$('shareBtn').addEventListener('click', async () => {
  const t = shareText();
  try { await navigator.clipboard.writeText(t); toast('Result copied'); }
  catch (e) { modal('YOUR RESULT', el('pre', { style: 'white-space:pre-wrap;margin:0;font-family:inherit', text: t }), [['CLOSE', 'btn-gold', null]]); }
});
$('soundBtn').setAttribute('aria-pressed', String(soundOn));
$('soundBtn').addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); $('soundBtn').setAttribute('aria-pressed', String(soundOn)); beep(660, .1); });
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('modal').classList.add('hidden'); });

$('shareBtn').after(el('button', { id: 'postBtn', class: 'btn btn-green btn-sm', onclick: postRun }, 'POST TO LEADERBOARD'));
$('rosterBtn').before(el('button', { id: 'statsBtn', class: 'btn btn-green btn-sm', onclick: () => { if (S && S.mode === 'fantasy') { if (S.fstats) viewFStats(); } else if (S && S.stats) viewStats(S.stats, S.result); } }, 'PLAYER STATS'));
$('lastCap').after(el('button', { id: 'lastStatsBtn', class: 'btn btn-green btn-sm hidden', onclick: () => { const l = store.get('last', null); if (l && l.stats) viewStats(l.stats, l); } }, 'PLAYER STATS'));
$('spinBtn').parentElement.append(el('button', { id: 'autoFillBtn', class: 'btn btn-gold btn-sm', onclick: autoFill }, '⚡ AUTO-FILL REST'));
$('randomTeamBtn').after(el('button', { id: 'autoDraftBtn', class: 'btn btn-gold btn-sm', onclick: autoDraftNew }, '⚡ INSTANT RANDOM TEAM'));
$('dailyBtn').parentElement.append(el('button', { id: 'fantasyBtn', class: 'btn btn-gold', onclick: startFantasy }, '★ SMALLER DRAFT FANTASY STYLE'));
buildWheel();
renderHome();
initShared();
// Account sync brought in stats from another device: redraw the home screen if it's showing.
window.addEventListener('rtt:synced', () => { if (!$('view-home').classList.contains('hidden')) renderHome(); });
window.__rtt = { get S() { return S; }, teamRating, roster, YEARS };
})();
