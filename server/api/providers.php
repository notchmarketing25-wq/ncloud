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
            'caps' => array('domains', 'tlds', 'check', 'hosting', 'vps', 'dns'),
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
/** Several requests at once (curl_multi): the slowest one decides the time, not the sum. Returns key => array(status, body, error). */
function prov_http_multi($reqs, $timeout = 9) {
    $out = array();
    if (!function_exists('curl_multi_init') || count($reqs) < 2) {
        foreach ($reqs as $k => $r) { try { list($st, $b) = prov_http($r[0], $r[1], $r[2], $r[3]); $out[$k] = array($st, $b, ''); } catch (Exception $e) { $out[$k] = array(0, '', $e->getMessage()); } }
        return $out;
    }
    $mh = curl_multi_init(); $hs = array();
    foreach ($reqs as $k => $r) {
        $ch = curl_init($r[1]);
        curl_setopt_array($ch, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => $timeout, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_CUSTOMREQUEST => $r[0], CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => array_merge(array('Accept: application/json', 'User-Agent: NotchCloud/1.0'), $r[2])));
        if ($r[3] !== null) { curl_setopt($ch, CURLOPT_POSTFIELDS, $r[3]); }
        curl_multi_add_handle($mh, $ch); $hs[$k] = $ch;
    }
    do { $st = curl_multi_exec($mh, $running); if ($running) { curl_multi_select($mh, 0.2); } } while ($running && $st === CURLM_OK);
    foreach ($hs as $k => $ch) {
        $body = curl_multi_getcontent($ch);
        $err = curl_error($ch);
        $out[$k] = array((int) curl_getinfo($ch, CURLINFO_HTTP_CODE), (string) $body, $err !== '' ? 'could not reach the provider (' . preg_replace('#https?://\S+#', '', $err) . ')' : '');
        curl_multi_remove_handle($mh, $ch); curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
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
function hostinger_check_req($cfg, $name, $tlds) {
    return array('POST', prov_base('hostinger', $cfg) . '/api/domains/v1/availability', array('Authorization: Bearer ' . $cfg['token'], 'Content-Type: application/json'), json_encode(array('domain' => $name, 'tlds' => array_values($tlds), 'with_alternatives' => false)));
}
function hostinger_check_parse($st, $raw, $name, $tlds) {
    $o = array();
    foreach (prov_rows(prov_json($st, $raw, 'Hostinger')) as $r) {
        if (!is_array($r) || empty($r['domain'])) { continue; }
        $o[] = array('domain' => strtolower($r['domain']), 'available' => !empty($r['is_available']));
    }
    return $o;
}
/** First of several possible field names. */
function prov_pick($a, $keys, $default) { foreach ($keys as $k) { if (isset($a[$k]) && $a[$k] !== '' && $a[$k] !== null && !is_array($a[$k])) { return $a[$k]; } } return $default; }
/** The provider's own record, reduced to short scalar fields, for the "provider details" card. */
function prov_details($a) {
    $o = array();
    foreach ((array) $a as $k => $v) {
        if (count($o) >= 24) { break; }
        if (is_scalar($v) && $v !== '' && !preg_match('/token|secret|password|key/i', (string) $k)) { $o[(string) $k] = is_bool($v) ? ($v ? 'true' : 'false') : clean_text((string) $v, 160); }
        elseif (is_array($v) && !empty($v) && count($v) <= 4) { $flat = array(); foreach ($v as $x) { if (is_scalar($x)) { $flat[] = (string) $x; } elseif (is_array($x)) { $y = reset($x); if (is_scalar($y)) { $flat[] = (string) $y; } } } if ($flat) { $o[(string) $k] = clean_text(implode(', ', $flat), 160); } }
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
    $subs = array(); foreach ($o as $r) { if ($r['kind'] === 'subscription') { $subs[$r['ref']] = $r; } }
    try {
        foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/hosting/v1/websites')) as $w) {
            if (!is_array($w) || empty($w['domain'])) { continue; }
            $usedB = null;
            foreach (array('disk_usage', 'disk_usage_bytes', 'disk_space_used', 'used_disk_space') as $k) { if (isset($w[$k]) && is_numeric($w[$k])) { $usedB = (float) $w[$k]; break; } }
            $type = strtolower(clean_text(prov_pick($w, array('type', 'website_type', 'app_type', 'application', 'platform', 'kind'), ''), 30));
            $order = (string) prov_pick($w, array('order_id', 'subscription_id', 'hosting_id'), '');
            $plan = $order !== '' && isset($subs[$order]) ? $subs[$order]['plan'] : 'Website';
            $o[] = array('usedGb' => $usedB === null ? null : round($usedB / 1073741824, 2), 'ref' => 'site:' . $w['domain'], 'kind' => 'website', 'plan' => $plan, 'domain' => strtolower($w['domain']),
                'status' => (isset($w['is_enabled']) && !$w['is_enabled']) ? 'stopped' : 'active', 'expires' => $order !== '' && isset($subs[$order]) ? $subs[$order]['expires'] : '', 'cost' => 0, 'billing' => 'monthly', 'currency' => 'USD',
                'appType' => $type, 'username' => clean_text(prov_pick($w, array('username', 'user', 'ftp_username'), ''), 60), 'dataCenter' => clean_text(prov_pick($w, array('data_center', 'datacenter', 'datacenter_code', 'region', 'location'), ''), 40),
                'orderRef' => $order, 'created' => prov_date(prov_pick($w, array('created_at', 'created', 'date_created'), '')), 'details' => prov_details($w));
        }
    } catch (Exception $e) { /* websites are a bonus: subscriptions alone are still useful */ }
    // VPS servers
    try {
        foreach (prov_rows(hostinger_call($cfg, 'GET', '/api/vps/v1/virtual-machines')) as $v) {
            if (!is_array($v) || empty($v['id'])) { continue; }
            $ip = '';
            $ipv4 = isset($v['ipv4']) ? $v['ipv4'] : (isset($v['ip_address']) ? $v['ip_address'] : '');
            if (is_array($ipv4)) { $first = reset($ipv4); $ip = is_array($first) ? (string) prov_pick($first, array('address', 'ip', 'ip_address'), '') : (string) $first; } else { $ip = (string) $ipv4; }
            $cpus = (int) prov_pick($v, array('cpus', 'cpu', 'vcpus'), 0);
            $memMb = (float) prov_pick($v, array('memory', 'ram', 'memory_mb'), 0);
            $diskMb = (float) prov_pick($v, array('disk', 'storage', 'disk_mb'), 0);
            $state = strtolower((string) prov_pick($v, array('state', 'status'), ''));
            $sub = (string) prov_pick($v, array('subscription_id', 'order_id'), '');
            $plan = clean_text(prov_pick($v, array('plan', 'plan_name'), 'VPS'), 60);
            $spec = trim(($cpus ? $cpus . ' vCPU' : '') . ($memMb ? ' · ' . round($memMb / 1024, 1) . ' GB RAM' : '') . ($diskMb ? ' · ' . round($diskMb / 1024) . ' GB' : ''), ' ·');
            $o[] = array('ref' => 'vps:' . $v['id'], 'kind' => 'vps', 'plan' => $plan, 'name' => clean_text(prov_pick($v, array('hostname', 'name'), 'vps-' . $v['id']), 60), 'domain' => '', 'ip' => $ip, 'spec' => $spec !== '' ? $spec : $plan, 'cpus' => $cpus,
                'status' => in_array($state, array('running', 'active', 'started'), true) ? 'active' : (in_array($state, array('stopped', 'stopping', 'off', 'suspended'), true) ? 'stopped' : 'pending'),
                'expires' => $sub !== '' && isset($subs[$sub]) ? $subs[$sub]['expires'] : '', 'cost' => $sub !== '' && isset($subs[$sub]) ? $subs[$sub]['cost'] : 0, 'billing' => $sub !== '' && isset($subs[$sub]) ? $subs[$sub]['billing'] : 'monthly', 'currency' => $sub !== '' && isset($subs[$sub]) ? $subs[$sub]['currency'] : 'USD',
                'dataCenter' => clean_text(prov_pick($v, array('data_center', 'datacenter', 'data_center_id'), ''), 40), 'orderRef' => $sub, 'created' => prov_date(prov_pick($v, array('created_at', 'created'), '')), 'details' => prov_details($v));
        }
    } catch (Exception $e) { /* not every account has VPS */ }
    return $o;
}

/* ───────── Namecheap (XML) ───────── */
function namecheap_req($cfg, $command, $params = array()) {
    $q = http_build_query(array_merge(array('ApiUser' => $cfg['apiUser'], 'ApiKey' => $cfg['apiKey'], 'UserName' => !empty($cfg['username']) ? $cfg['username'] : $cfg['apiUser'], 'ClientIp' => $cfg['clientIp'], 'Command' => $command), $params));
    return array('GET', prov_base('namecheap', $cfg) . '/xml.response?' . $q, array('Accept: application/xml'), null);
}
function namecheap_call($cfg, $command, $params = array()) {
    $r = namecheap_req($cfg, $command, $params);
    list($st, $raw) = prov_http($r[0], $r[1], $r[2], $r[3]);
    return namecheap_parse($st, $raw);
}
function namecheap_parse($st, $raw) {
    if (!function_exists('simplexml_load_string')) { throw new Exception('Namecheap: the PHP SimpleXML extension is required'); }
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
function namecheap_check_req($cfg, $name, $tlds) {
    $list = array();
    foreach (array_slice($tlds, 0, 50) as $t) { $list[] = $name . '.' . $t; }
    return namecheap_req($cfg, 'namecheap.domains.check', array('DomainList' => implode(',', $list)));
}
function namecheap_check_parse($st, $raw, $name, $tlds) {
    $x = namecheap_parse($st, $raw);
    $o = array();
    foreach ($x->CommandResponse->DomainCheckResult as $r) { $o[] = array('domain' => strtolower((string) $r['Domain']), 'available' => (string) $r['Available'] === 'true' && (string) $r['IsPremiumName'] !== 'true'); }
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
function resellerclub_check_req($cfg, $name, $tlds) {
    $raw = '';
    foreach ($tlds as $t) { $raw .= '&tlds=' . rawurlencode($t); }
    $q = http_build_query(array('auth-userid' => $cfg['userId'], 'api-key' => $cfg['apiKey'], 'domain-name' => $name)) . $raw;
    return array('GET', prov_base('resellerclub', $cfg) . '/api/domains/available.json?' . $q, array(), null);
}
function resellerclub_check_parse($st, $raw, $name, $tlds) {
    $j = json_decode($raw, true);
    if (is_array($j) && isset($j['status']) && strtolower((string) $j['status']) === 'error') { throw new Exception('ResellerClub: ' . clean_text(isset($j['message']) ? $j['message'] : 'request failed', 180)); }
    $j = prov_json($st, $raw, 'ResellerClub');
    $o = array();
    foreach ($j as $dom => $r) { if (is_array($r) && isset($r['status'])) { $o[] = array('domain' => strtolower($dom), 'available' => strtolower((string) $r['status']) === 'available'); } }
    return $o;
}


/* ───────── DNS: read (all three) and write (Hostinger, Namecheap) ─────────
 * Records are {type, host, value, ttl}. MX values read "10 mail.example.com" (priority first). */
/** One RRset per host+type (providers reject the same record twice, or one set with two TTLs). Identical values are sent once. */
function dns_group($records) {
    $g = array();
    foreach ($records as $r) {
        $k = $r['host'] . '|' . $r['type'];
        if (!isset($g[$k])) { $g[$k] = array('host' => $r['host'], 'type' => $r['type'], 'ttl' => (int) $r['ttl'], 'values' => array(), 'seen' => array()); }
        $n = dns_norm($r['value']);
        if (isset($g[$k]['seen'][$n])) { continue; }
        $g[$k]['seen'][$n] = true; $g[$k]['values'][] = $r['value'];
    }
    foreach ($g as $k => $x) { unset($g[$k]['seen']); }
    return array_values($g);
}
/** DNS rules a provider enforces: ALIAS/CNAME cannot share a name with A/AAAA (or with each other). The record added last wins; the rest are dropped and reported. */
function dns_resolve($records, &$notes) {
    $notes = array(); $by = array();
    foreach ($records as $i => $r) { $by[strtolower($r['host'])][] = $i; }
    $drop = array();
    foreach ($by as $host => $idx) {
        $excl = -1; $addr = -1;
        foreach ($idx as $i) { $t = $records[$i]['type']; if ($t === 'ALIAS' || $t === 'CNAME') { $excl = $i; } elseif ($t === 'A' || $t === 'AAAA') { $addr = $i; } }
        if ($excl < 0) { continue; }
        $winner = $excl > $addr ? $excl : $addr; $wt = $records[$winner]['type'];
        foreach ($idx as $i) {
            $t = $records[$i]['type']; if ($i === $winner || !in_array($t, array('A', 'AAAA', 'ALIAS', 'CNAME'), true)) { continue; }
            if ($wt === 'A' || $wt === 'AAAA') { if ($t === 'ALIAS' || $t === 'CNAME') { $drop[$i] = true; } }
            else { $drop[$i] = true; }
        }
        if ($wt === 'A' || $wt === 'AAAA') { foreach ($idx as $i) { if (isset($drop[$i]) && $i !== $winner) { $notes[] = $records[$i]['type'] . ' ' . $host; } } }
        else { foreach ($idx as $i) { if (isset($drop[$i])) { $notes[] = $records[$i]['type'] . ' ' . $host; } } }
    }
    $o = array(); foreach ($records as $i => $r) { if (!isset($drop[$i])) { $o[] = $r; } }
    return $o;
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
    $zone = array(); $n = array(); $records = dns_resolve($records, $n);
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
    $o = array(); $seen = array();
    foreach ($records as $r) {
        $host = clean_text($r['host'], 253) ?: '@';
        $k = $r['type'] . '|' . $host . '|' . dns_norm($r['value']);
        if (isset($seen[$k])) { continue; } // the provider listed it twice
        $seen[$k] = true;
        $o[] = array('id' => new_id(), 'type' => $r['type'], 'host' => $host, 'value' => clean_text($r['value'], 500), 'ttl' => (int) $r['ttl']);
    }
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
    $rowsAll = prov_tld_table($db, $cache);
    if (!$rowsAll) { fail('no provider prices yet — connect a provider in Apps first', 409); }
    $pricingSel = prov_pricing($db);
    $useSelected = (bool) $pricingSel['selected'];
    // Only the extensions you chose to sell. Until you choose any, the popular ones are searched so the box still works.
    foreach ($rowsAll as $r) { if ($useSelected ? $r['selected'] : in_array($r['tld'], $pricingSel['popular'], true)) { $table[$r['tld']] = $r; } }
    if (!$table) { fail('no extensions are enabled for sale yet — choose them in TLD pricing', 409); }
    $pricing = prov_pricing($db);
    // What to check: the typed extension first, then the popular ones, then the cheapest of the rest (at most 30 in all).
    $want = array();
    if ($forced && isset($table[$forced])) { $want[] = $forced; }
    $pool = $tldsWanted ?: array_keys($table);
    foreach ($pricing['popular'] as $t) { if (in_array($t, $pool, true) && !in_array($t, $want, true)) { $want[] = $t; } }
    $rest = array_values(array_diff($pool, $want));
    usort($rest, function ($a, $b) use ($table) { return (isset($table[$a]) ? $table[$a]['sell'] : PHP_INT_MAX) <=> (isset($table[$b]) ? $table[$b]['sell'] : PHP_INT_MAX); });
    foreach ($rest as $t) { $t = strtolower(trim($t)); if ($t !== '' && !in_array($t, $want, true)) { $want[] = $t; } }
    $want = array_slice($want, 0, 30);
    $t0 = microtime(true);
    $results = array(); $errors = array(); $got = array();
    $cached = prov_check_cache_get($name, $want);
    foreach ($cached as $tld => $avail) { $got[$tld] = $avail; }
    $todo = array_values(array_diff($want, array_keys($got)));
    $failed = array();
    // Round 1: every provider at once, each asked about the extensions it sells cheapest. Round 2: whatever failed goes to the next provider.
    for ($round = 0; $round < 2 && $todo; $round++) {
        $byProv = array();
        foreach ($todo as $t) {
            if (!isset($table[$t])) { continue; }
            foreach ($table[$t]['offers'] as $o) {
                $pid = $o['provider'];
                if (isset($failed[$pid]) || !prov_has_keys($pid, prov_cfg($db, $pid)) || !function_exists($pid . '_check_req')) { continue; }
                $byProv[$pid][] = $t; break;
            }
        }
        if (!$byProv) { break; }
        $reqs = array();
        foreach ($byProv as $pid => $tlds) { $reqs[$pid] = call_user_func($pid . '_check_req', prov_cfg($db, $pid), $name, array_slice($tlds, 0, 50)); }
        $answers = prov_http_multi($reqs);
        $todo = array();
        foreach ($byProv as $pid => $tlds) {
            try {
                list($st, $body, $err) = $answers[$pid];
                if ($err !== '') { throw new Exception($err); }
                foreach (call_user_func($pid . '_check_parse', $st, $body, $name, $tlds) as $r) { $tld = substr($r['domain'], strlen($name) + 1); $got[$tld] = array('a' => $r['available'], 'p' => $pid); }
                foreach ($tlds as $t) { if (!isset($got[$t])) { $todo[] = $t; $failed[$pid] = $failed[$pid] ?? true; } }
            } catch (Exception $e) { $errors[$pid] = $admin ? $e->getMessage() : 'unavailable'; $failed[$pid] = true; foreach ($tlds as $t) { $todo[] = $t; } }
        }
        $todo = array_values(array_unique($todo));
    }
    $fresh = array(); foreach ($got as $tld => $v) { if (is_array($v)) { $fresh[$tld] = $v['a']; } }
    prov_check_cache_put($name, $fresh);
    foreach ($want as $tld) {
        if (!isset($got[$tld]) || !isset($table[$tld])) { continue; }
        $v = $got[$tld]; $avail = is_array($v) ? $v['a'] : $v; $pid = is_array($v) ? $v['p'] : $table[$tld]['best'];
        $row = array('domain' => $name . '.' . $tld, 'tld' => $tld, 'available' => (bool) $avail, 'sell' => $table[$tld]['sell'], 'renewSell' => $table[$tld]['renewSell'], 'currency' => $table[$tld]['currency']);
        if ($admin) { $row += array('provider' => $pid, 'cost' => $table[$tld]['cost'], 'profit' => $table[$tld]['profit'], 'marginPct' => $table[$tld]['marginPct']); }
        $results[] = $row;
    }
    usort($results, function ($a, $b) use ($want) { return array_search($a['tld'], $want) <=> array_search($b['tld'], $want); });
    $ms = (int) round((microtime(true) - $t0) * 1000);
    return array('query' => $name, 'results' => $results, 'errors' => $errors, 'ms' => $ms, 'cached' => count($cached));
}

/** Availability answers are remembered for 90 seconds so repeated searches are instant. */
function prov_check_cache_get($name, $tlds) {
    $f = NC_DATA . '/cache-check.json';
    $j = is_file($f) ? json_decode(file_get_contents($f), true) : null;
    $o = array();
    if (!is_array($j)) { return $o; }
    foreach ($tlds as $t) { $k = $name . '.' . $t; if (isset($j[$k]) && $j[$k][0] > time() - 90) { $o[$t] = (bool) $j[$k][1]; } }
    return $o;
}
function prov_check_cache_put($name, $avail) {
    $f = NC_DATA . '/cache-check.json';
    $j = is_file($f) ? json_decode(file_get_contents($f), true) : null;
    if (!is_array($j)) { $j = array(); }
    foreach ($j as $k => $v) { if ($v[0] < time() - 90) { unset($j[$k]); } }
    foreach ($avail as $t => $a) { $j[$name . '.' . $t] = array(time(), (bool) $a); }
    if (count($j) > 600) { $j = array_slice($j, -600, null, true); }
    @file_put_contents($f, json_encode($j), LOCK_EX);
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
                    $local = isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array(); $notes = array();
                    $local = dns_resolve($local, $notes);
                    prov_run($pid, 'dns_set', $db, strtolower($d['name']), $local);
                    db_update(function (&$db) use ($id, $me, $d, $local) {
                        $k = find_by(items_of($db, 'domains'), 'id', $id);
                        if ($k >= 0) { $db['items']['domains'][$k]['dnsSynced'] = true; $db['items']['domains'][$k]['dns'] = $local; }
                        log_act($db, $me, 'dns-push', $d['name'] . ' x' . count($local));
                    });
                    out(array('ok' => true, 'records' => count($local), 'removed' => $notes));
                }
            } catch (Exception $e) { fail($e->getMessage(), 502); }
            fail('unknown action', 422);

        case 'admin/domain-mail':
            require_post();
            $b = body(); $id = isset($b['id']) ? (string) $b['id'] : '';
            $db = db_read();
            $i = find_by(items_of($db, 'domains'), 'id', $id);
            if ($i < 0) { fail('domain not found', 404); }
            $d = $db['items']['domains'][$i];
            $res = mail_dns_apply($id, $me, !empty($b['dkim']), true);
            $added = $res['added'];
            $warning = $res['warning'];
            out(array('ok' => true, 'added' => $added, 'warning' => $warning, 'webmail' => 'https://mail.hostinger.com'));

        case 'admin/hosting-sync':
            require_post();
            $b = body(); $id = isset($b['id']) ? (string) $b['id'] : '';
            $db = db_read();
            $i = find_by(items_of($db, 'hosting'), 'id', $id);
            if ($i < 0) { fail('hosting not found', 404); }
            $h = $db['items']['hosting'][$i];
            $pid = isset($h['provider']) ? (string) $h['provider'] : '';
            if ($pid !== 'hostinger') { fail('only Hostinger hosting can be refreshed from the provider', 422); }
            try { $remote = prov_run($pid, 'hosting', $db); } catch (Exception $e) { fail($e->getMessage(), 502); }
            $updated = db_update(function (&$db) use ($remote, $h, $me) {
                $n = 0;
                foreach ($remote as $r) {
                    if ($r['kind'] !== 'website' || $r['usedGb'] === null) { continue; }
                    foreach ($db['items']['websites'] as $k => $w) {
                        if ((isset($w['ref']) && $w['ref'] === $r['ref']) || strtolower($w['name']) === $r['domain']) { $db['items']['websites'][$k]['usedGb'] = $r['usedGb']; $n++; }
                    }
                }
                log_act($db, $me, 'hosting-sync', $h['plan'] . ' x' . $n);
                return $n;
            });
            out(array('ok' => true, 'updated' => $updated, 'note' => $updated === 0 ? 'The provider did not return disk usage for these websites — enter it by hand.' : ''));

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
            $have = array(); foreach (array_merge(items_of($db, 'hosting'), items_of($db, 'websites'), items_of($db, 'servers')) as $h) { if (!empty($h['ref'])) { $have[$h['ref']] = true; } }
            foreach ($list as $k => $h) { $list[$k]['imported'] = isset($have[$h['ref']]); $list[$k]['costStore'] = prov_to_store($db, $h['cost'], $h['currency']); }
            out(array('hosting' => $list, 'currency' => meta_get($db, 'currency', '') ?: 'EGP'));

        case 'admin/providers/import':
            require_post();
            $b = body(); $_GET['id'] = isset($b['id']) ? $b['id'] : ''; $id = prov_id();
            $kind = isset($b['kind']) && in_array($b['kind'], array('hosting', 'websites', 'servers'), true) ? $b['kind'] : 'domains';
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
                        $hostingId = ''; $orderRef = isset($it['orderRef']) ? (string) $it['orderRef'] : '';
                        foreach (items_of($db, 'hosting') as $h) { if ($orderRef !== '' && isset($h['ref']) && $h['ref'] === $orderRef) { $hostingId = $h['id']; break; } }
                        if ($hostingId === '') { foreach (items_of($db, 'hosting') as $h) { if (isset($h['provider']) && $h['provider'] === $id && $h['uid'] === $uid) { $hostingId = $h['id']; break; } } }
                        $db['items']['websites'][] = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'name' => $host, 'url' => $host, 'status' => in_array(isset($it['status']) ? $it['status'] : '', array('active', 'pending', 'stopped'), true) ? $it['status'] : 'active',
                            'domainId' => $domainId, 'hostingId' => $hostingId, 'provider' => $id, 'ref' => $ref, 'notes' => '', 'diskGb' => 0, 'usedGb' => isset($it['usedGb']) && is_numeric($it['usedGb']) ? (float) $it['usedGb'] : 0,
                            'appType' => clean_text(isset($it['appType']) ? $it['appType'] : '', 30), 'username' => clean_text(isset($it['username']) ? $it['username'] : '', 60), 'dataCenter' => clean_text(isset($it['dataCenter']) ? $it['dataCenter'] : '', 40),
                            'providerData' => isset($it['details']) && is_array($it['details']) ? array_slice(array_map(function ($x) { return clean_text((string) $x, 160); }, $it['details']), 0, 24, true) : array());
                    } elseif ($kind === 'servers') {
                        $ref = clean_text(isset($it['ref']) ? $it['ref'] : '', 80);
                        foreach (items_of($db, 'servers') as $sv) { if ($ref !== '' && isset($sv['ref']) && $sv['ref'] === $ref) { continue 2; } }
                        $costStore = prov_to_store($db, (float) (isset($it['cost']) ? $it['cost'] : 0), isset($it['currency']) ? $it['currency'] : 'USD');
                        $rec = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'name' => clean_text(isset($it['name']) ? $it['name'] : 'vps', 60), 'ip' => clean_text(isset($it['ip']) ? $it['ip'] : '', 64), 'spec' => clean_text(isset($it['spec']) ? $it['spec'] : '', 120), 'cpu' => 0, 'ram' => 0,
                            'status' => in_array(isset($it['status']) ? $it['status'] : '', array('active', 'pending', 'stopped'), true) ? $it['status'] : 'active', 'snapshots' => 0, 'provider' => $id, 'ref' => $ref, 'cost' => $costStore, 'billing' => isset($it['billing']) && $it['billing'] === 'yearly' ? 'yearly' : 'monthly',
                            'expires' => prov_date(isset($it['expires']) ? $it['expires'] : ''), 'price' => 0, 'dataCenter' => clean_text(isset($it['dataCenter']) ? $it['dataCenter'] : '', 40),
                            'providerData' => isset($it['details']) && is_array($it['details']) ? array_slice(array_map(function ($x) { return clean_text((string) $x, 160); }, $it['details']), 0, 24, true) : array());
                        $db['items']['servers'][] = $rec;
                        if ($bills && $costStore > 0) { prov_add_bill($db, array('provider' => $id, 'ref' => $ref, 'item' => 'VPS ' . $rec['name'], 'amount' => $costStore, 'period' => $rec['billing'], 'service' => 'server', 'client' => $uid, 'date' => $rec['expires'])); }
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
                    $p['selected'] = array_slice($p['selected'], 0, 3000);
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
    // Records that differ only by quotes / case / spacing are the same record: keep one (the provider refuses duplicates).
    $seen = array(); $clean = array();
    foreach (isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array() as $r) { $k = $r['type'] . '|' . $r['host'] . '|' . dns_norm($r['value']); if (isset($seen[$k])) { continue; } $seen[$k] = true; $clean[] = $r; }
    if (count($clean) !== count(isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array())) { $d['dns'] = $clean; db_update(function (&$db) use ($domainId, $clean) { $k = find_by(items_of($db, 'domains'), 'id', $domainId); if ($k >= 0) { $db['items']['domains'][$k]['dns'] = $clean; } }); }
    if (empty($d['dnsSynced']) || !dns_can_write($pid) || !prov_has_keys($pid, prov_cfg($db, $pid))) { return ''; }
    $recs = isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array(); $notes = array();
    $fixed = dns_resolve($recs, $notes);
    if ($notes) { db_update(function (&$db) use ($domainId, $fixed) { $k = find_by(items_of($db, 'domains'), 'id', $domainId); if ($k >= 0) { $db['items']['domains'][$k]['dns'] = $fixed; } }); }
    try { prov_run($pid, 'dns_set', $db, strtolower($d['name']), $fixed); return $notes ? 'sent, but these records were removed because the provider does not allow them on the same name as another record (A/AAAA vs ALIAS/CNAME): ' . implode(', ', $notes) : ''; }
    catch (Exception $e) { return 'saved here, but not sent to ' . prov_name($pid) . ': ' . $e->getMessage(); }
}

