<?php
/**
 * Notch Cloud Services: API (single file, flat-file storage, PHP 7.0+).
 * Written to api/ by install.php. Data lives in api/data/db.php (PHP-guarded JSON), never in a public file.
 *
 * Public : status | public/settings | public/catalog | public/lead | public/domain-search | auth/register
 * Auth   : auth/me | auth/login | auth/logout | auth/password
 * Client : me/data | svc/dns-save | svc/dns-delete | svc/server-power | svc/server-snapshot | tickets/create | tickets/reply | tickets/status
 * Admin  : admin/update | admin/domain | admin/domain-dns | admin/providers* | admin/pricing* | admin/overview | admin/users | admin/user-update | admin/user-delete | admin/items | admin/item-save | admin/item-delete
 *          admin/tickets | admin/leads | admin/lead-update | admin/lead-delete | admin/settings | admin/activity
 */
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

define('NC_VERSION', '__NC_VERSION__'); // replaced by scripts/package.mjs
define('NC_DATA', __DIR__ . '/data');
define('NC_DB', NC_DATA . '/db.php');
const NC_GUARD = "<?php http_response_code(404); exit; ?>\n";
const NC_DUMMY_HASH = '$2y$10$8Y16n8v4IzI3OW35lCBnoODimb31iLg1sMQ/8idOIoa4jptGzb9rW';

/** Resources an admin manages for clients: field => [type, max/options, 'req'?]. Every item also has id, uid (owner), created. */
$SCHEMA = array(
    'domains' => array('name' => array('str', 253, 'req'), 'status' => array('enum', array('active', 'pending', 'expiring', 'stopped')), 'expires' => array('date'), 'autoRenew' => array('bool'), 'provider' => array('str', 30), 'cost' => array('num'), 'price' => array('num'), 'notes' => array('str', 500), 'mail' => array('str', 20)),
    'mailboxes' => array('address' => array('str', 254, 'req'), 'quotaGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped'))),
    'hosting' => array('plan' => array('str', 60, 'req'), 'domain' => array('str', 253), 'diskGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped')), 'provider' => array('str', 30), 'ref' => array('str', 80), 'cost' => array('num'), 'billing' => array('enum', array('monthly', 'yearly')), 'expires' => array('date'), 'price' => array('num')),
    'servers' => array('name' => array('str', 60, 'req'), 'ip' => array('str', 64), 'spec' => array('str', 120), 'cpu' => array('num'), 'ram' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped'))),
    'invoices' => array('item' => array('str', 160, 'req'), 'amount' => array('num', 'req'), 'date' => array('date'), 'status' => array('enum', array('due', 'paid', 'void'))),
    // Websites: each one is linked to a hosting plan and a domain (and, through the domain, to its mailboxes).
    'websites' => array('name' => array('str', 120, 'req'), 'url' => array('str', 253), 'status' => array('enum', array('active', 'pending', 'stopped')), 'domainId' => array('str', 32), 'hostingId' => array('str', 32), 'provider' => array('str', 30), 'ref' => array('str', 80), 'notes' => array('str', 500), 'diskGb' => array('num'), 'usedGb' => array('num')),
    // Public price list shown on the website (edited in Admin → Plans). Not owned by a client.
    'plans' => array('category' => array('enum', array('hosting', 'email', 'vps', 'site', 'bundle')), 'nameAr' => array('str', 80, 'req'), 'nameEn' => array('str', 80), 'price' => array('num', 'req'), 'per' => array('enum', array('month', 'year', 'once')), 'featured' => array('bool'), 'active' => array('bool'), 'sort' => array('num'), 'specs' => array('str', 700), 'features' => array('str', 900)),
    // What we owe the providers (hosting / domain purchases). Admin only: never owned by a client (uid is empty).
    'purchases' => array('item' => array('str', 160, 'req'), 'provider' => array('str', 30), 'ref' => array('str', 80), 'service' => array('str', 20), 'client' => array('str', 32), 'amount' => array('num', 'req'), 'period' => array('enum', array('monthly', 'yearly', 'once')), 'date' => array('date'), 'status' => array('enum', array('due', 'paid', 'void'))),
);

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(array('error' => $msg), $code); }
function nc_len($s) { return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s); }
function nc_cut($s, $n) { return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n); }

/* ───────── storage ─────────
 * Two back ends behind the same two functions (db_read / db_update):
 *  - MySQL/MariaDB when api/data/config.php holds database settings (what install.php sets up);
 *  - a PHP-guarded JSON file otherwise (older installs keep working).
 */
function db_default() { return array('users' => array(), 'attempts' => array(), 'meta' => array(), 'items' => array(), 'tickets' => array(), 'leads' => array(), 'log' => array()); }

