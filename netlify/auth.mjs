// Run the Table — player accounts.
// Sign in with Google, Apple or Discord; link several of them to one account; stats sync across devices.
// Everything is stored in the Netlify Blobs store "rtt-users":
//   u/<uid>            -> { id, name, created, identities: { google: { sub, email, name }, ... } }
//   i/<provider>/<sub> -> { uid }            (which account a sign-in belongs to)
//   s/<uid>            -> { stats, updated } (the player's synced stats)
//   config/secret      -> { key }            (session-signing key, made on first use if SESSION_SECRET is unset)
//
// Routes (all under /api/):
//   GET  /api/auth/providers            -> { email, google, apple, discord } (true when that sign-in is available)
//   POST /api/auth/email/signup { email, password, name, link } -> { user }  (link: add email to the signed-in account)
//   POST /api/auth/email/login  { email, password }             -> { user }
//   GET  /api/auth/login/<provider>     -> redirect to the provider (?link=1 to add it to the signed-in account, ?return=/path)
//   GET|POST /api/auth/callback/<provider>
//   POST /api/auth/logout
//   GET  /api/me                        -> { user, stats } or { user: null }
//   PUT  /api/me/stats   { stats }      -> { ok, updated }
//   POST /api/me/name    { name }       -> { user }
//   POST /api/me/unlink  { provider }   -> { user }
//   POST /api/me/password { password }  -> { ok }   (change the email sign-in password)
//   POST /api/me/delete                 -> { ok }
import crypto from 'node:crypto';

const SESSION_COOKIE = 'rtt_sess';
const STATE_COOKIE = 'rtt_oauth';
const SESSION_DAYS = 180;
const MAX_STATS = 600_000;
const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[a-z]{2,}$/i;
const MAX_FAILS = 8, LOCK_MIN = 15;

// ---------- email + password ----------
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k))));
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return { salt: salt.toString('base64'), hash: (await scrypt(pw, salt)).toString('base64') };
}
async function checkPassword(pw, rec) {
  const got = await scrypt(pw, Buffer.from(rec.salt, 'base64'));
  const want = Buffer.from(rec.hash, 'base64');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}
const DUMMY = { salt: Buffer.alloc(16).toString('base64'), hash: Buffer.alloc(64).toString('base64') };
const normEmail = (e) => String(e || '').trim().toLowerCase().slice(0, 254);
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Use at least 8 characters for your password.';
  if (pw.length > 200) return 'That password is too long.';
  return null;
}