/* ───────── registering a domain at the provider (money is spent: only ever called from an explicit admin action) ───────── */
function nc_phone_intl($p) {
    $d = preg_replace('/\D/', '', (string) $p);
    if ($d === '') { return '+20.1000000000'; }
    if (strpos((string) $p, '+') === 0) { return '+' . substr($d, 0, 2) . '.' . substr($d, 2); }
    if ($d[0] === '0') { $d = '20' . substr($d, 1); }
    return '+' . substr($d, 0, 2) . '.' . substr($d, 2);
}
function namecheap_register($cfg, $domain, $years, $c) {
    $parts = preg_split('/\s+/', trim($c['name']), 2);
    $one = array('FirstName' => $parts[0] !== '' ? $parts[0] : 'Client', 'LastName' => isset($parts[1]) && $parts[1] !== '' ? $parts[1] : $parts[0], 'Address1' => $c['address'] ?: 'N/A', 'City' => $c['city'] ?: 'Cairo', 'StateProvince' => $c['state'] ?: 'Cairo', 'PostalCode' => $c['zip'] ?: '11511', 'Country' => $c['country'] ?: 'EG', 'Phone' => nc_phone_intl($c['phone']), 'EmailAddress' => $c['email']);
    $params = array('DomainName' => $domain, 'Years' => max(1, (int) $years), 'AddFreeWhoisguard' => 'yes', 'WGEnabled' => 'yes');
    foreach (array('Registrant', 'Tech', 'Admin', 'AuxBilling') as $role) { foreach ($one as $k => $v) { $params[$role . $k] = $v; } }
    $x = namecheap_call($cfg, 'namecheap.domains.create', $params);
    $r = isset($x->CommandResponse->DomainCreateResult) ? $x->CommandResponse->DomainCreateResult : null;
    if (!$r || strtolower((string) $r['Registered']) !== 'true') { throw new Exception('Namecheap did not confirm the registration'); }
    return array('ref' => (string) $r['DomainID'], 'charged' => (string) $r['ChargedAmount']);
}
function hostinger_register($cfg, $domain, $years, $c) {
    $tld = '.' . implode('.', array_slice(explode('.', $domain), 1));
    $cat = hostinger_call($cfg, 'GET', '/api/billing/v1/catalog?category=DOMAIN&name=' . rawurlencode($tld));
    $item = null;
    foreach (prov_rows($cat) as $p) { foreach ((isset($p['prices']) ? $p['prices'] : array()) as $pr) { if (isset($pr['period_unit']) && $pr['period_unit'] === 'year' && (int) $pr['period'] === (int) $years) { $item = $pr['id']; } } }
    if (!$item) { foreach (prov_rows($cat) as $p) { foreach ((isset($p['prices']) ? $p['prices'] : array()) as $pr) { if ($item === null && isset($pr['period_unit']) && $pr['period_unit'] === 'year') { $item = $pr['id']; } } } }
    if (!$item) { throw new Exception('Hostinger has no price for ' . $tld); }
    $who = prov_rows(hostinger_call($cfg, 'GET', '/api/domains/v1/whois'));
    if (!$who || !isset($who[0]['id'])) { throw new Exception('Create a WHOIS contact profile in your Hostinger account first'); }
    $cid = $who[0]['id'];
    $r = hostinger_call($cfg, 'POST', '/api/domains/v1/portfolio', array('domain' => $domain, 'item_id' => $item, 'domain_contacts' => array('owner_id' => $cid, 'admin_id' => $cid, 'billing_id' => $cid, 'tech_id' => $cid)));
    return array('ref' => isset($r['id']) ? (string) $r['id'] : $domain, 'charged' => '');
}
function resellerclub_register($cfg, $domain, $years, $c) { throw new Exception('Registering through ResellerClub needs a customer/contact set-up that is not supported yet: register it in the ResellerClub panel'); }

