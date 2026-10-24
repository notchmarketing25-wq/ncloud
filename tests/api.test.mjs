import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN, CLIENT, readMail, startServer, totp, wait } from './helpers.mjs';

let S, admin, client, clientId;
before(async () => {
  S = await startServer();
  admin = S.client(); client = S.client();
  assert.equal((await admin.login(ADMIN.email, ADMIN.password)).status, 200);
  const r = await client.call('auth/register', { name: CLIENT.name, email: CLIENT.email, password: CLIENT.password, phone: '01000000000' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  clientId = r.json.user.id;
});
after(() => S.stop());

test('security headers on every API answer', async () => {
  const r = await admin.call('status');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
});

test('clients cannot reach admin routes; anonymous cannot reach client routes', async () => {
  assert.equal((await client.call('admin/users')).status, 403);
  assert.equal((await client.call('admin/ops/backups')).status, 403);
  const anon = S.client();
  assert.equal((await anon.call('me/data')).status, 401);
  assert.equal((await anon.call('admin/ops/report')).status, 401);
});

test('wrong password is refused', async () => {
  const c = S.client();
  assert.equal((await c.login(ADMIN.email, 'nope-nope-1')).status, 401);
});

/* ───────── two-factor ───────── */
test('two-factor: setup, enable, login needs a code, replay and wrong codes fail, recovery code works once, disable', async () => {
  const c = S.client();
  await c.login(CLIENT.email, CLIENT.password);
  const setup = await c.call('auth/2fa-setup', {});
  assert.equal(setup.status, 200);
  assert.match(setup.json.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.json.uri, /^otpauth:\/\/totp\//);
  assert.equal((await c.call('auth/2fa-enable', { code: '000000' })).status, 401);
  const code = totp(setup.json.secret);
  const en = await c.call('auth/2fa-enable', { code });
  assert.equal(en.status, 200);
  assert.equal(en.json.recovery.length, 8);
  // new session: password alone is not enough
  const c2 = S.client();
  const noCode = await c2.login(CLIENT.email, CLIENT.password);
  assert.equal(noCode.status, 401); assert.equal(noCode.json.error, 'two-factor code required');
  assert.equal((await c2.call('me/data')).status, 401);
  assert.equal((await c2.login(CLIENT.email, CLIENT.password, { code: '123456' })).status, 401);
  // the code used while enabling cannot be replayed
  assert.equal((await c2.login(CLIENT.email, CLIENT.password, { code })).status, 401);
  const next = totp(setup.json.secret, 1);
  assert.equal((await c2.login(CLIENT.email, CLIENT.password, { code: next })).status, 200);
  assert.equal((await c2.call('me/data')).status, 200);
  // recovery code: once
  const c3 = S.client(); const rec = en.json.recovery[0];
  assert.equal((await c3.login(CLIENT.email, CLIENT.password, { code: rec })).status, 200);
  assert.equal((await S.client().login(CLIENT.email, CLIENT.password, { code: rec })).status, 401);
  // disabling needs the password and a code
  assert.equal((await c2.call('auth/2fa-disable', { password: 'bad-password-1', code: en.json.recovery[1] })).status, 403);
  assert.equal((await c2.call('auth/2fa-disable', { password: CLIENT.password, code: en.json.recovery[1] })).status, 200);
  assert.equal((await S.client().login(CLIENT.email, CLIENT.password)).status, 200);
});

test('admin can reset a colleague\'s two-factor', async () => {
  const c = S.client(); await c.login(CLIENT.email, CLIENT.password);
  const s = await c.call('auth/2fa-setup', {}); await c.call('auth/2fa-enable', { code: totp(s.json.secret) });
  assert.equal((await S.client().login(CLIENT.email, CLIENT.password)).status, 401);
  assert.equal((await admin.call('admin/2fa-reset', { uid: clientId })).status, 200);
  assert.equal((await S.client().login(CLIENT.email, CLIENT.password)).status, 200);
});

/* ───────── support tickets send mail both ways ───────── */
test('tickets: the company is mailed on a client message, the client on a reply', async () => {
  const before = S.mails.length;
  const t = await client.call('tickets/create', { subject: 'Need help', text: 'My site is down' });
  assert.equal(t.status, 201);
  await wait(200);
  const m1 = readMail(S.mails[before]);
  assert.deepEqual(m1.to, ['support@test.local']);
  assert.match(m1.subject, /\[Support\] Need help/);
  assert.match(m1.body, /My site is down/);
  const r = await admin.call('tickets/reply', { id: t.json.ticket.id, text: 'We are on it' });
  assert.equal(r.status, 200);
  await wait(200);
  const m2 = readMail(S.mails[S.mails.length - 1]);
  assert.deepEqual(m2.to, [CLIENT.email]);
  assert.match(m2.subject, /^Re: Need help/);
  assert.match(m2.body, /We are on it/);
  // another client cannot read or answer it
  const other = S.client();
  await other.call('auth/register', { name: 'Other', email: 'other@test.local', password: 'Other#12345' });
  assert.equal((await other.call('tickets/reply', { id: t.json.ticket.id, text: 'hi' })).status, 403);
});

/* ───────── quotes → orders ───────── */
test('quote: private link hides drafts; accepting or converting makes an order + invoice with the quote\'s own totals', async () => {
  const q = await admin.call('admin/quote-save', { uid: clientId, subject: 'Site build', status: 'draft', validUntil: '2099-01-01', terms: '50% upfront', items: [{ desc: 'Design', qty: 3, price: 100, details: '3 pages', taxed: true }, { desc: 'Hosting', amount: 50 }], discount: 10 });
  assert.equal(q.status, 201);
  const quote = q.json.quote;
  assert.equal(quote.items[0].amount, 300); assert.equal(quote.token.length, 24);
  assert.equal((await S.client().call('public/quote', undefined, { t: quote.token })).status, 404, 'a draft has no public page');
  await admin.call('admin/quote-save', { id: quote.id, uid: clientId, subject: 'Site build', status: 'delivered', validUntil: '2099-01-01', items: quote.items, discount: 10 });
  const pub = await S.client().call('public/quote', undefined, { t: quote.token });
  assert.equal(pub.status, 200); assert.equal(pub.json.quote.subject, 'Site build');
  assert.equal(pub.json.quote.token, undefined); assert.equal(pub.json.quote.uid, undefined);
  assert.equal((await S.client().call('public/quote', undefined, { t: 'a'.repeat(24) })).status, 404);
  const acc = await client.call('quotes/respond', { id: quote.id, accept: true });
  assert.equal(acc.status, 200); assert.ok(acc.json.order);
  const orders = (await admin.call('admin/items', undefined, { res: 'orders' })).json.items;
  const o = orders.find((x) => x.id === acc.json.order);
  const total = (await admin.call('admin/items', undefined, { res: 'quotes' })).json.items.find((x) => x.id === quote.id).total;
  assert.equal(o.total, total); assert.equal(o.status, 'pending');
  assert.equal((await admin.call('admin/quote-to-order', { id: quote.id })).status, 422, 'only once');
  // admin conversion path
  const q2 = (await admin.call('admin/quote-save', { uid: clientId, subject: 'Second', status: 'delivered', items: [{ desc: 'One', amount: 20 }] })).json.quote;
  const conv = await admin.call('admin/quote-to-order', { id: q2.id });
  assert.equal(conv.status, 200); assert.match(conv.json.number, /^ORD-/);
});

/* ───────── email plans: reserve mailboxes, switch on at payment ───────── */
test('email plan order reserves mailboxes (pending), activates them when the order is activated, frees them when cancelled', async () => {
  const plan = (await admin.call('admin/item-save', { item: { category: 'email', nameAr: '5 إيميل', nameEn: '5 emails', price: 3500, per: 'year', active: true, seats: 5 } }, { res: 'plans' })).json.item;
  const o = await client.call('orders/create', { items: [{ kind: 'plan', id: plan.id, qty: 1 }], domain: 'acme.com', mailboxes: ['hello', 'sales', 'Info', 'bad name', 'hello', 'a', 'b', 'c'] });
  assert.equal(o.status, 201, JSON.stringify(o.json));
  const mine = (await client.call('me/data')).json.mailboxes.filter((m) => m.orderId === o.json.order.id);
  assert.deepEqual(mine.map((m) => m.address).sort(), ['a@acme.com', 'b@acme.com', 'hello@acme.com', 'info@acme.com', 'sales@acme.com']);
  assert.ok(mine.every((m) => m.status === 'pending'));
  await admin.call('admin/order-status', { id: o.json.order.id, status: 'active' });
  const after = (await admin.call('admin/items', undefined, { res: 'mailboxes' })).json.items.filter((m) => m.orderId === o.json.order.id);
  assert.ok(after.length === 5 && after.every((m) => m.status === 'active' && m.expires));
  const o2 = await client.call('orders/create', { items: [{ kind: 'plan', id: plan.id, qty: 1 }], domain: 'acme.com', mailboxes: ['team1', 'team2'] });
  await admin.call('admin/order-status', { id: o2.json.order.id, status: 'cancelled' });
  assert.equal((await admin.call('admin/items', undefined, { res: 'mailboxes' })).json.items.filter((m) => m.orderId === o2.json.order.id).length, 0);
});

/* ───────── reports & CSV ───────── */
test('financial report and CSV exports', async () => {
  const inv = (await admin.call('admin/invoice-save', { uid: clientId, items: [{ desc: '=HYPERLINK("x")', amount: 1000, taxed: true }], status: 'due' })).json.invoice;
  assert.ok(inv.amount > 1000, 'VAT is added on top');
  await admin.call('admin/invoice-payment', { id: inv.id, amount: 400, method: 'Cash', fee: 10 });
  const rep = (await admin.call('admin/ops/report')).json;
  assert.ok(rep.totals.collected >= 400 && rep.totals.fees >= 10);
  assert.ok(rep.outstanding >= inv.amount - 400 - 0.01);
  assert.ok(rep.byMethod.some((m) => m.key === 'Cash' && m.amount >= 400));
  assert.ok(rep.topClients.some((c) => c.name === CLIENT.name));
  const csv = await admin.call('admin/ops/export', undefined, { kind: 'invoices' }, { raw: true });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const buf = Buffer.from(await csv.arrayBuffer()); const text = buf.toString('utf8');
  assert.deepEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM so Excel reads Arabic');
  assert.ok(text.includes("\"'=HYPERLINK"), 'cells starting with = are neutralised (CSV injection)');
  for (const k of ['transactions', 'clients', 'services', 'purchases']) assert.equal((await admin.call('admin/ops/export', undefined, { kind: k }, { raw: true })).status, 200);
  assert.equal((await admin.call('admin/ops/export', undefined, { kind: 'nope' })).status, 422);
});

/* ───────── backup & restore ───────── */
test('backup: create, list, download, restore brings the data back and takes a safety copy first', async () => {
  const created = await admin.call('admin/ops/backup-create', {});
  assert.equal(created.status, 200, JSON.stringify(created.json));
  const name = created.json.backup.name;
  assert.match(name, /^ncloud-backup-\d{8}-\d{6}-[a-f0-9]{8}\.zip$/);
  const list = (await admin.call('admin/ops/backups')).json;
  assert.ok(list.backups.some((b) => b.name === name));
  const dl = await admin.call('admin/ops/backup-download', undefined, { name }, { raw: true });
  assert.equal(dl.status, 200); const bytes = Buffer.from(await dl.arrayBuffer()); assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  assert.equal((await admin.call('admin/ops/backup-download', undefined, { name: '../../etc/passwd' })).status, 404);
  const usersBefore = (await admin.call('admin/users')).json.users.length;
  // change something after the backup, then restore
  await S.client().call('auth/register', { name: 'Late', email: 'late@test.local', password: 'Late#123456' });
  assert.equal((await admin.call('admin/users')).json.users.length, usersBefore + 1);
  const noConfirm = new FormData(); noConfirm.append('name', name);
  assert.equal((await admin.call('admin/ops/backup-restore', noConfirm)).status, 422);
  const fd = new FormData(); fd.append('name', name); fd.append('confirm', 'RESTORE');
  const rs = await admin.call('admin/ops/backup-restore', fd);
  assert.equal(rs.status, 200, JSON.stringify(rs.json));
  assert.equal((await admin.call('admin/users')).json.users.length, usersBefore);
  assert.ok((await admin.call('admin/ops/backups')).json.backups.some((b) => b.name === rs.json.restored.safety), 'safety copy exists');
  // an uploaded file works too, a junk file does not
  const up = new FormData(); up.append('confirm', 'RESTORE'); up.append('file', new Blob([bytes]), 'b.zip');
  assert.equal((await admin.call('admin/ops/backup-restore', up)).status, 200);
  const junk = new FormData(); junk.append('confirm', 'RESTORE'); junk.append('file', new Blob(['not a zip']), 'x.zip');
  assert.equal((await admin.call('admin/ops/backup-restore', junk)).status, 422);
  assert.equal((await client.call('admin/ops/backup-create', {})).status, 403);
  assert.equal((await admin.call('admin/ops/backup-delete', { name })).status, 200);
});

/* ───────── DNS rules ───────── */
test('dns_resolve: ALIAS/CNAME vs A on one name (also web vs web.example.com) — the record added last wins', () => {
  const src = readFileSync(join(S.dir, 'api/providers.php'), 'utf8');
  const fn = /function dns_resolve[\s\S]*?\n}\n/.exec(src)[0];
  const php = `${fn}\n$r=array(array('type'=>'A','host'=>'web.example.com','value'=>'1.1.1.1'),array('type'=>'ALIAS','host'=>'web','value'=>'x.com'),array('type'=>'TXT','host'=>'web','value'=>'t'),array('type'=>'A','host'=>'@','value'=>'2.2.2.2'));\n$o=dns_resolve($r,$n,'example.com'); echo json_encode(array(array_map(function($x){return $x['type'].' '.$x['host'];},$o),$n));`;
  const out = JSON.parse(execFileSync('php', ['-r', php]).toString());
  assert.deepEqual(out[0], ['ALIAS web', 'TXT web', 'A @']);
  assert.deepEqual(out[1], ['A web']);
});

/* ───────── ledger corrections ───────── */
test('ledger: partial payment, edit and delete an entry (credit stays in step), refund guard, late fee', async () => {
  const inv = (await admin.call('admin/invoice-save', { uid: clientId, items: [{ desc: 'Service', amount: 1000 }], status: 'due' })).json.invoice;
  const total = inv.amount; // + 14% VAT is only on taxed items; this item is untaxed
  await admin.call('admin/invoice-payment', { id: inv.id, amount: 300, method: 'Cash', fee: 5 });
  let cur = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id);
  assert.equal(cur.status, 'due'); assert.equal(cur.balance, total - 300, 'a partial payment leaves the invoice open');
  const e1 = cur.payments[0];
  // edit: raise it to the full amount → the invoice becomes paid
  assert.equal((await admin.call('admin/invoice-entry', { id: inv.id, entry: e1.id, action: 'edit', amount: total, method: 'Bank', ref: 'TX1', fee: 0 })).status, 200);
  cur = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id);
  assert.equal(cur.status, 'paid'); assert.equal(cur.payments[0].method, 'Bank'); assert.equal(cur.payments[0].ref, 'TX1');
  // lower it again → back to due
  await admin.call('admin/invoice-entry', { id: inv.id, entry: e1.id, action: 'edit', amount: 100 });
  cur = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id);
  assert.equal(cur.status, 'due'); assert.equal(cur.balance, total - 100);
  // a refund larger than what was paid is refused, and a payment cannot be edited below an existing refund
  assert.equal((await admin.call('admin/invoice-refund', { id: inv.id, amount: 500 })).status, 422);
  await admin.call('admin/invoice-refund', { id: inv.id, amount: 60, toCredit: true });
  const credit0 = (await client.call('me/data')).json.credit;
  const refund = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id).payments.find((e) => e.type === 'refund');
  assert.equal((await admin.call('admin/invoice-entry', { id: inv.id, entry: e1.id, action: 'edit', amount: 50 })).status, 422, 'paid 50 but 60 refunded');
  // deleting a refund-to-credit takes the credit back
  assert.equal((await admin.call('admin/invoice-entry', { id: inv.id, entry: refund.id, action: 'delete' })).status, 200);
  assert.equal((await client.call('me/data')).json.credit, credit0 - 60);
  // late fee: raises the balance, only on an unpaid invoice
  const before = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id);
  assert.equal((await admin.call('admin/invoice-fee', { id: inv.id, desc: 'Late fee', amount: 75 })).status, 200);
  const after = (await admin.call('admin/items', undefined, { res: 'invoices' })).json.items.find((x) => x.id === inv.id);
  assert.equal(after.amount, before.amount + 75); assert.equal(after.items.length, 2);
  await admin.call('admin/invoice-status', { id: inv.id, status: 'paid' });
  assert.equal((await admin.call('admin/invoice-fee', { id: inv.id, desc: 'x', amount: 5 })).status, 422);
  assert.equal((await client.call('admin/invoice-entry', { id: inv.id, entry: 'x', action: 'delete' })).status, 403);
});

