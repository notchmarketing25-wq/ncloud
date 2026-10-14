<?php
/**
 * Provider apps: Hostinger, Namecheap and ResellerClub.
 * Each adapter turns the provider's own API into the same few shapes:
 *   domains  [{name, expires, status, autoRenew}]
 *   tlds     {tld: {register, renew, transfer, currency}}
 *   check    [{domain, available}]
 *   hosting  [{ref, kind, plan, domain, status, expires, cost, billing, currency}]
 * Keys never leave the server: the admin API only returns masked values.
 */

/* ───────── definitions ───────── */
function prov_defs() {
    return array(
        'hostinger' => array(
            'name' => 'Hostinger',
            'caps' => array('domains', 'tlds', 'check', 'hosting', 'dns'),
            'base' => 'https://developers.hostinger.com',
            'fields' => array('token' => array('API token', true)),
            'help' => array('hPanel → Account → API → create a token', 'hPanel ← Account ← API ← أنشئ Token'),
        ),
        'namecheap' => array(
            'name' => 'Namecheap',
            'caps' => array('domains', 'tlds', 'check', 'dns'),
            'base' => 'https://api.namecheap.com',
            'sandbox' => 'https://api.sandbox.namecheap.com',
            'fields' => array('apiUser' => array('API user', false), 'apiKey' => array('API key', true), 'username' => array('Username (usually the same as API user)', false), 'clientIp' => array('Whitelisted server IP', false)),
            'help' => array('Profile → Tools → Namecheap API Access: turn it on and whitelist this server’s IP', 'Profile ← Tools ← Namecheap API Access: فعّله وأضف IP السيرفر ده في القائمة البيضاء'),
        ),
        'resellerclub' => array(
            'name' => 'ResellerClub',
            'caps' => array('domains', 'tlds', 'check', 'dnsread'),
            'base' => 'https://httpapi.com',
            'sandbox' => 'https://test.httpapi.com',
            'fields' => array('userId' => array('Reseller ID (auth-userid)', false), 'apiKey' => array('API key', true)),
            'help' => array('Settings → API: copy your Reseller ID and key, and whitelist the server IP', 'Settings ← API: انسخ Reseller ID والمفتاح وأضف IP السيرفر'),
        ),
    );
}
function prov_cfg_all($db) { $m = meta_get($db, 'providers', array()); return is_array($m) ? $m : array(); }
function prov_cfg($db, $id) { $a = prov_cfg_all($db); return isset($a[$id]) && is_array($a[$id]) ? $a[$id] : array(); }
function prov_has_keys($id, $cfg) {
    $defs = prov_defs();
    if (!isset($defs[$id])) { return false; }
    foreach (array_keys($defs[$id]['fields']) as $k) { if (empty($cfg[$k])) { return false; } }
    return true;
}
function prov_base($id, $cfg) {
    $d = prov_defs(); $d = $d[$id];
    if (!empty($cfg['baseUrl'])) { return rtrim($cfg['baseUrl'], '/'); }
    if (!empty($cfg['sandbox']) && isset($d['sandbox'])) { return $d['sandbox']; }
    return $d['base'];
}

/* ───────── http ───────── */
/** Returns array(status, body). Throws on transport errors; the message never contains the request URL (it may carry keys). */
function prov_http($method, $url, $headers, $body = null) {
    $headers = array_merge(array('Accept: application/json', 'User-Agent: NotchCloud/1.0'), $headers);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_HTTPHEADER => $headers, CURLOPT_FOLLOWLOCATION => false));
        if ($body !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, $body); }
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) { throw new Exception('could not reach the provider (' . preg_replace('#https?://\S+#', '', $err) . ')'); }
        return array($status, (string) $raw);
    }
    $ctx = stream_context_create(array('http' => array('method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body === null ? '' : $body, 'timeout' => 25, 'ignore_errors' => true)));
    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) { throw new Exception('could not reach the provider (enable the PHP curl extension)'); }
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m)) { $status = (int) $m[1]; }
    return array($status, (string) $raw);
}
function prov_json($status, $raw, $what) {
    $j = json_decode($raw, true);
    if ($status === 401 || $status === 403) { throw new Exception($what . ': the key was rejected (HTTP ' . $status . ') — check the key and any IP whitelist'); }
    if ($status >= 400) {
        $msg = is_array($j) ? (isset($j['message']) ? $j['message'] : (isset($j['error']) ? (is_string($j['error']) ? $j['error'] : json_encode($j['error'])) : '')) : '';
        throw new Exception($what . ': HTTP ' . $status . ($msg !== '' ? ' — ' . clean_text($msg, 160) : ''));
    }
    if (!is_array($j)) { throw new Exception($what . ': unexpected answer (not JSON)'); }
    return $j;
}
function prov_rows($j) { // a list, or {data:[...]}
    if (isset($j['data']) && is_array($j['data'])) { return $j['data']; }
    return $j;
}
function prov_date($s) {
    $s = trim((string) $s);
    if ($s === '') { return ''; }
    if (ctype_digit($s)) { return gmdate('Y-m-d', (int) $s > 99999999999 ? (int) ((int) $s / 1000) : (int) $s); }
    if (preg_match('#^(\d{2})/(\d{2})/(\d{4})#', $s, $m)) { return $m[3] . '-' . $m[1] . '-' . $m[2]; } // Namecheap MM/DD/YYYY
    $t = strtotime($s);
    return $t ? gmdate('Y-m-d', $t) : '';
}
function prov_num($v) { return is_numeric($v) ? (float) $v : null; }

