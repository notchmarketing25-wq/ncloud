import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, CLIENT, startServer } from './helpers.mjs';
import { startProviders } from './mock-providers.mjs';

let S, P, admin, client, clientId, nc, rc, hs;
before(async () => {
  S = await startServer(); P = await startProviders();
  admin = S.client(); client = S.client();
  await admin.login(ADMIN.email, ADMIN.password);
  clientId = (await client.call('auth/register', { name: CLIENT.name, email: CLIENT.email, password: CLIENT.password, phone: '01000000000' })).json.user.id;
  for (const [id, fields] of [['namecheap', { apiUser: 'u', apiKey: 'k', username: 'u', clientIp: '1.2.3.4' }], ['resellerclub', { userId: '1', apiKey: 'k', ns1: 'ns1.mine.net', ns2: 'ns2.mine.net' }], ['hostinger', { token: 'tok' }]]) {
    const r = await admin.call('admin/providers', { id, fields, baseUrl: P.url });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const mk = async (name, provider) => (await admin.call('admin/item-save', { item: { uid: clientId, name, status: 'active', expires: '2026-12-31', autoRenew: true, provider, price: 20 } }, { res: 'domains' })).json.item;
  nc = await mk('nc-example.com', 'namecheap'); rc = await mk('rc-example.com', 'resellerclub'); hs = await mk('hs-example.com', 'hostinger');
});
after(() => { S.stop(); P.stop(); });

test('namecheap: read nameservers + lock, change them, default DNS, lock/unlock', async () => {
  const i = (await admin.call('admin/domain-registrar', undefined, { id: nc.id })).json;
  assert.deepEqual(i.info.ns, ['dns1.old.com', 'dns2.old.com']); assert.equal(i.info.locked, false); assert.equal(i.caps.renew, true);
  assert.equal((await admin.call('admin/domain-registrar', { id: nc.id, action: 'setns', ns: ['ns1.new.com', 'ns2.new.com'] })).status, 200);
  assert.deepEqual(P.state.ncNs, ['ns1.new.com', 'ns2.new.com']);
  assert.equal((await admin.call('admin/domain-registrar', { id: nc.id, action: 'setns', ns: [] })).status, 200);
  assert.equal(P.state.ncDefault, true);
  assert.equal((await admin.call('admin/domain-registrar', { id: nc.id, action: 'setlock', lock: true })).status, 200);
  assert.equal((await admin.call('admin/domain-registrar', undefined, { id: nc.id })).json.info.locked, true);
  const bad = await admin.call('admin/domain-registrar', { id: nc.id, action: 'setns', ns: ['not a host', 'x'] });
  assert.equal(bad.status, 502); assert.match(bad.json.error, /invalid nameserver/);
  assert.equal((await admin.call('admin/domain-registrar', { id: nc.id, action: 'setns', ns: ['only.one.com'] })).status, 502, 'needs two');
});

test('the client sees and changes only their own domain\'s nameservers and lock; admin can switch it off per domain', async () => {
  const r = await client.call('svc/domain-registrar', undefined, { id: nc.id });
  assert.equal(r.status, 200); assert.equal(r.json.managed, true); assert.ok(r.json.info.ns !== undefined);
  assert.equal((await client.call('svc/domain-ns', { id: nc.id, ns: ['ns1.client.com', 'ns2.client.com'] })).status, 200);
  assert.deepEqual(P.state.ncNs, ['ns1.client.com', 'ns2.client.com']);
  assert.equal((await client.call('svc/domain-lock', { id: nc.id, lock: false })).status, 200);
  const other = S.client(); await other.call('auth/register', { name: 'Other', email: 'o@test.local', password: 'Other#12345' });
  assert.equal((await other.call('svc/domain-ns', { id: nc.id, ns: ['a.example.com', 'b.example.com'] })).status, 404);
  assert.equal((await other.call('svc/domain-registrar', undefined, { id: nc.id })).status, 404);
  await admin.call('admin/item-save', { item: { id: nc.id, uid: clientId, name: nc.name, status: 'active', provider: 'namecheap', dnsOff: true } }, { res: 'domains' });
  assert.equal((await client.call('svc/domain-ns', { id: nc.id, ns: ['a.example.com', 'b.example.com'] })).status, 403);
  await admin.call('admin/item-save', { item: { id: nc.id, uid: clientId, name: nc.name, status: 'active', provider: 'namecheap', dnsOff: false } }, { res: 'domains' });
});

test('renewing at the registrar needs the setting AND a confirmation, then records the new expiry', async () => {
  P.calls.length = 0;
  const no = await admin.call('admin/domain-registrar', { id: nc.id, action: 'renew', years: 1, confirm: true });
  assert.equal(no.status, 409);
  await admin.call('admin/settings', { ...(await admin.call('admin/settings')).json, providerRegister: true });
  assert.equal((await admin.call('admin/domain-registrar', { id: nc.id, action: 'renew', years: 1 })).status, 422, 'no confirm');
  assert.ok(!P.calls.some((c) => c.Command === 'namecheap.domains.renew'), 'nothing was charged yet');
  const ok = await admin.call('admin/domain-registrar', { id: nc.id, action: 'renew', years: 2, confirm: true });
  assert.equal(ok.status, 200); assert.equal(ok.json.charged, '11.98');
  assert.equal(P.calls.find((c) => c.Command === 'namecheap.domains.renew').Years, '2');
  const d = (await admin.call('admin/items', undefined, { res: 'domains' })).json.items.find((x) => x.id === nc.id);
  assert.equal(d.expires, '2031-12-31');
});

test('a paid renewal order marks the domain "to renew at the registrar"; auto-renew pays it from the cron job only when switched on', async () => {
  const o = await client.call('orders/create', { items: [{ kind: 'renew', res: 'domains', id: rc.id, qty: 1 }] });
  assert.equal(o.status, 201, JSON.stringify(o.json));
  await admin.call('admin/order-status', { id: o.json.order.id, status: 'active' });
  let d = (await admin.call('admin/items', undefined, { res: 'domains' })).json.items.find((x) => x.id === rc.id);
  assert.equal(d.renewPending, 1);
  const cronKey = (await admin.call('admin/settings')).json.cronKey;
  P.calls.length = 0;
  await S.client().call('cron/run', undefined, { key: cronKey });
  assert.ok(!P.calls.some((c) => c.path === '/api/domains/renew.json'), 'auto-renew is off by default');
  await admin.call('admin/settings', { ...(await admin.call('admin/settings')).json, providerRegister: true, providerRenew: true });
  await S.client().call('cron/run', undefined, { key: cronKey });
  assert.ok(P.calls.some((c) => c.path === '/api/domains/renew.json' && c['order-id'] === '4242' && c.years === '1'));
  d = (await admin.call('admin/items', undefined, { res: 'domains' })).json.items.find((x) => x.id === rc.id);
  assert.equal(d.renewPending, undefined);
});

test('resellerclub: nameservers, lock, EPP code; DNS write sends only the difference', async () => {
  assert.deepEqual((await admin.call('admin/domain-registrar', undefined, { id: rc.id })).json.info.ns, ['ns1.old.net', 'ns2.old.net']);
  assert.equal((await admin.call('admin/domain-registrar', { id: rc.id, action: 'setns', ns: ['ns1.rc-new.net', 'ns2.rc-new.net'] })).status, 200);
  assert.deepEqual(P.state.rcNs, ['ns1.rc-new.net', 'ns2.rc-new.net']);
  assert.equal((await admin.call('admin/domain-registrar', { id: rc.id, action: 'setlock', lock: true })).status, 200); assert.equal(P.state.rcLocked, true);
  assert.equal((await admin.call('admin/domain-registrar', { id: rc.id, action: 'epp' })).json.code, 'EPP-SECRET-1');
  // zone: pull, edit locally, push
  assert.equal((await admin.call('admin/domain-dns', { id: rc.id, action: 'pull' })).status, 200);
  const d = (await admin.call('admin/domain', undefined, { id: rc.id })).json.domain;
  assert.equal(d.dns.length, 2);
  const gone = d.dns.find((r) => r.host === 'gone');
  P.calls.length = 0;
  // the zone is synced, so each edit is pushed on its own; only the difference goes out
  await admin.call('svc/dns-delete', { id: rc.id, rid: gone.id });
  await admin.call('svc/dns-save', { id: rc.id, type: 'A', host: 'new', value: '5.5.5.5', ttl: 3600 });
  assert.equal((await admin.call('admin/domain-dns', { id: rc.id, action: 'push' })).status, 200);
  const writes = P.calls.filter((c) => /dns\/manage\/(add|delete)-/.test(c.path)).map((c) => `${c.path.split('/').pop()} ${c.host} ${c.value}`);
  assert.deepEqual(writes.sort(), ['add-ipv4-record.json new 5.5.5.5', 'delete-ipv4-record.json gone 9.9.9.9'], 'exactly one add and one delete, nothing re-sent by the explicit push');
  assert.ok(!writes.some((w) => w.includes('www')), 'the untouched record is not re-sent');
});

test('resellerclub: registering creates the customer and contact, then the domain', async () => {
  const dom = (await admin.call('admin/item-save', { item: { uid: clientId, name: 'brand-new.com', status: 'pending', regYears: 1 } }, { res: 'domains' })).json.item;
  P.calls.length = 0;
  const r = await admin.call('admin/register-domain', { id: dom.id, provider: 'resellerclub', years: 1, confirm: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const order = P.calls.map((c) => c.path.split('/').slice(-2).join('/'));
  assert.ok(order.indexOf('v2/signup.json') < order.indexOf('contacts/add.json') && order.indexOf('contacts/add.json') < order.indexOf('domains/register.json'), order.join(' > '));
  const reg = P.calls.find((c) => c.path === '/api/domains/register.json');
  assert.equal(reg['domain-name'], 'brand-new.com'); assert.equal(reg['customer-id'], '9001'); assert.equal(reg['reg-contact-id'], '9002'); assert.equal(reg.ns, 'ns2.mine.net', 'ns repeated: last wins in this parser but both are sent');
  assert.equal(P.calls.filter((c) => c.path === '/api/domains/register.json').length, 1);
});

test('transfer in: needs setting + confirmation + code, creates a pending domain at the provider', async () => {
  const body = { name: 'moving-in.com', provider: 'namecheap', epp: 'AUTH123', uid: clientId, years: 1 };
  assert.equal((await admin.call('admin/domain-transfer', body)).status, 422, 'no confirmation');
  assert.equal((await admin.call('admin/domain-transfer', { ...body, epp: '', confirm: true })).status, 422, 'needs the EPP code');
  assert.equal((await admin.call('admin/domain-transfer', { ...body, provider: 'hostinger', confirm: true })).status, 422, 'hostinger cannot');
  const r = await admin.call('admin/domain-transfer', { ...body, confirm: true });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.domain.status, 'pending'); assert.equal(r.json.domain.provider, 'namecheap');
  assert.equal(P.calls.find((c) => c.Command === 'namecheap.domains.transfer.create').EPPCode, 'AUTH123');
  assert.equal((await admin.call('admin/domain-transfer', { ...body, confirm: true })).status, 409, 'already exists');
  assert.equal((await client.call('admin/domain-transfer', { ...body, name: 'x.com', confirm: true })).status, 403);
});

test('hostinger: nameservers and lock; renewing is refused with a pointer to hPanel', async () => {
  const i = (await admin.call('admin/domain-registrar', undefined, { id: hs.id })).json;
  assert.deepEqual(i.info.ns, ['ns1.dns-parking.com', 'ns2.dns-parking.com']); assert.equal(i.caps.renew, false);
  assert.equal((await admin.call('admin/domain-registrar', { id: hs.id, action: 'setns', ns: ['ns1.h.com', 'ns2.h.com'] })).status, 200);
  assert.deepEqual(P.state.hsNs, ['ns1.h.com', 'ns2.h.com']);
  assert.equal((await admin.call('admin/domain-registrar', { id: hs.id, action: 'setlock', lock: true })).status, 200); assert.equal(P.state.hsLock, true);
  const rn = await admin.call('admin/domain-registrar', { id: hs.id, action: 'renew', years: 1, confirm: true });
  assert.equal(rn.status, 502); assert.match(rn.json.error, /hPanel/);
});