export const PROVIDERS = {
  google: {
    label: 'Google',
    configured: (env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    authorize: (env, p) => 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID, redirect_uri: p.redirect, response_type: 'code', scope: 'openid email profile',
      state: p.state, nonce: p.nonce, code_challenge: p.challenge, code_challenge_method: 'S256', prompt: 'select_account'
    }),
    async profile(env, code, p, _form, f) {
      const tok = await postForm(f, 'https://oauth2.googleapis.com/token', {
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code, grant_type: 'authorization_code',
        redirect_uri: p.redirect, code_verifier: p.verifier
      });
      // The id_token came straight from Google over TLS, so its claims can be read without re-checking the signature.
      const c = decodeJwt(tok.id_token);
      if (c.aud !== env.GOOGLE_CLIENT_ID || c.nonce !== p.nonce) throw new Error('Google sign-in could not be verified');
      return { sub: String(c.sub), email: c.email || '', name: c.name || c.given_name || '' };
    }
  },
  discord: {
    label: 'Discord',
    configured: (env) => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
    authorize: (env, p) => 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID, redirect_uri: p.redirect, response_type: 'code', scope: 'identify',
      state: p.state, code_challenge: p.challenge, code_challenge_method: 'S256', prompt: 'none'
    }),
    async profile(env, code, p, _form, f) {
      const tok = await postForm(f, 'https://discord.com/api/oauth2/token', {
        client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, code, grant_type: 'authorization_code',
        redirect_uri: p.redirect, code_verifier: p.verifier
      });
      const res = await f('https://discord.com/api/users/@me', { headers: { authorization: 'Bearer ' + tok.access_token } });
      if (!res.ok) throw new Error('Discord profile request failed');
      const u = await res.json();
      return { sub: String(u.id), email: '', name: u.global_name || u.username || '' };
    }
  },
  apple: {
    label: 'Apple',
    configured: (env) => !!(env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY),
    // Apple posts the result back (response_mode=form_post) whenever name/email are requested.
    authorize: (env, p) => 'https://appleid.apple.com/auth/authorize?' + new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID, redirect_uri: p.redirect, response_type: 'code', response_mode: 'form_post',
      scope: 'name email', state: p.state, nonce: p.nonce
    }),
    async profile(env, code, p, form, f) {
      const tok = await postForm(f, 'https://appleid.apple.com/auth/token', {
        client_id: env.APPLE_CLIENT_ID, client_secret: appleClientSecret(env), code, grant_type: 'authorization_code',
        redirect_uri: p.redirect
      });
      const c = decodeJwt(tok.id_token);
      if (c.aud !== env.APPLE_CLIENT_ID || (c.nonce && c.nonce !== p.nonce)) throw new Error('Apple sign-in could not be verified');
      let name = '';
      try { // Apple only sends the name the very first time someone signs in.
        const u = JSON.parse(form.get('user') || '{}');
        name = [u.name && u.name.firstName, u.name && u.name.lastName].filter(Boolean).join(' ');
      } catch (e) { /* no name */ }
      return { sub: String(c.sub), email: c.email || '', name };
    }
  }
};

// ---------- helpers ----------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
export function decodeJwt(t) {
  const part = String(t || '').split('.')[1];
  if (!part) throw new Error('Missing ID token');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}
async function postForm(f, url, body) {
  const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Sign-in token exchange failed (' + (data.error || res.status) + ')');
  return data;
}
export function appleClientSecret(env, now = Math.floor(Date.now() / 1000)) {
  const header = b64u(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }));
  const payload = b64u(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID }));
  // Netlify env vars often lose their line breaks; put the PEM back together if so.
  let pem = String(env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n').trim();
  if (!pem.includes('\n')) {
    const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    pem = '-----BEGIN PRIVATE KEY-----\n' + body.match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----';
  }
  const sig = crypto.sign('sha256', Buffer.from(header + '.' + payload), { key: pem, dsaEncoding: 'ieee-p1363' });
  return header + '.' + payload + '.' + b64u(sig);
}
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers }
});
function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const setCookie = (name, value, opts) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; ${opts}`;
const clearCookie = (name, same = 'Lax') => `${name}=; Path=/; HttpOnly; Secure; SameSite=${same}; Max-Age=0`;
const safeReturn = (r) => (typeof r === 'string' && /^\/(?!\/)[\w\-./?=&#%]*$/.test(r) ? r : '/');

async function signingKey(store, env) {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const cur = await store.get('config/secret', { type: 'json' });
  if (cur && cur.key) return cur.key;
  const key = crypto.randomBytes(32).toString('hex');
  await store.setJSON('config/secret', { key }, { onlyIfNew: true });
  const now = await store.get('config/secret', { type: 'json' }); // another request may have won the race
  return now.key;
}
function seal(key, obj) {
  const body = b64u(JSON.stringify(obj));
  return body + '.' + b64u(crypto.createHmac('sha256', key).update(body).digest());
}
function unseal(key, token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = crypto.createHmac('sha256', key).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return obj.exp && obj.exp > Date.now() ? obj : null;
  } catch (e) { return null; }
}
// POSTs that change the account must come from this site.
function sameOrigin(req) {
  const o = req.headers.get('origin');
  return !o || o === new URL(req.url).origin;
}
const publicUser = (u) => ({
  id: u.id, name: u.name, created: u.created,
  providers: Object.keys(u.identities || {}),
  identities: Object.fromEntries(Object.entries(u.identities || {}).map(([k, v]) => [k, { name: v.name || '', email: v.email || '' }]))
});
const redirect = (to, cookieList) => {
  const h = new Headers({ location: to, 'cache-control': 'no-store' });
  for (const c of cookieList || []) h.append('set-cookie', c);
  return new Response(null, { status: 302, headers: h });
};

async function currentUser(req, store, key) {
  const s = unseal(key, cookies(req)[SESSION_COOKIE]);
  if (!s || !s.uid) return null;
  return store.get('u/' + s.uid, { type: 'json' });
}
function sessionCookie(key, uid) {
  return setCookie(SESSION_COOKIE, seal(key, { uid, exp: Date.now() + SESSION_DAYS * 864e5 }), `SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}