/* ───────── Hostinger ───────── */
function hostinger_call($cfg, $method, $path, $body = null) {
    list($st, $raw) = prov_http($method, prov_base('hostinger', $cfg) . $path, array('Authorization: Bearer ' . $cfg['token'], 'Content-Type: application/json'), $body === null ? null : json_encode($body));
    return prov_json($st, $raw, 'Hostinger');
}
function hostinger_test($cfg) { hostinger_call($cfg, 'GET', '/api/domains/v1/portfolio'); return 'Connected to Hostinger'; }
function hostinger_domains($cfg) {
    $o = array();
    foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/domains/v1/portfolio')) as $d) {
        if (!is_array($d)) { continue; }
        $name = isset($d['domain']) ? $d['domain'] : (isset($d['name']) ? $d['name'] : '');
        if ($name === '') { continue; }
        $o[] = array('name' => strtolower($name), 'expires' => prov_date(isset($d['expires_at']) ? $d['expires_at'] : ''), 'status' => 'active', 'autoRenew' => !empty($d['is_auto_renewed']) || !empty($d['auto_renew']));
    }
    return $o;
}
function hostinger_tlds($cfg) {
    $o = array();
    foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/billing/v1/catalog?category=DOMAIN')) as $it) {
        if (!is_array($it) || empty($it['prices'])) { continue; }
        $label = isset($it['name']) ? $it['name'] : (isset($it['id']) ? $it['id'] : '');
        if (!preg_match('/\.([a-z0-9][a-z0-9.\-]*)/i', $label, $m)) { continue; }
        $tld = strtolower(rtrim($m[1], '.'));
        foreach ($it['prices'] as $p) {
            $unit = isset($p['period_unit']) ? strtolower($p['period_unit']) : 'year';
            if ((int) (isset($p['period']) ? $p['period'] : 1) !== 1 || $unit !== 'year') { continue; }
            $renew = prov_num(isset($p['price']) ? $p['price'] : null);
            $first = prov_num(isset($p['first_period_price']) ? $p['first_period_price'] : null);
            if ($renew === null && $first === null) { continue; }
            $o[$tld] = array('register' => ($first !== null ? $first : $renew) / 100, 'renew' => ($renew !== null ? $renew : $first) / 100, 'transfer' => ($renew !== null ? $renew : $first) / 100, 'currency' => isset($p['currency']) ? strtoupper($p['currency']) : 'USD');
            break;
        }
    }
    return $o;
}
function hostinger_check($cfg, $name, $tlds) {
    $o = array();
    $j = hostinger_call($cfg, 'POST', '/api/domains/v1/availability', array('domain' => $name, 'tlds' => array_values($tlds), 'with_alternatives' => false));
    foreach (prov_rows($j) as $r) {
        if (!is_array($r) || empty($r['domain'])) { continue; }
        $o[] = array('domain' => strtolower($r['domain']), 'available' => !empty($r['is_available']));
    }
    return $o;
}
function hostinger_hosting($cfg) {
    $o = array();
    foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/billing/v1/subscriptions')) as $s) {
        if (!is_array($s)) { continue; }
        $period = (int) (isset($s['billing_period']) ? $s['billing_period'] : 1);
        $unit = strtolower(isset($s['billing_period_unit']) ? $s['billing_period_unit'] : 'month');
        $months = $period * ($unit === 'year' ? 12 : 1);
        $price = prov_num(isset($s['renewal_price']) ? $s['renewal_price'] : (isset($s['total_price']) ? $s['total_price'] : null));
        $o[] = array('ref' => (string) (isset($s['id']) ? $s['id'] : ''), 'kind' => 'subscription', 'plan' => clean_text(isset($s['name']) ? $s['name'] : 'Hostinger', 60), 'domain' => '',
            'status' => (isset($s['status']) && strtolower($s['status']) === 'active') ? 'active' : 'pending', 'expires' => prov_date(isset($s['next_billing_at']) ? $s['next_billing_at'] : (isset($s['expires_at']) ? $s['expires_at'] : '')),
            'cost' => $price === null ? 0 : round($price / 100, 2), 'billing' => $months >= 12 ? 'yearly' : 'monthly', 'currency' => strtoupper(isset($s['currency_code']) ? $s['currency_code'] : 'USD'));
    }
    try {
        foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/hosting/v1/websites')) as $w) {
            if (!is_array($w) || empty($w['domain'])) { continue; }
            $o[] = array('ref' => 'site:' . $w['domain'], 'kind' => 'website', 'plan' => 'Website', 'domain' => strtolower($w['domain']), 'status' => (isset($w['is_enabled']) && !$w['is_enabled']) ? 'stopped' : 'active', 'expires' => '', 'cost' => 0, 'billing' => 'monthly', 'currency' => 'USD');
        }
    } catch (Exception $e) { /* websites are a bonus: subscriptions alone are still useful */ }
    return $o;
}

/* ───────── Namecheap (XML) ───────── */
function namecheap_call($cfg, $command, $params = array()) {
    if (!function_exists('simplexml_load_string')) { throw new Exception('Namecheap: the PHP SimpleXML extension is required'); }
    $q = http_build_query(array_merge(array('ApiUser' => $cfg['apiUser'], 'ApiKey' => $cfg['apiKey'], 'UserName' => !empty($cfg['username']) ? $cfg['username'] : $cfg['apiUser'], 'ClientIp' => $cfg['clientIp'], 'Command' => $command), $params));
    list($st, $raw) = prov_http('GET', prov_base('namecheap', $cfg) . '/xml.response?' . $q, array('Accept: application/xml'));
    $raw = preg_replace('/ xmlns="[^"]+"/', '', $raw);
    $x = @simplexml_load_string($raw);
    if (!$x) { throw new Exception('Namecheap: unexpected answer (HTTP ' . $st . ')'); }
    if ((string) $x['Status'] !== 'OK') {
        $e = isset($x->Errors->Error) ? trim((string) $x->Errors->Error[0]) : 'request failed';
        throw new Exception('Namecheap: ' . clean_text($e, 180));
    }
    return $x;
}
function namecheap_test($cfg) { namecheap_call($cfg, 'namecheap.users.getBalances'); return 'Connected to Namecheap'; }
function namecheap_domains($cfg) {
    $o = array();
    for ($page = 1; $page <= 10; $page++) {
        $x = namecheap_call($cfg, 'namecheap.domains.getList', array('PageSize' => 100, 'Page' => $page));
        $n = 0;
        foreach ($x->CommandResponse->DomainGetListResult->Domain as $d) {
            $n++;
            $o[] = array('name' => strtolower((string) $d['Name']), 'expires' => prov_date((string) $d['Expires']), 'status' => ((string) $d['IsExpired'] === 'true') ? 'stopped' : 'active', 'autoRenew' => (string) $d['AutoRenew'] === 'true');
        }
        if ($n < 100) { break; }
    }
    return $o;
}
function namecheap_tlds($cfg) {
    $o = array();
    foreach (array('register' => 'REGISTER', 'renew' => 'RENEW', 'transfer' => 'TRANSFER') as $field => $action) {
        $x = namecheap_call($cfg, 'namecheap.users.getPricing', array('ProductType' => 'DOMAIN', 'ProductCategory' => 'DOMAINS', 'ActionName' => $action));
        foreach ($x->xpath('//ProductCategory/Product') as $p) {
            $tld = strtolower((string) $p['Name']);
            foreach ($p->Price as $pr) {
                if ((string) $pr['Duration'] !== '1' || strtoupper((string) $pr['DurationType']) !== 'YEAR') { continue; }
                $v = isset($pr['YourPrice']) && (string) $pr['YourPrice'] !== '' ? (float) $pr['YourPrice'] : (float) $pr['Price'];
                if (!isset($o[$tld])) { $o[$tld] = array('register' => null, 'renew' => null, 'transfer' => null, 'currency' => ((string) $pr['Currency']) ?: 'USD'); }
                $o[$tld][$field] = $v;
                break;
            }
        }
    }
    foreach ($o as $t => $v) { if ($v['register'] === null) { unset($o[$t]); continue; } foreach (array('renew', 'transfer') as $f) { if ($o[$t][$f] === null) { $o[$t][$f] = $v['register']; } } }
    return $o;
}
function namecheap_check($cfg, $name, $tlds) {
    $list = array();
    foreach ($tlds as $t) { $list[] = $name . '.' . $t; }
    $o = array();
    foreach (array_chunk($list, 50) as $chunk) {
        $x = namecheap_call($cfg, 'namecheap.domains.check', array('DomainList' => implode(',', $chunk)));
        foreach ($x->CommandResponse->DomainCheckResult as $r) { $o[] = array('domain' => strtolower((string) $r['Domain']), 'available' => (string) $r['Available'] === 'true' && (string) $r['IsPremiumName'] !== 'true'); }
    }
    return $o;
}