/* ───────── a domain for every service ───────── */
test('checkout: hosting / email need a domain; existing must be the client\'s own; external is validated; "new" must be in the cart', async () => {
  const host = (await admin.call('admin/item-save', { item: { category: 'hosting', nameAr: 'استضافة', nameEn: 'Hosting', price: 100, per: 'month', active: true } }, { res: 'plans' })).json.item;
  const vps = (await admin.call('admin/item-save', { item: { category: 'vps', nameAr: 'VPS', nameEn: 'VPS', price: 500, per: 'month', active: true } }, { res: 'plans' })).json.item;
  const items = [{ kind: 'plan', id: host.id, qty: 1 }];
  assert.equal((await client.call('orders/create', { items })).status, 422, 'a domain is required');
  assert.equal((await client.call('orders/create', { items: [{ kind: 'plan', id: vps.id, qty: 1 }] })).status, 201, 'a VPS does not need one');
  assert.equal((await client.call('orders/create', { items, domainChoice: { mode: 'external', name: 'not a domain' } })).status, 422);
  const ext = await client.call('orders/create', { items, domainChoice: { mode: 'external', name: 'My-Site.com' } });
  assert.equal(ext.status, 201, JSON.stringify(ext.json)); assert.equal(ext.json.order.domain, 'my-site.com');
  assert.equal((await client.call('orders/create', { items, domainChoice: { mode: 'existing', name: 'someone-else.com' } })).status, 422);
  const own = (await admin.call('admin/item-save', { item: { uid: clientId, name: 'mine.com', status: 'active' } }, { res: 'domains' })).json.item;
  const ok = await client.call('orders/create', { items, domainChoice: { mode: 'existing', name: 'mine.com' } });
  assert.equal(ok.status, 201); assert.equal(ok.json.order.domain, 'mine.com');
  assert.equal((await client.call('orders/create', { items, domainChoice: { mode: 'new', name: 'brand-new.com' } })).status, 422, 'not in the cart');
  assert.equal((await client.call('orders/create', { items, domainChoice: { mode: 'external', name: 'a.com', epp: 'x' } })).status, 201);
  assert.ok(own.id);
});
