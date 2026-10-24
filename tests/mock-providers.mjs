// A stand-in for the registrar APIs (Namecheap XML, ResellerClub JSON, Hostinger JSON). Every call is recorded in `calls`.
import { createServer } from 'node:http';

export async function startProviders() {
  const calls = [];
  const state = { ncLock: 'false', ncDefault: false, ncNs: ['dns1.old.com', 'dns2.old.com'], rcNs: ['ns1.old.net', 'ns2.old.net'], rcLocked: false, rcRecords: [{ type: 'A', name: 'www.rc-example.com', value: '1.1.1.1', timetolive: 3600 }, { type: 'A', name: 'gone.rc-example.com', value: '9.9.9.9', timetolive: 3600 }], hsNs: ['ns1.dns-parking.com', 'ns2.dns-parking.com'], hsLock: false };
  const xml = (inner) => `<?xml version="1.0"?><ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response"><Errors/><CommandResponse>${inner}</CommandResponse></ApiResponse>`;
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
  const srv = createServer((req, res) => {
    let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'); const q = Object.fromEntries(u.searchParams); const form = Object.fromEntries(new URLSearchParams(raw));
      const all = { ...q, ...form };
      calls.push({ method: req.method, path: u.pathname, ...all, ...(req.method !== 'GET' && raw.startsWith('{') ? { json: JSON.parse(raw) } : {}) });
      // ── Namecheap
      if (u.pathname === '/xml.response') {
        const c = q.Command;
        if (c === 'namecheap.domains.dns.getList') return send(res, 200, xml(`<DomainDNSGetListResult Domain="${q.SLD}.${q.TLD}" IsUsingOurDNS="${state.ncDefault}">${state.ncDefault ? '' : state.ncNs.map((n) => `<Nameserver>${n}</Nameserver>`).join('')}</DomainDNSGetListResult>`), 'application/xml');
        if (c === 'namecheap.domains.dns.setCustom') { state.ncDefault = false; state.ncNs = q.Nameservers.split(','); return send(res, 200, xml('<DomainDNSSetCustomResult Domain="x" Update="true"/>'), 'application/xml'); }
        if (c === 'namecheap.domains.dns.setDefault') { state.ncDefault = true; return send(res, 200, xml('<DomainDNSSetDefaultResult Domain="x" Updated="true"/>'), 'application/xml'); }
        if (c === 'namecheap.domains.getRegistrarLock') return send(res, 200, xml(`<DomainGetRegistrarLockResult Domain="x" RegistrarLockStatus="${state.ncLock}"/>`), 'application/xml');
        if (c === 'namecheap.domains.setRegistrarLock') { state.ncLock = q.LockAction === 'LOCK' ? 'true' : 'false'; return send(res, 200, xml('<DomainSetRegistrarLockResult Domain="x" IsSuccess="true"/>'), 'application/xml'); }
        if (c === 'namecheap.domains.renew') return send(res, 200, xml(`<DomainRenewResult DomainName="${q.DomainName}" Renew="true" ChargedAmount="11.98"><DomainDetails><ExpiredDate>12/31/2031</ExpiredDate></DomainDetails></DomainRenewResult>`), 'application/xml');
        if (c === 'namecheap.domains.transfer.create') return send(res, 200, xml(`<DomainTransferCreateResult DomainName="${q.DomainName}" Transfer="true" TransferID="77" ChargedAmount="9.99"/>`), 'application/xml');
        return send(res, 200, `<ApiResponse Status="ERROR"><Errors><Error>unknown command ${c}</Error></Errors></ApiResponse>`, 'application/xml');
      }
      // ── Stripe
      if (u.pathname.startsWith('/v1/')) {
        if (u.pathname === '/v1/customers') return send(res, 200, { id: 'cus_1' });
        if (u.pathname === '/v1/checkout/sessions' && req.method === 'POST') return send(res, 200, { id: 'cs_test_1', url: 'https://checkout.stripe.test/c/cs_test_1' });
        if (u.pathname === '/v1/checkout/sessions/cs_test_1') return send(res, 200, { id: 'cs_test_1', customer: state.stripeCustomer ?? 'cus_1', setup_intent: { status: 'succeeded', payment_method: { id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 4, exp_year: 2030 } } } });
        if (u.pathname === '/v1/payment_intents') return state.piFail ? send(res, 402, { error: { message: 'Your card was declined.' } }) : send(res, 200, { id: 'pi_' + calls.length, status: 'succeeded' });
        if (u.pathname === '/v1/payment_methods/pm_1/detach') return send(res, 200, { id: 'pm_1' });
        return send(res, 404, { error: { message: 'no route' } });
      }
      // ── Hostinger
      const hs = /^\/api\/domains\/v1\/portfolio\/([^/]+)(\/.*)?$/.exec(u.pathname);
      if (hs) {
        if (!hs[2] && req.method === 'GET') return send(res, 200, { domain: hs[1], name_servers: { ns1: state.hsNs[0], ns2: state.hsNs[1] }, domain_lock: state.hsLock, expires_at: '2027-02-02T00:00:00Z' });
        if (hs[2] === '/nameservers' && req.method === 'PUT') { const j = JSON.parse(raw); state.hsNs = [j.ns1, j.ns2].filter(Boolean); return send(res, 200, { message: 'ok' }); }
        if (hs[2] === '/domain-lock') { state.hsLock = req.method === 'PUT'; return send(res, 200, { message: 'ok' }); }
      }
      // ── ResellerClub
      if (u.pathname.startsWith('/api/')) {
        const p = u.pathname.slice(5);
        if (p === 'domains/orderid.json') return send(res, 200, '4242');
        if (p === 'domains/details.json') return send(res, 200, { ns1: state.rcNs[0], ns2: state.rcNs[1], orderstatus: state.rcLocked ? ['transferlock'] : [], endtime: String(Math.floor(Date.parse('2027-05-01') / 1000)), domsecret: 'EPP-SECRET-1' });
        if (p === 'domains/modify-ns.json') { state.rcNs = [all.ns1, all.ns2].filter(Boolean); return send(res, 200, { status: 'Success', actionstatus: 'Success' }); }
        if (p === 'domains/enable-theft-protection.json') { state.rcLocked = true; return send(res, 200, { status: 'Success' }); }
        if (p === 'domains/disable-theft-protection.json') { state.rcLocked = false; return send(res, 200, { status: 'Success' }); }
        if (p === 'domains/renew.json') return send(res, 200, { status: 'Success', sellingamount: '14.50' });
        if (p === 'customers/details.json') return send(res, 200, { status: 'ERROR', message: 'not found' });
        if (p === 'customers/v2/signup.json') return send(res, 200, '9001');
        if (p === 'contacts/add.json') return send(res, 200, '9002');
        if (p === 'domains/register.json') return send(res, 200, { entityid: '5555', actionstatus: 'Success', sellingamount: '12.00', status: 'Success' });
        if (p === 'domains/transfer.json') return send(res, 200, { entityid: '5556', actionstatus: 'InProgress', sellingamount: '12.00' });
        if (p === 'dns/activate.json') return send(res, 200, { status: 'Success' });
        if (p === 'dns/manage/search-records.json') { const rows = state.rcRecords.filter((r) => r.type === all.type); const o = { recsonpage: String(rows.length), recsindb: String(rows.length) }; rows.forEach((r, i) => (o[i + 1] = { name: r.name, type: r.type, value: r.value, timetolive: r.timetolive })); return send(res, 200, o); }
        const add = /^dns\/manage\/add-(\w+)-record\.json$/.exec(p); const del = /^dns\/manage\/delete-(\w+)-record\.json$/.exec(p);
        const T = { ipv4: 'A', ipv6: 'AAAA', cname: 'CNAME', mx: 'MX', txt: 'TXT', ns: 'NS' };
        if (add) { state.rcRecords.push({ type: T[add[1]], name: (all.host ? all.host + '.' : '') + all['domain-name'], value: all.value, timetolive: 3600 }); return send(res, 200, { status: 'Success' }); }
        if (del) { const full = (all.host ? all.host + '.' : '') + all['domain-name']; state.rcRecords = state.rcRecords.filter((r) => !(r.type === T[del[1]] && r.name === full && r.value === all.value)); return send(res, 200, { status: 'Success' }); }
        return send(res, 404, { status: 'ERROR', message: 'unknown ' + p });
      }
      send(res, 404, { message: 'no route' });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  return { url: `http://127.0.0.1:${port}`, calls, state, stop: () => srv.close() };
}