/* ───────── ResellerClub / LogicBoxes ───────── */
function resellerclub_call($cfg, $path, $params = array(), $raw = '') {
    $q = http_build_query(array_merge(array('auth-userid' => $cfg['userId'], 'api-key' => $cfg['apiKey']), $params)) . $raw;
    list($st, $body) = prov_http('GET', prov_base('resellerclub', $cfg) . '/api/' . $path . '?' . $q, array());
    $j = json_decode($body, true);
    if (is_array($j) && isset($j['status']) && strtolower((string) $j['status']) === 'error') { throw new Exception('ResellerClub: ' . clean_text(isset($j['message']) ? $j['message'] : 'request failed', 180)); }
    return prov_json($st, $body, 'ResellerClub');
}
function resellerclub_test($cfg) { resellerclub_call($cfg, 'domains/search.json', array('no-of-records' => 1, 'page-no' => 1)); return 'Connected to ResellerClub'; }
function resellerclub_domains($cfg) {
    $o = array();
    for ($page = 1; $page <= 10; $page++) {
        $j = resellerclub_call($cfg, 'domains/search.json', array('no-of-records' => 50, 'page-no' => $page));
        $n = 0;
        foreach ($j as $k => $d) {
            if (!is_array($d) || !ctype_digit((string) $k) || empty($d['entity.description'])) { continue; }
            $n++;
            $st = isset($d['orders.currentstatus']) ? strtolower((string) $d['orders.currentstatus']) : 'active';
            $o[] = array('name' => strtolower($d['entity.description']), 'expires' => prov_date(isset($d['orders.endtime']) ? $d['orders.endtime'] : ''), 'status' => $st === 'active' ? 'active' : ($st === 'inactive' ? 'pending' : 'stopped'), 'autoRenew' => false);
        }
        if ($n < 50) { break; }
    }
    return $o;
}
/** Product keys differ from TLDs for the big ones (domcno = .com). Everything else is "dot" + the TLD. */
function resellerclub_tld_of($key) {
    $known = array('domcno' => 'com', 'dotnet' => 'net', 'domorg' => 'org', 'dominfo' => 'info', 'dombiz' => 'biz', 'dotco' => 'co', 'dotme' => 'me', 'dotus' => 'us', 'dotin' => 'in');
    if (isset($known[$key])) { return $known[$key]; }
    return preg_match('/^dot([a-z0-9]{2,20})$/', $key, $m) ? $m[1] : null;
}
function resellerclub_tlds($cfg) {
    $j = resellerclub_call($cfg, 'products/reseller-price.json');
    $o = array();
    foreach ($j as $key => $p) {
        $tld = resellerclub_tld_of((string) $key);
        if ($tld === null || !is_array($p) || !isset($p['addnewdomain']['1'])) { continue; }
        $reg = prov_num($p['addnewdomain']['1']);
        if ($reg === null) { continue; }
        $renew = isset($p['renewdomain']['1']) ? prov_num($p['renewdomain']['1']) : null;
        $tr = isset($p['addtransferdomain']['1']) ? prov_num($p['addtransferdomain']['1']) : null;
        $o[$tld] = array('register' => $reg, 'renew' => $renew === null ? $reg : $renew, 'transfer' => $tr === null ? $reg : $tr, 'currency' => 'USD');
    }
    return $o;
}
function resellerclub_check($cfg, $name, $tlds) {
    $raw = '';
    foreach ($tlds as $t) { $raw .= '&tlds=' . rawurlencode($t); }
    $j = resellerclub_call($cfg, 'domains/available.json', array('domain-name' => $name), $raw);
    $o = array();
    foreach ($j as $dom => $r) { if (is_array($r) && isset($r['status'])) { $o[] = array('domain' => strtolower($dom), 'available' => strtolower((string) $r['status']) === 'available'); } }
    return $o;
}


/* ───────── DNS: read (all three) and write (Hostinger, Namecheap) ─────────
 * Records are {type, host, value, ttl}. MX values read "10 mail.example.com" (priority first). */