// ---------- route handler ----------
// Returns a Response for account routes, or null when the route is not an account route.
export async function handleAuth(req, route, store, env = process.env, f = fetch) {
  const url = new URL(req.url);
  const origin = url.origin;

  if (route === 'auth/providers' && req.method === 'GET') {
    return json({ email: true, ...Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, p.configured(env)])) });
  }

  if ((route === 'auth/email/signup' || route === 'auth/email/login') && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
    const text = await req.text();
    if (text.length > 4000) return json({ error: 'Bad request' }, 400);
    let b; try { b = JSON.parse(text || '{}'); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = normEmail(b.email);
    if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const key = await signingKey(store, env);
    const idKey = 'i/email/' + email;

    if (route === 'auth/email/signup') {
      const bad = passwordProblem(b.password);
      if (bad) return json({ error: bad }, 400);
      if (await store.get(idKey, { type: 'json' })) return json({ error: 'That email already has an account. Sign in instead.' }, 409);
      const identity = { sub: email, email, name: '', linked: Date.now(), ...(await hashPassword(b.password)) };
      let u = b.link ? await currentUser(req, store, key) : null;
      const oldEmail = u && u.identities.email ? u.identities.email.sub : null;
      if (u) {
        u.identities.email = identity;
      } else {
        const id = crypto.randomUUID();
        u = { id, name: clean(b.name, 20) || email.split('@')[0].slice(0, 20), created: Date.now(), identities: { email: identity } };
      }
      const claim = await store.setJSON(idKey, { uid: u.id }, { onlyIfNew: true });
      if (claim && claim.modified === false) return json({ error: 'That email already has an account. Sign in instead.' }, 409);
      if (oldEmail && oldEmail !== email) await store.delete('i/email/' + oldEmail);
      await store.setJSON('u/' + u.id, u);
      return json({ user: publicUser(u) }, 200, { 'set-cookie': sessionCookie(key, u.id) });
    }

    // login
    const rlKey = 'rl/' + email;
    const rl = (await store.get(rlKey, { type: 'json' })) || { n: 0, until: 0 };
    if (rl.until > Date.now()) return json({ error: `Too many wrong passwords. Try again in ${Math.ceil((rl.until - Date.now()) / 60000)} minutes.` }, 429);
    const owner = await store.get(idKey, { type: 'json' });
    const u = owner && await store.get('u/' + owner.uid, { type: 'json' });
    const rec = u && u.identities.email && u.identities.email.sub === email ? u.identities.email : null;
    const ok = await checkPassword(String(b.password || '').slice(0, 200), rec || DUMMY) && !!rec;
    if (!ok) {
      const n = rl.n + 1;
      await store.setJSON(rlKey, n >= MAX_FAILS ? { n: 0, until: Date.now() + LOCK_MIN * 60e3 } : { n, until: 0 });
      return json({ error: 'Wrong email or password.' }, 401);
    }
    if (rl.n) await store.delete(rlKey);
    return json({ user: publicUser(u) }, 200, { 'set-cookie': sessionCookie(key, u.id) });
  }

  let m = route.match(/^auth\/login\/(google|apple|discord)$/);
  if (m && req.method === 'GET') {
    const name = m[1], P = PROVIDERS[name];
    if (!P.configured(env)) return redirect('/?signin_error=' + encodeURIComponent(P.label + ' sign-in is not set up yet'));
    const key = await signingKey(store, env);
    let linkUid = null;
    if (url.searchParams.get('link') === '1') {
      const u = await currentUser(req, store, key);
      if (u) linkUid = u.id;
    }
    const verifier = b64u(crypto.randomBytes(32));
    const st = {
      provider: name, state: b64u(crypto.randomBytes(16)), nonce: b64u(crypto.randomBytes(16)), verifier,
      linkUid, ret: safeReturn(url.searchParams.get('return')), exp: Date.now() + 15 * 60e3
    };
    const redirectUri = origin + '/api/auth/callback/' + name;
    const to = P.authorize(env, { ...st, redirect: redirectUri, challenge: b64u(crypto.createHash('sha256').update(verifier).digest()) });
    // SameSite=None so the cookie survives Apple's cross-site POST back to us.
    return redirect(to, [setCookie(STATE_COOKIE, seal(key, st), 'SameSite=None; Max-Age=900')]);
  }

  m = route.match(/^auth\/callback\/(google|apple|discord)$/);
  if (m && (req.method === 'GET' || req.method === 'POST')) {
    const name = m[1], P = PROVIDERS[name];
    const key = await signingKey(store, env);
    const st = unseal(key, cookies(req)[STATE_COOKIE]);
    const form = req.method === 'POST' ? new URLSearchParams(await req.text()) : url.searchParams;
    const base = ((st && st.ret) || '/').split('#')[0];
    // Send at most ONE Set-Cookie per response: some hosts merge several into one header and the
    // browser then drops the session cookie. The short-lived state cookie just expires on its own.
    const back = (msg, extra = []) => redirect(base + (base.includes('?') ? '&' : '?') + msg, extra.length ? extra : [clearCookie(STATE_COOKIE, 'None')]);
    if (!st || st.provider !== name || form.get('state') !== st.state) return back('signin_error=' + encodeURIComponent('Sign-in expired. Please try again.'));
    if (form.get('error')) return back('signin_error=' + encodeURIComponent(form.get('error') === 'access_denied' || form.get('error') === 'user_cancelled_authorize' ? 'Sign-in was cancelled.' : 'Sign-in failed.'));
    const code = form.get('code');
    if (!code) return back('signin_error=' + encodeURIComponent('Sign-in failed.'));
    let prof;
    try {
      prof = await P.profile(env, code, { ...st, redirect: origin + '/api/auth/callback/' + name }, form, f);
    } catch (e) {
      console.error('oauth', name, e.message);
      return back('signin_error=' + encodeURIComponent('Sign-in with ' + P.label + ' failed. Please try again.'));
    }
    const idKey = `i/${name}/${prof.sub}`;
    const owner = await store.get(idKey, { type: 'json' });
    const identity = { sub: prof.sub, email: clean(prof.email, 120), name: clean(prof.name, 60), linked: Date.now() };

    if (st.linkUid) { // adding a provider to an existing account
      const u = await store.get('u/' + st.linkUid, { type: 'json' });
      if (!u) return back('signin_error=' + encodeURIComponent('Please sign in again.'));
      if (owner && owner.uid !== u.id) return back('signin_error=' + encodeURIComponent('That ' + P.label + ' account is already linked to a different Run the Table account.'));
      if (u.identities[name] && u.identities[name].sub !== prof.sub) await store.delete(`i/${name}/${u.identities[name].sub}`);
      u.identities[name] = { ...identity, name: identity.name || (u.identities[name] && u.identities[name].name) || '' };
      await store.setJSON(idKey, { uid: u.id });
      await store.setJSON('u/' + u.id, u);
      return back('linked=' + name, [sessionCookie(key, u.id)]);
    }

    let u = owner && await store.get('u/' + owner.uid, { type: 'json' });
    if (!u) { // first sign-in: make an account
      const id = crypto.randomUUID();
      u = { id, name: identity.name || 'Player ' + id.slice(0, 4).toUpperCase(), created: Date.now(), identities: { [name]: identity } };
      await store.setJSON('u/' + id, u);
      await store.setJSON(idKey, { uid: id });
    } else if (identity.name && !u.identities[name].name) {
      u.identities[name].name = identity.name;
      await store.setJSON('u/' + u.id, u);
    }
    console.log('oauth ok', name, u.id);
    return back('signedin=' + name, [sessionCookie(key, u.id)]);
  }

  if (route === 'auth/logout' && req.method === 'POST') {
    if (!sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
  }

  if (route === 'me' || route.startsWith('me/')) {
    const key = await signingKey(store, env);
    const u = await currentUser(req, store, key);
    if (route === 'me' && req.method === 'GET') {
      if (!u) return json({ user: null });
      const s = await store.get('s/' + u.id, { type: 'json' });
      return json({ user: publicUser(u), stats: s ? s.stats : null, updated: s ? s.updated : 0 });
    }
    if (req.method !== 'GET' && !sameOrigin(req)) return json({ error: 'Bad origin' }, 403);
    if (!u) return json({ error: 'Not signed in' }, 401);
    const text = req.method === 'GET' ? '' : await req.text();
    if (text.length > MAX_STATS) return json({ error: 'Stats are too large to save' }, 413);
    let body = {};
    try { body = JSON.parse(text || '{}'); } catch (e) { return json({ error: 'Bad request' }, 400); }

    if (route === 'me/stats' && (req.method === 'PUT' || req.method === 'POST')) {
      if (!body.stats || typeof body.stats !== 'object' || Array.isArray(body.stats)) return json({ error: 'Bad stats' }, 400);
      const stats = {};
      for (const [k, v] of Object.entries(body.stats)) if (/^[\w:\-]{1,40}$/.test(k)) stats[k] = v;
      const updated = Date.now();
      await store.setJSON('s/' + u.id, { stats, updated });
      return json({ ok: true, updated });
    }
    if (route === 'me/name' && req.method === 'POST') {
      const name = clean(body.name, 20);
      if (!name) return json({ error: 'Enter a name' }, 400);
      u.name = name;
      await store.setJSON('u/' + u.id, u);
      return json({ user: publicUser(u) });
    }
    if (route === 'me/unlink' && req.method === 'POST') {
      const p = body.provider;
      if (!u.identities[p]) return json({ error: 'Not linked' }, 400);
      if (Object.keys(u.identities).length < 2) return json({ error: 'Link another sign-in first so you can still get into your account.' }, 400);
      await store.delete(`i/${p}/${u.identities[p].sub}`);
      delete u.identities[p];
      await store.setJSON('u/' + u.id, u);
      return json({ user: publicUser(u) });
    }
    if (route === 'me/password' && req.method === 'POST') {
      if (!u.identities.email) return json({ error: 'Add an email sign-in first.' }, 400);
      const bad = passwordProblem(body.password);
      if (bad) return json({ error: bad }, 400);
      Object.assign(u.identities.email, await hashPassword(body.password));
      await store.setJSON('u/' + u.id, u);
      return json({ ok: true });
    }
    if (route === 'me/delete' && req.method === 'POST') {
      for (const [p, v] of Object.entries(u.identities)) await store.delete(`i/${p}/${v.sub}`);
      await store.delete('s/' + u.id);
      await store.delete('u/' + u.id);
      return json({ ok: true }, 200, { 'set-cookie': clearCookie(SESSION_COOKIE) });
    }
    return json({ error: 'not found' }, 404);
  }
  return null;
}