/* ───────── online payment gateways ───────── */
function gw_cfg($db, $id) { $g = meta_get($db, 'gateways', array()); return isset($g[$id]) && is_array($g[$id]) && !empty($g[$id]['enabled']) ? $g[$id] : null; }
function gw_stripe_session($db, $o, $email, $okUrl, $backUrl) {
    $c = gw_cfg($db, 'stripe');
    if (!$c || empty($c['secret'])) { throw new Exception('Stripe is not set up'); }
    $base = !empty($c['base']) ? $c['base'] : 'https://api.stripe.com';
    $f = array('mode' => 'payment', 'success_url' => $okUrl, 'cancel_url' => $backUrl, 'client_reference_id' => $o['id'], 'customer_email' => $email, 'metadata[orderId]' => $o['id'],
        'line_items[0][quantity]' => 1, 'line_items[0][price_data][currency]' => strtolower($o['currency']), 'line_items[0][price_data][unit_amount]' => (int) round($o['total'] * 100), 'line_items[0][price_data][product_data][name]' => 'Order ' . $o['number']);
    list($st, $raw) = prov_http('POST', $base . '/v1/checkout/sessions', array('Authorization: Basic ' . base64_encode($c['secret'] . ':'), 'Content-Type: application/x-www-form-urlencoded'), http_build_query($f));
    $j = json_decode($raw, true);
    if ($st >= 300 || empty($j['url'])) { throw new Exception('Stripe: ' . (isset($j['error']['message']) ? clean_text($j['error']['message'], 160) : 'HTTP ' . $st)); }
    return $j['url'];
}
function gw_stripe_verify($secret, $payload, $header) {
    $t = ''; $sigs = array();
    foreach (explode(',', (string) $header) as $kv) { $p = explode('=', trim($kv), 2); if (count($p) === 2) { if ($p[0] === 't') { $t = $p[1]; } elseif ($p[0] === 'v1') { $sigs[] = $p[1]; } } }
    if ($t === '' || !$sigs || abs(time() - (int) $t) > 600) { return false; }
    $calc = hash_hmac('sha256', $t . '.' . $payload, $secret);
    foreach ($sigs as $s) { if (hash_equals($calc, $s)) { return true; } }
    return false;
}
function gw_paymob_url($db, $o, $u) {
    $c = gw_cfg($db, 'paymob');
    if (!$c || empty($c['apiKey']) || empty($c['integrationId']) || empty($c['iframeId'])) { throw new Exception('Paymob is not set up'); }
    $base = !empty($c['base']) ? $c['base'] : 'https://accept.paymob.com';
    $call = function ($path, $body) use ($base) {
        list($st, $raw) = prov_http('POST', $base . $path, array('Content-Type: application/json'), json_encode($body));
        $j = json_decode($raw, true);
        if ($st >= 300 || !is_array($j)) { throw new Exception('Paymob: HTTP ' . $st . ' ' . clean_text(substr($raw, 0, 120), 120)); }
        return $j;
    };
    $cents = (int) round($o['total'] * 100);
    $tok = $call('/api/auth/tokens', array('api_key' => $c['apiKey']));
    if (empty($tok['token'])) { throw new Exception('Paymob: bad API key'); }
    $ord = $call('/api/ecommerce/orders', array('auth_token' => $tok['token'], 'delivery_needed' => false, 'amount_cents' => $cents, 'currency' => $o['currency'], 'merchant_order_id' => $o['id'] . 'x' . time(), 'items' => array()));
    $parts = preg_split('/\s+/', trim($u['name']), 2);
    $pk = $call('/api/acceptance/payment_keys', array('auth_token' => $tok['token'], 'amount_cents' => $cents, 'expiration' => 3600, 'order_id' => $ord['id'], 'currency' => $o['currency'], 'integration_id' => (int) $c['integrationId'], 'lock_order_when_paid' => false,
        'billing_data' => array('first_name' => $parts[0], 'last_name' => isset($parts[1]) ? $parts[1] : $parts[0], 'email' => $u['email'], 'phone_number' => !empty($u['phone']) ? $u['phone'] : '01000000000', 'apartment' => 'NA', 'floor' => 'NA', 'street' => 'NA', 'building' => 'NA', 'shipping_method' => 'NA', 'postal_code' => 'NA', 'city' => 'Cairo', 'country' => 'EG', 'state' => 'Cairo')));
    if (empty($pk['token'])) { throw new Exception('Paymob: no payment token'); }
    return $base . '/api/acceptance/iframes/' . rawurlencode($c['iframeId']) . '?payment_token=' . rawurlencode($pk['token']);
}
function gw_paymob_verify($hmacKey, $obj, $given) {
    $get = function ($path) use ($obj) { $v = $obj; foreach (explode('.', $path) as $k) { if (!is_array($v) || !array_key_exists($k, $v)) { return ''; } $v = $v[$k]; } return is_bool($v) ? ($v ? 'true' : 'false') : (string) $v; };
    $keys = array('amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id', 'is_3d_secure', 'is_auto_captured', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success');
    $s = ''; foreach ($keys as $k) { $s .= $get($k); }
    return $hmacKey !== '' && hash_equals(hash_hmac('sha512', $s, $hmacKey), strtolower((string) $given));
}

/* ───────── system check (Settings → System check) ───────── */
function nc_ini_bytes($v) { $v = trim((string) $v); $n = (float) $v; switch (strtolower(substr($v, -1))) { case 'g': $n *= 1024; case 'm': $n *= 1024; case 'k': $n *= 1024; } return (int) $n; }
function nc_system_check($db) {
    $rows = array();
    $add = function ($id, $ok, $detail, $level = 'warn') use (&$rows) { $rows[] = array('id' => $id, 'ok' => (bool) $ok, 'level' => $ok ? 'ok' : $level, 'detail' => $detail); };
    $add('php', version_compare(PHP_VERSION, '7.0.0', '>='), PHP_VERSION, 'bad');
    foreach (array('pdo_mysql' => 'MySQL storage', 'curl' => 'provider APIs & online payments', 'zip' => 'update files (.zip)', 'mbstring' => 'text handling', 'openssl' => 'HTTPS & SMTP', 'simplexml' => 'Namecheap', 'json' => 'JSON') as $ext => $why) {
        $add('ext:' . $ext, extension_loaded($ext) || ($ext === 'pdo_mysql' && !use_sql()), $why, $ext === 'json' || $ext === 'curl' ? 'bad' : 'warn');
    }
    $up = nc_ini_bytes(ini_get('upload_max_filesize')); $post = nc_ini_bytes(ini_get('post_max_size'));
    $add('upload', $up >= 8 * 1048576 && $post >= 8 * 1048576, 'upload_max_filesize ' . ini_get('upload_max_filesize') . ' · post_max_size ' . ini_get('post_max_size') . ' (update files are ~1–2 MB, images up to 1.5 MB)');
    $site = dirname(dirname(NC_DATA));
    foreach (array(NC_DATA => 'api/data', $site . '/uploads' => 'uploads', $site . '/api' => 'api (updates)', $site . '/assets' => 'assets (updates)') as $dir => $label) {
        if ($label === 'uploads' && !is_dir($dir)) { @mkdir($dir, 0755, true); }
        $add('write:' . $label, is_dir($dir) && is_writable($dir), $label);
    }
    $op = function_exists('opcache_get_status') ? @opcache_get_status(false) : false;
    if ($op) { $val = (int) ini_get('opcache.validate_timestamps'); $rev = (int) ini_get('opcache.revalidate_freq'); $add('opcache', !$val || $rev <= 2, 'validate_timestamps=' . $val . ' revalidate_freq=' . $rev . ' — after an update the old code can stay cached for up to ' . $rev . 's; the updater also invalidates each file it writes'); }
    else { $add('opcache', true, 'opcache is off or not visible: updates apply at once'); }
    $smtp = meta_get($db, 'smtp', array());
    $add('mail', !empty($smtp['host']) || function_exists('mail'), !empty($smtp['host']) ? 'SMTP: ' . $smtp['host'] : (function_exists('mail') ? 'PHP mail() — many hosts drop these emails; set up SMTP' : 'no way to send email'));
    $add('siteurl', site_url($db) !== '', 'Settings → Store & tax → Site address (needed for password-reset and order links)');
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    $add('https', $https, $https ? 'HTTPS' : 'the site is opened over HTTP: use HTTPS before taking real customers');
    $last = meta_get($db, 'lastDaily', '');
    $add('cron', $last !== '' && $last >= gmdate('Y-m-d', time() - 2 * 86400), $last !== '' ? 'last daily run: ' . $last : 'the daily job (renewals & reminders) has never run: add a cron job (see Settings → Renewals)');
    return array('rows' => $rows, 'php' => PHP_VERSION, 'storage' => use_sql() ? 'mysql' : 'file', 'time' => gmdate('c'));
}

/* ───────── reading a mailbox over IMAP (read-only: EXAMINE + BODY.PEEK, nothing is marked as read or deleted) ───────── */
function mail_key() {
    $f = NC_DATA . '/.mailkey';
    if (!is_file($f)) { @file_put_contents($f, bin2hex(function_exists('random_bytes') ? random_bytes(32) : md5(uniqid('', true)) . md5(mt_rand()))); @chmod($f, 0600); }
    return hash('sha256', (string) @file_get_contents($f), true);
}
function mail_seal($plain) {
    if (!function_exists('openssl_encrypt')) { throw new Exception('the PHP openssl extension is needed to keep mailbox passwords'); }
    $iv = function_exists('random_bytes') ? random_bytes(16) : substr(md5(uniqid('', true), true), 0, 16);
    return base64_encode($iv . openssl_encrypt($plain, 'aes-256-cbc', mail_key(), OPENSSL_RAW_DATA, $iv));
}
function mail_unseal($sealed) {
    $raw = base64_decode((string) $sealed, true);
    if ($raw === false || strlen($raw) < 17 || !function_exists('openssl_decrypt')) { return ''; }
    $p = openssl_decrypt(substr($raw, 16), 'aes-256-cbc', mail_key(), OPENSSL_RAW_DATA, substr($raw, 0, 16));
    return $p === false ? '' : $p;
}

class NcImap {
    private $fp; private $n = 0;
    function __construct($cfg, $user, $pass) {
        $fp = @stream_socket_client(($cfg['secure'] === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['host'] . ':' . $cfg['port'], $en, $es, 10);
        if (!$fp) { throw new Exception('cannot reach the mail server ' . $cfg['host'] . ' (' . $es . ')'); }
        stream_set_timeout($fp, 15); $this->fp = $fp;
        fgets($fp, 2048); // greeting
        $r = $this->cmd('LOGIN ' . $this->q($user) . ' ' . $this->q($pass));
        if (!$r['ok']) { throw new Exception('the mail server refused the address or password'); }
    }
    private function q($s) { return '"' . addcslashes((string) $s, "\\\"") . '"'; }
    /** Sends a command and returns array(ok, lines) — literals ({n}) are read in full. */
    function cmd($c, $maxBytes = 3000000) {
        $tag = 'a' . (++$this->n);
        fwrite($this->fp, $tag . ' ' . $c . "\r\n");
        $out = ''; $total = 0;
        while (($l = fgets($this->fp, 65536)) !== false) {
            if (preg_match('/^' . $tag . ' (OK|NO|BAD)/i', $l, $m)) { return array('ok' => strtoupper($m[1]) === 'OK', 'data' => $out, 'status' => trim($l)); }
            $out .= $l; $total += strlen($l);
            if (preg_match('/\{(\d+)\}\r?\n$/', $l, $m)) { $need = (int) $m[1]; $buf = ''; while ($need > 0 && !feof($this->fp)) { $chunk = fread($this->fp, min(8192, $need)); if ($chunk === false || $chunk === '') { break; } $need -= strlen($chunk); if ($total < $maxBytes) { $buf .= $chunk; } } $out .= $buf; $total += strlen($buf); }
            if ($total > $maxBytes * 2) { break; }
        }
        return array('ok' => false, 'data' => $out, 'status' => 'connection closed');
    }
    function folders() {
        $r = $this->cmd('LIST "" "*"'); $o = array();
        foreach (preg_split('/\r?\n/', $r['data']) as $l) { if (preg_match('/^\* LIST \(([^)]*)\) (?:"(.)"|NIL) (.+)$/', trim($l), $m)) { $n = trim($m[3]); if ($n !== '' && $n[0] === '"') { $n = stripcslashes(substr($n, 1, -1)); } if (stripos($m[1], '\\Noselect') === false) { $o[] = mail_utf7($n); } } }
        return $o;
    }
    function examine($folder) { $r = $this->cmd('EXAMINE ' . $this->q(mail_utf7_enc($folder))); if (!$r['ok']) { throw new Exception('folder not found'); } return preg_match('/\* (\d+) EXISTS/', $r['data'], $m) ? (int) $m[1] : 0; }
    function headers($from, $to) {
        $r = $this->cmd("FETCH $from:$to (UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])", 1500000);
        return array_reverse($this->parseHeaders($r['data']));
    }
    function message($uid) {
        $r = $this->cmd('UID FETCH ' . (int) $uid . ' (BODY.PEEK[])', 2500000);
        if (!$r['ok'] || !preg_match('/\{(\d+)\}\r?\n/', $r['data'], $m, PREG_OFFSET_CAPTURE)) { throw new Exception('message not found'); }
        $raw = substr($r['data'], $m[0][1] + strlen($m[0][0]), (int) $m[1][0]); // exactly the literal: the closing ")" of the FETCH is not part of the mail
        return mail_parse($raw);
    }
    function select($folder) { $r = $this->cmd('SELECT ' . $this->q(mail_utf7_enc($folder))); if (!$r['ok']) { throw new Exception('folder not found'); } return preg_match('/\* (\d+) EXISTS/', $r['data'], $m) ? (int) $m[1] : 0; }
    function status($folder) { $r = $this->cmd('STATUS ' . $this->q(mail_utf7_enc($folder)) . ' (MESSAGES UNSEEN)'); return array('messages' => preg_match('/MESSAGES (\d+)/', $r['data'], $m) ? (int) $m[1] : 0, 'unseen' => preg_match('/UNSEEN (\d+)/', $r['data'], $u) ? (int) $u[1] : 0); }
    /** UIDs matching a search (newest first). $crit is an IMAP search expression built by mail_search(). */
    function searchUids($crit) { $r = $this->cmd('UID SEARCH ' . $crit); $u = array(); if (preg_match('/\* SEARCH ([\d ]*)/', $r['data'], $m)) { $u = array_map('intval', preg_split('/\s+/', trim($m[1]), -1, PREG_SPLIT_NO_EMPTY)); } rsort($u); return $u; }
    function headersByUids($uids) { if (!$uids) { return array(); } $r = $this->cmd('UID FETCH ' . implode(',', array_map('intval', $uids)) . ' (UID FLAGS RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])', 1500000); $by = array(); foreach ($this->parseHeaders($r['data']) as $h) { $by[$h['uid']] = $h; } $o = array(); foreach ($uids as $u) { if (isset($by[$u])) { $o[] = $by[$u]; } } return $o; }
    function store($uid, $flag, $on) { $r = $this->cmd('UID STORE ' . (int) $uid . ' ' . ($on ? '+' : '-') . 'FLAGS.SILENT (' . $flag . ')'); return $r['ok']; }
    function moveTo($uid, $dest) {
        $r = $this->cmd('UID MOVE ' . (int) $uid . ' ' . $this->q(mail_utf7_enc($dest)));
        if ($r['ok']) { return true; }
        $c = $this->cmd('UID COPY ' . (int) $uid . ' ' . $this->q(mail_utf7_enc($dest)));
        if (!$c['ok']) { return false; }
        return $this->expunge($uid);
    }
    function expunge($uid) { $this->store($uid, '\\Deleted', true); $r = $this->cmd('UID EXPUNGE ' . (int) $uid); if (!$r['ok']) { $r = $this->cmd('EXPUNGE'); } return $r['ok']; }
    function append($folder, $raw, $flags = '\\Seen') {
        $tag = 'a' . (++$this->n);
        fwrite($this->fp, $tag . ' APPEND ' . $this->q(mail_utf7_enc($folder)) . ' (' . $flags . ') {' . strlen($raw) . "}\r\n");
        $l = fgets($this->fp, 4096);
        if ($l === false || $l[0] !== '+') { return false; }
        fwrite($this->fp, $raw . "\r\n");
        while (($l = fgets($this->fp, 4096)) !== false) { if (strpos($l, $tag . ' ') === 0) { return stripos($l, $tag . ' OK') === 0; } }
        return false;
    }
    function rawMessage($uid) {
        $r = $this->cmd('UID FETCH ' . (int) $uid . ' (BODY.PEEK[])', 12000000);
        if (!$r['ok'] || !preg_match('/\{(\d+)\}\r?\n/', $r['data'], $m, PREG_OFFSET_CAPTURE)) { throw new Exception('message not found'); }
        return substr($r['data'], $m[0][1] + strlen($m[0][0]), (int) $m[1][0]);
    }
    private function parseHeaders($data) {
        $o = array();
        foreach (preg_split('/(?=^\* \d+ FETCH)/m', $data) as $blk) {
            if (!preg_match('/^\* (\d+) FETCH/', $blk, $m)) { continue; }
            $uid = preg_match('/UID (\d+)/', $blk, $u) ? (int) $u[1] : (int) $m[1];
            $hdr = ''; if (preg_match('/\{\d+\}\r?\n(.*)\r?\n\)/s', $blk, $h)) { $hdr = $h[1]; }
            $p = mail_headers($hdr);
            $o[] = array('uid' => $uid, 'from' => isset($p['from']) ? $p['from'] : '', 'subject' => isset($p['subject']) ? $p['subject'] : '', 'date' => isset($p['date']) ? $p['date'] : '', 'seen' => stripos($blk, '\\Seen') !== false, 'starred' => stripos($blk, '\\Flagged') !== false, 'size' => preg_match('/RFC822\.SIZE (\d+)/', $blk, $z) ? (int) $z[1] : 0);
        }
        return $o;
    }
    function close() { @fwrite($this->fp, "x LOGOUT\r\n"); @fclose($this->fp); }
}
function mail_utf7($s) { return function_exists('mb_convert_encoding') && strpos($s, '&') !== false ? @mb_convert_encoding(str_replace(',', '/', $s), 'UTF-8', 'UTF7-IMAP') ?: $s : $s; }
function mail_utf7_enc($s) { return function_exists('mb_convert_encoding') && preg_match('/[^\x20-\x7e]/', $s) ? @mb_convert_encoding($s, 'UTF7-IMAP', 'UTF-8') ?: $s : $s; }
function mail_dec($v) {
    $v = trim((string) $v);
    if ($v === '') { return ''; }
    $d = false;
    if (function_exists('iconv_mime_decode')) { $d = @iconv_mime_decode($v, 2, 'UTF-8'); }
    if ($d === false && function_exists('mb_decode_mimeheader')) { $d = mb_decode_mimeheader($v); }
    if ($d === false) { $d = $v; }
    // Kept as text (the page prints it escaped): the <address> part of "Name <a@b>" must survive.
    return nc_cut(trim(preg_replace('/[\x00-\x1f\x7f]+/u', ' ', (string) $d)), 400);
}
function mail_headers($raw) {
    $raw = preg_replace('/\r?\n[ \t]+/', ' ', $raw); $o = array();
    foreach (preg_split('/\r?\n/', $raw) as $l) { if (preg_match('/^([A-Za-z\-]+):\s*(.*)$/', $l, $m)) { $o[strtolower($m[1])] = $m[2]; } }
    foreach (array('from', 'subject', 'to', 'cc', 'reply-to') as $k) { if (isset($o[$k])) { $o[$k] = mail_dec($o[$k]); } }
    return $o;
}
function mail_charset($txt, $cs) { $cs = strtolower(trim((string) $cs, "\"' ")); if ($cs === '' || $cs === 'utf-8' || $cs === 'us-ascii') { return $txt; } if (function_exists('mb_convert_encoding')) { $r = @mb_convert_encoding($txt, 'UTF-8', $cs); if ($r !== false) { return $r; } } return function_exists('iconv') ? (@iconv($cs, 'UTF-8//IGNORE', $txt) ?: $txt) : $txt; }
function mail_body_decode($body, $enc, $cs) {
    $enc = strtolower(trim($enc));
    if ($enc === 'base64') { $body = base64_decode($body); } elseif ($enc === 'quoted-printable') { $body = quoted_printable_decode($body); }
    return mail_charset($body, $cs);
}
/** A small MIME reader: headers + the text of the message (plain text preferred, HTML turned into text) + attachment names. */
function mail_parse($raw, $depth = 0, $keep = false) {
    $parts = preg_split('/\r?\n\r?\n/', $raw, 2); $hdr = mail_headers($parts[0]); $body = isset($parts[1]) ? $parts[1] : '';
    $ct = isset($hdr['content-type']) ? $hdr['content-type'] : 'text/plain'; $enc = isset($hdr['content-transfer-encoding']) ? $hdr['content-transfer-encoding'] : '7bit';
    $res = array('headers' => array_intersect_key($hdr, array_flip(array('from', 'to', 'cc', 'subject', 'date', 'reply-to', 'message-id', 'references', 'in-reply-to'))), 'text' => '', 'html' => false, 'attachments' => array());
    if (preg_match('#^multipart/#i', $ct) && $depth < 5 && preg_match('/boundary="?([^";\s]+)"?/i', $ct, $b)) {
        $plain = ''; $html = '';
        foreach (preg_split('/--' . preg_quote($b[1], '/') . '(?:--)?\r?\n?/', $body) as $seg) {
            if (trim($seg) === '') { continue; }
            $sub = mail_parse($seg, $depth + 1, $keep);
            if ($sub['text'] !== '') { if ($sub['html']) { $html .= ($html ? "\n" : '') . $sub['text']; } else { $plain .= ($plain ? "\n" : '') . $sub['text']; } }
            $res['attachments'] = array_merge($res['attachments'], $sub['attachments']);
        }
        if ($plain !== '') { $res['text'] = $plain; } elseif ($html !== '') { $res['text'] = $html; $res['html'] = true; }
        return $res;
    }
    $disp = isset($hdr['content-disposition']) ? $hdr['content-disposition'] : '';
    $name = ''; if (preg_match('/(?:file)?name\*?="?([^";]+)"?/i', $disp . ' ' . $ct, $nm)) { $name = mail_dec(urldecode($nm[1])); }
    if (stripos($disp, 'attachment') === 0 || ($name !== '' && !preg_match('#^text/(plain|html)#i', $ct))) { $att = array('name' => $name !== '' ? $name : 'attachment', 'type' => strtolower(trim(explode(';', $ct)[0])), 'size' => strlen($body)); if ($keep) { $att['data'] = strtolower(trim($enc)) === 'base64' ? base64_decode($body) : (strtolower(trim($enc)) === 'quoted-printable' ? quoted_printable_decode($body) : $body); $att['size'] = strlen($att['data']); } $res['attachments'][] = $att; return $res; }
    $cs = preg_match('/charset="?([^";\s]+)"?/i', $ct, $cm) ? $cm[1] : '';
    $txt = mail_body_decode($body, $enc, $cs);
    if (preg_match('#^text/html#i', $ct)) { $txt = html_entity_decode(trim(preg_replace('/[ \t]+/', ' ', strip_tags(preg_replace(array('#<(script|style)[^>]*>.*?</\1>#is', '#<br\s*/?>|</p>|</div>|</tr>|</h\d>#i'), array('', "\n"), $txt)))), ENT_QUOTES, 'UTF-8'); $res['html'] = true; }
    $res['text'] = nc_substr(preg_replace("/\n{3,}/", "\n\n", trim($txt)), 60000);
    return $res;
}

/* ───────── the "N Emails" platform: folders, search, actions, sending, DNS ───────── */
/** The folder names for Sent / Trash / Drafts / Spam, whatever the server calls them. */
function mail_special($folders) {
    $pick = function ($re) use ($folders) { foreach ($folders as $f) { if (preg_match($re, $f)) { return $f; } } return ''; };
    return array('inbox' => 'INBOX', 'sent' => $pick('/^(INBOX[.\/])?(Sent( (Items|Messages|Mail))?)$/i'), 'drafts' => $pick('/^(INBOX[.\/])?Drafts?$/i'), 'trash' => $pick('/^(INBOX[.\/])?(Trash|Deleted( (Items|Messages))?|Bin)$/i'), 'spam' => $pick('/^(INBOX[.\/])?(Spam|Junk( E-?mail)?)$/i'));
}
function mail_search_crit($q, $filter) {
    $parts = array();
    $map = array('unread' => 'UNSEEN', 'read' => 'SEEN', 'starred' => 'FLAGGED');
    if (isset($map[$filter])) { $parts[] = $map[$filter]; }
    $q = trim(str_replace(array("\r", "\n", '"', '\\'), ' ', (string) $q));
    if ($q !== '') { $parts[] = 'OR OR FROM "' . $q . '" SUBJECT "' . $q . '" TO "' . $q . '"'; }
    return $parts ? implode(' ', $parts) : 'ALL';
}
function mail_smtp_cfg($db) { $c = meta_get($db, 'smtpOut', array()); return array('host' => !empty($c['host']) ? $c['host'] : 'smtp.hostinger.com', 'port' => !empty($c['port']) ? (int) $c['port'] : 465, 'secure' => isset($c['secure']) && in_array($c['secure'], array('tls', 'none'), true) ? $c['secure'] : 'ssl'); }
/** Delivers a ready-made RFC 822 message over SMTP with the mailbox's own login. */
function smtp_deliver($cfg, $user, $pass, $from, $rcpts, $raw) {
    $fp = @stream_socket_client(($cfg['secure'] === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['host'] . ':' . $cfg['port'], $en, $es, 12);
    if (!$fp) { throw new Exception('cannot reach the mail server ' . $cfg['host'] . ' (' . $es . ')'); }
    stream_set_timeout($fp, 25);
    try {
        smtp_cmd($fp, null, 220);
        $me = isset($_SERVER['SERVER_NAME']) ? preg_replace('/[^A-Za-z0-9.\-]/', '', $_SERVER['SERVER_NAME']) : 'localhost';
        smtp_cmd($fp, 'EHLO ' . ($me ?: 'localhost'), 250);
        if ($cfg['secure'] === 'tls') { smtp_cmd($fp, 'STARTTLS', 220); if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { throw new Exception('TLS handshake failed'); } smtp_cmd($fp, 'EHLO ' . ($me ?: 'localhost'), 250); }
        smtp_cmd($fp, 'AUTH LOGIN', 334); smtp_cmd($fp, base64_encode($user), 334); smtp_cmd($fp, base64_encode($pass), 235);
        smtp_cmd($fp, 'MAIL FROM:<' . $from . '>', 250);
        foreach ($rcpts as $r) { smtp_cmd($fp, 'RCPT TO:<' . $r . '>', array(250, 251)); }
        smtp_cmd($fp, 'DATA', 354);
        fwrite($fp, preg_replace('/^\./m', '..', $raw) . "\r\n.\r\n");
        smtp_cmd($fp, null, 250);
        @fwrite($fp, "QUIT\r\n");
    } catch (Exception $e) { @fclose($fp); throw $e; }
    @fclose($fp);
}
function mail_addr_list($s) { $o = array(); foreach (preg_split('/[,;]+/', (string) $s) as $a) { $a = trim($a); if (preg_match('/<([^>]+)>/', $a, $m)) { $a = trim($m[1]); } $a = strtolower($a); if ($a !== '') { if (!filter_var($a, FILTER_VALIDATE_EMAIL)) { throw new Exception('invalid address: ' . clean_text($a, 80)); } $o[] = $a; } } return array_values(array_unique($o)); }
/** Builds the message: text + attachments, with reply headers. */
function mail_build($from, $fromName, $to, $cc, $subject, $text, $files, $inReplyTo, $refs) {
    $dom = substr(strrchr($from, '@'), 1);
    $h = 'From: ' . ($fromName !== '' ? '=?UTF-8?B?' . base64_encode($fromName) . '?= ' : '') . '<' . $from . ">\r\nTo: " . implode(', ', $to) . "\r\n" . ($cc ? 'Cc: ' . implode(', ', $cc) . "\r\n" : '') . 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\nDate: " . date('r') . "\r\nMessage-ID: <" . bin2hex(function_exists('random_bytes') ? random_bytes(10) : md5(uniqid('', true), true)) . '@' . $dom . ">\r\nMIME-Version: 1.0\r\n";
    if ($inReplyTo !== '' && preg_match('/^<[^<>\s]+>$/', $inReplyTo)) { $h .= 'In-Reply-To: ' . $inReplyTo . "\r\nReferences: " . trim(preg_replace('/[^<>@\w.\-\s]/', '', $refs) . ' ' . $inReplyTo) . "\r\n"; }
    $bodyPart = "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text));
    if (!$files) { return $h . $bodyPart; }
    $b = '=_nc' . bin2hex(function_exists('random_bytes') ? random_bytes(8) : md5(uniqid('', true), true));
    $m = $h . 'Content-Type: multipart/mixed; boundary="' . $b . "\"\r\n\r\n--" . $b . "\r\n" . $bodyPart;
    foreach ($files as $f) { $n = preg_replace('/[\r\n"\\\\]/', '_', $f['name']); $m .= "--" . $b . "\r\nContent-Type: " . ($f['type'] ?: 'application/octet-stream') . '; name="' . $n . "\"\r\nContent-Disposition: attachment; filename=\"" . $n . "\"\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($f['data'])); }
    return $m . '--' . $b . "--\r\n";
}

/* Mail DNS: what a domain needs to send and receive at Hostinger Email. */
function mail_dns_want() {
    return array(
        'mx' => array(array('host' => '@', 'type' => 'MX', 'value' => '5 mx1.hostinger.com', 'ttl' => 14400), array('host' => '@', 'type' => 'MX', 'value' => '10 mx2.hostinger.com', 'ttl' => 14400)),
        'spf' => array(array('host' => '@', 'type' => 'TXT', 'value' => 'v=spf1 include:_spf.mail.hostinger.com ~all', 'ttl' => 14400)),
        'dkim' => array(array('host' => 'hostingermail-a._domainkey', 'type' => 'CNAME', 'value' => 'hostingermail-a.dkim.mail.hostinger.com', 'ttl' => 14400), array('host' => 'hostingermail-b._domainkey', 'type' => 'CNAME', 'value' => 'hostingermail-b.dkim.mail.hostinger.com', 'ttl' => 14400), array('host' => 'hostingermail-c._domainkey', 'type' => 'CNAME', 'value' => 'hostingermail-c.dkim.mail.hostinger.com', 'ttl' => 14400)),
        'dmarc' => array(array('host' => '_dmarc', 'type' => 'TXT', 'value' => 'v=DMARC1; p=none', 'ttl' => 14400)),
    );
}
/** Public DNS answer for one record set, or null when the host cannot look it up. */
function mail_dns_live($host, $type) {
    if (!function_exists('dns_get_record')) { return null; }
    $r = @dns_get_record($host, $type === 'MX' ? DNS_MX : ($type === 'CNAME' ? DNS_CNAME : DNS_TXT));
    if ($r === false) { return null; }
    $o = array();
    foreach ($r as $x) { $o[] = $type === 'MX' ? (int) $x['pri'] . ' ' . $x['target'] : ($type === 'CNAME' ? $x['target'] : (isset($x['txt']) ? $x['txt'] : '')); }
    return $o;
}
function mail_dns_status($domain, $localRecords, $live = true) {
    $out = array(); $name = strtolower($domain['name']);
    foreach (mail_dns_want() as $key => $recs) {
        $okAll = true; $detail = array(); $liveAny = false;
        foreach ($recs as $w) {
            $fq = $w['host'] === '@' ? $name : $w['host'] . '.' . $name;
            $got = $live ? mail_dns_live($fq, $w['type']) : null;
            if ($got !== null) { $liveAny = true; }
            $match = function ($g) use ($key, $w) { return $key === 'spf' ? (stripos($g, '_spf.mail.hostinger.com') !== false) : ($key === 'dmarc' ? stripos(trim(str_replace('"', '', $g)), 'v=DMARC1') === 0 : dns_norm($g) === dns_norm($w['value'])); };
            $has = false; $saved = false;
            if ($got !== null) { foreach ($got as $g) { if ($match($g)) { $has = true; } } }
            foreach ($localRecords as $r) { if ($r['type'] === $w['type'] && ($r['host'] === $w['host'] || $r['host'] === $fq) && $match($r['value'])) { $saved = true; } }
            if (!$has && $got === null && $saved) { $has = true; }
            if (!$has) { $okAll = false; }
            $detail[] = array('host' => $fq, 'type' => $w['type'], 'value' => $w['value'], 'ok' => $has, 'saved' => $saved);
        }
        $out[] = array('key' => $key, 'ok' => $okAll, 'live' => $liveAny, 'records' => $detail, 'required' => $key === 'mx' || $key === 'spf');
    }
    return $out;
}
/** Adds the records a domain needs to the saved DNS (and pushes them to the provider when DNS is connected). MX + SPF always, DMARC by default, DKIM on request. */
function mail_dns_apply($domainId, $actor, $dkim = false, $dmarc = true) {
    $want = mail_dns_want(); $need = array_merge($want['mx'], $want['spf']);
    if ($dmarc) { $need = array_merge($need, $want['dmarc']); }
    if ($dkim) { $need = array_merge($need, $want['dkim']); }
    $added = db_update(function (&$db) use ($domainId, $need, $actor) {
        $k = find_by(items_of($db, 'domains'), 'id', $domainId);
        if ($k < 0) { return 0; }
        $dns = isset($db['items']['domains'][$k]['dns']) && is_array($db['items']['domains'][$k]['dns']) ? $db['items']['domains'][$k]['dns'] : array();
        $n = 0;
        foreach ($need as $w) {
            $has = false;
            foreach ($dns as $ri => $r) {
                if ($r['type'] === $w['type'] && $r['host'] === $w['host'] && dns_norm($r['value']) === dns_norm($w['value'])) { $has = true; }
                // One SPF record only: merge Hostinger into an existing one.
                if (!$has && $w['type'] === 'TXT' && $w['host'] === '@' && $r['type'] === 'TXT' && $r['host'] === '@' && stripos(trim(str_replace('"', '', $r['value'])), 'v=spf1') === 0) {
                    $has = true; $cur = trim(str_replace('"', '', $r['value']));
                    if (stripos($cur, '_spf.mail.hostinger.com') === false) { $dns[$ri]['value'] = preg_match('/\s[-~?+]all\s*$/i', $cur) ? preg_replace('/(\s[-~?+]all)\s*$/i', ' include:_spf.mail.hostinger.com$1', $cur) : $cur . ' include:_spf.mail.hostinger.com ~all'; $n++; }
                }
                // One DMARC record only.
                if (!$has && $w['host'] === '_dmarc' && $r['host'] === '_dmarc' && $r['type'] === 'TXT') { $has = true; }
            }
            if (!$has) { $w['id'] = new_id(); $dns[] = $w; $n++; }
        }
        $db['items']['domains'][$k]['dns'] = $dns; $db['items']['domains'][$k]['mail'] = 'hostinger';
        log_act($db, $actor, 'mail-dns', $db['items']['domains'][$k]['name'] . ' +' . $n);
        return $n;
    });
    return array('added' => $added, 'warning' => prov_dns_autopush($domainId));
}