function dns_group($records) {
    $g = array();
    foreach ($records as $r) { $k = $r['host'] . '|' . $r['type'] . '|' . $r['ttl']; $g[$k]['host'] = $r['host']; $g[$k]['type'] = $r['type']; $g[$k]['ttl'] = (int) $r['ttl']; $g[$k]['values'][] = $r['value']; }
    return array_values($g);
}
function hostinger_dns_get($cfg, $domain) {
    $o = array();
    foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/dns/v1/zones/' . rawurlencode($domain))) as $z) {
        if (!is_array($z) || empty($z['type'])) { continue; }
        $type = strtoupper($z['type']);
        if (!in_array($type, array('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'), true)) { continue; }
        foreach (isset($z['records']) && is_array($z['records']) ? $z['records'] : array() as $rec) {
            $v = is_array($rec) ? (isset($rec['content']) ? $rec['content'] : '') : (string) $rec;
            if ($v === '') { continue; }
            $o[] = array('type' => $type, 'host' => isset($z['name']) && $z['name'] !== '' ? $z['name'] : '@', 'value' => $v, 'ttl' => (int) (isset($z['ttl']) ? $z['ttl'] : 3600));
        }
    }
    return $o;
}
function hostinger_dns_set($cfg, $domain, $records) {
    $zone = array();
    foreach (dns_group($records) as $g) {
        $zone[] = array('name' => $g['host'], 'type' => $g['type'], 'ttl' => $g['ttl'], 'records' => array_map(function ($v) { return array('content' => $v); }, $g['values']));
    }
    hostinger_call($cfg, 'PUT', '/api/dns/v1/zones/' . rawurlencode($domain), array('overwrite' => true, 'zone' => $zone));
}
function nc_split_domain($domain) { $p = explode('.', $domain, 2); return array($p[0], isset($p[1]) ? $p[1] : ''); }
function namecheap_dns_get($cfg, $domain) {
    list($sld, $tld) = nc_split_domain($domain);
    $x = namecheap_call($cfg, 'namecheap.domains.dns.getHosts', array('SLD' => $sld, 'TLD' => $tld));
    $o = array();
    foreach ($x->CommandResponse->DomainDNSGetHostsResult->host as $h) {
        $type = strtoupper((string) $h['Type']);
        if (!in_array($type, array('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'CAA'), true)) { continue; }
        $v = (string) $h['Address'];
        if ($type === 'MX') { $v = ((string) $h['MXPref'] !== '' ? (string) $h['MXPref'] : '10') . ' ' . $v; }
        $o[] = array('type' => $type, 'host' => (string) $h['Name'] ?: '@', 'value' => $v, 'ttl' => (int) ((string) $h['TTL'] ?: 1800));
    }
    return $o;
}
function namecheap_dns_set($cfg, $domain, $records) {
    list($sld, $tld) = nc_split_domain($domain);
    $p = array('SLD' => $sld, 'TLD' => $tld);
    $i = 0;
    foreach ($records as $r) {
        $i++;
        $v = $r['value']; $pref = '';
        if ($r['type'] === 'MX' && preg_match('/^(\d+)\s+(\S+)$/', $v, $m)) { $pref = $m[1]; $v = $m[2]; } elseif ($r['type'] === 'MX') { $pref = '10'; }
        $p['HostName' . $i] = $r['host']; $p['RecordType' . $i] = $r['type']; $p['Address' . $i] = $v; $p['TTL' . $i] = max(60, min(60000, (int) $r['ttl']));
        if ($pref !== '') { $p['MXPref' . $i] = $pref; }
    }
    if ($i === 0) { throw new Exception('Namecheap: refusing to save an empty record list'); }
    $x = namecheap_call($cfg, 'namecheap.domains.dns.setHosts', $p);
    if ((string) $x->CommandResponse->DomainDNSSetHostsResult['IsSuccess'] !== 'true') { throw new Exception('Namecheap: the records were not accepted'); }
}
function resellerclub_dns_get($cfg, $domain) {
    $o = array(); $firstErr = null; $okAny = false;
    foreach (array('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS') as $type) {
        try {
            $j = resellerclub_call($cfg, 'dns/manage/search-records.json', array('domain-name' => $domain, 'type' => $type, 'no-of-records' => 50, 'page-no' => 1));
            $okAny = true;
            foreach ($j as $k => $r) {
                if (!is_array($r) || !ctype_digit((string) $k) || !isset($r['value'])) { continue; }
                $v = (string) $r['value'];
                if ($type === 'MX') { $v = (isset($r['priority']) ? $r['priority'] : '10') . ' ' . $v; }
                $host = isset($r['name']) ? (string) $r['name'] : '@';
                if (substr($host, -strlen($domain)) === $domain) { $host = rtrim(substr($host, 0, -strlen($domain)), '.'); }
                $o[] = array('type' => $type, 'host' => $host === '' ? '@' : $host, 'value' => $v, 'ttl' => (int) (isset($r['timetolive']) ? $r['timetolive'] : 3600));
            }
        } catch (Exception $e) { if ($firstErr === null) { $firstErr = $e; } }
    }
    if (!$okAny && $firstErr) { throw $firstErr; }
    return $o;
}
function dns_can_write($id) { return in_array($id, array('hostinger', 'namecheap'), true); }
function dns_clean($records) {
    $o = array();
    foreach ($records as $r) { $o[] = array('id' => new_id(), 'type' => $r['type'], 'host' => clean_text($r['host'], 253) ?: '@', 'value' => clean_text($r['value'], 500), 'ttl' => in_array((int) $r['ttl'], array(300, 3600, 14400, 86400), true) ? (int) $r['ttl'] : (int) $r['ttl']); }
    return array_slice($o, 0, 200);
}

/* ───────── dispatch ───────── */
function prov_run($id, $fn, $db) {
    $cfg = prov_cfg($db, $id);
    if (!prov_has_keys($id, $cfg)) { throw new Exception(prov_name($id) . ' is not connected'); }
    $f = $id . '_' . $fn;
    $args = array_slice(func_get_args(), 3);
    return call_user_func_array($f, array_merge(array($cfg), $args));
}
function prov_name($id) { $d = prov_defs(); return isset($d[$id]) ? $d[$id]['name'] : $id; }
function prov_id() { $d = prov_defs(); $id = isset($_GET['id']) ? (string) $_GET['id'] : ''; if (!isset($d[$id])) { fail('unknown provider', 404); } return $id; }

/* ───────── pricing ───────── */
function prov_pricing_defaults() { return array('marginPct' => 30, 'rounding' => 5, 'rates' => array('USD' => 50, 'EUR' => 55), 'tldMargins' => new stdClass(), 'tldProfits' => new stdClass(), 'selected' => array(), 'popular' => array('com', 'net', 'org', 'info', 'store', 'online', 'site', 'xyz', 'co', 'io', 'app', 'tech', 'shop')); }
function prov_pricing($db) {
    $p = meta_get($db, 'pricing', array());
    $d = prov_pricing_defaults();
    $out = array_merge($d, is_array($p) ? $p : array());
    $out['rates'] = array_merge($d['rates'], isset($p['rates']) && is_array($p['rates']) ? $p['rates'] : array());
    $out['tldMargins'] = isset($p['tldMargins']) && is_array($p['tldMargins']) ? $p['tldMargins'] : array();
    $out['tldProfits'] = isset($p['tldProfits']) && is_array($p['tldProfits']) ? $p['tldProfits'] : array();
    $out['selected'] = isset($p['selected']) && is_array($p['selected']) ? array_values($p['selected']) : array();
    return $out;
}
function prov_cache_file() { return NC_DATA . '/cache-tlds.json'; }
function prov_cache_read() { $f = prov_cache_file(); $j = is_file($f) ? json_decode(file_get_contents($f), true) : null; return is_array($j) ? $j : array('at' => '', 'providers' => array(), 'errors' => array()); }
function prov_cache_refresh($db) {
    $cache = array('at' => gmdate('c'), 'providers' => array(), 'errors' => array());
    foreach (prov_defs() as $id => $d) {
        if (!in_array('tlds', $d['caps'], true) || !prov_has_keys($id, prov_cfg($db, $id))) { continue; }
        try { $cache['providers'][$id] = prov_run($id, 'tlds', $db); } catch (Exception $e) { $cache['errors'][$id] = $e->getMessage(); }
    }
    @file_put_contents(prov_cache_file(), json_encode($cache), LOCK_EX);
    return $cache;
}
function prov_rate($pricing, $cur, $storeCur) {
    $cur = strtoupper($cur ?: 'USD');
    if ($cur === strtoupper($storeCur)) { return 1.0; }
    return isset($pricing['rates'][$cur]) ? (float) $pricing['rates'][$cur] : 1.0;
}
function prov_sell($cost, $margin, $rounding) {
    $v = $cost * (1 + $margin / 100);
    return $rounding > 0 ? ceil($v / $rounding) * $rounding : round($v, 2);
}
/** One row per TLD: every provider's price, the cheapest one, and what to charge. Money in the store currency. */
function prov_tld_table($db, $cache) {
    $pricing = prov_pricing($db);
    $store = meta_get($db, 'currency', '') ?: 'EGP';
    $rows = array();
    foreach ($cache['providers'] as $id => $tlds) {
        foreach ($tlds as $tld => $p) {
            $rate = prov_rate($pricing, $p['currency'], $store);
            $rows[$tld]['offers'][] = array('provider' => $id, 'currency' => $p['currency'], 'register' => $p['register'], 'renew' => $p['renew'], 'transfer' => $p['transfer'], 'costStore' => round($p['register'] * $rate, 2), 'renewStore' => round($p['renew'] * $rate, 2));
        }
    }
    $out = array();
    foreach ($rows as $tld => $r) {
        usort($r['offers'], function ($a, $b) { return $a['costStore'] <=> $b['costStore']; });
        $best = $r['offers'][0];
        $fixed = isset($pricing['tldProfits'][$tld]) ? (float) $pricing['tldProfits'][$tld] : null; // a fixed profit in store currency beats the percentage
        $margin = isset($pricing['tldMargins'][$tld]) ? (float) $pricing['tldMargins'][$tld] : (float) $pricing['marginPct'];
        if ($fixed !== null) {
            $sell = prov_sell($best['costStore'] + $fixed, 0, (float) $pricing['rounding']);
            $renewSell = prov_sell($best['renewStore'] + $fixed, 0, (float) $pricing['rounding']);
            $margin = $best['costStore'] > 0 ? round(($sell - $best['costStore']) / $best['costStore'] * 100, 1) : 0;
        } else {
            $sell = prov_sell($best['costStore'], $margin, (float) $pricing['rounding']);
            $renewSell = prov_sell($best['renewStore'], $margin, (float) $pricing['rounding']);
        }
        $out[] = array('tld' => $tld, 'offers' => $r['offers'], 'best' => $best['provider'], 'cost' => $best['costStore'], 'renewCost' => $best['renewStore'], 'marginPct' => $margin, 'custom' => isset($pricing['tldMargins'][$tld]), 'fixedProfit' => $fixed,
            'selected' => in_array($tld, $pricing['selected'], true), 'sell' => $sell, 'renewSell' => $renewSell, 'profit' => round($sell - $best['costStore'], 2), 'currency' => $store);
    }
    usort($out, function ($a, $b) use ($pricing) {
        if ($a['selected'] !== $b['selected']) { return $a['selected'] ? -1 : 1; }
        $pa = array_search($a['tld'], $pricing['popular']); $pb = array_search($b['tld'], $pricing['popular']);
        if ($pa !== false && $pb !== false) { return $pa <=> $pb; }
        if ($pa !== false) { return -1; } if ($pb !== false) { return 1; }
        return strcmp($a['tld'], $b['tld']);
    });
    return $out;
}

/** Availability through the cheapest provider of each TLD. $admin adds the cost and profit. */
function prov_search($db, $q, $tldsWanted, $admin) {
    $q = strtolower(trim($q));
    $q = preg_replace('#^https?://#', '', $q);
    $name = $q; $forced = null;
    if (strpos($q, '.') !== false) { $parts = explode('.', $q, 2); $name = $parts[0]; $forced = preg_replace('/[^a-z0-9.\-]/', '', $parts[1]); }
    $name = preg_replace('/[^a-z0-9\-]/', '', $name);
    if ($name === '' || strlen($name) > 63) { fail('enter a domain name to search', 422); }
    $cache = prov_cache_read();
    if (!$cache['providers']) { $cache = prov_cache_refresh($db); }
    $table = array();
    foreach (prov_tld_table($db, $cache) as $r) { if ($r['selected']) { $table[$r['tld']] = $r; } } // only extensions you chose to sell
    if (!$table) { fail('no extensions are enabled for sale yet — choose them in TLD pricing', 409); }
    $pricing = prov_pricing($db);
    $want = array();
    if ($forced && isset($table[$forced])) { $want[] = $forced; }
    foreach ($tldsWanted ?: array_keys($table) as $t) { $t = strtolower(trim($t)); if ($t !== '' && !in_array($t, $want, true)) { $want[] = $t; } }
    $byProv = array();
    foreach ($want as $t) { if (isset($table[$t])) { $byProv[$table[$t]['best']][] = $t; } }
    $results = array(); $errors = array();
    foreach ($byProv as $pid => $tlds) {
        try {
            foreach (prov_run($pid, 'check', $db, $name, array_slice($tlds, 0, 25)) as $r) {
                $tld = substr($r['domain'], strlen($name) + 1);
                if (!isset($table[$tld])) { continue; }
                $row = array('domain' => $r['domain'], 'tld' => $tld, 'available' => $r['available'], 'sell' => $table[$tld]['sell'], 'renewSell' => $table[$tld]['renewSell'], 'currency' => $table[$tld]['currency']);
                if ($admin) { $row += array('provider' => $pid, 'cost' => $table[$tld]['cost'], 'profit' => $table[$tld]['profit'], 'marginPct' => $table[$tld]['marginPct']); }
                $results[] = $row;
            }
        } catch (Exception $e) { $errors[$pid] = $admin ? $e->getMessage() : 'unavailable'; }
    }
    usort($results, function ($a, $b) use ($want) { return array_search($a['tld'], $want) <=> array_search($b['tld'], $want); });
    return array('query' => $name, 'results' => $results, 'errors' => $errors);
}

/** Cost of a domain/hosting in the store currency. */
function prov_to_store($db, $amount, $cur) { $p = prov_pricing($db); $store = meta_get($db, 'currency', '') ?: 'EGP'; return round($amount * prov_rate($p, $cur, $store), 2); }

/* ───────── routes ───────── */
function prov_masked($db) {
    $out = array();
    foreach (prov_defs() as $id => $d) {
        $cfg = prov_cfg($db, $id);
        $fields = array();
        foreach ($d['fields'] as $k => $f) { $fields[] = array('key' => $k, 'label' => $f[0], 'secret' => $f[1], 'value' => $f[1] ? '' : (isset($cfg[$k]) ? $cfg[$k] : ''), 'set' => !empty($cfg[$k])); }
        $out[] = array('id' => $id, 'name' => $d['name'], 'caps' => $d['caps'], 'help' => $d['help'], 'fields' => $fields, 'sandbox' => isset($d['sandbox']), 'useSandbox' => !empty($cfg['sandbox']),
            'baseUrl' => isset($cfg['baseUrl']) ? $cfg['baseUrl'] : '', 'connected' => prov_has_keys($id, $cfg), 'test' => isset($cfg['test']) ? $cfg['test'] : null);
    }
    return $out;
}

/** Handles every admin/provider*, admin/pricing* route; returns false when $r is not one of them. */
function prov_route($r, $me) {
    global $SCHEMA;
    $isPost = $_SERVER['REQUEST_METHOD'] === 'POST';
    switch ($r) {
        case 'admin/providers':
            if (!$isPost) { out(array('providers' => prov_masked(db_read()))); }
            require_post();
            $b = body();
            $id = isset($b['id']) ? (string) $b['id'] : '';
            $defs = prov_defs();
            if (!isset($defs[$id])) { fail('unknown provider', 404); }
            $in = isset($b['fields']) && is_array($b['fields']) ? $b['fields'] : array();
            $disconnect = !empty($b['disconnect']);
            $base = isset($b['baseUrl']) ? trim((string) $b['baseUrl']) : '';
            if ($base !== '' && !preg_match('#^(https://[A-Za-z0-9.\-]+(:\d+)?(/[^\s]*)?|http://(localhost|127\.0\.0\.1)(:\d+)?(/[^\s]*)?)$#', $base)) { fail('the API address must start with https://', 422); }
            db_update(function (&$db) use ($id, $defs, $in, $disconnect, $base, $b, $me) {
                $all = prov_cfg_all($db);
                if ($disconnect) { unset($all[$id]); log_act($db, $me, 'provider-disconnect', $id); }
                else {
                    $cfg = isset($all[$id]) ? $all[$id] : array();
                    foreach ($defs[$id]['fields'] as $k => $f) {
                        if (!array_key_exists($k, $in)) { continue; }
                        $v = trim((string) $in[$k]);
                        if ($v === '' && $f[1]) { continue; } // a blank secret keeps the saved one
                        $cfg[$k] = clean_text($v, 200);
                    }
                    $cfg['sandbox'] = !empty($b['useSandbox']);
                    $cfg['baseUrl'] = $base;
                    unset($cfg['test']);
                    $all[$id] = $cfg;
                    log_act($db, $me, 'provider-save', $id);
                }
                $db['meta']['providers'] = $all;
            });
            @unlink(prov_cache_file());
            out(array('providers' => prov_masked(db_read())));

        case 'admin/domain':
            need_admin(); $db = db_read();
            $id = isset($_GET['id']) ? (string) $_GET['id'] : '';
            $i = find_by(items_of($db, 'domains'), 'id', $id);
            if ($i < 0) { fail('domain not found', 404); }
            $d = $db['items']['domains'][$i];
            $name = strtolower($d['name']);
            $pv = isset($d['provider']) ? (string) $d['provider'] : '';
            $related = function ($res, $fn) use ($db) { return array_values(array_filter(items_of($db, $res), $fn)); };
            $under = function ($host) use ($name) { $host = strtolower((string) $host); return $host === $name || (strlen($host) > strlen($name) && substr($host, -strlen($name) - 1) === '.' . $name); };
            out(array('domain' => $d, 'owner' => (function ($uid) use ($db) { $u = find_user($db, 'id', $uid); return $u < 0 ? null : public_user($db['users'][$u]); })($d['uid']),
                'hosting' => $related('hosting', function ($h) use ($id, $under) { return (isset($h['domainId']) && $h['domainId'] === $id) || $under(isset($h['domain']) ? $h['domain'] : ''); }),
                'websites' => $related('websites', function ($w) use ($id, $under) { return (isset($w['domainId']) && $w['domainId'] === $id) || $under(isset($w['url']) ? $w['url'] : ''); }),
                'mailboxes' => $related('mailboxes', function ($m) use ($name) { return substr(strtolower($m['address']), -strlen($name) - 1) === '@' . $name; }),
                'canPull' => $pv !== '' && isset(prov_defs()[$pv]) && (in_array('dns', prov_defs()[$pv]['caps'], true) || in_array('dnsread', prov_defs()[$pv]['caps'], true)),
                'canPush' => dns_can_write($pv)));

        case 'admin/domain-dns':
            require_post();
            $b = body(); $id = isset($b['id']) ? (string) $b['id'] : ''; $action = isset($b['action']) ? (string) $b['action'] : '';
            $db = db_read();
            $i = find_by(items_of($db, 'domains'), 'id', $id);
            if ($i < 0) { fail('domain not found', 404); }
            $d = $db['items']['domains'][$i];
            $pid = isset($d['provider']) ? (string) $d['provider'] : '';
            if ($pid === '' || !isset(prov_defs()[$pid])) { fail('this domain has no provider — choose one in the domain details first', 422); }
            try {
                if ($action === 'pull') {
                    $recs = dns_clean(prov_run($pid, 'dns_get', $db, strtolower($d['name'])));
                    db_update(function (&$db) use ($id, $recs, $me, $d) {
                        $k = find_by(items_of($db, 'domains'), 'id', $id);
                        if ($k < 0) { return; }
                        $db['items']['domains'][$k]['dns'] = $recs; $db['items']['domains'][$k]['dnsSynced'] = true;
                        log_act($db, $me, 'dns-pull', $d['name'] . ' x' . count($recs));
                    });
                    out(array('ok' => true, 'records' => count($recs)));
                }
                if ($action === 'push') {
                    if (!dns_can_write($pid)) { fail(prov_name($pid) . ' DNS is read-only here — edit it at the provider', 422); }
                    $local = isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array();
                    prov_run($pid, 'dns_set', $db, strtolower($d['name']), $local);
                    db_update(function (&$db) use ($id, $me, $d, $local) {
                        $k = find_by(items_of($db, 'domains'), 'id', $id);
                        if ($k >= 0) { $db['items']['domains'][$k]['dnsSynced'] = true; }
                        log_act($db, $me, 'dns-push', $d['name'] . ' x' . count($local));
                    });
                    out(array('ok' => true, 'records' => count($local)));
                }
            } catch (Exception $e) { fail($e->getMessage(), 502); }
            fail('unknown action', 422);

        case 'admin/providers/test':
            require_post();
            $b = body(); $_GET['id'] = isset($b['id']) ? $b['id'] : ''; $id = prov_id();
            $db = db_read();
            $res = array('ok' => true, 'message' => '');
            try { $res['message'] = prov_run($id, 'test', $db); } catch (Exception $e) { $res = array('ok' => false, 'message' => $e->getMessage()); }
            db_update(function (&$db) use ($id, $res) { $all = prov_cfg_all($db); if (isset($all[$id])) { $all[$id]['test'] = array('ok' => $res['ok'], 'message' => $res['message'], 'at' => gmdate('c')); $db['meta']['providers'] = $all; } });
            out($res);

        case 'admin/providers/domains':
            need_admin(); $id = prov_id(); $db = db_read();
            try { $list = prov_run($id, 'domains', $db); } catch (Exception $e) { fail($e->getMessage(), 502); }
            $have = array(); foreach (items_of($db, 'domains') as $d) { $have[strtolower($d['name'])] = true; }
            foreach ($list as $k => $d) { $list[$k]['imported'] = isset($have[$d['name']]); }
            out(array('domains' => $list));

        case 'admin/providers/hosting':
            need_admin(); $id = prov_id(); $db = db_read();
            if (!in_array('hosting', prov_defs()[$id]['caps'], true)) { fail('this provider has no hosting API', 422); }
            try { $list = prov_run($id, 'hosting', $db); } catch (Exception $e) { fail($e->getMessage(), 502); }
            $have = array(); foreach (array_merge(items_of($db, 'hosting'), items_of($db, 'websites')) as $h) { if (!empty($h['ref'])) { $have[$h['ref']] = true; } }
            foreach ($list as $k => $h) { $list[$k]['imported'] = isset($have[$h['ref']]); $list[$k]['costStore'] = prov_to_store($db, $h['cost'], $h['currency']); }
            out(array('hosting' => $list, 'currency' => meta_get($db, 'currency', '') ?: 'EGP'));

        case 'admin/providers/import':
            require_post();
            $b = body(); $_GET['id'] = isset($b['id']) ? $b['id'] : ''; $id = prov_id();
            $kind = isset($b['kind']) && in_array($b['kind'], array('hosting', 'websites'), true) ? $b['kind'] : 'domains';
            $uid = isset($b['uid']) ? (string) $b['uid'] : '';
            $items = isset($b['items']) && is_array($b['items']) ? array_slice($b['items'], 0, 200) : array();
            $bills = !empty($b['bills']);
            if (!$items) { fail('select at least one item', 422); }
            $count = db_update(function (&$db) use ($id, $kind, $uid, $items, $bills, $me) {
                $defaultUid = $uid;
                if (find_user($db, 'id', $defaultUid) < 0) { return -1; }
                $n = 0;
                $cache = prov_cache_read();
                foreach ($items as $it) {
                    if (!is_array($it)) { continue; }
                    // Each row may name its own client; otherwise the one chosen for the whole import.
                    $uid = isset($it['uid']) && find_user($db, 'id', (string) $it['uid']) >= 0 ? (string) $it['uid'] : $defaultUid;
                    if ($kind === 'domains') {
                        $name = strtolower(clean_text(isset($it['name']) ? $it['name'] : '', 253));
                        if ($name === '') { continue; }
                        foreach (items_of($db, 'domains') as $d) { if (strtolower($d['name']) === $name) { continue 2; } }
                        $tld = substr($name, (int) strpos($name, '.') + 1);
                        $cost = 0.0;
                        if (isset($cache['providers'][$id][$tld])) { $c = $cache['providers'][$id][$tld]; $cost = prov_to_store($db, $c['renew'], $c['currency']); }
                        $rec = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'name' => $name, 'status' => in_array(isset($it['status']) ? $it['status'] : '', array('active', 'pending', 'expiring', 'stopped'), true) ? $it['status'] : 'active',
                            'expires' => prov_date(isset($it['expires']) ? $it['expires'] : ''), 'autoRenew' => !empty($it['autoRenew']), 'provider' => $id, 'cost' => $cost, 'price' => 0, 'dns' => array());
                        $db['items']['domains'][] = $rec;
                        if ($bills && $cost > 0) { prov_add_bill($db, array('provider' => $id, 'ref' => $name, 'item' => 'Domain renewal ' . $name, 'amount' => $cost, 'period' => 'yearly', 'service' => 'domain', 'client' => $uid, 'date' => $rec['expires'])); }
                    } elseif ($kind === 'websites') {
                        $host = strtolower(clean_text(isset($it['domain']) ? $it['domain'] : (isset($it['name']) ? $it['name'] : ''), 253));
                        if ($host === '') { continue; }
                        $ref = clean_text(isset($it['ref']) ? $it['ref'] : ('site:' . $host), 80);
                        foreach (items_of($db, 'websites') as $w) { if (isset($w['ref']) && $w['ref'] === $ref) { continue 2; } }
                        // Link it: the longest domain it sits under, and the provider's first hosting plan of that client.
                        $domainId = ''; $best = 0;
                        foreach (items_of($db, 'domains') as $d) { $dn = strtolower($d['name']); if (($host === $dn || substr($host, -strlen($dn) - 1) === '.' . $dn) && strlen($dn) > $best) { $best = strlen($dn); $domainId = $d['id']; } }
                        $hostingId = '';
                        foreach (items_of($db, 'hosting') as $h) { if (isset($h['provider']) && $h['provider'] === $id && $h['uid'] === $uid) { $hostingId = $h['id']; break; } }
                        $db['items']['websites'][] = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'name' => $host, 'url' => $host, 'status' => in_array(isset($it['status']) ? $it['status'] : '', array('active', 'pending', 'stopped'), true) ? $it['status'] : 'active',
                            'domainId' => $domainId, 'hostingId' => $hostingId, 'provider' => $id, 'ref' => $ref, 'notes' => '');
                    } else {
                        $ref = clean_text(isset($it['ref']) ? $it['ref'] : '', 80);
                        foreach (items_of($db, 'hosting') as $h) { if ($ref !== '' && isset($h['ref']) && $h['ref'] === $ref) { continue 2; } }
                        $costStore = prov_to_store($db, (float) (isset($it['cost']) ? $it['cost'] : 0), isset($it['currency']) ? $it['currency'] : 'USD');
                        $billing = isset($it['billing']) && $it['billing'] === 'yearly' ? 'yearly' : 'monthly';
                        $rec = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'plan' => clean_text(isset($it['plan']) ? $it['plan'] : 'Hosting', 60), 'domain' => clean_text(isset($it['domain']) ? $it['domain'] : '', 253),
                            'diskGb' => 0, 'usedGb' => 0, 'status' => in_array(isset($it['status']) ? $it['status'] : '', array('active', 'pending', 'stopped'), true) ? $it['status'] : 'active',
                            'provider' => $id, 'ref' => $ref, 'cost' => $costStore, 'billing' => $billing, 'expires' => prov_date(isset($it['expires']) ? $it['expires'] : ''), 'price' => 0);
                        $db['items']['hosting'][] = $rec;
                        if ($bills && $costStore > 0) { prov_add_bill($db, array('provider' => $id, 'ref' => $ref, 'item' => $rec['plan'] . ($rec['domain'] ? ' · ' . $rec['domain'] : ''), 'amount' => $costStore, 'period' => $billing, 'service' => 'hosting', 'client' => $uid, 'date' => $rec['expires'])); }
                    }
                    $n++;
                }
                log_act($db, $me, 'provider-import', $id . ' ' . $kind . ' x' . $n);
                return $n;
            });
            if ($count === -1) { fail('choose a client', 422); }
            out(array('imported' => $count));

        case 'admin/pricing':
            need_admin(); $db = db_read();
            if ($isPost) {
                require_post();
                $b = body();
                $p = prov_pricing($db);
                if (isset($b['marginPct'])) { $p['marginPct'] = max(0, min(1000, (float) $b['marginPct'])); }
                if (isset($b['rounding'])) { $p['rounding'] = max(0, min(1000, (float) $b['rounding'])); }
                if (isset($b['rates']) && is_array($b['rates'])) { foreach ($b['rates'] as $c => $v) { $c = strtoupper(preg_replace('/[^A-Za-z]/', '', (string) $c)); if ($c !== '' && is_numeric($v) && $v > 0) { $p['rates'][$c] = (float) $v; } } }
                if (isset($b['selected']) && is_array($b['selected'])) {
                    $p['selected'] = array();
                    foreach ($b['selected'] as $t) { $t = strtolower(preg_replace('/[^A-Za-z0-9.\-]/', '', (string) $t)); if ($t !== '' && !in_array($t, $p['selected'], true)) { $p['selected'][] = $t; } }
                    $p['selected'] = array_slice($p['selected'], 0, 500);
                }
                if (isset($b['tldProfits']) && is_array($b['tldProfits'])) {
                    $p['tldProfits'] = array();
                    foreach ($b['tldProfits'] as $t => $v) { $t = strtolower(preg_replace('/[^A-Za-z0-9.\-]/', '', (string) $t)); if ($t !== '' && is_numeric($v) && $v >= 0) { $p['tldProfits'][$t] = round((float) $v, 2); } }
                }
                if (isset($b['tldMargins']) && is_array($b['tldMargins'])) {
                    $p['tldMargins'] = array();
                    foreach ($b['tldMargins'] as $t => $v) { $t = strtolower(preg_replace('/[^A-Za-z0-9.\-]/', '', (string) $t)); if ($t !== '' && is_numeric($v)) { $p['tldMargins'][$t] = max(0, min(1000, (float) $v)); } }
                }
                db_update(function (&$db) use ($p, $me) { $db['meta']['pricing'] = $p; log_act($db, $me, 'pricing', 'updated'); });
                $db = db_read();
            }
            $cache = isset($_GET['refresh']) || $isPost && !empty($b['refresh']) ? prov_cache_refresh($db) : prov_cache_read();
            if (!$cache['providers'] && !$cache['errors']) { $cache = prov_cache_refresh($db); }
            $p = prov_pricing($db);
            out(array('pricing' => array('marginPct' => $p['marginPct'], 'rounding' => $p['rounding'], 'rates' => $p['rates'], 'tldMargins' => (object) $p['tldMargins'], 'tldProfits' => (object) $p['tldProfits'], 'selected' => $p['selected']), 'currency' => meta_get($db, 'currency', '') ?: 'EGP', 'fetchedAt' => $cache['at'], 'errors' => $cache['errors'], 'tlds' => prov_tld_table($db, $cache)));

        case 'admin/pricing/search':
            need_admin();
            $tlds = isset($_GET['tlds']) && $_GET['tlds'] !== '' ? explode(',', (string) $_GET['tlds']) : array();
            out(prov_search(db_read(), isset($_GET['q']) ? (string) $_GET['q'] : '', $tlds, true));
    }
    return false;
}

