// Run the Table — global leaderboard + Run the Grid pick counts.
// Routes (all under /api/):
//   POST /api/pick   { pid }                      -> { before, count, points }
//   POST /api/score  { game, name, date, ...run } -> { ok, entry }
//   GET  /api/board?game=grid&scope=today|all&date=YYYY-MM-DD -> { entries }
//   /api/auth/* and /api/me*  -> player accounts (see ../auth.mjs)
import { getStore } from '@netlify/blobs';
import { handleAuth } from '../auth.mjs';

const GAMES = ['table', 'fantasy', 'grid'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOP_N = 100;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (x, lo, hi) => { const v = Number(x); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; };
const r1 = (x) => Math.round(x * 10) / 10;
const utcDate = () => new Date().toISOString().slice(0, 10);

// Rarity: a player nobody has picked is worth 100; every 10 earlier picks halves it, roughly.
export const rarityPoints = (before) => Math.max(1, Math.round(100 / (1 + before / 10)));

export const RANK = {
  table: (a, b) => b.ring - a.ring || b.w - a.w || b.ovr - a.ovr || a.ts - b.ts,
  fantasy: (a, b) => b.ring - a.ring || b.w - a.w || b.pf - a.pf || a.ts - b.ts,
  grid: (a, b) => b.score - a.score || b.filled - a.filled || b.downs - a.downs || a.ts - b.ts
};

export function sanitize(game, b) {
  const base = { name: clean(b.name, 20) || 'Anonymous', date: DATE_RE.test(b.date) ? b.date : utcDate(), ts: Date.now() };
  if (game === 'table') {
    return { ...base, mode: b.mode === 'daily' ? 'daily' : 'free', w: num(b.w, 0, 17) | 0, l: num(b.l, 0, 17) | 0, ring: b.ring ? 1 : 0, ovr: r1(num(b.ovr, 0, 100)), fr: clean(b.fr, 4), result: clean(b.result, 80) };
  }
  if (game === 'fantasy') {
    return { ...base, w: num(b.w, 0, 17) | 0, l: num(b.l, 0, 17) | 0, ring: b.ring ? 1 : 0, pf: r1(num(b.pf, 0, 9999)), ovr: r1(num(b.ovr, 0, 100)), result: clean(b.result, 80) };
  }
  return { ...base, score: num(b.score, 0, 900) | 0, filled: num(b.filled, 0, 9) | 0, downs: num(b.downs, 0, 4) | 0, result: b.result === 'win' ? 'win' : 'lose' };
}

// Read-modify-write with an etag check so simultaneous writes don't clobber each other.
async function update(store, key, fn, init) {
  for (let i = 0; i < 8; i++) {
    const cur = await store.getWithMetadata(key, { type: 'json' });
    const next = fn(cur && cur.data != null ? cur.data : init);
    const opts = cur ? { onlyIfMatch: cur.etag } : { onlyIfNew: true };
    const res = await store.setJSON(key, next, opts);
    if (!res || res.modified !== false) return next;
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 150));
  }
  throw new Error('busy');
}

async function readBody(req) {
  const text = await req.text();
  if (text.length > 4000) throw new Error('too large');
  return JSON.parse(text || '{}');
}

export async function handle(req, stores) {
  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  if (stores.users && (route.startsWith('auth/') || route === 'me' || route.startsWith('me/'))) {
    try {
      const res = await handleAuth(req, route, stores.users);
      if (res) return res;
    } catch (e) {
      console.error('account', route, e);
      return json({ error: 'Account service error, try again' }, 500);
    }
  }
  try {
    if (route === 'pick' && req.method === 'POST') {
      const b = await readBody(req);
      const pid = Number(b.pid);
      if (!Number.isInteger(pid) || pid < 0 || pid > 200000) return json({ error: 'bad player' }, 400);
      let before = 0;
      const count = await update(stores.picks, 'p/' + pid, (c) => { before = c.n || 0; return { n: before + 1 }; }, { n: 0 });
      return json({ before, count: count.n, points: rarityPoints(before) });
    }
    if (route === 'score' && req.method === 'POST') {
      const b = await readBody(req);
      if (!GAMES.includes(b.game)) return json({ error: 'bad game' }, 400);
      const entry = sanitize(b.game, b);
      entry.id = entry.ts.toString(36) + Math.random().toString(36).slice(2, 8);
      await stores.scores.setJSON(`day/${b.game}/${entry.date}/${entry.id}`, entry);
      await update(stores.scores, 'top/' + b.game, (list) => list.concat([entry]).sort(RANK[b.game]).slice(0, TOP_N), []);
      return json({ ok: true, entry });
    }
    if (route === 'board' && req.method === 'GET') {
      const game = url.searchParams.get('game');
      if (!GAMES.includes(game)) return json({ error: 'bad game' }, 400);
      const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'today';
      let entries;
      if (scope === 'all') {
        entries = (await stores.scores.get('top/' + game, { type: 'json' })) || [];
      } else {
        const date = DATE_RE.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : utcDate();
        const { blobs } = await stores.scores.list({ prefix: `day/${game}/${date}/` });
        const keys = blobs.map((x) => x.key).slice(-500);
        entries = (await Promise.all(keys.map((k) => stores.scores.get(k, { type: 'json' })))).filter(Boolean);
      }
      entries.sort(RANK[game]);
      return json({ game, scope, entries: entries.slice(0, 50) });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message === 'busy' ? 'Busy, try again' : 'Bad request' }, e.message === 'busy' ? 503 : 400);
  }
}

export default async (req) => handle(req, {
  picks: getStore({ name: 'rtt-picks', consistency: 'strong' }),
  scores: getStore({ name: 'rtt-scores', consistency: 'strong' }),
  users: getStore({ name: 'rtt-users', consistency: 'strong' })
});

export const config = { path: '/api/*' };
