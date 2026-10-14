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
            'caps' => array('domains', 'tlds', 'check', 'hosting'),
            'base' => 'https://developers.hostinger.com',
            'fields' => array('token' => array('API token', true)),
            'help' => array('hPanel → Account → API → create a token', 'hPanel ← Account ← API ← أنشئ Token'),
        ),
        'namecheap' => array(
            'name' => 'Namecheap',
            'caps' => array('domains', 'tlds', 'check'),
            'base' => 'https://api.namecheap.com',
            'sandbox' => 'https://api.sandbox.namecheap.com',
            'fields' => array('apiUser' => array('API user', false), 'apiKey' => array('API key', true), 'username' => array('Username (usually the same as API user)', false), 'clientIp' => array('Whitelisted server IP', false)),
            'help' => array('Profile → Tools → Namecheap API Access: turn it on and whitelist this server’s IP', 'Profile ← Tools ← Namecheap API Access: فعّله وأضف IP السيرفر ده في القائمة البيضاء'),
        ),
        'resellerclub' => array(
            'name' => 'ResellerClub',
            'caps' => array('domains', 'tlds', 'check'),
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
function prov_pricing_defaults() { return array('marginPct' => 30, 'rounding' => 5, 'rates' => array('USD' => 50, 'EUR' => 55), 'tldMargins' => new stdClass(), 'popular' => array('com', 'net', 'org', 'info', 'store', 'online', 'site', 'xyz', 'co', 'io', 'app', 'tech', 'shop')); }
function prov_pricing($db) {
    $p = meta_get($db, 'pricing', array());
    $d = prov_pricing_defaults();
    $out = array_merge($d, is_array($p) ? $p : array());
    $out['rates'] = array_merge($d['rates'], isset($p['rates']) && is_array($p['rates']) ? $p['rates'] : array());
    $out['tldMargins'] = isset($p['tldMargins']) && is_array($p['tldMargins']) ? $p['tldMargins'] : array();
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
        $margin = isset($pricing['tldMargins'][$tld]) ? (float) $pricing['tldMargins'][$tld] : (float) $pricing['marginPct'];
        $sell = prov_sell($best['costStore'], $margin, (float) $pricing['rounding']);
        $renewSell = prov_sell($best['renewStore'], $margin, (float) $pricing['rounding']);
        $out[] = array('tld' => $tld, 'offers' => $r['offers'], 'best' => $best['provider'], 'cost' => $best['costStore'], 'renewCost' => $best['renewStore'], 'marginPct' => $margin, 'custom' => isset($pricing['tldMargins'][$tld]),
            'sell' => $sell, 'renewSell' => $renewSell, 'profit' => round($sell - $best['costStore'], 2), 'currency' => $store);
    }
    usort($out, function ($a, $b) use ($pricing) {
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
    foreach (prov_tld_table($db, $cache) as $r) { $table[$r['tld']] = $r; }
    if (!$table) { fail('no provider prices yet — connect a provider in Apps first', 409); }
    $pricing = prov_pricing($db);
    $want = array();
    if ($forced) { $want[] = $forced; }
    foreach ($tldsWanted ?: $pricing['popular'] as $t) { $t = strtolower(trim($t)); if ($t !== '' && !in_array($t, $want, true)) { $want[] = $t; } }
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
            $have = array(); foreach (items_of($db, 'hosting') as $h) { if (!empty($h['ref'])) { $have[$h['ref']] = true; } }
            foreach ($list as $k => $h) { $list[$k]['imported'] = isset($have[$h['ref']]); $list[$k]['costStore'] = prov_to_store($db, $h['cost'], $h['currency']); }
            out(array('hosting' => $list, 'currency' => meta_get($db, 'currency', '') ?: 'EGP'));

        case 'admin/providers/import':
            require_post();
            $b = body(); $_GET['id'] = isset($b['id']) ? $b['id'] : ''; $id = prov_id();
            $kind = isset($b['kind']) && $b['kind'] === 'hosting' ? 'hosting' : 'domains';
            $uid = isset($b['uid']) ? (string) $b['uid'] : '';
            $items = isset($b['items']) && is_array($b['items']) ? array_slice($b['items'], 0, 200) : array();
            $bills = !empty($b['bills']);
            if (!$items) { fail('select at least one item', 422); }
            $count = db_update(function (&$db) use ($id, $kind, $uid, $items, $bills, $me) {
                if (find_user($db, 'id', $uid) < 0) { return -1; }
                $n = 0;
                $cache = prov_cache_read();
                foreach ($items as $it) {
                    if (!is_array($it)) { continue; }
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
            out(array('pricing' => array('marginPct' => $p['marginPct'], 'rounding' => $p['rounding'], 'rates' => $p['rates'], 'tldMargins' => (object) $p['tldMargins']), 'currency' => meta_get($db, 'currency', '') ?: 'EGP', 'fetchedAt' => $cache['at'], 'errors' => $cache['errors'], 'tlds' => prov_tld_table($db, $cache)));

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