/** A purchase bill (what we owe a provider). Caller holds the db lock. */
function prov_add_bill(&$db, $f) {
    $seq = (int) meta_get($db, 'purchaseSeq', 0) + 1;
    $db['meta']['purchaseSeq'] = $seq;
    $db['items']['purchases'][] = array('id' => new_id(), 'uid' => '', 'created' => gmdate('c'), 'number' => 'PUR-' . $seq, 'provider' => $f['provider'], 'ref' => $f['ref'], 'item' => clean_text($f['item'], 160),
        'amount' => round((float) $f['amount'], 2), 'period' => $f['period'], 'service' => $f['service'], 'client' => $f['client'], 'date' => $f['date'] !== '' ? $f['date'] : gmdate('Y-m-d'), 'status' => 'due');
}

/** After a client or admin changes a domain's DNS: when the zone was pulled from its provider, send the new list back. Returns a warning text or ''. */
function prov_dns_autopush($domainId) {
    $db = db_read();
    $i = find_by(items_of($db, 'domains'), 'id', $domainId);
    if ($i < 0) { return ''; }
    $d = $db['items']['domains'][$i];
    $pid = isset($d['provider']) ? (string) $d['provider'] : '';
    if (empty($d['dnsSynced']) || !dns_can_write($pid) || !prov_has_keys($pid, prov_cfg($db, $pid))) { return ''; }
    try { prov_run($pid, 'dns_set', $db, strtolower($d['name']), isset($d['dns']) ? $d['dns'] : array()); return ''; }
    catch (Exception $e) { return 'saved here, but not sent to ' . prov_name($pid) . ': ' . $e->getMessage(); }
}