function nc_cfg() {
    static $c = null;
    if ($c === null) {
        $f = NC_DATA . '/config.php';
        $c = is_file($f) ? include $f : array();
        if (!is_array($c)) { $c = array(); }
    }
    return $c;
}
function use_sql() { $c = nc_cfg(); return !empty($c['db']['name']); }
function nc_pdo() {
    static $pdo = null;
    if ($pdo === null) {
        $c = nc_cfg();
        $d = $c['db'];
        $dsn = 'mysql:host=' . $d['host'] . (!empty($d['port']) ? ';port=' . (int) $d['port'] : '') . ';dbname=' . $d['name'] . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $d['user'], $d['pass'], array(PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false));
        $pdo->exec("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
    return $pdo;
}
function db_fail(Exception $e) {
    error_log('ncloud db: ' . $e->getMessage());
    fail('database error: ' . preg_replace('/\s+/', ' ', substr($e->getMessage(), 0, 160)), 500);
}
function nc_j($v) { return json_encode($v, JSON_UNESCAPED_UNICODE); }

/** Lists kept in their own tables: key in the db array => [table, extra columns taken from each record]. */
function sql_lists() { return array('users' => array('nc_users', array('email', 'role')), 'tickets' => array('nc_tickets', array('uid')), 'leads' => array('nc_leads', array())); }

function sql_read(PDO $pdo) {
    $d = db_default();
    foreach (sql_lists() as $key => $t) { foreach ($pdo->query('SELECT data FROM ' . $t[0] . ' ORDER BY seq') as $r) { $d[$key][] = json_decode($r['data'], true); } }
    foreach ($pdo->query('SELECT res, data FROM nc_items ORDER BY seq') as $r) { $d['items'][$r['res']][] = json_decode($r['data'], true); }
    foreach ($pdo->query('SELECT data FROM nc_log ORDER BY seq') as $r) { $d['log'][] = json_decode($r['data'], true); }
    foreach ($pdo->query('SELECT k, v FROM nc_meta') as $r) { $d['meta'][$r['k']] = json_decode($r['v'], true); }
    foreach ($pdo->query('SELECT k, v FROM nc_attempts') as $r) { $d['attempts'][$r['k']] = json_decode($r['v'], true); }
    return $d;
}

/** Writes only what changed between $old and $new (rows are matched by id / key). */
function sql_write(PDO $pdo, $old, $new) {
    $rows = function ($list) { $m = array(); foreach ($list as $it) { $m[(string) $it['id']] = $it; } return $m; };
    $syncRows = function ($table, $cols, $o, $n) use ($pdo, $rows) {
        $o = $rows($o); $n = $rows($n);
        foreach (array_diff_key($o, $n) as $id => $_) { $pdo->prepare('DELETE FROM ' . $table . ' WHERE id = ?')->execute(array($id)); }
        foreach ($n as $id => $it) {
            $json = nc_j($it);
            if (isset($o[$id])) {
                if (nc_j($o[$id]) === $json) { continue; }
                $set = 'data = ?'; $args = array($json);
                foreach ($cols as $c) { $set .= ', ' . $c . ' = ?'; $args[] = isset($it[$c]) ? (string) $it[$c] : ''; }
                $args[] = $id;
                $pdo->prepare('UPDATE ' . $table . ' SET ' . $set . ' WHERE id = ?')->execute($args);
            } else {
                $names = 'id, data'; $q = '?, ?'; $args = array($id, $json);
                foreach ($cols as $c) { $names .= ', ' . $c; $q .= ', ?'; $args[] = isset($it[$c]) ? (string) $it[$c] : ''; }
                $pdo->prepare('INSERT INTO ' . $table . ' (' . $names . ') VALUES (' . $q . ')')->execute($args);
            }
        }
    };
    foreach (sql_lists() as $key => $t) {
        $cols = $t[1];
        $syncRows($t[0], $cols, $old[$key], $new[$key]);
    }
    // items: one table, the resource name is a column
    $flat = function ($items) { $o = array(); foreach ($items as $res => $list) { foreach ($list as $it) { $it['__res'] = $res; $o[] = $it; } } return $o; };
    $oi = $rows($flat($old['items'])); $ni = $rows($flat($new['items']));
    foreach (array_diff_key($oi, $ni) as $id => $_) { $pdo->prepare('DELETE FROM nc_items WHERE id = ?')->execute(array($id)); }
    foreach ($ni as $id => $it) {
        $res = $it['__res']; unset($it['__res']);
        $json = nc_j($it);
        if (isset($oi[$id])) {
            $o = $oi[$id]; unset($o['__res']);
            if (nc_j($o) === $json && $oi[$id]['__res'] === $res) { continue; }
            $pdo->prepare('UPDATE nc_items SET data = ?, res = ?, uid = ? WHERE id = ?')->execute(array($json, $res, isset($it['uid']) ? (string) $it['uid'] : '', $id));
        } else {
            $pdo->prepare('INSERT INTO nc_items (id, res, uid, data) VALUES (?, ?, ?, ?)')->execute(array($id, $res, isset($it['uid']) ? (string) $it['uid'] : '', $json));
        }
    }
    if (nc_j($old['log']) !== nc_j($new['log'])) { // a short, capped list: rewritten as a whole
        $pdo->exec('DELETE FROM nc_log');
        $ins = $pdo->prepare('INSERT INTO nc_log (data) VALUES (?)');
        foreach ($new['log'] as $l) { $ins->execute(array(nc_j($l))); }
    }
    foreach (array('meta' => 'nc_meta', 'attempts' => 'nc_attempts') as $key => $table) {
        $col = $key === 'meta' ? 'v' : 'v';
        foreach (array_diff_key($old[$key], $new[$key]) as $k => $_) { $pdo->prepare('DELETE FROM ' . $table . ' WHERE k = ?')->execute(array((string) $k)); }
        foreach ($new[$key] as $k => $v) {
            if (isset($old[$key][$k]) && nc_j($old[$key][$k]) === nc_j($v)) { continue; }
            $pdo->prepare('REPLACE INTO ' . $table . ' (k, ' . $col . ') VALUES (?, ?)')->execute(array((string) $k, nc_j($v)));
        }
    }
}

function db_read() {
    if (use_sql()) {
        try { return sql_read(nc_pdo()); } catch (Exception $e) { db_fail($e); }
    }
    if (!is_file(NC_DB)) { return db_default(); }
    $raw = file_get_contents(NC_DB);
    $nl = strpos($raw, "\n");
    $d = json_decode($nl === false ? '' : substr($raw, $nl + 1), true);
    if (!is_array($d)) { return db_default(); }
    foreach (db_default() as $k => $v) { if (!isset($d[$k]) || !is_array($d[$k])) { $d[$k] = $v; } }
    return $d;
}
/** Locked read-modify-write. $fn receives the db array by reference and may return a value. */
function db_update($fn) {
    if (use_sql()) {
        $pdo = null; $locked = false;
        try {
            $pdo = nc_pdo();
            $locked = (int) $pdo->query("SELECT GET_LOCK('nc_db', 10)")->fetchColumn() === 1;
            if (!$locked) { fail('storage busy', 503); }
            $pdo->beginTransaction();
            $old = sql_read($pdo);
            $db = $old;
            $ret = $fn($db);
            sql_write($pdo, $old, $db);
            $pdo->commit();
            $pdo->query("SELECT RELEASE_LOCK('nc_db')");
            return $ret;
        } catch (Exception $e) {
            if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
            if ($pdo && $locked) { try { $pdo->query("SELECT RELEASE_LOCK('nc_db')"); } catch (Exception $x) { /* connection gone */ } }
            db_fail($e);
        }
    }
    $lock = fopen(NC_DATA . '/db.lock', 'c');
    if (!$lock || !flock($lock, LOCK_EX)) { fail('storage busy', 503); }
    $db = db_read();
    $ret = $fn($db);
    $tmp = NC_DB . '.tmp';
    if (file_put_contents($tmp, NC_GUARD . json_encode($db, JSON_UNESCAPED_UNICODE), LOCK_EX) === false || !rename($tmp, NC_DB)) {
        flock($lock, LOCK_UN); fail('could not save data', 500);
    }
    @chmod(NC_DB, 0600);
    flock($lock, LOCK_UN); fclose($lock);
    return $ret;
}

/* ───────── helpers ───────── */
function public_user($u) { return array('id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => isset($u['created']) ? $u['created'] : null, 'phone' => isset($u['phone']) ? $u['phone'] : '', 'company' => isset($u['company']) ? $u['company'] : '', 'source' => isset($u['source']) ? $u['source'] : ''); }
function new_id() { return function_exists('random_bytes') ? bin2hex(random_bytes(8)) : md5(uniqid('', true)); }
function find_by($list, $key, $val) { foreach ($list as $i => $u) { if (isset($u[$key]) && $u[$key] === $val) { return $i; } } return -1; }
function find_user($db, $key, $val) { return find_by($db['users'], $key, $val); }
function clean_email($e) { return strtolower(trim((string) $e)); }
function clean_text($s, $max) { return nc_cut(trim(preg_replace('/[ \t]+/u', ' ', strip_tags((string) $s))), $max); }
function clean_name($n) { return clean_text(preg_replace('/\s+/u', ' ', (string) $n), 80); }
function meta_get($db, $k, $default) { return isset($db['meta'][$k]) ? $db['meta'][$k] : $default; }
function log_act(&$db, $actor, $action, $detail) {
    $db['log'][] = array('at' => gmdate('c'), 'by' => $actor ? $actor['name'] : '-', 'action' => $action, 'detail' => clean_text($detail, 200));
    if (count($db['log']) > 300) { array_splice($db['log'], 0, count($db['log']) - 300); }
}
function body() {
    if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 200000) { fail('request too large', 413); }
    $d = json_decode(file_get_contents('php://input'), true);
    return is_array($d) ? $d : array();
}
function require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { fail('POST required', 405); }
    // Custom header + JSON body: a cross-site form cannot send these, which is our CSRF guard (with SameSite cookies).
    if (!isset($_SERVER['HTTP_X_NC']) || $_SERVER['HTTP_X_NC'] !== '1') { fail('bad request', 400); }
}
function check_password($p) { if (!is_string($p) || strlen($p) < 8) { fail('password must be at least 8 characters', 422); } if (strlen($p) > 200) { fail('password too long', 422); } }
function admin_count($db) { $n = 0; foreach ($db['users'] as $u) { if ($u['role'] === 'admin') { $n++; } } return $n; }
function user_name($db, $uid) { $i = find_user($db, 'id', $uid); return $i < 0 ? '-' : $db['users'][$i]['name']; }

function rate_blocked(&$db, $key, $max, $window) {
    $now = time();
    foreach ($db['attempts'] as $k => $l) { if (!$l || max($l) < $now - 3600) { unset($db['attempts'][$k]); } }
    $list = isset($db['attempts'][$key]) ? $db['attempts'][$key] : array();
    $list = array_values(array_filter($list, function ($t) use ($now, $window) { return $t > $now - $window; }));
    if ($list) { $db['attempts'][$key] = $list; } else { unset($db['attempts'][$key]); }
    return count($list) >= $max;
}
function rate_hit(&$db, $key) { $db['attempts'][$key][] = time(); }
function client_ip() { return md5(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : ''); }

/** Validate a record against a field schema. Returns the clean record or null (and sets $err). */
function clean_fields($fields, $in, &$err) {
    $o = array();
    foreach ($fields as $k => $d) {
        $type = $d[0];
        $req = in_array('req', $d, true);
        $v = array_key_exists($k, $in) ? $in[$k] : null;
        if ($type === 'str') {
            $v = clean_text($v === null ? '' : $v, $d[1]);
            if ($req && $v === '') { $err = $k . ' is required'; return null; }
        } elseif ($type === 'num') {
            if (!is_numeric($v)) { if ($req) { $err = $k . ' must be a number'; return null; } $v = 0; }
            $v = $v + 0;
            if ($v < 0 || $v > 1000000000) { $err = $k . ' is out of range'; return null; }
        } elseif ($type === 'bool') {
            $v = (bool) $v;
        } elseif ($type === 'date') {
            $v = (string) $v;
            if ($v !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) { $err = $k . ' must be YYYY-MM-DD'; return null; }
        } elseif ($type === 'enum') {
            if (!in_array($v, $d[1], true)) { $v = $d[1][0]; }
        }
        $o[$k] = $v;
    }
    return $o;
}

function start_session() {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
    session_name('ncsid');
    if (PHP_VERSION_ID >= 70300) {
        session_set_cookie_params(array('lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax'));
    } else {
        session_set_cookie_params(0, '/; samesite=Lax', '', $https, true);
    }
    @session_start();
}
function current_user() {
    if (empty($_SESSION['uid'])) { return null; }
    $db = db_read();
    $i = find_user($db, 'id', $_SESSION['uid']);
    return $i < 0 ? null : $db['users'][$i];
}
function need_user() { $u = current_user(); if (!$u) { fail('not signed in', 401); } return $u; }
function need_admin() { $u = need_user(); if ($u['role'] !== 'admin') { fail('forbidden', 403); } return $u; }
function can_touch($u, $item) { return $u['role'] === 'admin' || (isset($item['uid']) && $item['uid'] === $u['id']); }
function res_name() { global $SCHEMA; $r = isset($_GET['res']) ? (string) $_GET['res'] : ''; if (!isset($SCHEMA[$r])) { fail('unknown resource', 404); } return $r; }
/** Records that belong to the company, not to a client (purchase bills, the public plans). */
/** A DNS value in a comparable form: no case, no trailing dot, single spaces. */
function dns_norm($v) { return rtrim(strtolower(trim(preg_replace('/\s+/', ' ', (string) $v))), '.'); }
function res_unowned($res) { return $res === 'purchases' || $res === 'plans'; }
function items_of($db, $res) { return isset($db['items'][$res]) && is_array($db['items'][$res]) ? $db['items'][$res] : array(); }
function mine($db, $res, $uid) { return array_values(array_filter(items_of($db, $res), function ($i) use ($uid) { return $i['uid'] === $uid; })); }

/* ───────── routing ───────── */
$r = isset($_GET['r']) ? (string) $_GET['r'] : '';
if (!is_file(NC_DATA . '/installed.lock')) {
    if ($r === 'status') { out(array('installed' => false)); }
    fail('not installed', 503);
}
start_session();

if ($r === 'admin/update' || $r === 'admin/update/restore') {
    require_once __DIR__ . '/update.php';
    $me = need_admin();
    upd_route($r, $me);
    fail('not found', 404);
}
if (strpos($r, 'admin/provider') === 0 || strpos($r, 'admin/pricing') === 0 || strpos($r, 'admin/domain') === 0 || strpos($r, 'admin/hosting-') === 0) {
    require_once __DIR__ . '/providers.php';
    $me = need_admin();
    prov_route($r, $me);
    fail('not found', 404);
}

switch ($r) {
    /* ── public ── */
    case 'status':
        $db = db_read();
        out(array('installed' => true, 'version' => NC_VERSION, 'storage' => use_sql() ? 'mysql' : 'file', 'site' => meta_get($db, 'site', '')));

    case 'public/settings':
        $db = db_read();
        out(array('site' => meta_get($db, 'site', ''), 'placeholder' => (bool) meta_get($db, 'placeholder', false), 'currency' => meta_get($db, 'currency', ''), 'contactEmail' => meta_get($db, 'contactEmail', ''),
            'phone' => meta_get($db, 'phone', ''), 'whatsapp' => meta_get($db, 'whatsapp', ''), 'address' => meta_get($db, 'address', ''), 'allowRegistration' => (bool) meta_get($db, 'allowRegistration', true),
            'brand' => meta_get($db, 'brand', new stdClass())));

    case 'public/catalog':
        // What the website sells: the active plans (Admin → Plans) and the domain extensions chosen in TLD pricing. No costs, no providers.
        $db = db_read();
        $plans = array_values(array_filter(items_of($db, 'plans'), function ($p) { return !empty($p['active']); }));
        usort($plans, function ($a, $b) { return ((float) $a['sort']) <=> ((float) $b['sort']); });
        $tlds = array();
        if (is_file(NC_DATA . '/cache-tlds.json')) {
            require_once __DIR__ . '/providers.php';
            foreach (prov_tld_table($db, prov_cache_read()) as $r) { if ($r['selected']) { $tlds[] = array('ext' => '.' . $r['tld'], 'register' => $r['sell'], 'renew' => $r['renewSell']); } }
        }
        out(array('plans' => array_map(function ($p) { unset($p['uid'], $p['created']); return $p; }, $plans), 'tlds' => $tlds, 'currency' => meta_get($db, 'currency', '')));

    case 'public/lead':
        require_post();
        $b = body();
        if (!empty($b['website'])) { out(array('ok' => true)); } // honeypot: bots fill the hidden field
        $name = clean_name(isset($b['name']) ? $b['name'] : '');
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $msg = clean_text(isset($b['message']) ? $b['message'] : '', 3000);
        $service = clean_text(isset($b['service']) ? $b['service'] : '', 60);
        $phone = clean_text(isset($b['phone']) ? $b['phone'] : '', 30);
        if ($name === '') { fail('name is required', 422); }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        $ip = client_ip();
        $lead = array('id' => new_id(), 'name' => $name, 'email' => $email, 'phone' => $phone, 'service' => $service, 'message' => $msg, 'status' => 'new', 'at' => gmdate('c'));
        $res = db_update(function (&$db) use ($ip, $lead) {
            if (rate_blocked($db, 'lead:' . $ip, 5, 3600)) { return array('blocked' => true); }
            rate_hit($db, 'lead:' . $ip);
            $db['leads'][] = $lead;
            if (count($db['leads']) > 1000) { array_shift($db['leads']); }
            return array('to' => meta_get($db, 'contactEmail', ''));
        });
        if (!empty($res['blocked'])) { fail('too many messages, try later', 429); }
        if (!empty($res['to']) && function_exists('mail')) {
            @mail($res['to'], '=?UTF-8?B?' . base64_encode('New request: ' . $name) . '?=', "Name: $name\nEmail: $email\nPhone: $phone\nService: $service\n\n$msg", "Content-Type: text/plain; charset=UTF-8\r\nReply-To: $email");
        }
        out(array('ok' => true), 201);

    case 'public/domain-search':
    case 'svc/domain-search':
        if ($r === 'svc/domain-search') { need_user(); }
        $ip = client_ip();
        $blocked = db_update(function (&$db) use ($ip) {
            if (rate_blocked($db, 'dom:' . $ip, 40, 3600)) { return true; }
            rate_hit($db, 'dom:' . $ip);
            return false;
        });
        if ($blocked) { fail('too many searches, try later', 429); }
        require_once __DIR__ . '/providers.php';
        out(prov_search(db_read(), isset($_GET['q']) ? (string) $_GET['q'] : '', isset($_GET['tlds']) && $_GET['tlds'] !== '' ? explode(',', (string) $_GET['tlds']) : array(), false));

    /* ── auth ── */
    case 'auth/me':
        $u = current_user();
        out(array('user' => $u ? public_user($u) : null));

    case 'auth/login':
        require_post();
        $b = body();
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $pass = isset($b['password']) ? (string) $b['password'] : '';
        $ip = client_ip();
        $blocked = db_update(function (&$db) use ($ip) { return rate_blocked($db, 'login:' . $ip, 8, 600); });
        if ($blocked) { fail('too many attempts, try again in 10 minutes', 429); }
        $db = db_read();
        $i = find_user($db, 'email', $email);
        $hash = $i >= 0 ? $db['users'][$i]['hash'] : NC_DUMMY_HASH;
        $ok = password_verify($pass, $hash) && $i >= 0;
        if (!$ok) {
            db_update(function (&$db) use ($ip) { rate_hit($db, 'login:' . $ip); });
            fail('wrong email or password', 401);
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = $db['users'][$i]['id'];
        out(array('user' => public_user($db['users'][$i])));

    case 'auth/register':
        require_post();
        $b = body();
        $name = clean_name(isset($b['name']) ? $b['name'] : '');
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $phone = clean_text(isset($b['phone']) ? $b['phone'] : '', 30);
        $company = clean_text(isset($b['company']) ? $b['company'] : '', 80);
        if ($name === '') { fail('name is required', 422); }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        check_password(isset($b['password']) ? $b['password'] : '');
        $ip = client_ip();
        $user = array('id' => new_id(), 'name' => $name, 'email' => $email, 'role' => 'client', 'hash' => password_hash($b['password'], PASSWORD_DEFAULT), 'created' => gmdate('c'), 'phone' => $phone, 'company' => $company, 'source' => 'signup');
        $res = db_update(function (&$db) use ($user, $ip) {
            if (!meta_get($db, 'allowRegistration', true)) { return 'closed'; }
            if (rate_blocked($db, 'reg:' . $ip, 5, 3600)) { return 'rate'; }
            if (find_user($db, 'email', $user['email']) >= 0) { return 'dup'; }
            rate_hit($db, 'reg:' . $ip);
            $db['users'][] = $user;
            log_act($db, $user, 'signup', $user['email']);
            return array('to' => meta_get($db, 'contactEmail', ''));
        });
        if ($res === 'closed') { fail('new sign-ups are closed', 403); }
        if ($res === 'rate') { fail('too many attempts, try later', 429); }
        if ($res === 'dup') { fail('this email is already registered', 409); }
        if (!empty($res['to']) && function_exists('mail')) {
            @mail($res['to'], '=?UTF-8?B?' . base64_encode('New client: ' . $name) . '?=', "A new client signed up.\nName: $name\nEmail: $email\nPhone: $phone\nCompany: $company", "Content-Type: text/plain; charset=UTF-8\r\nReply-To: $email");
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = $user['id'];
        out(array('user' => public_user($user)), 201);

    case 'orders/create':
        $u = need_user();
        require_post();
        $b = body();
        $planId = isset($b['planId']) ? (string) $b['planId'] : '';
        $note = clean_text(isset($b['note']) ? $b['note'] : '', 2000);
        $db0 = db_read();
        $pi = find_by(items_of($db0, 'plans'), 'id', $planId);
        if ($pi < 0) { fail('plan not found', 404); }
        $plan = $db0['items']['plans'][$pi];
        $now = gmdate('c');
        $line = $plan['nameEn'] !== '' ? $plan['nameEn'] : $plan['nameAr'];
        $per = array('month' => '/ month', 'year' => '/ year', 'once' => 'one-time');
        $text = 'New order request: ' . $line . ' — ' . $plan['price'] . ' ' . (meta_get($db0, 'currency', '') ?: 'EGP') . ' ' . $per[$plan['per']] . ($note !== '' ? "\n\n" . $note : '');
        $t = array('id' => new_id(), 'uid' => $u['id'], 'subject' => 'Order: ' . $line, 'status' => 'open', 'updated' => $now, 'created' => $now, 'messages' => array(array('from' => 'client', 'name' => $u['name'], 'text' => $text, 'at' => $now)));
        $to = db_update(function (&$db) use ($t, $u) { $db['tickets'][] = $t; log_act($db, $u, 'order', $t['subject']); return meta_get($db, 'contactEmail', ''); });
        if ($to && function_exists('mail')) { @mail($to, '=?UTF-8?B?' . base64_encode($t['subject']) . '?=', $u['name'] . ' <' . $u['email'] . ">\n\n" . $text, "Content-Type: text/plain; charset=UTF-8\r\nReply-To: " . $u['email']); }
        out(array('ticket' => $t), 201);

    case 'auth/logout':
        require_post();
        $_SESSION = array();
        session_destroy();
        out(array('ok' => true));

    case 'auth/password':
        require_post();
        $u = need_user();
        $b = body();
        if (!password_verify(isset($b['current']) ? (string) $b['current'] : '', $u['hash'])) { fail('current password is wrong', 403); }
        check_password(isset($b['new']) ? $b['new'] : '');
        $h = password_hash($b['new'], PASSWORD_DEFAULT);
        db_update(function (&$db) use ($u, $h) { $i = find_user($db, 'id', $u['id']); if ($i >= 0) { $db['users'][$i]['hash'] = $h; log_act($db, $u, 'password', 'changed own password'); } });
        out(array('ok' => true));

    /* ── client data ── */
    case 'me/data':
        $u = need_user();
        $db = db_read();
        $o = array();
        foreach (array_keys($SCHEMA) as $res) {
            if (res_unowned($res)) { continue; }
            // Our cost and supplier are never shown to clients.
            $o[$res] = array_map(function ($it) { unset($it['cost'], $it['provider'], $it['ref']); return $it; }, mine($db, $res, $u['id']));
        }
        $o['tickets'] = array_values(array_filter($db['tickets'], function ($t) use ($u) { return $t['uid'] === $u['id']; }));
        out($o);

    case 'svc/dns-save':
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $types = array('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA');
        $type = isset($b['type']) ? (string) $b['type'] : '';
        $value = clean_text(isset($b['value']) ? $b['value'] : '', 500);
        $host = clean_text(isset($b['host']) ? $b['host'] : '', 253);
        $ttl = isset($b['ttl']) ? (int) $b['ttl'] : 3600;
        if (!in_array($type, $types, true)) { fail('invalid record type', 422); }
        if ($value === '') { fail('value is required', 422); }
        if (!in_array($ttl, array(300, 3600, 14400, 86400), true)) { $ttl = 3600; }
        $rec = array('id' => new_id(), 'type' => $type, 'host' => $host === '' ? '@' : $host, 'value' => $value, 'ttl' => $ttl);
        $res = db_update(function (&$db) use ($id, $u, $rec) {
            $i = find_by(items_of($db, 'domains'), 'id', $id);
            if ($i < 0) { return 'missing'; }
            $d = $db['items']['domains'][$i];
            if (!can_touch($u, $d)) { return 'forbidden'; }
            $dns = isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array();
            if (count($dns) >= 100) { return 'limit'; }
            foreach ($dns as $x) { if ($x['type'] === $rec['type'] && $x['host'] === $rec['host'] && dns_norm($x['value']) === dns_norm($rec['value'])) { return 'ok'; } }
            $dns[] = $rec;
            $db['items']['domains'][$i]['dns'] = $dns;
            log_act($db, $u, 'dns-add', $d['name'] . ' ' . $rec['type'] . ' ' . $rec['host']);
            return 'ok';
        });
        if ($res === 'missing') { fail('domain not found', 404); }
        if ($res === 'forbidden') { fail('forbidden', 403); }
        if ($res === 'limit') { fail('too many records', 409); }
        require_once __DIR__ . '/providers.php';
        out(array('ok' => true, 'record' => $rec, 'warning' => prov_dns_autopush($id)), 201);

    case 'svc/dns-delete':
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $rid = isset($b['rid']) ? (string) $b['rid'] : '';
        $res = db_update(function (&$db) use ($id, $rid, $u) {
            $i = find_by(items_of($db, 'domains'), 'id', $id);
            if ($i < 0) { return 'missing'; }
            $d = $db['items']['domains'][$i];
            if (!can_touch($u, $d)) { return 'forbidden'; }
            $dns = isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array();
            $db['items']['domains'][$i]['dns'] = array_values(array_filter($dns, function ($x) use ($rid) { return $x['id'] !== $rid; }));
            log_act($db, $u, 'dns-delete', $d['name']);
            return 'ok';
        });
        if ($res === 'missing') { fail('domain not found', 404); }
        if ($res === 'forbidden') { fail('forbidden', 403); }
        require_once __DIR__ . '/providers.php';
        out(array('ok' => true, 'warning' => prov_dns_autopush($id)));

    case 'svc/server-power':
    case 'svc/server-snapshot':
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $power = ($r === 'svc/server-power');
        $on = !empty($b['on']);
        $res = db_update(function (&$db) use ($id, $u, $power, $on) {
            $i = find_by(items_of($db, 'servers'), 'id', $id);
            if ($i < 0) { return 'missing'; }
            $s = $db['items']['servers'][$i];
            if (!can_touch($u, $s)) { return 'forbidden'; }
            if ($power) {
                if ($s['status'] === 'pending') { return 'pending'; }
                $db['items']['servers'][$i]['status'] = $on ? 'active' : 'stopped';
                $db['items']['servers'][$i]['cpu'] = $on ? 8 : 0;
                $db['items']['servers'][$i]['ram'] = $on ? 22 : 0;
                log_act($db, $u, $on ? 'server-start' : 'server-stop', $s['name']);
            } else {
                $n = isset($s['snapshots']) ? (int) $s['snapshots'] : 0;
                $db['items']['servers'][$i]['snapshots'] = min(50, $n + 1);
                log_act($db, $u, 'server-snapshot', $s['name']);
            }
            return 'ok';
        });
        if ($res === 'missing') { fail('server not found', 404); }
        if ($res === 'forbidden') { fail('forbidden', 403); }
        if ($res === 'pending') { fail('server is still being set up', 409); }
        out(array('ok' => true));

    /* ── tickets (client + admin) ── */
    case 'tickets/create':
        $u = need_user();
        require_post();
        $b = body();
        $subject = clean_text(isset($b['subject']) ? $b['subject'] : '', 120);
        $text = clean_text(isset($b['text']) ? $b['text'] : '', 4000);
        if ($subject === '' || $text === '') { fail('subject and message are required', 422); }
        $now = gmdate('c');
        $t = array('id' => new_id(), 'uid' => $u['id'], 'subject' => $subject, 'status' => 'open', 'updated' => $now, 'created' => $now,
            'messages' => array(array('from' => 'client', 'name' => $u['name'], 'text' => $text, 'at' => $now)));
        db_update(function (&$db) use ($t, $u) { $db['tickets'][] = $t; log_act($db, $u, 'ticket-create', $t['subject']); });
        out(array('ticket' => $t), 201);

    case 'tickets/reply':
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $text = clean_text(isset($b['text']) ? $b['text'] : '', 4000);
        if ($text === '') { fail('message is required', 422); }
        $res = db_update(function (&$db) use ($id, $text, $u) {
            $i = find_by($db['tickets'], 'id', $id);
            if ($i < 0) { return 'missing'; }
            $t = $db['tickets'][$i];
            if (!can_touch($u, $t)) { return 'forbidden'; }
            $admin = $u['role'] === 'admin' && $t['uid'] !== $u['id'];
            $now = gmdate('c');
            $db['tickets'][$i]['messages'][] = array('from' => $admin ? 'admin' : 'client', 'name' => $u['name'], 'text' => $text, 'at' => $now);
            $db['tickets'][$i]['status'] = $admin ? 'answered' : 'open';
            $db['tickets'][$i]['updated'] = $now;
            log_act($db, $u, 'ticket-reply', $t['subject']);
            return 'ok';
        });
        if ($res === 'missing') { fail('ticket not found', 404); }
        if ($res === 'forbidden') { fail('forbidden', 403); }
        out(array('ok' => true));

    case 'tickets/status':
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $st = isset($b['status']) ? (string) $b['status'] : '';
        if (!in_array($st, array('open', 'answered', 'closed'), true)) { fail('invalid status', 422); }
        $res = db_update(function (&$db) use ($id, $st, $u) {
            $i = find_by($db['tickets'], 'id', $id);
            if ($i < 0) { return 'missing'; }
            if (!can_touch($u, $db['tickets'][$i])) { return 'forbidden'; }
            if ($u['role'] !== 'admin' && $st === 'answered') { return 'forbidden'; }
            $db['tickets'][$i]['status'] = $st;
            $db['tickets'][$i]['updated'] = gmdate('c');
            log_act($db, $u, 'ticket-status', $db['tickets'][$i]['subject'] . ' -> ' . $st);
            return 'ok';
        });
        if ($res === 'missing') { fail('ticket not found', 404); }
        if ($res === 'forbidden') { fail('forbidden', 403); }
        out(array('ok' => true));

    /* ── admin: overview ── */
    case 'admin/overview':
        need_admin();
        $db = db_read();
        $admins = admin_count($db);
        $active = 0; $counts = array();
        foreach (array_keys($SCHEMA) as $res) {
            $list = items_of($db, $res);
            $counts[$res] = count($list);
            if ($res !== 'invoices') { foreach ($list as $it) { if ($it['status'] === 'active') { $active++; } } }
        }
        $paid = 0; $due = 0;
        foreach (items_of($db, 'invoices') as $inv) { if ($inv['status'] === 'paid') { $paid += $inv['amount']; } elseif ($inv['status'] === 'due') { $due += $inv['amount']; } }
        $open = 0; foreach ($db['tickets'] as $t) { if ($t['status'] === 'open') { $open++; } } // open = waiting for an admin reply
        $newLeads = 0; foreach ($db['leads'] as $l) { if ($l['status'] === 'new') { $newLeads++; } }
        $soon = date('Y-m-d', time() + 30 * 86400);
        $expiring = array();
        foreach (items_of($db, 'domains') as $d) {
            if ($d['status'] === 'expiring' || ($d['expires'] !== '' && $d['expires'] <= $soon)) { $expiring[] = array('id' => $d['id'], 'name' => $d['name'], 'expires' => $d['expires'], 'owner' => user_name($db, $d['uid'])); }
        }
        out(array('users' => count($db['users']), 'admins' => $admins, 'clients' => count($db['users']) - $admins, 'site' => meta_get($db, 'site', ''),
            'counts' => $counts, 'activeServices' => $active, 'paid' => $paid, 'due' => $due, 'openTickets' => $open, 'newLeads' => $newLeads,
            'expiring' => array_slice($expiring, 0, 6), 'recent' => array_slice(array_reverse($db['log']), 0, 8)));

    /* ── admin: users ── */
    case 'admin/users':
        need_admin();
        $db = db_read();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') { out(array('users' => array_map('public_user', $db['users']))); }
        $me = need_admin();
        require_post();
        $b = body();
        $name = clean_name(isset($b['name']) ? $b['name'] : '');
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $role = (isset($b['role']) && $b['role'] === 'admin') ? 'admin' : 'client';
        if ($name === '') { fail('name is required', 422); }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        check_password(isset($b['password']) ? $b['password'] : '');
        $hash = password_hash($b['password'], PASSWORD_DEFAULT);
        $user = array('id' => new_id(), 'name' => $name, 'email' => $email, 'role' => $role, 'hash' => $hash, 'created' => gmdate('c'));
        $dup = db_update(function (&$db) use ($user, $me) {
            if (find_user($db, 'email', $user['email']) >= 0) { return true; }
            $db['users'][] = $user;
            log_act($db, $me, 'user-create', $user['email'] . ' (' . $user['role'] . ')');
            return false;
        });
        if ($dup) { fail('this email is already registered', 409); }
        out(array('user' => public_user($user)), 201);

    case 'admin/user-update':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $name = isset($b['name']) ? clean_name($b['name']) : null;
        $role = isset($b['role']) ? ($b['role'] === 'admin' ? 'admin' : 'client') : null;
        $hash = null;
        if (isset($b['password']) && $b['password'] !== '') { check_password($b['password']); $hash = password_hash($b['password'], PASSWORD_DEFAULT); }
        $phone = isset($b['phone']) ? clean_text($b['phone'], 30) : null;
        $company = isset($b['company']) ? clean_text($b['company'], 80) : null;
        $email = isset($b['email']) ? clean_email($b['email']) : null;
        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        $res = db_update(function (&$db) use ($id, $name, $role, $hash, $me, $phone, $company, $email) {
            $i = find_user($db, 'id', $id);
            if ($i < 0) { return 'missing'; }
            if ($email !== null && $email !== $db['users'][$i]['email']) {
                if (find_user($db, 'email', $email) >= 0) { return 'dup'; }
                $db['users'][$i]['email'] = $email;
            }
            if ($phone !== null) { $db['users'][$i]['phone'] = $phone; }
            if ($company !== null) { $db['users'][$i]['company'] = $company; }
            if ($role !== null && $role !== 'admin' && $db['users'][$i]['role'] === 'admin' && admin_count($db) <= 1) { return 'last-admin'; }
            if ($name !== null && $name !== '') { $db['users'][$i]['name'] = $name; }
            if ($role !== null) { $db['users'][$i]['role'] = $role; }
            if ($hash !== null) { $db['users'][$i]['hash'] = $hash; }
            log_act($db, $me, 'user-update', $db['users'][$i]['email']);
            return 'ok';
        });
        if ($res === 'missing') { fail('user not found', 404); }
        if ($res === 'last-admin') { fail('there must be at least one admin', 409); }
        if ($res === 'dup') { fail('this email is already registered', 409); }
        out(array('ok' => true));

    case 'admin/user-delete':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        if ($id === $me['id']) { fail('you cannot delete your own account', 409); }
        $res = db_update(function (&$db) use ($id, $me, $SCHEMA) {
            $i = find_user($db, 'id', $id);
            if ($i < 0) { return 'missing'; }
            if ($db['users'][$i]['role'] === 'admin' && admin_count($db) <= 1) { return 'last-admin'; }
            $email = $db['users'][$i]['email'];
            array_splice($db['users'], $i, 1);
            foreach (array_keys($SCHEMA) as $res) { $db['items'][$res] = array_values(array_filter(items_of($db, $res), function ($it) use ($id) { return $it['uid'] !== $id; })); }
            $db['tickets'] = array_values(array_filter($db['tickets'], function ($t) use ($id) { return $t['uid'] !== $id; }));
            log_act($db, $me, 'user-delete', $email . ' (and their services)');
            return 'ok';
        });
        if ($res === 'missing') { fail('user not found', 404); }
        if ($res === 'last-admin') { fail('there must be at least one admin', 409); }
        out(array('ok' => true));

    /* ── admin: client services ── */
    case 'admin/items':
        need_admin();
        $res = res_name();
        $db = db_read();
        out(array('items' => items_of($db, $res)));

    case 'admin/all':
        need_admin();
        $db = db_read();
        $o = array('users' => array_map('public_user', $db['users']), 'items' => array(), 'tickets' => array());
        foreach (array_keys($SCHEMA) as $res) { if (!res_unowned($res)) { $o['items'][$res] = items_of($db, $res); } }
        foreach ($db['tickets'] as $t) { $o['tickets'][] = array('id' => $t['id'], 'uid' => $t['uid'], 'subject' => $t['subject'], 'status' => $t['status'], 'updated' => isset($t['updated']) ? $t['updated'] : ''); }
        out($o);

    case 'admin/item-save':
        $me = need_admin();
        require_post();
        $res = res_name();
        $b = body();
        $in = (isset($b['item']) && is_array($b['item'])) ? $b['item'] : array();
        $err = '';
        $clean = clean_fields($SCHEMA[$res], $in, $err);
        if ($clean === null) { fail($err, 422); }
        $uid = isset($in['uid']) ? (string) $in['uid'] : '';
        $id = isset($in['id']) ? (string) $in['id'] : '';
        if (res_unowned($res)) { $uid = ''; }
        $saved = db_update(function (&$db) use ($res, $clean, $uid, $id, $me) {
            if (!res_unowned($res) && find_user($db, 'id', $uid) < 0) { return array('err' => 'choose a client'); }
            if (!isset($db['items'][$res]) || !is_array($db['items'][$res])) { $db['items'][$res] = array(); }
            $i = $id === '' ? -1 : find_by($db['items'][$res], 'id', $id);
            if ($id !== '' && $i < 0) { return array('err' => 'item not found'); }
            if ($i >= 0) {
                $item = array_merge($db['items'][$res][$i], $clean, array('uid' => $uid));
                $db['items'][$res][$i] = $item;
                log_act($db, $me, $res . '-update', $uid === '' ? $id : user_name($db, $uid));
            } else {
                $item = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c')), $clean);
                if ($res === 'domains') { $item['dns'] = array(); }
                if ($res === 'servers') { $item['snapshots'] = 0; }
                if ($res === 'plans' && !isset($item['sort'])) { $item['sort'] = count($db['items']['plans']) + 1; }
                if ($res === 'purchases') {
                    $seq = (int) meta_get($db, 'purchaseSeq', 0) + 1;
                    $db['meta']['purchaseSeq'] = $seq;
                    $item['number'] = 'PUR-' . $seq;
                    if ($item['date'] === '') { $item['date'] = gmdate('Y-m-d'); }
                }
                if ($res === 'invoices') {
                    $seq = (int) meta_get($db, 'invoiceSeq', 1000) + 1;
                    $db['meta']['invoiceSeq'] = $seq;
                    $item['number'] = 'INV-' . $seq;
                    if ($item['date'] === '') { $item['date'] = gmdate('Y-m-d'); }
                }
                $db['items'][$res][] = $item;
                log_act($db, $me, $res . '-create', $uid === '' ? ($res === 'plans' ? 'plan ' . $clean['nameAr'] : 'provider bill') : user_name($db, $uid));
            }
            return array('item' => $item);
        });
        if (isset($saved['err'])) { fail($saved['err'], 422); }
        out($saved);

    case 'admin/item-delete':
        $me = need_admin();
        require_post();
        $res = res_name();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $ok = db_update(function (&$db) use ($res, $id, $me) {
            $i = find_by(items_of($db, $res), 'id', $id);
            if ($i < 0) { return false; }
            array_splice($db['items'][$res], $i, 1);
            log_act($db, $me, $res . '-delete', $id);
            return true;
        });
        if (!$ok) { fail('item not found', 404); }
        out(array('ok' => true));

    /* ── admin: tickets, leads ── */
    case 'admin/tickets':
        need_admin();
        $db = db_read();
        $list = array_map(function ($t) use ($db) { $t['owner'] = user_name($db, $t['uid']); return $t; }, $db['tickets']);
        usort($list, function ($a, $b) { return strcmp($b['updated'], $a['updated']); });
        out(array('tickets' => $list));

    case 'admin/leads':
        need_admin();
        $db = db_read();
        out(array('leads' => array_reverse($db['leads'])));

    case 'admin/lead-update':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $st = isset($b['status']) ? (string) $b['status'] : '';
        if (!in_array($st, array('new', 'contacted', 'closed'), true)) { fail('invalid status', 422); }
        $ok = db_update(function (&$db) use ($id, $st, $me) {
            $i = find_by($db['leads'], 'id', $id);
            if ($i < 0) { return false; }
            $db['leads'][$i]['status'] = $st;
            log_act($db, $me, 'lead-status', $db['leads'][$i]['email'] . ' -> ' . $st);
            return true;
        });
        if (!$ok) { fail('lead not found', 404); }
        out(array('ok' => true));

    case 'admin/lead-delete':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $ok = db_update(function (&$db) use ($id, $me) {
            $i = find_by($db['leads'], 'id', $id);
            if ($i < 0) { return false; }
            array_splice($db['leads'], $i, 1);
            log_act($db, $me, 'lead-delete', $id);
            return true;
        });
        if (!$ok) { fail('lead not found', 404); }
        out(array('ok' => true));

    /* ── admin: settings + activity ── */
    case 'admin/upload':
        $me = need_admin();
        require_post();
        if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) { fail('no file received', 422); }
        $f = $_FILES['file'];
        if ($f['size'] > 1500000) { fail('the image is larger than 1.5 MB', 413); }
        $bytes = file_get_contents($f['tmp_name']);
        $kinds = array("\x89PNG" => 'png', "\xFF\xD8\xFF" => 'jpg', 'GIF8' => 'gif', 'RIFF' => 'webp', "\x00\x00\x01\x00" => 'ico');
        $ext = '';
        foreach ($kinds as $sig => $e) { if (strncmp($bytes, $sig, strlen($sig)) === 0) { $ext = $e; } }
        if ($ext === 'webp' && substr($bytes, 8, 4) !== 'WEBP') { $ext = ''; }
        if ($ext === '') { fail('use a PNG, JPG, WebP, GIF or ICO image', 422); }
        $dir = dirname(__DIR__) . '/uploads';
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { fail('could not create the uploads folder (check permissions)', 500); }
        $name = 'brand-' . substr(md5($bytes), 0, 12) . '.' . $ext;
        if (@file_put_contents($dir . '/' . $name, $bytes) === false) { fail('could not save the image', 500); }
        @file_put_contents($dir . '/index.html', '');
        db_update(function (&$db) use ($me, $name) { log_act($db, $me, 'upload', $name); });
        out(array('url' => 'uploads/' . $name));

    case 'admin/settings':
        $me = need_admin();
        $db = db_read();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') {
            out(array('site' => meta_get($db, 'site', ''), 'contactEmail' => meta_get($db, 'contactEmail', ''), 'placeholder' => (bool) meta_get($db, 'placeholder', false), 'currency' => meta_get($db, 'currency', ''), 'version' => NC_VERSION,
                'phone' => meta_get($db, 'phone', ''), 'whatsapp' => meta_get($db, 'whatsapp', ''), 'address' => meta_get($db, 'address', ''), 'allowRegistration' => (bool) meta_get($db, 'allowRegistration', true),
                'brand' => meta_get($db, 'brand', new stdClass()), 'business' => meta_get($db, 'business', new stdClass())));
        }
        require_post();
        $b = body();
        $site = clean_text(isset($b['site']) ? $b['site'] : '', 80);
        $ce = clean_email(isset($b['contactEmail']) ? $b['contactEmail'] : '');
        if ($ce !== '' && !filter_var($ce, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        $cur = clean_text(isset($b['currency']) ? $b['currency'] : '', 8);
        $ph = !empty($b['placeholder']);
        $extra = array('phone' => clean_text(isset($b['phone']) ? $b['phone'] : '', 30), 'whatsapp' => preg_replace('/[^0-9+]/', '', (string) (isset($b['whatsapp']) ? $b['whatsapp'] : '')), 'address' => clean_text(isset($b['address']) ? $b['address'] : '', 200), 'allowRegistration' => !isset($b['allowRegistration']) || !empty($b['allowRegistration']));
        if (isset($b['business']) && is_array($b['business'])) {
            $bz = array(); foreach (array('legalName', 'country', 'address', 'address2', 'city', 'governorate', 'postalCode', 'taxId') as $k) { $bz[$k] = clean_text(isset($b['business'][$k]) ? $b['business'][$k] : '', 160); }
            $extra['business'] = $bz;
        }
        if (isset($b['brand']) && is_array($b['brand'])) {
            $br = array();
            foreach (array('logo', 'logoDark', 'icon') as $k) {
                $u = isset($b['brand'][$k]) ? trim((string) $b['brand'][$k]) : '';
                if ($u !== '' && !preg_match('#^uploads/[A-Za-z0-9._\-]+$#', $u)) { fail('invalid image', 422); }
                $br[$k] = $u;
            }
            $ac = isset($b['brand']['accent']) ? trim((string) $b['brand']['accent']) : '';
            if ($ac !== '' && !preg_match('/^#[0-9a-fA-F]{6}$/', $ac)) { fail('invalid color', 422); }
            $br['accent'] = $ac;
            $extra['brand'] = $br;
        }
        db_update(function (&$db) use ($site, $ce, $cur, $ph, $me, $extra) {
            $db['meta']['site'] = $site; $db['meta']['contactEmail'] = $ce; $db['meta']['currency'] = $cur; $db['meta']['placeholder'] = $ph;
            foreach ($extra as $k => $v) { $db['meta'][$k] = $v; }
            log_act($db, $me, 'settings', 'updated site settings');
        });
        out(array('ok' => true));

    case 'admin/activity':
        need_admin();
        $db = db_read();
        out(array('log' => array_slice(array_reverse($db['log']), 0, 100)));

    default:
        fail('not found', 404);
}
