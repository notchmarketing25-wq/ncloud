// Test harness: a throw-away copy of the PHP API running on PHP's built-in server (file storage), a mail sink that records every
// message the API sends, and a tiny client with a cookie jar. No MySQL, no network, nothing outside a temp folder.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer as tcp } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ADMIN = { email: 'admin@test.local', password: 'Admin#12345' };
export const CLIENT = { email: 'client@test.local', password: 'Client#12345', name: 'Test Client' };

const freePort = () => new Promise((res) => { const s = tcp(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

/** SMTP sink: accepts everything and keeps { to, subject, body } for each message. */
function mailSink(port) {
  const mails = [];
  const srv = tcp((sock) => {
    let data = false; let buf = ''; let to = [];
    sock.write('220 sink\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === '.') { data = false; const raw = mails.pop(); mails.push({ ...raw }); sock.write('250 queued\r\n'); } else { mails[mails.length - 1].raw += line + '\n'; } continue; }
        const u = line.toUpperCase();
        if (u.startsWith('EHLO')) sock.write('250-sink\r\n250 AUTH LOGIN\r\n');
        else if (u.startsWith('RCPT TO')) { to.push(line.slice(8).replace(/[<>]/g, '').trim()); sock.write('250 ok\r\n'); }
        else if (u.startsWith('MAIL FROM')) { to = []; sock.write('250 ok\r\n'); }
        else if (u === 'DATA') { data = true; mails.push({ to: [...to], raw: '' }); sock.write('354 go\r\n'); }
        else if (u === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise((res) => srv.listen(port, '127.0.0.1', () => res({ mails, close: () => srv.close() })));
}

/** Decodes the headers + base64/plain body of a recorded message into something easy to assert on. */
export function readMail(m) {
  const [head, ...rest] = m.raw.split('\n\n');
  const subj = /^Subject: (.*)$/m.exec(head)?.[1] ?? '';
  const subject = subj.startsWith('=?UTF-8?B?') ? Buffer.from(subj.slice(10, -2), 'base64').toString('utf8') : subj;
  let body = rest.join('\n\n');
  if (/Content-Transfer-Encoding: base64/i.test(head)) body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  return { to: m.to, subject, body };
}

export async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'nc-test-'));
  const api = join(dir, 'api'); mkdirSync(join(api, 'data'), { recursive: true });
  for (const f of readdirSync(join(ROOT, 'server/api'))) if (f.endsWith('.php')) cpSync(join(ROOT, 'server/api', f), join(api, f));
  const port = await freePort(); const smtpPort = await freePort();
  const sink = await mailSink(smtpPort);
  const hash = execFileSync('php', ['-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', ADMIN.password]).toString();
  const db = { users: [{ id: 'adminid0000000001', name: 'Admin', email: ADMIN.email, role: 'admin', hash, created: '2026-01-01T00:00:00+00:00', no: 1 }], attempts: {}, items: {}, tickets: [], leads: [], log: [],
    meta: { site: 'Test Co', currency: 'EGP', contactEmail: 'support@test.local', siteUrl: `http://127.0.0.1:${port}`, smtp: { host: '127.0.0.1', port: smtpPort, secure: 'none', user: '', pass: '', from: 'noreply@test.local', fromName: 'Test Co' }, taxes: [{ name: 'VAT', rate: 14 }], taxInclusive: false } };
  writeFileSync(join(api, 'data/db.php'), "<?php http_response_code(404); exit; ?>\n" + JSON.stringify(db));
  writeFileSync(join(api, 'data/installed.lock'), 'ok');
  const proc = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', dir], { env: { ...process.env, PHP_CLI_SERVER_WORKERS: '4' }, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/api/index.php`;
  for (let i = 0; i < 50; i++) { try { const r = await fetch(`${base}?r=status`); if (r.ok) break; } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 100)); }
  const stop = () => { proc.kill(); sink.close(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } };
  return { base, dir, mails: sink.mails, stop, client: (name = 'who') => makeClient(base) };
}

function makeClient(base) {
  let cookie = '';
  const call = async (route, body, query = {}, opts = {}) => {
    const qs = Object.entries(query).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    const headers = { 'X-NC': '1', Cookie: cookie };
    let payload;
    if (body instanceof FormData) payload = body; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(`${base}?r=${route}${qs}`, { method: body !== undefined ? 'POST' : 'GET', headers, body: payload });
    for (const c of res.headers.getSetCookie?.() ?? []) cookie = c.split(';')[0];
    if (opts.raw) return res;
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  };
  return { call, login: (email, password, extra = {}) => call('auth/login', { email, password, ...extra }), logout: () => { cookie = ''; } };
}

// RFC 6238, so tests can play the authenticator app.
export function totp(secretB32, offset = 0) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of secretB32.toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const bytes = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const step = Math.floor(Date.now() / 30000) + offset; const msg = Buffer.alloc(8); msg.writeUInt32BE(step, 4);
  const h = createHmac('sha1', bytes).update(msg).digest(); const o = h[19] & 15;
  return String(((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6).padStart(6, '0');
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
