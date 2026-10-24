import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN, CLIENT, readMail, startServer, wait } from './helpers.mjs';
import { startProviders } from './mock-providers.mjs';

let S, P, admin, client, clientId, cronKey;
before(async () => {
  P = await startProviders();
  S = await startServer({ meta: { gateways: { stripe: { enabled: true, secret: 'sk_test', webhook: 'whsec_x', base: P.url } }, autoActivate: false } });
  admin = S.client(); client = S.client();
  await admin.login(ADMIN.email, ADMIN.password);
  clientId = (await client.call('auth/register', { name: CLIENT.name, email: CLIENT.email, password: CLIENT.password })).json.user.id;
  cronKey = (await admin.call('admin/settings')).json.cronKey;
});
after(() => { S.stop(); P.stop(); });

const renewalOrder = async (name, expires) => {
  const d = (await admin.call('admin/item-save', { item: { uid: clientId, name, status: 'active', expires, autoRenew: true, price: 300 } }, { res: 'domains' })).json.item;
  await S.client().call('cron/run', undefined, { key: cronKey }); // the daily job opens the renewal order
  const orders = (await admin.call('admin/items', undefined, { res: 'orders' })).json.items;
  return { d, o: orders.find((o) => o.lines.some((l) => l.ref === 'domains:' + d.id)) };
};
const soon = () => new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);

test('cards: setup returns the hosted page, confirm reads the session from Stripe and stores only brand / last 4 / expiry', async () => {
  const me0 = (await client.call('me/data')).json;
  assert.equal(me0.cardsAvailable, true); assert.equal(me0.card, null);
  const s = await client.call('cards/setup', {});
  assert.equal(s.status, 200); assert.match(s.json.url, /checkout\.stripe\.test/);
  const form = P.calls.find((c) => c.path === '/v1/checkout/sessions' && c.method === 'POST');
  assert.equal(form.mode, 'setup'); assert.equal(form.customer, 'cus_1'); assert.match(form.success_url, /\/#\/portal\/billing\?card=/);
  assert.equal((await client.call('cards/confirm', { session: 'bad session' })).status, 502);
  const c = await client.call('cards/confirm', { session: 'cs_test_1' });
  assert.equal(c.status, 200); assert.deepEqual(c.json.card, { brand: 'visa', last4: '4242', exp: '04/30', autopay: true });
  const me = (await client.call('me/data')).json;
  assert.equal(me.card.last4, '4242'); assert.ok(!JSON.stringify(me).includes('pm_1'), 'the Stripe reference never reaches the browser');
  // another account cannot claim this session
  const other = S.client(); await other.call('auth/register', { name: 'O', email: 'o@test.local', password: 'Other#12345' });
  await other.call('cards/setup', {});
  P.state.stripeCustomer = 'cus_someone_else';
  assert.equal((await other.call('cards/confirm', { session: 'cs_test_1' })).status, 502);
  delete P.state.stripeCustomer;
});

test('autopay: the daily job charges the saved card for a renewal order, marks it paid and mails the client', async () => {
  const { o } = await renewalOrder('pay-me.com', soon());
  assert.ok(o, 'a renewal order was opened'); 
  const refreshed = (await admin.call('admin/items', undefined, { res: 'orders' })).json.items.find((x) => x.id === o.id);
  assert.equal(refreshed.status, 'paid', JSON.stringify(refreshed.payRef));
  assert.match(refreshed.payRef, /^stripe-autopay:pi_/);
  const pi = P.calls.filter((c) => c.path === '/v1/payment_intents').pop();
  assert.equal(pi.amount, String(Math.round(o.total * 100))); assert.equal(pi.off_session, 'true'); assert.equal(pi.confirm, 'true'); assert.equal(pi.payment_method, 'pm_1'); assert.equal(pi.customer, 'cus_1');
  await wait(150);
  const mail = S.mails.map(readMail).find((m) => /Automatic payment/.test(m.subject));
  assert.ok(mail && mail.to[0] === CLIENT.email);
  // not charged twice by a second run
  const before = P.calls.filter((c) => c.path === '/v1/payment_intents').length;
  await S.client().call('cron/run', undefined, { key: cronKey });
  assert.equal(P.calls.filter((c) => c.path === '/v1/payment_intents').length, before);
});

test('autopay: a declined card is retried once a day up to 3 times, the client is told, and nothing is marked paid', async () => {
  P.state.piFail = true;
  const { o } = await renewalOrder('decline-me.com', soon());
  let cur = (await admin.call('admin/items', undefined, { res: 'orders' })).json.items.find((x) => x.id === o.id);
  assert.equal(cur.status, 'pending'); assert.equal(cur.autopay.tries, 1); assert.match(cur.autopay.error, /declined/);
  await S.client().call('cron/run', undefined, { key: cronKey });
  cur = (await admin.call('admin/items', undefined, { res: 'orders' })).json.items.find((x) => x.id === o.id);
  assert.equal(cur.autopay.tries, 1, 'only one attempt per day');
  await wait(150);
  const m = S.mails.map(readMail).find((x) => /could not charge your card/.test(x.subject));
  assert.ok(m && /declined/.test(m.body) && /try again tomorrow/.test(m.body));
  P.state.piFail = false;
});

test('autopay off or card removed: no charge', async () => {
  assert.equal((await client.call('cards/autopay', { on: false })).status, 200);
  const before = P.calls.filter((c) => c.path === '/v1/payment_intents').length;
  P.state.piFail = false;
  const { o } = await renewalOrder('manual-pay.com', soon());
  assert.equal(P.calls.filter((c) => c.path === '/v1/payment_intents').length, before);
  assert.equal((await admin.call('admin/items', undefined, { res: 'orders' })).json.items.find((x) => x.id === o.id).status, 'pending');
  assert.equal((await client.call('cards/remove', {})).status, 200);
  assert.equal((await client.call('me/data')).json.card, null);
  assert.ok(P.calls.some((c) => c.path === '/v1/payment_methods/pm_1/detach'));
});
