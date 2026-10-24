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
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') { header('Strict-Transport-Security: max-age=15552000'); }

define('NC_VERSION', '__NC_VERSION__'); // replaced by scripts/package.mjs
define('NC_DATA', __DIR__ . '/data');
define('NC_DB', NC_DATA . '/db.php');
const NC_GUARD = "<?php http_response_code(404); exit; ?>\n";
const NC_DUMMY_HASH = '$2y$10$8Y16n8v4IzI3OW35lCBnoODimb31iLg1sMQ/8idOIoa4jptGzb9rW';

/** Resources an admin manages for clients: field => [type, max/options, 'req'?]. Every item also has id, uid (owner), created. */
$SCHEMA = array(
    'domains' => array('name' => array('str', 253, 'req'), 'status' => array('enum', array('active', 'pending', 'expiring', 'stopped', 'archived')), 'expires' => array('date'), 'autoRenew' => array('bool'), 'provider' => array('str', 30), 'cost' => array('num'), 'price' => array('num'), 'notes' => array('str', 500), 'mail' => array('str', 20), 'nextDue' => array('date'), 'firstAmount' => array('num'), 'promo' => array('str', 40), 'subRef' => array('str', 80), 'payMethod' => array('str', 40), 'noSuspendUntil' => array('date'), 'adminNotes' => array('str', 1000), 'dnsOff' => array('bool'), 'emailFwd' => array('bool'), 'idProtect' => array('bool'), 'regYears' => array('num'), 'regDate' => array('date')),
    'mailboxes' => array('address' => array('str', 254, 'req'), 'quotaGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'expires' => array('date'), 'price' => array('num'), 'nextDue' => array('date'), 'firstAmount' => array('num'), 'promo' => array('str', 40), 'subRef' => array('str', 80), 'payMethod' => array('str', 40), 'noSuspendUntil' => array('date'), 'adminNotes' => array('str', 1000)),
    'hosting' => array('plan' => array('str', 60, 'req'), 'domain' => array('str', 253), 'diskGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'provider' => array('str', 30), 'ref' => array('str', 80), 'cost' => array('num'), 'billing' => array('enum', array('monthly', 'yearly')), 'expires' => array('date'), 'price' => array('num'), 'nextDue' => array('date'), 'firstAmount' => array('num'), 'promo' => array('str', 40), 'subRef' => array('str', 80), 'payMethod' => array('str', 40), 'noSuspendUntil' => array('date'), 'adminNotes' => array('str', 1000), 'mode' => array('enum', array('dedicated', 'shared'))),
    'servers' => array('name' => array('str', 60, 'req'), 'ip' => array('str', 64), 'spec' => array('str', 120), 'cpu' => array('num'), 'ram' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'expires' => array('date'), 'price' => array('num'), 'nextDue' => array('date'), 'firstAmount' => array('num'), 'promo' => array('str', 40), 'subRef' => array('str', 80), 'payMethod' => array('str', 40), 'noSuspendUntil' => array('date'), 'adminNotes' => array('str', 1000), 'provider' => array('str', 30), 'ref' => array('str', 80), 'cost' => array('num'), 'billing' => array('enum', array('monthly', 'yearly')), 'dataCenter' => array('str', 40)),
    'invoices' => array('item' => array('str', 160, 'req'), 'amount' => array('num', 'req'), 'date' => array('date'), 'dueDate' => array('date'), 'status' => array('enum', array('due', 'paid', 'void', 'draft', 'refunded', 'collections')), 'notes' => array('str', 1000), 'payMethod' => array('str', 40)),
    // Websites: each one is linked to a hosting plan and a domain (and, through the domain, to its mailboxes).
    'websites' => array('name' => array('str', 120, 'req'), 'url' => array('str', 253), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'domainId' => array('str', 32), 'hostingId' => array('str', 32), 'provider' => array('str', 30), 'ref' => array('str', 80), 'notes' => array('str', 500), 'diskGb' => array('num'), 'usedGb' => array('num'), 'expires' => array('date'), 'price' => array('num'), 'nextDue' => array('date'), 'firstAmount' => array('num'), 'promo' => array('str', 40), 'subRef' => array('str', 80), 'payMethod' => array('str', 40), 'noSuspendUntil' => array('date'), 'adminNotes' => array('str', 1000), 'appType' => array('str', 30), 'dataCenter' => array('str', 40), 'username' => array('str', 60)),
    // Public price list shown on the website (edited in Admin → Plans). Not owned by a client.
    'plans' => array('category' => array('enum', array('hosting', 'email', 'vps', 'site', 'bundle')), 'nameAr' => array('str', 80, 'req'), 'nameEn' => array('str', 80), 'price' => array('num', 'req'), 'per' => array('enum', array('month', 'year', 'once')), 'featured' => array('bool'), 'active' => array('bool'), 'sort' => array('num'), 'specs' => array('str', 700), 'features' => array('str', 900), 'seats' => array('num')),
    // Orders placed from the cart. Lines, number and totals are set by the server; admin edits status / payment fields only.
    'orders' => array('status' => array('enum', array('pending', 'paid', 'active', 'cancelled')), 'method' => array('str', 40), 'payRef' => array('str', 160), 'adminNote' => array('str', 1000)),
    // One-off charges waiting to be put on an invoice, and quotes a client can accept (items and totals are set by the server).
    'billable' => array('desc' => array('str', 200, 'req'), 'amount' => array('num', 'req'), 'taxed' => array('bool'), 'dueDate' => array('date'), 'status' => array('enum', array('pending', 'invoiced'))),
    'quotes' => array('subject' => array('str', 160, 'req'), 'status' => array('enum', array('draft', 'delivered', 'accepted', 'declined', 'expired')), 'validUntil' => array('date'), 'notes' => array('str', 1000)),
    // What we owe the providers (hosting / domain purchases). Admin only: never owned by a client (uid is empty).
    'purchases' => array('item' => array('str', 160, 'req'), 'provider' => array('str', 30), 'ref' => array('str', 80), 'service' => array('str', 20), 'client' => array('str', 32), 'amount' => array('num', 'req'), 'period' => array('enum', array('monthly', 'yearly', 'once')), 'date' => array('date'), 'status' => array('enum', array('due', 'paid', 'void'))),
);

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(array('error' => $msg), $code); }
function nc_substr($s, $n) { return function_exists('mb_substr') ? mb_substr($s, 0, $n, 'UTF-8') : substr($s, 0, $n); }
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
function next_user_no($db) { $m = 0; foreach ($db['users'] as $x) { if (isset($x['no']) && (int) $x['no'] > $m) { $m = (int) $x['no']; } } return max($m, count($db['users'])) + 1; }
function public_user($u) { return array('twoFactor' => !empty($u['totp']['on']), 'id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => isset($u['created']) ? $u['created'] : null, 'phone' => isset($u['phone']) ? $u['phone'] : '', 'company' => isset($u['company']) ? $u['company'] : '', 'source' => isset($u['source']) ? $u['source'] : '', 'disabled' => !empty($u['disabled']), 'credit' => (float) (isset($u['credit']) ? $u['credit'] : 0), 'no' => isset($u['no']) ? (int) $u['no'] : 0, 'group' => isset($u['group']) ? $u['group'] : '', 'notes' => isset($u['notes']) ? $u['notes'] : '', 'contacts' => isset($u['contacts']) && is_array($u['contacts']) ? $u['contacts'] : array(), 'taxExempt' => !empty($u['taxExempt']), 'noReminders' => !empty($u['noReminders']), 'addr' => isset($u['addr']) && is_array($u['addr']) ? $u['addr'] : new stdClass(), 'kyc' => kyc_public($u), 'terms' => isset($u['terms']) && is_array($u['terms']) ? $u['terms'] : null); }
function new_id() { return function_exists('random_bytes') ? bin2hex(random_bytes(8)) : md5(uniqid('', true)); }
function find_by($list, $key, $val) { foreach ($list as $i => $u) { if (isset($u[$key]) && $u[$key] === $val) { return $i; } } return -1; }
function find_user($db, $key, $val) { return find_by($db['users'], $key, $val); }
function clean_email($e) { return strtolower(trim((string) $e)); }
function clean_text($s, $max) { return nc_cut(trim(preg_replace('/[ \t]+/u', ' ', strip_tags((string) $s))), $max); }
function clean_name($n) { return clean_text(preg_replace('/\s+/u', ' ', (string) $n), 80); }
function meta_get($db, $k, $default) { return isset($db['meta'][$k]) ? $db['meta'][$k] : $default; }
function log_act(&$db, $actor, $action, $detail) {
    $db['log'][] = array('at' => gmdate('c'), 'by' => $actor ? $actor['name'] : '-', 'action' => $action, 'detail' => clean_text($detail, 200));
    if (count($db['log']) > 1000) { array_splice($db['log'], 0, count($db['log']) - 1000); }
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
    if ($i < 0) { return null; }
    if (!empty($db['users'][$i]['disabled']) && $db['users'][$i]['role'] !== 'admin') { return null; } // a suspended client is signed out everywhere
    return $db['users'][$i];
}
function need_user() { $u = current_user(); if (!$u) { fail('not signed in', 401); } return $u; }
function need_admin() { $u = need_user(); if ($u['role'] !== 'admin') { fail('forbidden', 403); } return $u; }
function can_touch($u, $item) { return $u['role'] === 'admin' || (isset($item['uid']) && $item['uid'] === $u['id']); }
function res_name() { global $SCHEMA; $r = isset($_GET['res']) ? (string) $_GET['res'] : ''; if (!isset($SCHEMA[$r])) { fail('unknown resource', 404); } return $r; }
/** Records that belong to the company, not to a client (purchase bills, the public plans). */
/** A DNS value in a comparable form: no case, no trailing dot, single spaces. */
function dns_norm($v) { return rtrim(strtolower(trim(preg_replace('/\s+/', ' ', str_replace(array('"', "\xE2\x80\x9C", "\xE2\x80\x9D"), '', (string) $v)))), '.'); } // quotes never make two records different: a provider returns "v=spf1 …" where we stored v=spf1 …

/** Every service gets a stable subscription ID (derived from its id, so it never changes) and a start date. */
function sub_prefix($res) { $p = array('domains' => 'DOM', 'hosting' => 'HST', 'websites' => 'WEB', 'servers' => 'SRV', 'mailboxes' => 'MBX'); return isset($p[$res]) ? $p[$res] : ''; }
function deco_item($res, $it) {
    $p = sub_prefix($res);
    if ($p === '' || !isset($it['id'])) { return $it; }
    $it['sub'] = $p . '-' . strtoupper(substr(md5($it['id']), 0, 8));
    $it['started'] = isset($it['created']) ? substr($it['created'], 0, 10) : '';
    return $it;
}
function imap_cfg($db) { $c = meta_get($db, 'imap', array()); return array('host' => !empty($c['host']) ? $c['host'] : 'imap.hostinger.com', 'port' => !empty($c['port']) ? (int) $c['port'] : 993, 'secure' => isset($c['secure']) && $c['secure'] === 'none' ? 'none' : 'ssl'); }

/** The mailbox a signed-in user may open: their own (an admin: any). */
function mail_box($db, $u, $id) {
    $i = find_by(items_of($db, 'mailboxes'), 'id', $id);
    if ($i < 0) { fail('mailbox not found', 404); }
    $m = $db['items']['mailboxes'][$i];
    if ($u['role'] !== 'admin' && $m['uid'] !== $u['id']) { fail('mailbox not found', 404); }
    return $m;
}
function mail_pass($db, $m) { $sec = meta_get($db, 'mailSecrets', array()); if (empty($sec[$m['id']])) { fail('mailbox not connected', 409); } return mail_unseal($sec[$m['id']]); }
function with_pass($db, $list) { $sec = meta_get($db, 'mailSecrets', array()); return array_map(function ($m) use ($sec) { $m['hasPass'] = !empty($sec[$m['id']]); return $m; }, $list); }
function deco_list($res, $list) { return array_map(function ($it) use ($res) { return deco_item($res, $it); }, $list); }

/* ───────── client identity (individual / company), ID documents and terms & conditions ───────── */
function kyc_clean($in) {
    $in = is_array($in) ? $in : array();
    return array('type' => isset($in['type']) && $in['type'] === 'company' ? 'company' : 'individual', 'nationalId' => preg_replace('/[^0-9A-Za-z\-]/', '', substr((string) (isset($in['nationalId']) ? $in['nationalId'] : ''), 0, 24)),
        'commercialReg' => clean_text(isset($in['commercialReg']) ? $in['commercialReg'] : '', 40), 'taxId' => clean_text(isset($in['taxId']) ? $in['taxId'] : '', 40));
}
function kyc_public($u) {
    $k = isset($u['kyc']) && is_array($u['kyc']) ? $u['kyc'] : array(); $f = isset($k['files']) && is_array($k['files']) ? $k['files'] : array();
    return array('type' => isset($k['type']) ? $k['type'] : 'individual', 'nationalId' => isset($k['nationalId']) ? $k['nationalId'] : '', 'commercialReg' => isset($k['commercialReg']) ? $k['commercialReg'] : '', 'taxId' => isset($k['taxId']) ? $k['taxId'] : '',
        'front' => !empty($f['front']), 'back' => !empty($f['back']), 'tax' => !empty($f['tax']));
}
function terms_cfg($db) { $t = meta_get($db, 'terms', array()); return array('ar' => isset($t['ar']) ? $t['ar'] : '', 'en' => isset($t['en']) ? $t['en'] : '', 'version' => isset($t['version']) ? (string) $t['version'] : '1', 'required' => !empty($t['required'])); }
function terms_ok($db, $u) { $t = terms_cfg($db); if (!$t['required'] || ($t['ar'] === '' && $t['en'] === '')) { return true; } return !empty($u['terms']) && $u['terms']['version'] === $t['version']; }
function terms_stamp($db, $by) { $t = terms_cfg($db); return array('version' => $t['version'], 'at' => gmdate('c'), 'by' => $by, 'ip' => isset($_SERVER['REMOTE_ADDR']) ? substr(preg_replace('/[^0-9a-fA-F:.]/', '', $_SERVER['REMOTE_ADDR']), 0, 45) : ''); }
function kyc_dir() { $d = NC_DATA . '/kyc'; if (!is_dir($d)) { @mkdir($d, 0755, true); @file_put_contents($d . '/.htaccess', "Require all denied\n"); @file_put_contents($d . '/index.html', ''); } return $d; }
/** Saves an uploaded ID / tax card (image or PDF, up to 3 MB) privately, outside the web folders, and returns array(ok, name|error). */
function kyc_store($uid, $side, $old) {
    if (!in_array($side, array('front', 'back', 'tax'), true)) { return array(false, 'invalid side'); }
    if (empty($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'])) { return array(false, 'no file received'); }
    if ($_FILES['file']['size'] > 3000000) { return array(false, 'the file is larger than 3 MB'); }
    $bytes = file_get_contents($_FILES['file']['tmp_name']);
    $kinds = array("\x89PNG" => 'png', "\xFF\xD8\xFF" => 'jpg', 'RIFF' => 'webp', '%PDF' => 'pdf');
    $ext = ''; foreach ($kinds as $sig => $e) { if (strncmp($bytes, $sig, strlen($sig)) === 0) { $ext = $e; } }
    if ($ext === 'webp' && substr($bytes, 8, 4) !== 'WEBP') { $ext = ''; }
    if ($ext === '') { return array(false, 'use a JPG, PNG, WebP or PDF file'); }
    $name = preg_replace('/[^a-z0-9]/i', '', $uid) . '-' . $side . '-' . substr(bin2hex(function_exists('random_bytes') ? random_bytes(6) : md5(uniqid('', true))), 0, 12) . '.' . $ext;
    if (@file_put_contents(kyc_dir() . '/' . $name, $bytes) === false) { return array(false, 'could not save the file'); }
    if ($old && preg_match('/^[A-Za-z0-9.\-]+$/', $old) && is_file(kyc_dir() . '/' . $old)) { @unlink(kyc_dir() . '/' . $old); }
    return array(true, $name);
}
function kyc_send($u, $side) {
    $f = isset($u['kyc']['files'][$side]) ? $u['kyc']['files'][$side] : '';
    if (!$f || !preg_match('/^[A-Za-z0-9.\-]+$/', $f) || !is_file(kyc_dir() . '/' . $f)) { fail('no file', 404); }
    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION)); $types = array('png' => 'image/png', 'jpg' => 'image/jpeg', 'webp' => 'image/webp', 'pdf' => 'application/pdf');
    header('Content-Type: ' . (isset($types[$ext]) ? $types[$ext] : 'application/octet-stream')); header('Cache-Control: private, no-store'); header('X-Content-Type-Options: nosniff'); header('Content-Disposition: inline; filename="' . $side . '.' . $ext . '"');
    readfile(kyc_dir() . '/' . $f); exit;
}
/** Payment methods set in Admin → Settings → Payments. Details (account numbers…) are only sent to signed-in clients. */
function pay_methods($db, $withDetails) {
    $o = array();
    foreach ((array) meta_get($db, 'payments', array()) as $m) {
        if (empty($m['active'])) { continue; }
        $x = array('id' => $m['id'], 'type' => $m['type'], 'nameAr' => $m['nameAr'], 'nameEn' => $m['nameEn']);
        if ($withDetails) { $x['details'] = $m['details']; $x['qr'] = isset($m['qr']) ? $m['qr'] : ''; }
        $o[] = $x;
    }
    return $o;
}
function res_unowned($res) { return $res === 'purchases' || $res === 'plans'; }
function items_of($db, $res) { return isset($db['items'][$res]) && is_array($db['items'][$res]) ? $db['items'][$res] : array(); }
function mine($db, $res, $uid) { return array_values(array_filter(items_of($db, $res), function ($i) use ($uid) { return $i['uid'] === $uid; })); }


/* ───────── mail (SMTP when configured in Settings, PHP mail() otherwise) ───────── */
function smtp_read($fp) { $out = ''; while (($l = fgets($fp, 515)) !== false) { $out .= $l; if (strlen($l) < 4 || $l[3] === ' ') { break; } } return $out; }
function smtp_cmd($fp, $cmd, $ok) { if ($cmd !== null) { fwrite($fp, $cmd . "\r\n"); } $r = smtp_read($fp); if (!in_array((int) substr($r, 0, 3), (array) $ok, true)) { throw new Exception(trim($r)); } return $r; }
function smtp_send($c, $to, $subject, $text, $replyTo) {
    $host = $c['host']; $port = (int) $c['port'] ?: 587; $sec = isset($c['secure']) ? $c['secure'] : 'tls';
    $fp = @stream_socket_client(($sec === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port, $en, $es, 6);
    if (!$fp) { throw new Exception('cannot connect to ' . $host . ':' . $port . ' (' . $es . ')'); }
    stream_set_timeout($fp, 8);
    try {
        smtp_cmd($fp, null, 220);
        $me = isset($_SERVER['SERVER_NAME']) ? preg_replace('/[^A-Za-z0-9.\-]/', '', $_SERVER['SERVER_NAME']) : 'localhost';
        smtp_cmd($fp, 'EHLO ' . ($me ?: 'localhost'), 250);
        if ($sec === 'tls') {
            smtp_cmd($fp, 'STARTTLS', 220);
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) { throw new Exception('TLS handshake failed'); }
            smtp_cmd($fp, 'EHLO ' . ($me ?: 'localhost'), 250);
        }
        if ($c['user'] !== '') {
            smtp_cmd($fp, 'AUTH LOGIN', 334); smtp_cmd($fp, base64_encode($c['user']), 334); smtp_cmd($fp, base64_encode($c['pass']), 235);
        }
        $from = $c['from'] !== '' ? $c['from'] : $c['user'];
        smtp_cmd($fp, 'MAIL FROM:<' . $from . '>', 250);
        smtp_cmd($fp, 'RCPT TO:<' . $to . '>', array(250, 251));
        smtp_cmd($fp, 'DATA', 354);
        $fromName = isset($c['fromName']) && $c['fromName'] !== '' ? '=?UTF-8?B?' . base64_encode($c['fromName']) . '?= ' : '';
        $h = 'From: ' . $fromName . '<' . $from . ">\r\nTo: <" . $to . ">\r\nSubject: =?UTF-8?B?" . base64_encode($subject) . "?=\r\nDate: " . date('r') . "\r\nMessage-ID: <" . new_id() . '@' . ($me ?: 'localhost') . ">\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n" . ($replyTo ? 'Reply-To: ' . $replyTo . "\r\n" : '');
        fwrite($fp, $h . "\r\n" . chunk_split(base64_encode($text)) . "\r\n.\r\n");
        smtp_cmd($fp, null, 250);
        @fwrite($fp, "QUIT\r\n");
    } catch (Exception $e) { @fclose($fp); throw $e; }
    @fclose($fp);
    return true;
}
/** Sends a plain-text email. Returns true, or an error string. Never throws. */
function nc_mail($db, $to, $subject, $text, $replyTo = '') {
    $r = nc_mail_send($db, $to, $subject, $text, $replyTo);
    mail_log($to, $subject, $r);
    return $r;
}
function mail_log($to, $subject, $r) {
    static $busy = false; if ($busy) { return; } $busy = true;
    try { db_update(function (&$db) use ($to, $subject, $r) { $l = meta_get($db, 'mailLog', array()); array_unshift($l, array('at' => gmdate('c'), 'to' => clean_email($to), 'subject' => nc_substr($subject, 160), 'ok' => $r === true, 'err' => $r === true ? '' : nc_substr((string) $r, 160))); $db['meta']['mailLog'] = array_slice($l, 0, 400); }); } catch (Exception $e) { /* logging must never break sending */ }
    $busy = false;
}
function nc_mail_send($db, $to, $subject, $text, $replyTo = '') {
    $to = clean_email($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $subject . $replyTo)) { return 'invalid address'; }
    $c = meta_get($db, 'smtp', array());
    if (!empty($c['host'])) {
        try { smtp_send($c + array('port' => 587, 'secure' => 'tls', 'user' => '', 'pass' => '', 'from' => '', 'fromName' => ''), $to, $subject, $text, $replyTo); return true; } catch (Exception $e) { return 'smtp: ' . $e->getMessage(); }
    }
    if (!function_exists('mail')) { return 'mail() is not available'; }
    $from = meta_get($db, 'contactEmail', '');
    $ok = @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $text, "Content-Type: text/plain; charset=UTF-8\r\n" . ($from ? 'From: ' . $from . "\r\n" : '') . ($replyTo ? 'Reply-To: ' . $replyTo . "\r\n" : ''));
    return $ok ? true : 'mail() failed';
}
/** The public address of the site (Settings → General). Emailed links are built from it only, never from request headers. */
function site_url($db) { $u = rtrim((string) meta_get($db, 'siteUrl', ''), '/'); return preg_match('#^https?://[^\s<>"\']+$#i', $u) ? $u : ''; }
/** Link to a client-area page. Hash routing (the default build) or clean URLs, as set in Settings. */
function site_link($db, $path) { $b = site_url($db); if ($b === '') { return ''; } return meta_get($db, 'cleanUrls', false) ? $b . $path : $b . '/#' . $path; }


/* ───────── invoice engine: items, taxes, ledger (payments / credit / refunds), balance ───────── */
function inv_taxes($db) {
    $t = meta_get($db, 'taxes', null);
    if (is_array($t)) { return array_values(array_filter($t, function ($x) { return is_array($x) && isset($x['rate']) && (float) $x['rate'] > 0; })); }
    $r = (float) meta_get($db, 'taxRate', 0);
    return $r > 0 ? array(array('name' => 'VAT', 'rate' => $r)) : array();
}
/** Totals for a list of items [{desc, amount, taxed}] and a discount. Prices are tax-inclusive unless Settings says otherwise. */
function inv_calc($db, $items, $discount, $exempt = false) {
    if ($exempt) { $db['meta']['taxes'] = array(); $db['meta']['taxRate'] = 0; }
    $incl = (bool) meta_get($db, 'taxInclusive', true);
    $sub = 0; $taxed = 0;
    foreach ($items as $it) { $sub += (float) $it['amount']; if (!empty($it['taxed'])) { $taxed += (float) $it['amount']; } }
    $discount = min(max(0, (float) $discount), $sub);
    $share = $sub > 0 ? $discount / $sub : 0;
    $taxedNet = $taxed * (1 - $share);
    $rates = 0; foreach (inv_taxes($db) as $t) { $rates += (float) $t['rate']; }
    $base = ($incl && $rates > 0) ? $taxedNet / (1 + $rates / 100) : $taxedNet;
    $total = $sub - $discount; $lines = array();
    foreach (inv_taxes($db) as $t) { $a = round($base * (float) $t['rate'] / 100, 2); $lines[] = array('name' => $t['name'], 'rate' => (float) $t['rate'], 'amount' => $a); if (!$incl) { $total += $a; } }
    return array('discount' => round($discount, 2), 'taxes' => $lines, 'total' => round($total, 2), 'inclusive' => $incl);
}
function inv_items($inv) {
    if (!empty($inv['items']) && is_array($inv['items'])) { return $inv['items']; }
    return array(array('desc' => $inv['item'], 'amount' => (float) $inv['amount'], 'taxed' => false)); // an invoice made before itemised invoices
}
function inv_paid($inv) {
    $p = 0; $pays = isset($inv['payments']) && is_array($inv['payments']) ? $inv['payments'] : array();
    if (!$pays) { return $inv['status'] === 'paid' ? round((float) $inv['amount'], 2) : 0; }
    foreach ($pays as $e) { $p += $e['type'] === 'refund' ? -(float) $e['amount'] : (float) $e['amount']; }
    return round($p, 2);
}
function inv_balance($inv) { return in_array($inv['status'], array('void', 'draft'), true) ? 0 : max(0, round((float) $inv['amount'] - inv_paid($inv), 2)); }
function inv_next_number(&$db) {
    $seq = (int) meta_get($db, 'invoiceSeq', 1000) + 1; $db['meta']['invoiceSeq'] = $seq;
    return (string) meta_get($db, 'invoicePrefix', 'INV-') . $seq;
}
/** Re-derives status from the ledger and runs the "paid" consequences once (add-funds credit, order activation). */
function inv_refresh(&$db, $i, $actor, $activate = true) {
    $inv = $db['items']['invoices'][$i];
    if (in_array($inv['status'], array('draft', 'void'), true)) { return; }
    $paid = inv_paid($inv); $bal = inv_balance($inv);
    $hadRefund = false; foreach ((array) (isset($inv['payments']) ? $inv['payments'] : array()) as $e) { if ($e['type'] === 'refund') { $hadRefund = true; } }
    $new = ($inv['amount'] > 0 && $bal <= 0.004) ? 'paid' : (($paid <= 0.004 && $hadRefund) ? 'refunded' : 'due');
    if ($inv['status'] === 'collections' && $new === 'due') { $new = 'collections'; }
    $old = $inv['status'];
    $db['items']['invoices'][$i]['status'] = $new;
    if ($new === 'paid' && $old !== 'paid') {
        $db['items']['invoices'][$i]['paidAt'] = gmdate('c');
        if (!empty($inv['addFunds'])) { $ui = find_user($db, 'id', $inv['uid']); if ($ui >= 0) { credit_add($db, $ui, (float) $inv['amount'], 'Add funds ' . $inv['number'], $actor); } }
        if ($activate && !empty($inv['orderId'])) {
            $oi = find_by(items_of($db, 'orders'), 'id', $inv['orderId']);
            if ($oi >= 0 && in_array($db['items']['orders'][$oi]['status'], array('pending', 'paid'), true)) { order_set_status($db, $inv['orderId'], 'active', $actor, false); }
        }
    }
    log_act($db, $actor, 'invoice-' . $new, $inv['number']);
}
function inv_entry(&$db, $i, $type, $amount, $method, $ref, $fee, $note, $date) {
    if (!isset($db['items']['invoices'][$i]['payments']) || !is_array($db['items']['invoices'][$i]['payments'])) {
        $inv = $db['items']['invoices'][$i];
        $db['items']['invoices'][$i]['payments'] = array();
        if ($inv['status'] === 'paid') { $db['items']['invoices'][$i]['payments'][] = array('id' => new_id(), 'at' => isset($inv['created']) ? $inv['created'] : gmdate('c'), 'type' => 'payment', 'method' => isset($inv['payMethod']) ? $inv['payMethod'] : '', 'ref' => '', 'amount' => (float) $inv['amount'], 'fee' => 0, 'note' => 'Recorded before the ledger existed'); }
    }
    $at = ($date !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) ? $date . 'T' . gmdate('H:i:s') . '+00:00' : gmdate('c');
    $db['items']['invoices'][$i]['payments'][] = array('id' => new_id(), 'at' => $at, 'type' => $type, 'method' => clean_text($method, 60), 'ref' => clean_text($ref, 160), 'amount' => round((float) $amount, 2), 'fee' => round((float) $fee, 2), 'note' => clean_text($note, 200));
}
/** Pays whatever is still owed (gateway confirmation, "mark paid"). */
function inv_settle(&$db, $i, $method, $ref, $actor, $activate = true) {
    $bal = inv_balance($db['items']['invoices'][$i]);
    if ($bal > 0) { inv_entry($db, $i, 'payment', $bal, $method, $ref, 0, '', ''); }
    inv_refresh($db, $i, $actor, $activate);
}
function credit_add(&$db, $ui, $amount, $note, $actor) {
    $db['users'][$ui]['credit'] = round((float) (isset($db['users'][$ui]['credit']) ? $db['users'][$ui]['credit'] : 0) + $amount, 2);
    if (!isset($db['users'][$ui]['creditLog']) || !is_array($db['users'][$ui]['creditLog'])) { $db['users'][$ui]['creditLog'] = array(); }
    array_unshift($db['users'][$ui]['creditLog'], array('at' => gmdate('c'), 'amount' => round($amount, 2), 'note' => clean_text($note, 160), 'by' => $actor ? $actor['name'] : '-'));
    $db['users'][$ui]['creditLog'] = array_slice($db['users'][$ui]['creditLog'], 0, 100);
}
/** An invoice's totals, ledger and balance for the screens. */
function inv_public($db, $inv) {
    $inv['items'] = inv_items($inv);
    $c = inv_calc($db, $inv['items'], isset($inv['discount']) ? $inv['discount'] : 0);
    if (isset($inv['taxLines']) && is_array($inv['taxLines'])) { $c['taxes'] = $inv['taxLines']; }
    $inv['taxes'] = $c['taxes']; $inv['inclusive'] = isset($inv['inclusive']) ? $inv['inclusive'] : $c['inclusive'];
    $inv['paid'] = inv_paid($inv); $inv['balance'] = inv_balance($inv);
    if (!isset($inv['payments'])) { $inv['payments'] = array(); }
    return $inv;
}
function inv_template($db, $inv, $user, $tpl) {
    $cur = meta_get($db, 'currency', '') ?: 'EGP'; $link = site_link($db, '/portal/invoices/' . $inv['id']);
    $hi = 'Hello ' . $user['name'] . ",\n\n"; $tail = ($link !== '' ? "\n\nView it here: " . $link : '') . "\n\nThank you.";
    $amt = $inv['amount'] . ' ' . $cur; $n = $inv['number'];
    if ($tpl === 'confirmation') { return array('Payment confirmation — invoice ' . $n, $hi . 'We received your payment for invoice ' . $n . ' (' . $amt . "). Thank you!" . $tail); }
    if ($tpl === 'reminder') { return array('Payment reminder — invoice ' . $n, $hi . 'This is a friendly reminder that invoice ' . $n . ' for ' . $amt . ' is still unpaid' . (!empty($inv['dueDate']) ? ' (due ' . $inv['dueDate'] . ')' : '') . '. Balance: ' . inv_balance($inv) . ' ' . $cur . '.' . $tail); }
    if ($tpl === 'overdue') { return array('Overdue — invoice ' . $n, $hi . 'Invoice ' . $n . ' for ' . $amt . ' is overdue' . (!empty($inv['dueDate']) ? ' since ' . $inv['dueDate'] : '') . '. Please pay it to keep your services running. Balance: ' . inv_balance($inv) . ' ' . $cur . '.' . $tail); }
    if ($tpl === 'refund') { return array('Refund — invoice ' . $n, $hi . 'A refund was issued on invoice ' . $n . '.' . $tail); }
    return array('Invoice ' . $n . ' — ' . $amt, $hi . 'Invoice ' . $n . ' for ' . $amt . ' (' . $inv['item'] . ')' . (!empty($inv['dueDate']) ? ', due ' . $inv['dueDate'] : '') . '.' . $tail);
}

/* ───────── orders ───────── */
/** Creates an order and its invoice inside a db_update callback. */
function nc_new_order(&$db, $u, $lines, $total, $o) {
    $now = gmdate('c');
    $cur = isset($o['cur']) ? $o['cur'] : (meta_get($db, 'currency', '') ?: 'EGP');
    $seq = (int) meta_get($db, 'orderSeq', 1000) + 1; $db['meta']['orderSeq'] = $seq;
    $summary = implode(' + ', array_map(function ($l) { return $l['nameEn']; }, $lines));
    $order = array('id' => new_id(), 'uid' => $u['id'], 'created' => $now, 'number' => 'ORD-' . $seq, 'status' => 'pending', 'method' => isset($o['method']) ? $o['method'] : '', 'methodName' => isset($o['mname']) ? $o['mname'] : '', 'payRef' => '', 'adminNote' => '', 'lines' => $lines, 'subtotal' => isset($o['subtotal']) ? $o['subtotal'] : $total, 'discount' => isset($o['discount']) ? $o['discount'] : 0, 'coupon' => isset($o['coupon']) ? $o['coupon'] : '', 'total' => $total, 'currency' => $cur, 'domain' => isset($o['domain']) ? $o['domain'] : '', 'note' => isset($o['note']) ? $o['note'] : '', 'summary' => nc_substr($summary, 160), 'provisioned' => false, 'auto' => !empty($o['auto']));
    $iitems = array_map(function ($l) { return array('desc' => $l['nameEn'], 'descAr' => $l['nameAr'], 'amount' => (float) $l['price'], 'taxed' => true); }, $lines);
    $uix = find_user($db, 'id', $u['id']);
    $calc = inv_calc($db, $iitems, isset($o['discount']) ? $o['discount'] : 0, $uix >= 0 && !empty($db['users'][$uix]['taxExempt']));
    $order['total'] = $calc['total'];
    $inv = array('id' => new_id(), 'uid' => $u['id'], 'created' => $now, 'number' => inv_next_number($db), 'item' => nc_substr('Order ' . $order['number'] . ': ' . $summary, 160), 'items' => $iitems, 'discount' => $calc['discount'], 'taxLines' => $calc['taxes'], 'inclusive' => $calc['inclusive'], 'amount' => $calc['total'], 'date' => gmdate('Y-m-d'), 'dueDate' => gmdate('Y-m-d', time() + 7 * 86400), 'status' => 'due', 'orderId' => $order['id'], 'payments' => array(), 'payMethod' => isset($o['mname']) ? $o['mname'] : '');
    $order['invoiceId'] = $inv['id'];
    $db['items']['orders'][] = $order;
    $db['items']['invoices'][] = $inv;
    $text = ($order['auto'] ? 'Renewal order ' : 'New order ') . $order['number'] . ' — ' . $order['total'] . ' ' . $cur . "\n" . implode("\n", array_map(function ($l) { return '• ' . $l['nameEn'] . ' × ' . $l['qty'] . ' = ' . $l['price']; }, $lines)) . ($order['domain'] !== '' ? "\nDomain: " . $order['domain'] : '') . ($order['note'] !== '' ? "\n\n" . $order['note'] : '');
    $db['tickets'][] = array('kind' => 'order', 'id' => new_id(), 'uid' => $u['id'], 'subject' => ($order['auto'] ? 'Renewal ' : 'Order ') . $order['number'], 'status' => $order['auto'] ? 'answered' : 'open', 'updated' => $now, 'created' => $now, 'messages' => array(array('from' => 'client', 'name' => $u['name'], 'text' => $text, 'at' => $now)));
    return array('order' => $order, 'invoice' => $inv, 'text' => $text);
}
/** Turns a quote into an order (+ its invoice), once. The quote's own items, discount and taxes are kept on the invoice. */
function quote_make_order(&$db, $k, $actor) {
    $q = $db['items']['quotes'][$k];
    if (!empty($q['orderId'])) { return array('err' => 'this quote already has an order'); }
    $ui = find_user($db, 'id', $q['uid']);
    if ($ui < 0) { return array('err' => 'the quote has no client'); }
    $lines = array();
    foreach (isset($q['items']) && is_array($q['items']) ? $q['items'] : array() as $it) {
        $qty = isset($it['qty']) ? (float) $it['qty'] : 1; $unitPrice = isset($it['price']) ? (float) $it['price'] : (float) $it['amount'];
        $lines[] = array('kind' => 'custom', 'ref' => $q['number'], 'category' => 'custom', 'nameAr' => $it['desc'], 'nameEn' => $it['desc'], 'qty' => $qty, 'unit' => 'once', 'unitPrice' => $unitPrice, 'price' => (float) $it['amount']);
    }
    $r = nc_new_order($db, $db['users'][$ui], $lines, (float) $q['total'], array('discount' => isset($q['discount']) ? (float) $q['discount'] : 0, 'note' => 'From quote ' . $q['number'] . ': ' . $q['subject']));
    $ii = find_by(items_of($db, 'invoices'), 'id', $r['invoice']['id']);
    if ($ii >= 0) { $db['items']['invoices'][$ii] = array_merge($db['items']['invoices'][$ii], array('items' => $q['items'], 'discount' => $q['discount'], 'taxLines' => $q['taxLines'], 'inclusive' => $q['inclusive'], 'amount' => $q['total'], 'item' => nc_substr('Quote ' . $q['number'] . ': ' . $q['subject'], 160), 'quoteId' => $q['id'])); }
    $oi = find_by(items_of($db, 'orders'), 'id', $r['order']['id']);
    if ($oi >= 0) { $db['items']['orders'][$oi]['total'] = $q['total']; $db['items']['orders'][$oi]['quoteId'] = $q['id']; }
    $db['items']['quotes'][$k]['status'] = 'accepted'; $db['items']['quotes'][$k]['orderId'] = $r['order']['id']; $db['items']['quotes'][$k]['invoiceId'] = $r['invoice']['id'];
    log_act($db, $actor, 'quote-to-order', $q['number'] . ' → ' . $r['order']['number']);
    return array('ok' => true, 'order' => $r['order']['id'], 'invoice' => $r['invoice']['id'], 'number' => $r['order']['number']);
}
function add_period($date, $qty, $unit) {
    $base = ($date !== '' && $date > gmdate('Y-m-d')) ? $date : gmdate('Y-m-d');
    return gmdate('Y-m-d', strtotime($base . ' +' . (int) $qty . ' ' . $unit));
}
/** Moves an order to a status (paid → invoice paid; active → also provisions / extends services, once; cancelled → invoice void). */
function order_set_status(&$db, $id, $st, $actor, $syncInvoice = true) {
    global $SCHEMA;
    $i = find_by(items_of($db, 'orders'), 'id', $id);
    if ($i < 0) { return array('err' => 'order not found'); }
    $o = $db['items']['orders'][$i];
    if ($o['status'] === $st) { return array('order' => $o); }
    $o['status'] = $st;
    $ii = find_by(items_of($db, 'invoices'), 'id', isset($o['invoiceId']) ? $o['invoiceId'] : '');
    if ($ii >= 0 && $syncInvoice) {
        if ($st === 'cancelled') { $db['items']['invoices'][$ii]['status'] = 'void'; }
        elseif ($st === 'pending') { if ($db['items']['invoices'][$ii]['status'] === 'void') { $db['items']['invoices'][$ii]['status'] = 'due'; } inv_refresh($db, $ii, $actor, false); }
        else { inv_settle($db, $ii, $o['methodName'] !== '' ? $o['methodName'] : $o['method'], $o['payRef'], $actor, false); }
    }
    if ($st === 'cancelled') { $db['items']['mailboxes'] = array_values(array_filter(items_of($db, 'mailboxes'), function ($m) use ($o) { return !(isset($m['orderId']) && $m['orderId'] === $o['id'] && $m['status'] === 'pending'); })); }
    if ($st === 'active' && empty($o['provisioned'])) {
        $made = array(); $now = gmdate('c'); $uid = $o['uid'];
        foreach ($o['lines'] as $l) {
            if ($l['kind'] === 'renew') {
                list($res, $rid) = explode(':', $l['ref'] . ':');
                $k = find_by(items_of($db, $res), 'id', $rid);
                if ($k < 0 || ($res !== 'domains' && $res !== 'hosting')) { continue; }
                $unit = $l['unit'] === 'year' ? 'years' : 'months';
                $db['items'][$res][$k]['expires'] = add_period(isset($db['items'][$res][$k]['expires']) ? $db['items'][$res][$k]['expires'] : '', $l['qty'], $unit);
                if (($db['items'][$res][$k]['status'] === 'expiring' || $db['items'][$res][$k]['status'] === 'stopped') && $res === 'domains') { $db['items'][$res][$k]['status'] = 'active'; }
                unset($db['items'][$res][$k]['remind']);
                if ($res === 'domains' && !empty($db['items'][$res][$k]['provider'])) { $db['items'][$res][$k]['renewPending'] = max(1, (int) $l['qty']); }
                $made[] = 'renewed ' . $l['nameEn'];
            } elseif ($l['kind'] === 'domain') {
                $d = clean_fields($SCHEMA['domains'], array('name' => $l['ref'], 'status' => 'pending', 'autoRenew' => true, 'price' => $l['unitPrice'], 'notes' => 'Order ' . $o['number']), $e);
                $db['items']['domains'][] = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => $now, 'dns' => array(), 'orderId' => $o['id'], 'regYears' => $l['qty']), $d); $made[] = 'domain ' . $l['ref'];
            } elseif ($l['category'] === 'email') {
                foreach ($db['items']['mailboxes'] as $mk => $mb) { if (isset($mb['orderId']) && $mb['orderId'] === $o['id'] && $mb['status'] === 'pending') { $db['items']['mailboxes'][$mk]['status'] = 'active'; $db['items']['mailboxes'][$mk]['expires'] = add_period('', $l['qty'], $l['unit'] === 'year' ? 'years' : 'months'); $made[] = 'mailbox ' . $mb['address']; } }
            } elseif ($l['category'] === 'hosting') {
                $per = $l['unit'] === 'year' ? 'yearly' : 'monthly';
                $d = clean_fields($SCHEMA['hosting'], array('plan' => $l['nameEn'], 'domain' => $o['domain'], 'status' => 'active', 'billing' => $per, 'price' => $l['unitPrice'], 'expires' => add_period('', $l['qty'], $l['unit'] === 'year' ? 'years' : 'months'), 'notes' => 'Order ' . $o['number']), $e);
                $db['items']['hosting'][] = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => $now), $d); $made[] = 'hosting ' . $l['nameEn'];
            } elseif ($l['category'] === 'site') {
                $d = clean_fields($SCHEMA['websites'], array('name' => $l['nameEn'], 'url' => $o['domain'], 'status' => 'pending', 'notes' => 'Order ' . $o['number']), $e);
                $db['items']['websites'][] = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => $now), $d); $made[] = 'website ' . $l['nameEn'];
            }
        }
        $o['provisioned'] = true;
        log_act($db, $actor, 'order-provision', $o['number'] . ': ' . implode(', ', $made));
    }
    $db['items']['orders'][$i] = $o;
    log_act($db, $actor, 'order-' . $st, $o['number']);
    return array('order' => $o);
}
/** Coupon lookup. Returns array(coupon|null, error). */
function coupon_find($db, $code, $total) {
    $code = strtoupper(trim((string) $code));
    if ($code === '') { return array(null, ''); }
    foreach ((array) meta_get($db, 'coupons', array()) as $c) {
        if (strtoupper($c['code']) !== $code) { continue; }
        if (empty($c['active'])) { return array(null, 'coupon is not active'); }
        if ($c['expires'] !== '' && $c['expires'] < gmdate('Y-m-d')) { return array(null, 'coupon expired'); }
        if ((int) $c['maxUses'] > 0 && (int) $c['used'] >= (int) $c['maxUses']) { return array(null, 'coupon fully used'); }
        if ((float) $c['minTotal'] > $total) { return array(null, 'order total is below the coupon minimum'); }
        return array($c, '');
    }
    return array(null, 'coupon not found');
}
function coupon_discount($c, $total) { $d = $c['type'] === 'percent' ? round($total * min(100, (float) $c['value']) / 100, 2) : (float) $c['value']; return round(min($total, max(0, $d)), 2); }


/* ───────── daily job: renewal invoices and expiry reminders ───────── */
function nc_daily($force = false) {
    $res = db_update(function (&$db) use ($force) {
        $today = gmdate('Y-m-d');
        if (!$force && meta_get($db, 'lastDaily', '') === $today) { return array('ran' => false); }
        $db['meta']['lastDaily'] = $today;
        $mails = array(); $created = 0;
        foreach (array('domains', 'hosting') as $res) {
            foreach (items_of($db, $res) as $k => $svc) {
                if (empty($svc['expires']) || empty($svc['uid']) || $svc['status'] === 'archived' || $svc['status'] === 'stopped') { continue; }
                $days = (int) floor((strtotime($svc['expires'] . ' 00:00:00 UTC') - time()) / 86400);
                if ($days > 30) { if (isset($svc['remind'])) { unset($db['items'][$res][$k]['remind']); } continue; }
                $label = $res === 'domains' ? $svc['name'] : $svc['plan'] . ($svc['domain'] !== '' ? ' (' . $svc['domain'] . ')' : '');
                $ui = find_user($db, 'id', $svc['uid']);
                if ($ui < 0) { continue; }
                $u = $db['users'][$ui];
                if (!empty($u['noReminders'])) { continue; }
                $ref = $res . ':' . $svc['id'];
                $line = '';
                if ($days <= 14 && (float) $svc['price'] > 0 && meta_get($db, 'autoRenewInvoices', true)) {
                    $open = false; foreach (items_of($db, 'orders') as $od) { if ($od['status'] === 'pending' || $od['status'] === 'paid') { foreach ($od['lines'] as $l) { if ($l['ref'] === $ref && $l['kind'] === 'renew') { $open = true; } } } }
                    if (!$open) {
                        $yearly = $res === 'domains' || (isset($svc['billing']) && $svc['billing'] === 'yearly');
                        $price = round((float) $svc['price'], 2);
                        $r = nc_new_order($db, $u, array(array('kind' => 'renew', 'ref' => $ref, 'category' => 'renew', 'nameAr' => 'تجديد ' . $label, 'nameEn' => 'Renewal: ' . $label, 'qty' => 1, 'unit' => $yearly ? 'year' : 'month', 'unitPrice' => $price, 'price' => $price)), $price, array('auto' => true, 'note' => 'Automatic renewal invoice'));
                        $created++; $line = "\nWe created invoice " . $r['invoice']['number'] . ' (' . $price . ' ' . $r['order']['currency'] . ') for the renewal. Pay it from your client area → Orders.';
                    }
                }
                $bucket = $days < 0 ? 0 : ($days <= 1 ? 1 : ($days <= 7 ? 7 : ($days <= 14 ? 14 : 30)));
                if (!isset($svc['remind']) || (int) $svc['remind'] > $bucket) {
                    $db['items'][$res][$k]['remind'] = $bucket;
                    $rl = isset($svc['remindLog']) && is_array($svc['remindLog']) ? $svc['remindLog'] : array(); array_unshift($rl, array('at' => gmdate('c'), 'days' => $days, 'to' => $u['email']));
                    $db['items'][$res][$k]['remindLog'] = array_slice($rl, 0, 20);
                    $mails[] = array($u['email'], $days < 0 ? 'Expired: ' . $label : 'Renewal in ' . $days . ' days: ' . $label, ($days < 0 ? $label . ' expired on ' . $svc['expires'] . '.' : $label . ' expires on ' . $svc['expires'] . ' (' . $days . " days).") . $line . "\n\nRenew it any time from your client area.");
                }
                if ($days < 0 && $res === 'domains' && $svc['status'] === 'active') { $db['items'][$res][$k]['status'] = 'expiring'; }
            }
        }
        foreach (items_of($db, 'invoices') as $k => $inv) {
            if ($inv['status'] !== 'due' || empty($inv['dueDate']) || $inv['dueDate'] >= $today || inv_balance($inv) <= 0) { continue; }
            if (!empty($inv['remindedAt']) && substr($inv['remindedAt'], 0, 10) > gmdate('Y-m-d', time() - 7 * 86400)) { continue; }
            $ui = find_user($db, 'id', $inv['uid']);
            if ($ui < 0) { continue; }
            $db['items']['invoices'][$k]['remindedAt'] = gmdate('c');
            list($sub, $txt) = inv_template($db, $inv, $db['users'][$ui], 'overdue');
            $mails[] = array($db['users'][$ui]['email'], $sub, $txt);
        }
        $sd = (int) meta_get($db, 'suspendAfterDays', 0);
        if ($sd > 0) {
            foreach (items_of($db, 'invoices') as $inv) {
                if ($inv['status'] !== 'due' || empty($inv['dueDate']) || empty($inv['orderId']) || inv_balance($inv) <= 0) { continue; }
                if ((strtotime($today) - strtotime($inv['dueDate'])) / 86400 < $sd) { continue; }
                $oi = find_by(items_of($db, 'orders'), 'id', $inv['orderId']);
                if ($oi < 0) { continue; }
                foreach ($db['items']['orders'][$oi]['lines'] as $l) {
                    if ($l['kind'] !== 'renew') { continue; }
                    list($rs, $rid) = explode(':', $l['ref'] . ':');
                    $k = find_by(items_of($db, $rs), 'id', $rid);
                    if ($k < 0 || $db['items'][$rs][$k]['status'] !== 'active') { continue; }
                    if (!empty($db['items'][$rs][$k]['noSuspendUntil']) && $db['items'][$rs][$k]['noSuspendUntil'] >= $today) { continue; }
                    $db['items'][$rs][$k]['status'] = 'stopped';
                    log_act($db, null, 'auto-suspend', $rs . ' ' . $rid . ' (invoice ' . $inv['number'] . ' overdue)');
                }
            }
        }
        return array('ran' => true, 'mails' => $mails, 'created' => $created, 'db' => $db);
    });
    if (!empty($res['ran']) && $res['mails']) {
        // Reminder emails go out after the response is sent, and stop at the first failure (a dead mail server must never slow the panel down).
        $send = function () use ($res) { foreach ($res['mails'] as $m) { if (nc_mail($res['db'], $m[0], $m[1], $m[2]) !== true) { break; } } };
        if ($force) { $send(); } else { register_shutdown_function(function () use ($send) { if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); } @ignore_user_abort(true); $send(); }); }
    }
    return $res;
}


function gw_cfg_early($db, $id) { $g = meta_get($db, 'gateways', array()); return isset($g[$id]) && is_array($g[$id]) && !empty($g[$id]['enabled']) ? $g[$id] : null; }
/** A gateway told us an order was paid: mark it (and activate it when "auto-activate" is on), email the client. */
function gw_mark_paid($orderId, $ref) {
    $res = db_update(function (&$db) use ($orderId, $ref) {
        $i = find_by(items_of($db, 'orders'), 'id', $orderId);
        if ($i < 0 || $db['items']['orders'][$i]['status'] !== 'pending') { return null; }
        $db['items']['orders'][$i]['payRef'] = $ref; $db['items']['orders'][$i]['paidClaim'] = gmdate('c');
        $r = order_set_status($db, $orderId, meta_get($db, 'autoActivate', false) ? 'active' : 'paid', array('name' => 'gateway'));
        return array('order' => $r['order'], 'db' => $db);
    });
    if ($res) { $ui = find_user($res['db'], 'id', $res['order']['uid']); if ($ui >= 0) { nc_mail($res['db'], $res['db']['users'][$ui]['email'], 'Payment received for order ' . $res['order']['number'], 'Thank you! We received your online payment for order ' . $res['order']['number'] . '.'); } }
}


function smtp_public($c) { $c = is_array($c) ? $c : array(); return array('host' => isset($c['host']) ? $c['host'] : '', 'port' => isset($c['port']) ? (int) $c['port'] : 587, 'secure' => isset($c['secure']) ? $c['secure'] : 'tls', 'user' => isset($c['user']) ? $c['user'] : '', 'passSet' => !empty($c['pass']), 'from' => isset($c['from']) ? $c['from'] : '', 'fromName' => isset($c['fromName']) ? $c['fromName'] : ''); }
function gw_public($g) {
    $g = is_array($g) ? $g : array(); $o = array();
    $secret = array('stripe' => array('secret', 'webhook'), 'paymob' => array('apiKey', 'hmac'));
    $plain = array('stripe' => array(), 'paymob' => array('integrationId', 'iframeId'));
    foreach ($secret as $id => $keys) {
        $c = isset($g[$id]) && is_array($g[$id]) ? $g[$id] : array();
        $o[$id] = array('enabled' => !empty($c['enabled']));
        foreach ($keys as $k) { $o[$id][$k . 'Set'] = !empty($c[$k]); }
        foreach ($plain[$id] as $k) { $o[$id][$k] = isset($c[$k]) ? $c[$k] : ''; }
    }
    return $o;
}
function cron_key($db) {
    $k = (string) meta_get($db, 'cronKey', '');
    if ($k === '') { $k = bin2hex(function_exists('random_bytes') ? random_bytes(12) : md5(uniqid('', true))); db_update(function (&$d) use ($k) { if (empty($d['meta']['cronKey'])) { $d['meta']['cronKey'] = $k; } }); }
    return $k;
}

/** The ticket that accompanies an order (older ones are recognised by their subject). */
function ticket_is_order($t) { return (isset($t['kind']) && $t['kind'] === 'order') || (bool) preg_match('/^(Order|Renewal) ORD-\d+$/', isset($t['subject']) ? $t['subject'] : ''); }
/** Support mail: a client's message goes to the company, the company's reply goes to the client. Never called inside db_update. */
function ticket_notify($db, $t, $actor, $text, $fromClient) {
    $excerpt = nc_substr($text, 700);
    if ($fromClient) {
        $to = (string) meta_get($db, 'contactEmail', '');
        if ($to === '') { foreach ($db['users'] as $x) { if ($x['role'] === 'admin') { $to = $x['email']; break; } } }
        if ($to === '') { return; }
        $link = site_link($db, '/admin/tickets');
        nc_mail($db, $to, '[Support] ' . $t['subject'], $actor['name'] . ' <' . $actor['email'] . ">\n\n" . $excerpt . ($link ? "\n\nOpen: " . $link : ''), $actor['email']);
    } else {
        $ui = find_user($db, 'id', $t['uid']);
        if ($ui < 0) { return; }
        $link = site_link($db, '/portal/support');
        nc_mail($db, $db['users'][$ui]['email'], 'Re: ' . $t['subject'], "We replied to your support request:\n\n" . $excerpt . ($link ? "\n\nView and answer here: " . $link : ''), (string) meta_get($db, 'contactEmail', ''));
    }
}

/* ───────── two-factor (TOTP, RFC 6238) ───────── */
function b32_enc($bin) { $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; foreach (str_split($bin) as $c) { $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT); } $o = ''; foreach (str_split($bits, 5) as $ch) { $o .= $a[bindec(str_pad($ch, 5, '0', STR_PAD_RIGHT))]; } return $o; }
function b32_dec($s) { $a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; $bits = ''; foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s))) as $c) { $bits .= str_pad(decbin(strpos($a, $c)), 5, '0', STR_PAD_LEFT); } $o = ''; foreach (str_split($bits, 8) as $by) { if (strlen($by) === 8) { $o .= chr(bindec($by)); } } return $o; }
function totp_at($secretBin, $step) { $h = hash_hmac('sha1', pack('N2', 0, $step), $secretBin, true); $off = ord($h[19]) & 15; $v = ((ord($h[$off]) & 0x7f) << 24) | (ord($h[$off + 1]) << 16) | (ord($h[$off + 2]) << 8) | ord($h[$off + 3]); return str_pad((string) ($v % 1000000), 6, '0', STR_PAD_LEFT); }
/** The matching 30-second step (±1 for clock drift) or 0. */
function totp_match($secretBin, $code) { $code = preg_replace('/\D/', '', (string) $code); if (strlen($code) !== 6) { return 0; } $now = (int) floor(time() / 30); for ($d = -1; $d <= 1; $d++) { if (hash_equals(totp_at($secretBin, $now + $d), $code)) { return $now + $d; } } return 0; }
function tfa_secret($u) { require_once __DIR__ . '/providers.php'; return !empty($u['totp']['secret']) ? b32_dec(mail_unseal($u['totp']['secret'])) : ''; }
/** Checks a login / disable code: an authenticator code (not reused) or a recovery code (consumed). Returns the updated totp array or null. */
function tfa_check($u, $code) {
    $t = isset($u['totp']) && is_array($u['totp']) ? $u['totp'] : array();
    $bin = tfa_secret($u);
    if ($bin !== '') { $st = totp_match($bin, $code); if ($st > 0 && $st > (int) (isset($t['last']) ? $t['last'] : 0)) { $t['last'] = $st; return $t; } }
    $norm = strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $code));
    if (strlen($norm) === 10) { $h = hash('sha256', $norm); foreach (isset($t['rec']) && is_array($t['rec']) ? $t['rec'] : array() as $k => $x) { if (hash_equals($x, $h)) { unset($t['rec'][$k]); $t['rec'] = array_values($t['rec']); return $t; } } }
    return null;
}

/* ───────── routing ───────── */
$r = isset($_GET['r']) ? (string) $_GET['r'] : '';
if (!is_file(NC_DATA . '/installed.lock')) {
    if ($r === 'status') { out(array('installed' => false)); }
    fail('not installed', 503);
}
start_session();
// PHP keeps the session file locked until the script ends, so one slow request (a mail server that does not answer, a provider call) would freeze every other page for the same user. Only sign-in / sign-out need to write the session.
if (!in_array($r, array('auth/login', 'auth/register', 'auth/logout', 'admin/impersonate', 'auth/stop-impersonate'), true)) { session_write_close(); }

if ($r === 'admin/update' || $r === 'admin/update/restore') {
    require_once __DIR__ . '/update.php';
    $me = need_admin();
    upd_route($r, $me);
    fail('not found', 404);
}
if ($r === 'svc/domain-registrar' || $r === 'svc/domain-ns' || $r === 'svc/domain-lock') {
    require_once __DIR__ . '/providers.php';
    reg_client_route($r, need_user());
    fail('not found', 404);
}
if (strpos($r, 'admin/ops') === 0) {
    require_once __DIR__ . '/providers.php';
    $me = need_admin();
    ops_route($r, $me);
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
        out(array('site' => meta_get($db, 'site', ''), 'placeholder' => false, 'currency' => meta_get($db, 'currency', ''), 'contactEmail' => meta_get($db, 'contactEmail', ''),
            'phone' => meta_get($db, 'phone', ''), 'whatsapp' => meta_get($db, 'whatsapp', ''), 'address' => meta_get($db, 'address', ''), 'allowRegistration' => (bool) meta_get($db, 'allowRegistration', true),
            'brand' => meta_get($db, 'brand', new stdClass()), 'webmailUrl' => meta_get($db, 'webmailUrl', 'https://mail.hostinger.com'), 'defaultLang' => meta_get($db, 'defaultLang', 'ar')));

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
        out(array('plans' => array_map(function ($p) { unset($p['uid'], $p['created']); return $p; }, $plans), 'tlds' => $tlds, 'currency' => meta_get($db, 'currency', ''), 'payments' => pay_methods($db, false)));

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
            return array('to' => meta_get($db, 'contactEmail', ''), 'db' => $db);
        });
        if (!empty($res['blocked'])) { fail('too many messages, try later', 429); }
        if (!empty($res['to'])) { nc_mail($res['db'], $res['to'], 'New request: ' . $name, "Name: $name\nEmail: $email\nPhone: $phone\nService: $service\n\n$msg", $email); }
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
        out(array('user' => $u ? public_user($u) : null, 'impersonating' => !empty($_SESSION['admin_uid'])));

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
        if ($ok && !empty($db['users'][$i]['disabled']) && $db['users'][$i]['role'] !== 'admin') { fail('this account is suspended, contact us', 403); }
        if (!$ok) {
            db_update(function (&$db) use ($ip) { rate_hit($db, 'login:' . $ip); });
            fail('wrong email or password', 401);
        }
        if (!empty($db['users'][$i]['totp']['on'])) {
            $tuid = $db['users'][$i]['id'];
            $code = isset($b['code']) ? (string) $b['code'] : '';
            if ($code === '') { fail('two-factor code required', 401); }
            if (db_update(function (&$d) use ($tuid) { return rate_blocked($d, 'tfa:' . $tuid, 6, 600); })) { fail('too many attempts, try again in 10 minutes', 429); }
            $nt = tfa_check($db['users'][$i], $code);
            if ($nt === null) { db_update(function (&$d) use ($tuid) { rate_hit($d, 'tfa:' . $tuid); }); fail('wrong two-factor code', 401); }
            db_update(function (&$d) use ($tuid, $nt) { $k = find_user($d, 'id', $tuid); if ($k >= 0) { $d['users'][$k]['totp'] = $nt; } });
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = $db['users'][$i]['id'];
        out(array('user' => public_user($db['users'][$i])));

    case 'auth/2fa-setup':
        $u = need_user(); require_post();
        if (!empty($u['totp']['on'])) { fail('two-factor is already on', 409); }
        require_once __DIR__ . '/providers.php';
        $raw = b32_enc(function_exists('random_bytes') ? random_bytes(20) : substr(md5(uniqid('', true), true) . md5(uniqid('', true), true), 0, 20));
        $sealed = mail_seal($raw);
        db_update(function (&$d) use ($u, $sealed) { $k = find_user($d, 'id', $u['id']); if ($k >= 0) { $d['users'][$k]['totp'] = array('secret' => $sealed, 'on' => false, 'last' => 0, 'rec' => array()); } });
        $dbs = db_read(); $label = rawurlencode(meta_get($dbs, 'site', '') ?: 'Notch Cloud') . ':' . rawurlencode($u['email']);
        out(array('secret' => $raw, 'uri' => 'otpauth://totp/' . $label . '?secret=' . $raw . '&issuer=' . rawurlencode(meta_get($dbs, 'site', '') ?: 'Notch Cloud') . '&digits=6&period=30'));

    case 'auth/2fa-enable':
        $u = need_user(); require_post();
        $b = body();
        if (!empty($u['totp']['on'])) { fail('two-factor is already on', 409); }
        $bin = tfa_secret($u);
        if ($bin === '') { fail('start the setup first', 422); }
        $st = totp_match($bin, isset($b['code']) ? $b['code'] : '');
        if ($st <= 0) { fail('wrong two-factor code', 401); }
        $codes = array(); $hashes = array();
        for ($n = 0; $n < 8; $n++) { $c = strtolower(substr(bin2hex(function_exists('random_bytes') ? random_bytes(5) : md5(uniqid('', true), true)), 0, 10)); $codes[] = substr($c, 0, 5) . '-' . substr($c, 5); $hashes[] = hash('sha256', $c); }
        db_update(function (&$d) use ($u, $st, $hashes) { $k = find_user($d, 'id', $u['id']); if ($k >= 0) { $d['users'][$k]['totp']['on'] = true; $d['users'][$k]['totp']['last'] = $st; $d['users'][$k]['totp']['rec'] = $hashes; log_act($d, $u, '2fa-on', $u['email']); } });
        out(array('ok' => true, 'recovery' => $codes));

    case 'auth/2fa-disable':
        $u = need_user(); require_post();
        $b = body();
        if (empty($u['totp']['on'])) { out(array('ok' => true)); }
        if (!password_verify(isset($b['password']) ? (string) $b['password'] : '', $u['hash'])) { fail('current password is wrong', 403); }
        if (db_update(function (&$d) use ($u) { return rate_blocked($d, 'tfa:' . $u['id'], 6, 600); })) { fail('too many attempts, try again in 10 minutes', 429); }
        if (tfa_check($u, isset($b['code']) ? $b['code'] : '') === null) { db_update(function (&$d) use ($u) { rate_hit($d, 'tfa:' . $u['id']); }); fail('wrong two-factor code', 401); }
        db_update(function (&$d) use ($u) { $k = find_user($d, 'id', $u['id']); if ($k >= 0) { unset($d['users'][$k]['totp']); log_act($d, $u, '2fa-off', $u['email']); } });
        out(array('ok' => true));

    case 'admin/2fa-reset':
        // For a client / colleague who lost the phone and the recovery codes.
        $me = need_admin(); require_post();
        $b = body(); $tuid = isset($b['uid']) ? (string) $b['uid'] : '';
        $okr = db_update(function (&$d) use ($tuid, $me) { $k = find_user($d, 'id', $tuid); if ($k < 0) { return false; } unset($d['users'][$k]['totp']); log_act($d, $me, '2fa-reset', $d['users'][$k]['email']); return true; });
        if (!$okr) { fail('user not found', 404); }
        out(array('ok' => true));

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
        $dbT = db_read();
        if (terms_cfg($dbT)['required'] && (terms_cfg($dbT)['ar'] !== '' || terms_cfg($dbT)['en'] !== '') && empty($b['acceptTerms'])) { fail('you must accept the terms and conditions', 422); }
        $kyc = kyc_clean($b);
        if ($kyc['type'] === 'company' && $company === '') { fail('enter the company name', 422); }
        $ip = client_ip();
        $user = array('kyc' => $kyc, 'terms' => !empty($b['acceptTerms']) ? terms_stamp($dbT, 'client') : null, 'id' => new_id(), 'name' => $name, 'email' => $email, 'role' => 'client', 'hash' => password_hash($b['password'], PASSWORD_DEFAULT), 'created' => gmdate('c'), 'phone' => $phone, 'company' => $company, 'source' => 'signup');
        $res = db_update(function (&$db) use ($user, $ip) {
            if (!meta_get($db, 'allowRegistration', true)) { return 'closed'; }
            if (rate_blocked($db, 'reg:' . $ip, 5, 3600)) { return 'rate'; }
            if (find_user($db, 'email', $user['email']) >= 0) { return 'dup'; }
            rate_hit($db, 'reg:' . $ip);
            $user['no'] = next_user_no($db);
            $db['users'][] = $user;
            log_act($db, $user, 'signup', $user['email']);
            return array('to' => meta_get($db, 'contactEmail', ''), 'db' => $db);
        });
        if ($res === 'closed') { fail('new sign-ups are closed', 403); }
        if ($res === 'rate') { fail('too many attempts, try later', 429); }
        if ($res === 'dup') { fail('this email is already registered', 409); }
        if (!empty($res['to'])) { nc_mail($res['db'], $res['to'], 'New client: ' . $name, "A new client signed up.\nName: $name\nEmail: $email\nPhone: $phone\nCompany: $company", $email); }
        session_regenerate_id(true);
        $_SESSION['uid'] = $user['id'];
        out(array('user' => public_user($user)), 201);

    case 'orders/coupon':
        $u = need_user();
        require_post();
        $b = body();
        $total = isset($b['total']) ? (float) $b['total'] : 0;
        list($c, $err) = coupon_find(db_read(), isset($b['code']) ? $b['code'] : '', $total);
        if (!$c) { fail($err !== '' ? $err : 'enter a coupon', 422); }
        out(array('code' => $c['code'], 'type' => $c['type'], 'value' => $c['value'], 'discount' => coupon_discount($c, $total)));

    case 'orders/create':
        // The cart: plans (a number of periods), domain registrations and renewals. Prices are always computed here from the live catalog / the client's own services.
        $u = need_user();
        require_post();
        $b = body();
        $in = isset($b['items']) && is_array($b['items']) ? $b['items'] : (isset($b['planId']) ? array(array('kind' => 'plan', 'id' => $b['planId'], 'qty' => 1)) : array());
        if (count($in) < 1 || count($in) > 20) { fail('cart is empty', 422); }
        $note = clean_text(isset($b['note']) ? $b['note'] : '', 2000);
        $domain = strtolower(clean_text(isset($b['domain']) ? $b['domain'] : '', 253));
        $mbWanted = array();
        foreach (isset($b['mailboxes']) && is_array($b['mailboxes']) ? array_slice($b['mailboxes'], 0, 100) : array() as $lp) { $lp = strtolower(trim((string) $lp)); if (preg_match('/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/', $lp) && !in_array($lp, $mbWanted, true)) { $mbWanted[] = $lp; } }
        $db0 = db_read();
        if (!terms_ok($db0, $u)) { fail('terms', 403); }
        $cur = meta_get($db0, 'currency', '') ?: 'EGP';
        $methods = pay_methods($db0, true);
        $method = isset($b['method']) ? (string) $b['method'] : '';
        $mi = -1; foreach ($methods as $k => $m) { if ($m['id'] === $method) { $mi = $k; } }
        if (count($methods) > 0 && $mi < 0) { fail('choose a payment method', 422); }
        $lines = array(); $total = 0;
        $tldRows = null;
        foreach ($in as $it) {
            if (!is_array($it)) { continue; }
            $kind = isset($it['kind']) ? $it['kind'] : 'plan';
            if ($kind === 'domain') {
                $name = strtolower(trim(isset($it['name']) ? (string) $it['name'] : ''));
                if (!preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $name)) { fail('invalid domain name', 422); }
                $years = max(1, min(10, (int) (isset($it['qty']) ? $it['qty'] : 1)));
                require_once __DIR__ . '/providers.php';
                if ($tldRows === null) { $tldRows = prov_tld_table($db0, prov_cache_read()); }
                $best = null;
                foreach ($tldRows as $row) { if ($row['selected'] && substr($name, -strlen('.' . $row['tld'])) === '.' . $row['tld'] && ($best === null || strlen($row['tld']) > strlen($best['tld']))) { $best = $row; } }
                if ($best === null) { fail('this extension is not for sale', 422); }
                $chk = prov_search($db0, $name, array($best['tld']), false);
                foreach ((isset($chk['results']) ? $chk['results'] : array()) as $rr) { if ($rr['domain'] === $name && empty($rr['available'])) { fail('domain is no longer available: ' . $name, 409); } }
                $price = round($best['sell'] + ($years - 1) * $best['renewSell'], 2);
                $lines[] = array('kind' => 'domain', 'ref' => $name, 'nameAr' => 'تسجيل دومين ' . $name, 'nameEn' => 'Domain registration ' . $name, 'qty' => $years, 'unit' => 'year', 'unitPrice' => $best['renewSell'], 'price' => $price);
                $total += $price;
            } elseif ($kind === 'renew') {
                $res = isset($it['res']) ? (string) $it['res'] : '';
                if ($res !== 'domains' && $res !== 'hosting') { fail('cannot renew this', 422); }
                $k = find_by(mine($db0, $res, $u['id']), 'id', isset($it['id']) ? (string) $it['id'] : '');
                if ($k < 0) { fail('service not found', 404); }
                $svc = mine($db0, $res, $u['id'])[$k];
                if ((float) $svc['price'] <= 0) { fail('this service has no renewal price, contact us', 422); }
                $yearly = $res === 'domains' || (isset($svc['billing']) && $svc['billing'] === 'yearly');
                $qty = max(1, min($yearly ? 5 : 36, (int) (isset($it['qty']) ? $it['qty'] : 1)));
                $label = $res === 'domains' ? $svc['name'] : $svc['plan'] . ($svc['domain'] !== '' ? ' (' . $svc['domain'] . ')' : '');
                $price = round($svc['price'] * $qty, 2);
                $lines[] = array('kind' => 'renew', 'ref' => $res . ':' . $svc['id'], 'category' => 'renew', 'nameAr' => 'تجديد ' . $label, 'nameEn' => 'Renewal: ' . $label, 'qty' => $qty, 'unit' => $yearly ? 'year' : 'month', 'unitPrice' => $svc['price'], 'price' => $price);
                $total += $price;
            } else {
                $pi = find_by(items_of($db0, 'plans'), 'id', isset($it['id']) ? (string) $it['id'] : '');
                if ($pi < 0 || empty($db0['items']['plans'][$pi]['active'])) { fail('plan not found', 404); }
                $plan = $db0['items']['plans'][$pi];
                $qty = max(1, (int) (isset($it['qty']) ? $it['qty'] : 1));
                $qty = $plan['per'] === 'once' ? 1 : min($qty, $plan['per'] === 'year' ? 5 : 36);
                $price = round($plan['price'] * $qty, 2);
                $lines[] = array('kind' => 'plan', 'ref' => $plan['id'], 'category' => $plan['category'], 'nameAr' => $plan['nameAr'], 'nameEn' => $plan['nameEn'] !== '' ? $plan['nameEn'] : $plan['nameAr'], 'qty' => $qty, 'unit' => $plan['per'], 'unitPrice' => $plan['price'], 'price' => $price);
                $total += $price;
            }
        }
        if (!$lines) { fail('cart is empty', 422); }
        $subtotal = round($total, 2);
        $coupon = ''; $discount = 0;
        if (!empty($b['coupon'])) {
            list($cp, $cerr) = coupon_find($db0, $b['coupon'], $subtotal);
            if (!$cp) { fail($cerr, 422); }
            $coupon = $cp['code']; $discount = coupon_discount($cp, $subtotal);
        }
        $total = round($subtotal - $discount, 2);
        $mname = $mi >= 0 ? ($methods[$mi]['nameEn'] !== '' ? $methods[$mi]['nameEn'] : $methods[$mi]['nameAr']) : '';
        $made = db_update(function (&$db) use ($lines, $total, $subtotal, $discount, $coupon, $u, $note, $domain, $method, $mname, $cur, $mbWanted) {
            global $SCHEMA;
            if ($coupon !== '') {
                list($cp, $cerr) = coupon_find($db, $coupon, $subtotal);
                if (!$cp) { return array('err' => $cerr); }
                foreach ($db['meta']['coupons'] as $ci => $cc) { if (strtoupper($cc['code']) === strtoupper($coupon)) { $db['meta']['coupons'][$ci]['used'] = (int) $cc['used'] + 1; } }
            }
            $r = nc_new_order($db, $u, $lines, $total, array('domain' => $domain, 'note' => $note, 'method' => $method, 'mname' => $mname, 'coupon' => $coupon, 'discount' => $discount, 'subtotal' => $subtotal, 'cur' => $cur));
            // Email plans: the mailboxes the client picked are reserved right away (pending) and switch on when the order is paid.
            $seats = 0; $emailLine = null; foreach ($lines as $ln) { if ($ln['category'] === 'email') { $pi2 = find_by(items_of($db, 'plans'), 'id', $ln['ref']); $seats += $pi2 >= 0 && isset($db['items']['plans'][$pi2]['seats']) ? (int) $db['items']['plans'][$pi2]['seats'] : 0; $emailLine = $ln; } }
            if ($emailLine !== null && $mbWanted && preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/', $domain)) {
                $have = array(); foreach (items_of($db, 'mailboxes') as $m0) { $have[strtolower($m0['address'])] = true; }
                $made2 = array();
                foreach ($mbWanted as $lp) {
                    if (count($made2) >= ($seats > 0 ? $seats : 50)) { break; }
                    $addr = $lp . '@' . $domain; if (isset($have[$addr])) { continue; }
                    $e2 = ''; $d2 = clean_fields($SCHEMA['mailboxes'], array('address' => $addr, 'quotaGb' => 5, 'usedGb' => 0, 'status' => 'pending', 'notes' => ''), $e2);
                    if ($d2 === null) { continue; }
                    $db['items']['mailboxes'][] = array_merge(array('id' => new_id(), 'uid' => $u['id'], 'created' => gmdate('c'), 'orderId' => $r['order']['id']), $d2); $made2[] = $addr;
                }
                $oi2 = find_by(items_of($db, 'orders'), 'id', $r['order']['id']); if ($oi2 >= 0) { $db['items']['orders'][$oi2]['mailboxes'] = $made2; }
            }
            log_act($db, $u, 'order', $r['order']['number'] . ' ' . $total);
            $r['to'] = meta_get($db, 'contactEmail', ''); $r['db'] = $db;
            return $r;
        });
        if (isset($made['err'])) { fail($made['err'], 422); }
        $dbm = $made['db']; unset($made['db']);
        if ($made['to']) { nc_mail($dbm, $made['to'], 'Order ' . $made['order']['number'], $u['name'] . ' <' . $u['email'] . ">\n\n" . $made['text'], $u['email']); }
        nc_mail($dbm, $u['email'], 'Your order ' . $made['order']['number'], "Thank you! We received your order " . $made['order']['number'] . " (" . $made['order']['total'] . ' ' . $made['order']['currency'] . ").\nFollow it and pay here: " . (site_link($dbm, '/portal/orders/' . $made['order']['id']) ?: '(your client area → Orders)'));
        out(array('order' => $made['order'], 'invoice' => $made['invoice'], 'payment' => $mi >= 0 ? $methods[$mi] : null), 201);

    case 'auth/forgot':
        require_post();
        $b = body();
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $ip = client_ip();
        $blocked = db_update(function (&$db) use ($ip) { if (rate_blocked($db, 'forgot:' . $ip, 5, 3600)) { return true; } rate_hit($db, 'forgot:' . $ip); return false; });
        if ($blocked) { fail('too many requests, try again later', 429); }
        $tok = bin2hex(function_exists('random_bytes') ? random_bytes(20) : md5(uniqid('', true)) . md5(mt_rand()));
        $sent = db_update(function (&$db) use ($email, $tok) {
            $i = find_user($db, 'email', $email);
            if ($i < 0 || site_url($db) === '') { return null; }
            $db['users'][$i]['resetHash'] = hash('sha256', $tok);
            $db['users'][$i]['resetExp'] = time() + 3600;
            return array('db' => $db, 'name' => $db['users'][$i]['name']);
        });
        if ($sent) { $link = site_link($sent['db'], '/portal/reset?email=' . rawurlencode($email) . '&token=' . $tok); nc_mail($sent['db'], $email, 'Reset your password', "Hello " . $sent['name'] . ",\n\nUse this link to choose a new password (valid for 1 hour):\n" . $link . "\n\nIf you did not ask for this, ignore this email."); }
        out(array('ok' => true)); // the same answer whether or not the address exists

    case 'auth/reset':
        require_post();
        $b = body();
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $tok = isset($b['token']) ? (string) $b['token'] : '';
        check_password(isset($b['password']) ? $b['password'] : '');
        $ip = client_ip();
        $blocked = db_update(function (&$db) use ($ip) { if (rate_blocked($db, 'reset:' . $ip, 10, 3600)) { return true; } rate_hit($db, 'reset:' . $ip); return false; });
        if ($blocked) { fail('too many attempts, try again later', 429); }
        $h = password_hash($b['password'], PASSWORD_DEFAULT);
        $ok = db_update(function (&$db) use ($email, $tok, $h) {
            $i = find_user($db, 'email', $email);
            if ($i < 0 || empty($db['users'][$i]['resetHash']) || $db['users'][$i]['resetExp'] < time() || !hash_equals($db['users'][$i]['resetHash'], hash('sha256', $tok))) { return false; }
            $db['users'][$i]['hash'] = $h; unset($db['users'][$i]['resetHash'], $db['users'][$i]['resetExp']);
            log_act($db, $db['users'][$i], 'password-reset', 'reset by email link');
            return true;
        });
        if (!$ok) { fail('this link is invalid or expired', 400); }
        out(array('ok' => true));

    case 'orders/pay-online':
        $u = need_user();
        require_post();
        $b = body();
        $db = db_read();
        $oi = find_by(items_of($db, 'orders'), 'id', isset($b['id']) ? (string) $b['id'] : '');
        if ($oi < 0 || $db['items']['orders'][$oi]['uid'] !== $u['id'] || $db['items']['orders'][$oi]['status'] !== 'pending') { fail('order not found or already processed', 404); }
        $o = $db['items']['orders'][$oi];
        $type = ''; foreach ((array) meta_get($db, 'payments', array()) as $m) { if ($m['id'] === $o['method']) { $type = $m['type']; } }
        require_once __DIR__ . '/providers.php';
        try {
            if ($type === 'stripe') {
                if (site_url($db) === '') { fail('set the site address in Settings first', 409); }
                $url = gw_stripe_session($db, $o, $u['email'], site_link($db, '/portal/orders/' . $o['id']), site_link($db, '/portal/orders/' . $o['id']));
            } elseif ($type === 'paymob') {
                $url = gw_paymob_url($db, $o, $u);
            } else { fail('this payment method is not an online gateway', 422); }
        } catch (Exception $e) { fail($e->getMessage(), 502); }
        out(array('url' => $url));

    case 'pay/stripe-webhook':
        $payload = file_get_contents('php://input');
        $db = db_read();
        $c = gw_cfg_early($db, 'stripe');
        if (!$c || empty($c['webhook']) || !function_exists('hash_hmac')) { fail('not configured', 400); }
        require_once __DIR__ . '/providers.php';
        if (!gw_stripe_verify($c['webhook'], $payload, isset($_SERVER['HTTP_STRIPE_SIGNATURE']) ? $_SERVER['HTTP_STRIPE_SIGNATURE'] : '')) { fail('bad signature', 400); }
        $ev = json_decode($payload, true);
        if (is_array($ev) && isset($ev['type']) && $ev['type'] === 'checkout.session.completed' && isset($ev['data']['object']['metadata']['orderId']) && (isset($ev['data']['object']['payment_status']) ? $ev['data']['object']['payment_status'] === 'paid' : true)) {
            gw_mark_paid((string) $ev['data']['object']['metadata']['orderId'], 'stripe:' . (isset($ev['data']['object']['id']) ? $ev['data']['object']['id'] : ''));
        }
        out(array('received' => true));

    case 'pay/paymob-webhook':
        $db = db_read();
        $c = gw_cfg_early($db, 'paymob');
        if (!$c || empty($c['hmac'])) { fail('not configured', 400); }
        require_once __DIR__ . '/providers.php';
        $ev = json_decode(file_get_contents('php://input'), true);
        $obj = is_array($ev) && isset($ev['obj']) ? $ev['obj'] : array();
        if (!gw_paymob_verify($c['hmac'], $obj, isset($_GET['hmac']) ? $_GET['hmac'] : '')) { fail('bad signature', 400); }
        if (!empty($obj['success']) && empty($obj['is_refunded']) && empty($obj['is_voided']) && isset($obj['order']['merchant_order_id'])) {
            gw_mark_paid(explode('x', (string) $obj['order']['merchant_order_id'])[0], 'paymob:' . (isset($obj['id']) ? $obj['id'] : ''));
        }
        out(array('received' => true));

    case 'cards/setup':
    case 'cards/confirm':
    case 'cards/remove':
    case 'cards/autopay':
        $u = need_user(); require_post();
        require_once __DIR__ . '/providers.php';
        $b = body(); $db = db_read();
        try {
            if ($r === 'cards/setup') {
                if (site_url($db) === '') { fail('set the site address in Settings first', 409); }
                $url = card_setup_url($db, $u, site_link($db, '/portal/billing') . (meta_get($db, 'cleanUrls', false) ? '?card={CHECKOUT_SESSION_ID}' : '?card={CHECKOUT_SESSION_ID}'), site_link($db, '/portal/billing'));
                out(array('url' => $url));
            }
            if ($r === 'cards/confirm') { $c = card_confirm($db, $u, isset($b['session']) ? (string) $b['session'] : ''); out(array('card' => array('brand' => $c['brand'], 'last4' => $c['last4'], 'exp' => $c['exp'], 'autopay' => true))); }
            if ($r === 'cards/remove') { card_remove($db, $u); out(array('ok' => true)); }
            $on = !empty($b['on']);
            db_update(function (&$d) use ($u, $on) { $k = find_user($d, 'id', $u['id']); if ($k >= 0 && !empty($d['users'][$k]['card']['pm'])) { $d['users'][$k]['autopay'] = $on; log_act($d, $u, 'autopay-' . ($on ? 'on' : 'off'), $u['email']); } });
            out(array('ok' => true));
        } catch (Exception $e) { fail($e->getMessage(), 502); }

    case 'cron/run':
        // For a hosting cron job: curl "https://your-site/api/index.php?r=cron/run&key=…" once a day.
        $db = db_read();
        $k = (string) meta_get($db, 'cronKey', '');
        if ($k === '' || !isset($_GET['key']) || !hash_equals($k, (string) $_GET['key'])) { fail('forbidden', 403); }
        $r2 = nc_daily(true);
        require_once __DIR__ . '/providers.php'; ops_backup_daily(); reg_auto_renew(); autopay_run();
        out(array('ok' => true, 'created' => isset($r2['created']) ? $r2['created'] : 0));

    case 'orders/pay':
        // The client reports how/when they paid; the admin confirms it.
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $ref = clean_text(isset($b['ref']) ? $b['ref'] : '', 160);
        $method = isset($b['method']) ? (string) $b['method'] : '';
        if ($ref === '') { fail('enter the payment reference', 422); }
        $ok = db_update(function (&$db) use ($id, $ref, $method, $u) {
            $i = find_by(items_of($db, 'orders'), 'id', $id);
            if ($i < 0 || $db['items']['orders'][$i]['uid'] !== $u['id'] || $db['items']['orders'][$i]['status'] !== 'pending') { return false; }
            $db['items']['orders'][$i]['payRef'] = $ref;
            if ($method !== '') { $db['items']['orders'][$i]['method'] = $method; }
            $db['items']['orders'][$i]['paidClaim'] = gmdate('c');
            log_act($db, $u, 'order-paid-claim', $db['items']['orders'][$i]['number']);
            return true;
        });
        if (!$ok) { fail('order not found or already processed', 404); }
        out(array('ok' => true));

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
            if (res_unowned($res) || $res === 'billable') { continue; }
            // Our cost and supplier are never shown to clients.
            $o[$res] = array_values(array_map(function ($it) { unset($it['cost'], $it['provider'], $it['ref'], $it['adminNote']); return $it; }, array_filter(deco_list($res, mine($db, $res, $u['id'])), function ($it) { return !isset($it['status']) || $it['status'] !== 'archived'; })));
        }
        // The automatic ticket that accompanies every order is for the company; the client sees it only once we have answered in it.
        $o['tickets'] = array_values(array_filter($db['tickets'], function ($t) use ($u) { if ($t['uid'] !== $u['id']) { return false; } if (ticket_is_order($t)) { foreach ($t['messages'] as $m) { if ($m['from'] === 'admin') { return true; } } return false; } return true; }));
        // Sites of this client that sit on somebody else's (shared) hosting: only the plan name is shown.
        $o['sharedHosting'] = array(); $seenH = array();
        foreach ($o['websites'] as $w) {
            if (empty($w['hostingId']) || isset($seenH[$w['hostingId']])) { continue; }
            $hi = find_by(items_of($db, 'hosting'), 'id', $w['hostingId']);
            if ($hi >= 0 && $db['items']['hosting'][$hi]['uid'] !== $u['id']) { $seenH[$w['hostingId']] = true; $o['sharedHosting'][] = array('id' => $w['hostingId'], 'plan' => $db['items']['hosting'][$hi]['plan'], 'mode' => 'shared'); }
        }
        $o['quotes'] = array_values(array_filter($o['quotes'], function ($q) { return $q['status'] !== 'draft'; }));
        $o['invoices'] = array_values(array_map(function ($v) use ($db) { return inv_public($db, $v); }, mine($db, 'invoices', $u['id'])));
        $o['credit'] = (float) (isset($u['credit']) ? $u['credit'] : 0);
        $o['transactions'] = array(); foreach ($o['invoices'] as $inv) { foreach ($inv['payments'] as $e) { $o['transactions'][] = array_merge($e, array('invoiceId' => $inv['id'], 'number' => $inv['number'])); } }
        usort($o['transactions'], function ($a, $b) { return strcmp($b['at'], $a['at']); });
        $o['payments'] = pay_methods($db, true);
        $o['webmail'] = meta_get($db, 'webmailUrl', 'https://mail.hostinger.com');
        $o['business'] = meta_get($db, 'business', new stdClass());
        $ic = imap_cfg($db); $sc = meta_get($db, 'smtpOut', array());
        $o['card'] = !empty($u['card']['pm']) ? array('brand' => $u['card']['brand'], 'last4' => $u['card']['last4'], 'exp' => $u['card']['exp'], 'autopay' => !empty($u['autopay'])) : null;
        $gwS = gw_cfg_early($db, 'stripe'); $o['cardsAvailable'] = (bool) ($gwS && !empty($gwS['secret']));
        $o['mailServer'] = array('imap' => array('host' => $ic['host'], 'port' => $ic['port']), 'smtp' => array('host' => !empty($sc['host']) ? $sc['host'] : 'smtp.hostinger.com', 'port' => !empty($sc['port']) ? (int) $sc['port'] : 465));
        $o['taxRate'] = (float) meta_get($db, 'taxRate', 0);
        $o['taxes'] = inv_taxes($db); $o['taxInclusive'] = (bool) meta_get($db, 'taxInclusive', true);
        $o['me'] = array('name' => $u['name'], 'email' => $u['email'], 'phone' => isset($u['phone']) ? $u['phone'] : '', 'company' => isset($u['company']) ? $u['company'] : '');
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
            if (!can_touch($u, $d) || ($u['role'] !== 'admin' && !empty($d['dnsOff']))) { return 'forbidden'; }
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
            if (!can_touch($u, $d) || ($u['role'] !== 'admin' && !empty($d['dnsOff']))) { return 'forbidden'; }
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
        ticket_notify(db_read(), $t, $u, $text, true);
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
        $dbn = db_read(); $tk = find_by($dbn['tickets'], 'id', $id);
        if ($tk >= 0) { ticket_notify($dbn, $dbn['tickets'][$tk], $u, $text, $u['role'] !== 'admin' || $dbn['tickets'][$tk]['uid'] === $u['id']); }
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
        nc_daily(); // once a day, the first time an admin opens the panel (a cron job does it more reliably)
        require_once __DIR__ . '/providers.php'; ops_backup_daily();
        $db = db_read();
        $admins = admin_count($db);
        $active = 0; $counts = array();
        foreach (array_keys($SCHEMA) as $res) {
            $list = items_of($db, $res);
            $counts[$res] = count($list);
            if ($res !== 'invoices' && $res !== 'orders') { foreach ($list as $it) { if ($it['status'] === 'active') { $active++; } } }
        }
        $paid = 0; $due = 0;
        foreach (items_of($db, 'invoices') as $inv) { $paid += inv_paid($inv); if ($inv['status'] === 'due' || $inv['status'] === 'collections') { $due += inv_balance($inv); } }
        $open = 0; foreach ($db['tickets'] as $t) { if ($t['status'] === 'open' && !ticket_is_order($t)) { $open++; } } // open = waiting for an admin reply
        $pendingOrders = 0; foreach (items_of($db, 'orders') as $od) { if ($od['status'] === 'pending') { $pendingOrders++; } }
        $newLeads = 0; foreach ($db['leads'] as $l) { if ($l['status'] === 'new') { $newLeads++; } }
        $soon = date('Y-m-d', time() + 30 * 86400);
        $expiring = array();
        foreach (items_of($db, 'domains') as $d) {
            if ($d['status'] === 'expiring' || ($d['expires'] !== '' && $d['expires'] <= $soon)) { $expiring[] = array('id' => $d['id'], 'name' => $d['name'], 'expires' => $d['expires'], 'owner' => user_name($db, $d['uid'])); }
        }
        out(array('users' => count($db['users']), 'admins' => $admins, 'clients' => count($db['users']) - $admins, 'site' => meta_get($db, 'site', ''),
            'counts' => $counts, 'activeServices' => $active, 'paid' => $paid, 'due' => $due, 'openTickets' => $open, 'newLeads' => $newLeads, 'pendingOrders' => $pendingOrders,
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
        $user = array('id' => new_id(), 'name' => $name, 'email' => $email, 'role' => $role, 'hash' => $hash, 'created' => gmdate('c'), 'phone' => clean_text(isset($b['phone']) ? $b['phone'] : '', 30), 'company' => clean_text(isset($b['company']) ? $b['company'] : '', 80), 'kyc' => kyc_clean($b));
        $dup = db_update(function (&$db) use ($user, $me) {
            if (find_user($db, 'email', $user['email']) >= 0) { return true; }
            $user['no'] = next_user_no($db);
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
        $disabled = isset($b['disabled']) ? !empty($b['disabled']) : null;
        $extras = array();
        if (isset($b['group'])) { $extras['group'] = clean_text($b['group'], 60); }
        if (isset($b['notes'])) { $extras['notes'] = clean_text($b['notes'], 4000); }
        if (isset($b['taxExempt'])) { $extras['taxExempt'] = !empty($b['taxExempt']); }
        if (isset($b['noReminders'])) { $extras['noReminders'] = !empty($b['noReminders']); }
        if (isset($b['kyc']) && is_array($b['kyc'])) { $extras['kyc_in'] = kyc_clean($b['kyc']); }
        if (!empty($b['termsAccepted'])) { $extras['terms_attest'] = true; }
        if (isset($b['addr']) && is_array($b['addr'])) { $ad = array(); foreach (array('address1', 'address2', 'city', 'state', 'zip', 'country', 'taxId') as $k) { $ad[$k] = clean_text(isset($b['addr'][$k]) ? $b['addr'][$k] : '', 160); } $extras['addr'] = $ad; }
        if (isset($b['contacts']) && is_array($b['contacts'])) { $cl = array(); foreach (array_slice($b['contacts'], 0, 30) as $c) { if (is_array($c) && clean_text(isset($c['name']) ? $c['name'] : '', 80) !== '') { $cl[] = array('id' => isset($c['id']) && preg_match('/^[a-z0-9]{4,20}$/', (string) $c['id']) ? $c['id'] : new_id(), 'name' => clean_text($c['name'], 80), 'email' => clean_email(isset($c['email']) ? $c['email'] : ''), 'phone' => clean_text(isset($c['phone']) ? $c['phone'] : '', 30), 'role' => clean_text(isset($c['role']) ? $c['role'] : '', 40)); } } $extras['contacts'] = $cl; }
        if ($disabled && $id === $me['id']) { fail('you cannot suspend your own account', 409); }
        $res = db_update(function (&$db) use ($id, $name, $role, $hash, $me, $phone, $company, $email, $disabled, $extras) {
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
            foreach ($extras as $ek => $ev) {
                if ($ek === 'kyc_in') { $old = isset($db['users'][$i]['kyc']) && is_array($db['users'][$i]['kyc']) ? $db['users'][$i]['kyc'] : array(); $db['users'][$i]['kyc'] = array_merge($old, $ev); }
                elseif ($ek === 'terms_attest') { $db['users'][$i]['terms'] = terms_stamp($db, 'admin'); }
                else { $db['users'][$i][$ek] = $ev; }
            }
            if ($disabled !== null) { if ($disabled && $db['users'][$i]['role'] === 'admin') { return 'last-admin'; } $db['users'][$i]['disabled'] = $disabled; }
            log_act($db, $me, $disabled === true ? 'user-suspend' : ($disabled === false ? 'user-activate' : 'user-update'), $db['users'][$i]['email']);
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
        foreach ((array) glob(kyc_dir() . '/' . preg_replace('/[^a-z0-9]/i', '', $id) . '-*') as $kf) { @unlink($kf); }
        out(array('ok' => true));

    /* ── admin: client services ── */
    case 'admin/items':
        need_admin();
        $res = res_name();
        $db = db_read();
        out(array('items' => $res === 'invoices' ? array_map(function ($v) use ($db) { return inv_public($db, $v); }, items_of($db, $res)) : ($res === 'mailboxes' ? with_pass($db, deco_list($res, items_of($db, $res))) : deco_list($res, items_of($db, $res)))));

    case 'admin/all':
        need_admin();
        $db = db_read();
        $o = array('users' => array_map(function ($u, $k) { $p = public_user($u); if (!$p['no']) { $p['no'] = $k + 1; } return $p; }, $db['users'], array_keys($db['users'])), 'items' => array(), 'tickets' => array());
        foreach (array_keys($SCHEMA) as $res) { if (!res_unowned($res)) { $o['items'][$res] = $res === 'invoices' ? array_map(function ($v) use ($db) { return inv_public($db, $v); }, items_of($db, $res)) : ($res === 'mailboxes' ? with_pass($db, deco_list($res, items_of($db, $res))) : deco_list($res, items_of($db, $res))); } }
        foreach ($db['tickets'] as $t) { $o['tickets'][] = array('id' => $t['id'], 'uid' => $t['uid'], 'subject' => $t['subject'], 'status' => $t['status'], 'updated' => isset($t['updated']) ? $t['updated'] : ''); }
        out($o);

    case 'admin/item-save':
        $me = need_admin();
        require_post();
        $res = res_name();
        if ($res === 'invoices') { fail('use the invoice screens to change invoices', 405); }
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
            if ($res === 'websites' && !empty($clean['hostingId'])) {
                $hi = find_by(items_of($db, 'hosting'), 'id', (string) $clean['hostingId']);
                if ($hi >= 0 && $db['items']['hosting'][$hi]['uid'] !== $uid && (!isset($db['items']['hosting'][$hi]['mode']) || $db['items']['hosting'][$hi]['mode'] !== 'shared')) { return array('err' => 'this hosting belongs to one client only: set it to "shared" first to put another client\'s site on it'); }
            }
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

    case 'admin/order-status':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $st = isset($b['status']) ? (string) $b['status'] : '';
        if (!in_array($st, array('pending', 'paid', 'active', 'cancelled'), true)) { fail('invalid status', 422); }
        $res = db_update(function (&$db) use ($id, $st, $me) { $r = order_set_status($db, $id, $st, $me); if (isset($r['order'])) { $r['uid'] = $r['order']['uid']; $r['db'] = $db; } return $r; });
        if (isset($res['err'])) { fail($res['err'], 404); }
        if ($st === 'active' || $st === 'paid') { $cu = find_user($res['db'], 'id', $res['uid']); if ($cu >= 0) { nc_mail($res['db'], $res['db']['users'][$cu]['email'], 'Order ' . $res['order']['number'] . ($st === 'active' ? ' is active' : ' payment received'), $st === 'active' ? "Your order " . $res['order']['number'] . " is now active. You can see your services in your client area." : "We received the payment for order " . $res['order']['number'] . ". We are setting up your service."); } }
        unset($res['db'], $res['uid']);
        out($res);

    case 'admin/mailbox-import':
        // Paste the mailboxes that exist at Hostinger (one address per line) so they show up for the client.
        $me = need_admin();
        require_post();
        $b = body();
        $uid = isset($b['uid']) ? (string) $b['uid'] : '';
        $dom = strtolower(trim(isset($b['domain']) ? (string) $b['domain'] : ''));
        $lines = preg_split('/[\r\n,;]+/', (string) (isset($b['list']) ? $b['list'] : ''));
        $res = db_update(function (&$db) use ($uid, $dom, $lines, $me, $SCHEMA) {
            if (find_user($db, 'id', $uid) < 0) { return array('err' => 'choose a client'); }
            $have = array(); foreach (items_of($db, 'mailboxes') as $m) { $have[strtolower($m['address'])] = true; }
            $added = 0; $skipped = 0;
            foreach ($lines as $a) {
                $a = strtolower(trim($a));
                if ($a === '') { continue; }
                if (strpos($a, '@') === false && $dom !== '') { $a .= '@' . $dom; }
                if (!filter_var($a, FILTER_VALIDATE_EMAIL) || ($dom !== '' && substr($a, -strlen('@' . $dom)) !== '@' . $dom) || isset($have[$a])) { $skipped++; continue; }
                $d = clean_fields($SCHEMA['mailboxes'], array('address' => $a, 'quotaGb' => 5, 'usedGb' => 0, 'status' => 'active'), $e);
                $db['items']['mailboxes'][] = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c')), $d);
                $have[$a] = true; $added++;
            }
            log_act($db, $me, 'mailbox-import', $dom . ' +' . $added);
            return array('added' => $added, 'skipped' => $skipped);
        });
        if (isset($res['err'])) { fail($res['err'], 422); }
        out($res);

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
        $list = array_map(function ($t) use ($db) { $t['owner'] = user_name($db, $t['uid']); $t['kind'] = ticket_is_order($t) ? 'order' : 'support'; return $t; }, $db['tickets']);
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
                'brand' => meta_get($db, 'brand', new stdClass()), 'business' => meta_get($db, 'business', new stdClass()),
                'payments' => meta_get($db, 'payments', array()), 'webmailUrl' => meta_get($db, 'webmailUrl', 'https://mail.hostinger.com'),
                'imap' => imap_cfg($db), 'smtpOut' => (function ($c) { return array('host' => isset($c['host']) ? $c['host'] : '', 'port' => isset($c['port']) ? (int) $c['port'] : 465, 'secure' => isset($c['secure']) ? $c['secure'] : 'ssl'); })(meta_get($db, 'smtpOut', array())), 'terms' => terms_cfg($db), 'suspendAfterDays' => (int) meta_get($db, 'suspendAfterDays', 0), 'taxes' => inv_taxes($db), 'taxInclusive' => (bool) meta_get($db, 'taxInclusive', true), 'invoicePrefix' => meta_get($db, 'invoicePrefix', 'INV-'), 'defaultLang' => meta_get($db, 'defaultLang', 'ar'), 'siteUrl' => meta_get($db, 'siteUrl', ''), 'cleanUrls' => (bool) meta_get($db, 'cleanUrls', false), 'taxRate' => (float) meta_get($db, 'taxRate', 0), 'autoActivate' => (bool) meta_get($db, 'autoActivate', false), 'autoRenewInvoices' => (bool) meta_get($db, 'autoRenewInvoices', true),
                'smtp' => smtp_public(meta_get($db, 'smtp', array())), 'gateways' => gw_public(meta_get($db, 'gateways', array())), 'coupons' => meta_get($db, 'coupons', array()),
                'cronKey' => cron_key($db), 'lastDaily' => meta_get($db, 'lastDaily', ''), 'providerRegister' => (bool) meta_get($db, 'providerRegister', false), 'providerRenew' => (bool) meta_get($db, 'providerRenew', false)));
        }
        require_post();
        $b = body();
        $site = clean_text(isset($b['site']) ? $b['site'] : '', 80);
        $ce = clean_email(isset($b['contactEmail']) ? $b['contactEmail'] : '');
        if ($ce !== '' && !filter_var($ce, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        $cur = clean_text(isset($b['currency']) ? $b['currency'] : '', 8);
        $ph = false; // the "placeholder" marks no longer exist
        $extra = array('phone' => clean_text(isset($b['phone']) ? $b['phone'] : '', 30), 'whatsapp' => preg_replace('/[^0-9+]/', '', (string) (isset($b['whatsapp']) ? $b['whatsapp'] : '')), 'address' => clean_text(isset($b['address']) ? $b['address'] : '', 200), 'allowRegistration' => !isset($b['allowRegistration']) || !empty($b['allowRegistration']));
        if (isset($b['payments']) && is_array($b['payments'])) {
            $pm = array();
            foreach (array_slice($b['payments'], 0, 12) as $m) {
                if (!is_array($m)) { continue; }
                $type = isset($m['type']) && in_array($m['type'], array('bank', 'wallet', 'instapay', 'fawateerk', 'card', 'cash', 'other', 'stripe', 'paymob'), true) ? $m['type'] : 'other';
                $nameAr = clean_text(isset($m['nameAr']) ? $m['nameAr'] : '', 80);
                $nameEn = clean_text(isset($m['nameEn']) ? $m['nameEn'] : '', 80);
                if ($nameAr === '' && $nameEn === '') { continue; }
                $id = isset($m['id']) && preg_match('/^[a-z0-9]{4,20}$/', (string) $m['id']) ? $m['id'] : new_id();
                $pm[] = array('id' => $id, 'type' => $type, 'nameAr' => $nameAr, 'nameEn' => $nameEn, 'details' => clean_text(isset($m['details']) ? $m['details'] : '', 600), 'qr' => (isset($m['qr']) && preg_match('#^uploads/[A-Za-z0-9._\-]+$#', (string) $m['qr'])) ? $m['qr'] : '', 'active' => !empty($m['active']));
            }
            $extra['payments'] = $pm;
        }
        if (isset($b['taxes']) && is_array($b['taxes'])) {
            $tx = array();
            foreach (array_slice($b['taxes'], 0, 6) as $t) { if (is_array($t) && isset($t['rate']) && (float) $t['rate'] > 0 && (float) $t['rate'] <= 100) { $tx[] = array('name' => clean_text(isset($t['name']) && $t['name'] !== '' ? $t['name'] : 'Tax', 40), 'rate' => round((float) $t['rate'], 2)); } }
            $extra['taxes'] = $tx; $extra['taxRate'] = 0;
        }
        if (isset($b['terms']) && is_array($b['terms'])) {
            $old = terms_cfg($db);
            $nt = array('ar' => clean_text(isset($b['terms']['ar']) ? $b['terms']['ar'] : '', 30000), 'en' => clean_text(isset($b['terms']['en']) ? $b['terms']['en'] : '', 30000), 'required' => !empty($b['terms']['required']));
            $nt['version'] = ($nt['ar'] !== $old['ar'] || $nt['en'] !== $old['en']) ? (string) ((int) $old['version'] + 1) : $old['version']; // a changed text asks everybody to accept again
            $extra['terms'] = $nt;
        }
        if (isset($b['smtpOut']) && is_array($b['smtpOut'])) { $extra['smtpOut'] = array('host' => preg_replace('/[^A-Za-z0-9.\-]/', '', (string) (isset($b['smtpOut']['host']) ? $b['smtpOut']['host'] : '')), 'port' => max(1, min(65535, (int) (isset($b['smtpOut']['port']) ? $b['smtpOut']['port'] : 465))), 'secure' => isset($b['smtpOut']['secure']) && in_array($b['smtpOut']['secure'], array('tls', 'none'), true) ? $b['smtpOut']['secure'] : 'ssl'); }
        if (isset($b['imap']) && is_array($b['imap'])) { $extra['imap'] = array('host' => preg_replace('/[^A-Za-z0-9.\-]/', '', (string) (isset($b['imap']['host']) ? $b['imap']['host'] : '')), 'port' => max(1, min(65535, (int) (isset($b['imap']['port']) ? $b['imap']['port'] : 993))), 'secure' => isset($b['imap']['secure']) && $b['imap']['secure'] === 'none' ? 'none' : 'ssl'); }
        if (isset($b['suspendAfterDays'])) { $extra['suspendAfterDays'] = max(0, min(365, (int) $b['suspendAfterDays'])); }
        if (isset($b['taxInclusive'])) { $extra['taxInclusive'] = !empty($b['taxInclusive']); }
        if (isset($b['invoicePrefix'])) { $extra['invoicePrefix'] = preg_replace('/[^A-Za-z0-9 _\-]/', '', substr((string) $b['invoicePrefix'], 0, 12)); }
        if (isset($b['defaultLang'])) { $extra['defaultLang'] = $b['defaultLang'] === 'en' ? 'en' : 'ar'; }
        if (isset($b['siteUrl'])) {
            $su = rtrim(trim((string) $b['siteUrl']), '/');
            if ($su !== '' && !preg_match('#^https?://[A-Za-z0-9.\-]+(:\d+)?(/[A-Za-z0-9._~\-/]*)?$#', $su)) { fail('invalid site address (like https://example.com)', 422); }
            $extra['siteUrl'] = $su;
        }
        foreach (array('cleanUrls', 'autoActivate', 'autoRenewInvoices', 'providerRegister', 'providerRenew') as $fk) { if (isset($b[$fk])) { $extra[$fk] = !empty($b[$fk]); } }
        if (isset($b['taxRate'])) { $tr = (float) $b['taxRate']; if ($tr < 0 || $tr > 100) { fail('invalid tax rate', 422); } $extra['taxRate'] = $tr; }
        if (isset($b['smtp']) && is_array($b['smtp'])) {
            $old = meta_get($db, 'smtp', array());
            $sm = array('host' => preg_replace('/[^A-Za-z0-9.\-]/', '', (string) (isset($b['smtp']['host']) ? $b['smtp']['host'] : '')), 'port' => (int) (isset($b['smtp']['port']) ? $b['smtp']['port'] : 587), 'secure' => isset($b['smtp']['secure']) && in_array($b['smtp']['secure'], array('tls', 'ssl', 'none'), true) ? $b['smtp']['secure'] : 'tls',
                'user' => clean_text(isset($b['smtp']['user']) ? $b['smtp']['user'] : '', 160), 'from' => clean_email(isset($b['smtp']['from']) ? $b['smtp']['from'] : ''), 'fromName' => clean_text(isset($b['smtp']['fromName']) ? $b['smtp']['fromName'] : '', 80));
            $sm['pass'] = isset($b['smtp']['pass']) && $b['smtp']['pass'] !== '' ? (string) $b['smtp']['pass'] : (isset($old['pass']) ? $old['pass'] : '');
            if ($sm['from'] !== '' && !filter_var($sm['from'], FILTER_VALIDATE_EMAIL)) { fail('invalid sender address', 422); }
            $extra['smtp'] = $sm;
        }
        if (isset($b['gateways']) && is_array($b['gateways'])) {
            $old = meta_get($db, 'gateways', array()); $gw = array();
            $spec = array('stripe' => array('secret', 'webhook'), 'paymob' => array('apiKey', 'hmac', 'integrationId', 'iframeId'));
            foreach ($spec as $id => $keys) {
                $in = isset($b['gateways'][$id]) && is_array($b['gateways'][$id]) ? $b['gateways'][$id] : array();
                $o = isset($old[$id]) && is_array($old[$id]) ? $old[$id] : array();
                $gw[$id] = array('enabled' => !empty($in['enabled']));
                foreach ($keys as $k) { $v = isset($in[$k]) ? trim((string) $in[$k]) : ''; $gw[$id][$k] = $v !== '' ? clean_text($v, 200) : (isset($o[$k]) ? $o[$k] : ''); }
                if (isset($o['base'])) { $gw[$id]['base'] = $o['base']; }
            }
            $extra['gateways'] = $gw;
        }
        if (isset($b['coupons']) && is_array($b['coupons'])) {
            $old = array(); foreach ((array) meta_get($db, 'coupons', array()) as $c) { $old[strtoupper($c['code'])] = $c; }
            $cl = array(); $seen = array();
            foreach (array_slice($b['coupons'], 0, 100) as $c) {
                if (!is_array($c)) { continue; }
                $code = strtoupper(preg_replace('/[^A-Za-z0-9_\-]/', '', (string) (isset($c['code']) ? $c['code'] : '')));
                if ($code === '' || isset($seen[$code])) { continue; }
                $seen[$code] = true;
                $type = isset($c['type']) && $c['type'] === 'fixed' ? 'fixed' : 'percent';
                $val = max(0, (float) (isset($c['value']) ? $c['value'] : 0)); if ($type === 'percent') { $val = min(100, $val); }
                $ex = isset($c['expires']) ? (string) $c['expires'] : ''; if ($ex !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $ex)) { $ex = ''; }
                $cl[] = array('code' => $code, 'type' => $type, 'value' => $val, 'active' => !empty($c['active']), 'expires' => $ex, 'maxUses' => max(0, (int) (isset($c['maxUses']) ? $c['maxUses'] : 0)), 'minTotal' => max(0, (float) (isset($c['minTotal']) ? $c['minTotal'] : 0)), 'used' => isset($old[$code]) ? (int) $old[$code]['used'] : 0);
            }
            $extra['coupons'] = $cl;
        }
        if (isset($b['webmailUrl'])) {
            $wu = trim((string) $b['webmailUrl']);
            if ($wu !== '' && !preg_match('#^https?://[^\s<>"\']+$#i', $wu)) { fail('invalid webmail url', 422); }
            $extra['webmailUrl'] = $wu;
        }
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

    case 'admin/smtp-test':
        $me = need_admin();
        require_post();
        $b = body();
        $to = clean_email(isset($b['to']) && $b['to'] !== '' ? $b['to'] : $me['email']);
        $res = nc_mail(db_read(), $to, 'Test email from your control panel', "If you can read this, your email settings work.\nSent " . gmdate('c'));
        if ($res !== true) { fail($res, 502); }
        out(array('ok' => true, 'to' => $to));

    case 'admin/system-check':
        need_admin();
        require_once __DIR__ . '/providers.php';
        out(nc_system_check(db_read()));

    case 'admin/daily-run':
        need_admin();
        require_post();
        $r2 = nc_daily(true);
        out(array('ok' => true, 'created' => isset($r2['created']) ? $r2['created'] : 0));

    case 'admin/register-domain':
        // Buys the domain at the provider with the provider's own account (spends money). Explicitly enabled in Settings and confirmed by the admin.
        $me = need_admin();
        require_post();
        $b = body();
        $db0 = db_read();
        if (!meta_get($db0, 'providerRegister', false)) { fail('turn on "Register domains at the provider" in Settings → Renewals & providers first', 409); }
        if (empty($b['confirm'])) { fail('confirmation required', 422); }
        $di = find_by(items_of($db0, 'domains'), 'id', isset($b['id']) ? (string) $b['id'] : '');
        if ($di < 0) { fail('domain not found', 404); }
        $d = $db0['items']['domains'][$di];
        $pid = isset($b['provider']) ? (string) $b['provider'] : '';
        if (!in_array($pid, array('hostinger', 'namecheap', 'resellerclub'), true)) { fail('choose a provider', 422); }
        $years = max(1, min(10, (int) (isset($b['years']) ? $b['years'] : (isset($d['regYears']) ? $d['regYears'] : 1))));
        $ui = find_user($db0, 'id', $d['uid']);
        if ($ui < 0) { fail('the domain has no client', 422); }
        $cu = $db0['users'][$ui]; $bz = meta_get($db0, 'business', array());
        $contact = array('name' => $cu['name'], 'email' => $cu['email'], 'phone' => isset($cu['phone']) ? $cu['phone'] : '', 'address' => isset($bz['address']) ? $bz['address'] : '', 'city' => isset($bz['city']) ? $bz['city'] : '', 'state' => isset($bz['governorate']) ? $bz['governorate'] : '', 'zip' => isset($bz['postalCode']) ? $bz['postalCode'] : '', 'country' => 'EG');
        require_once __DIR__ . '/providers.php';
        try { $r2 = prov_run($pid, 'register', $db0, $d['name'], $years, $contact); } catch (Exception $e) { fail($e->getMessage(), 502); }
        $res = db_update(function (&$db) use ($d, $pid, $years, $r2, $me) {
            $i = find_by(items_of($db, 'domains'), 'id', $d['id']);
            if ($i < 0) { return null; }
            $db['items']['domains'][$i]['provider'] = $pid; $db['items']['domains'][$i]['ref'] = $r2['ref']; $db['items']['domains'][$i]['status'] = 'active'; $db['items']['domains'][$i]['expires'] = add_period('', $years, 'years');
            log_act($db, $me, 'domain-register', $d['name'] . ' at ' . $pid);
            return $db['items']['domains'][$i];
        });
        out(array('ok' => true, 'domain' => $res, 'charged' => $r2['charged']));

    case 'admin/invoice-status':
        // Marks an invoice paid (records the rest of the balance as a payment) / unpaid / cancelled / draft / collections.
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $st = isset($b['status']) ? (string) $b['status'] : '';
        if (!in_array($st, array('due', 'paid', 'void', 'draft', 'collections'), true)) { fail('invalid status', 422); }
        $res = db_update(function (&$db) use ($id, $st, $me) {
            $i = find_by(items_of($db, 'invoices'), 'id', $id);
            if ($i < 0) { return array('err' => 'invoice not found'); }
            $inv = $db['items']['invoices'][$i];
            if ($st === 'paid') {
                if ($inv['status'] === 'draft') { $db['items']['invoices'][$i]['status'] = 'due'; }
                inv_settle($db, $i, isset($inv['payMethod']) && $inv['payMethod'] !== '' ? $inv['payMethod'] : 'Manual', '', $me);
            } else {
                $db['items']['invoices'][$i]['status'] = $st;
                if ($st === 'due') { inv_refresh($db, $i, $me, false); }
                $oi = !empty($inv['orderId']) ? find_by(items_of($db, 'orders'), 'id', $inv['orderId']) : -1;
                if ($oi >= 0 && $st === 'void' && $db['items']['orders'][$oi]['status'] !== 'active') { order_set_status($db, $inv['orderId'], 'cancelled', $me, false); }
                log_act($db, $me, 'invoice-' . $st, $inv['number']);
            }
            return array('invoice' => inv_public($db, $db['items']['invoices'][$i]));
        });
        if (isset($res['err'])) { fail($res['err'], 404); }
        out($res);

    case 'admin/invoice-save':
        // Create or edit an itemised invoice.
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $items = array();
        foreach ((isset($b['items']) && is_array($b['items']) ? array_slice($b['items'], 0, 60) : array()) as $it) {
            if (!is_array($it)) { continue; }
            $d = clean_text(isset($it['desc']) ? $it['desc'] : '', 200);
            $am = isset($it['amount']) && is_numeric($it['amount']) ? round((float) $it['amount'], 2) : 0;
            if ($d === '' && $am == 0) { continue; }
            $items[] = array('desc' => $d, 'amount' => $am, 'taxed' => !empty($it['taxed']));
        }
        if (!$items) { fail('add at least one item', 422); }
        $date = isset($b['date']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $b['date']) ? $b['date'] : gmdate('Y-m-d');
        $due = isset($b['dueDate']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $b['dueDate']) ? $b['dueDate'] : '';
        $status = isset($b['status']) && in_array($b['status'], array('draft', 'due', 'void', 'collections'), true) ? $b['status'] : 'due';
        $notes = clean_text(isset($b['notes']) ? $b['notes'] : '', 1000);
        $pm = clean_text(isset($b['payMethod']) ? $b['payMethod'] : '', 40);
        $uid = isset($b['uid']) ? (string) $b['uid'] : '';
        $disc = isset($b['discount']) ? max(0, (float) $b['discount']) : 0;
        $addFunds = !empty($b['addFunds']);
        $res = db_update(function (&$db) use ($id, $items, $date, $due, $status, $notes, $pm, $uid, $disc, $addFunds, $me) {
            $uix = find_user($db, 'id', $id === '' ? $uid : (isset($db['items']['invoices'][find_by(items_of($db, 'invoices'), 'id', $id)]['uid']) ? $db['items']['invoices'][find_by(items_of($db, 'invoices'), 'id', $id)]['uid'] : ''));
            $calc = inv_calc($db, $items, $disc, $uix >= 0 && !empty($db['users'][$uix]['taxExempt']));
            $title = nc_substr($items[0]['desc'] . (count($items) > 1 ? ' +' . (count($items) - 1) : ''), 160);
            if ($id === '') {
                if (find_user($db, 'id', $uid) < 0) { return array('err' => 'choose a client'); }
                $inv = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'number' => inv_next_number($db), 'payments' => array());
                $db['items']['invoices'][] = $inv; $i = count($db['items']['invoices']) - 1;
            } else {
                $i = find_by(items_of($db, 'invoices'), 'id', $id);
                if ($i < 0) { return array('err' => 'invoice not found'); }
            }
            $keep = $db['items']['invoices'][$i];
            $db['items']['invoices'][$i] = array_merge($keep, array('item' => $title, 'items' => $items, 'discount' => $calc['discount'], 'taxLines' => $calc['taxes'], 'inclusive' => $calc['inclusive'], 'amount' => $calc['total'], 'date' => $date, 'dueDate' => $due, 'notes' => $notes, 'payMethod' => $pm, 'addFunds' => $addFunds, 'status' => $status));
            if ($status === 'due') { inv_refresh($db, $i, $me, true); }
            log_act($db, $me, $id === '' ? 'invoice-create' : 'invoice-update', $db['items']['invoices'][$i]['number']);
            return array('invoice' => inv_public($db, $db['items']['invoices'][$i]));
        });
        if (isset($res['err'])) { fail($res['err'], 422); }
        out($res, $id === '' ? 201 : 200);

    case 'admin/invoice-payment':
    case 'admin/invoice-credit':
    case 'admin/invoice-refund':
        // Ledger entries: a payment (any method, with reference and fee), client credit applied, or a refund (optionally back to credit).
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $amount = isset($b['amount']) && is_numeric($b['amount']) ? round((float) $b['amount'], 2) : 0;
        if ($amount <= 0) { fail('enter an amount', 422); }
        $kind = substr($r, strlen('admin/invoice-'));
        $method = isset($b['method']) ? (string) $b['method'] : ''; $ref = isset($b['ref']) ? (string) $b['ref'] : ''; $fee = isset($b['fee']) ? (float) $b['fee'] : 0;
        $note = isset($b['note']) ? (string) $b['note'] : ''; $date = isset($b['date']) ? (string) $b['date'] : ''; $toCredit = !empty($b['toCredit']);
        $res = db_update(function (&$db) use ($id, $amount, $kind, $method, $ref, $fee, $note, $date, $toCredit, $me) {
            $i = find_by(items_of($db, 'invoices'), 'id', $id);
            if ($i < 0) { return array('err' => 'invoice not found'); }
            $inv = $db['items']['invoices'][$i];
            if (in_array($inv['status'], array('draft', 'void'), true)) { return array('err' => 'this invoice is ' . $inv['status'] . ': make it unpaid first'); }
            $ui = find_user($db, 'id', $inv['uid']);
            if ($kind === 'payment') {
                inv_entry($db, $i, 'payment', $amount, $method !== '' ? $method : 'Manual', $ref, $fee, $note, $date);
            } elseif ($kind === 'credit') {
                if ($ui < 0) { return array('err' => 'client not found'); }
                $have = (float) (isset($db['users'][$ui]['credit']) ? $db['users'][$ui]['credit'] : 0);
                $use = min($amount, $have, inv_balance($inv));
                if ($use <= 0) { return array('err' => 'no credit available or nothing owed'); }
                credit_add($db, $ui, -$use, 'Applied to ' . $inv['number'], $me);
                inv_entry($db, $i, 'credit', $use, 'Credit', '', 0, $note, $date);
            } else {
                $paid = inv_paid($inv);
                if ($amount > $paid + 0.004) { return array('err' => 'the refund is more than what was paid (' . $paid . ')'); }
                inv_entry($db, $i, 'refund', $amount, $toCredit ? 'Credit' : ($method !== '' ? $method : 'Manual'), $ref, 0, $note, $date);
                if ($toCredit && $ui >= 0) { credit_add($db, $ui, $amount, 'Refund of ' . $inv['number'], $me); }
            }
            inv_refresh($db, $i, $me, true);
            return array('invoice' => inv_public($db, $db['items']['invoices'][$i]));
        });
        if (isset($res['err'])) { fail($res['err'], 422); }
        out($res);

    case 'admin/invoice-email':
        $me = need_admin();
        require_post();
        $b = body();
        $db0 = db_read();
        $i = find_by(items_of($db0, 'invoices'), 'id', isset($b['id']) ? (string) $b['id'] : '');
        if ($i < 0) { fail('invoice not found', 404); }
        $inv = $db0['items']['invoices'][$i];
        $ui = find_user($db0, 'id', $inv['uid']);
        if ($ui < 0) { fail('the invoice has no client', 422); }
        $tpl = isset($b['template']) ? (string) $b['template'] : 'created';
        list($sub, $txt) = inv_template($db0, $inv, $db0['users'][$ui], $tpl);
        $r2 = nc_mail($db0, $db0['users'][$ui]['email'], $sub, $txt);
        if ($r2 !== true) { fail($r2, 502); }
        db_update(function (&$db) use ($inv, $me, $tpl) { $k = find_by(items_of($db, 'invoices'), 'id', $inv['id']); if ($k >= 0) { $db['items']['invoices'][$k]['sentAt'] = gmdate('c'); $db['items']['invoices'][$k]['sentVia'] = 'email'; $db['items']['invoices'][$k]['sentCount'] = (int) (isset($db['items']['invoices'][$k]['sentCount']) ? $db['items']['invoices'][$k]['sentCount'] : 0) + 1; log_act($db, $me, 'invoice-email', $inv['number'] . ' (' . $tpl . ')'); } });
        out(array('ok' => true));

    case 'admin/credit':
        $me = need_admin();
        require_post();
        $b = body();
        $amount = isset($b['amount']) && is_numeric($b['amount']) ? round((float) $b['amount'], 2) : 0;
        if ($amount == 0) { fail('enter an amount (negative removes credit)', 422); }
        $res = db_update(function (&$db) use ($b, $amount, $me) {
            $ui = find_user($db, 'id', isset($b['uid']) ? (string) $b['uid'] : '');
            if ($ui < 0) { return array('err' => 'client not found'); }
            if ($amount < 0 && (float) (isset($db['users'][$ui]['credit']) ? $db['users'][$ui]['credit'] : 0) + $amount < 0) { return array('err' => 'not enough credit'); }
            credit_add($db, $ui, $amount, isset($b['note']) ? (string) $b['note'] : 'Manual', $me);
            log_act($db, $me, 'credit', $db['users'][$ui]['email'] . ' ' . $amount);
            return array('credit' => $db['users'][$ui]['credit']);
        });
        if (isset($res['err'])) { fail($res['err'], 422); }
        out($res);

    case 'admin/transactions':
        need_admin();
        $db = db_read();
        $o = array();
        foreach (items_of($db, 'invoices') as $inv) { foreach ((array) (isset($inv['payments']) ? $inv['payments'] : array()) as $e) { $o[] = array_merge($e, array('invoiceId' => $inv['id'], 'number' => $inv['number'], 'uid' => $inv['uid'])); } }
        usort($o, function ($a, $b) { return strcmp($b['at'], $a['at']); });
        out(array('transactions' => array_slice($o, 0, 2000)));

    case 'admin/invoice-send':
        // Emails the client a link to the invoice and records it. (WhatsApp is opened from the admin page and recorded with via=whatsapp.)
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $via = isset($b['via']) && $b['via'] === 'whatsapp' ? 'whatsapp' : 'email';
        $db0 = db_read();
        $i = find_by(items_of($db0, 'invoices'), 'id', $id);
        if ($i < 0) { fail('invoice not found', 404); }
        $inv = $db0['items']['invoices'][$i];
        $ui = find_user($db0, 'id', $inv['uid']);
        if ($ui < 0) { fail('the invoice has no client', 422); }
        if ($via === 'email') {
            $link = site_link($db0, '/portal/invoices/' . $inv['id']);
            if ($link === '') { fail('set the site address in Settings → Store & tax first', 409); }
            $cur = meta_get($db0, 'currency', '') ?: 'EGP';
            $r = nc_mail($db0, $db0['users'][$ui]['email'], 'Invoice ' . $inv['number'] . ' — ' . $inv['amount'] . ' ' . $cur, "Hello " . $db0['users'][$ui]['name'] . ",\n\nInvoice " . $inv['number'] . ' for ' . $inv['amount'] . ' ' . $cur . ' (' . $inv['item'] . ").\nView it and pay here: " . $link . "\n\nThank you.");
            if ($r !== true) { fail($r, 502); }
        }
        db_update(function (&$db) use ($id, $via, $me) {
            $i = find_by(items_of($db, 'invoices'), 'id', $id);
            if ($i < 0) { return; }
            $db['items']['invoices'][$i]['sentAt'] = gmdate('c'); $db['items']['invoices'][$i]['sentVia'] = $via;
            $db['items']['invoices'][$i]['sentCount'] = (int) (isset($db['items']['invoices'][$i]['sentCount']) ? $db['items']['invoices'][$i]['sentCount'] : 0) + 1;
            log_act($db, $me, 'invoice-sent', $db['items']['invoices'][$i]['number'] . ' via ' . $via);
        });
        out(array('ok' => true));

    case 'invoices/view':
        // The client opened the invoice: lets the admin see it was read.
        $u = need_user();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        db_update(function (&$db) use ($id, $u) {
            $i = find_by(items_of($db, 'invoices'), 'id', $id);
            if ($i < 0 || $db['items']['invoices'][$i]['uid'] !== $u['id'] || !empty($db['items']['invoices'][$i]['viewedAt'])) { return; }
            $db['items']['invoices'][$i]['viewedAt'] = gmdate('c');
        });
        out(array('ok' => true));

    case 'admin/bulk':
        // Bulk actions on a client's services: set status / payment method / "do not suspend until", put them on an invoice, delete.
        $me = need_admin();
        require_post();
        $b = body();
        $res = isset($b['res']) ? (string) $b['res'] : '';
        if (!in_array($res, array('domains', 'hosting', 'websites', 'servers', 'mailboxes'), true)) { fail('unknown resource', 422); }
        $ids = isset($b['ids']) && is_array($b['ids']) ? array_slice(array_map('strval', $b['ids']), 0, 200) : array();
        $act = isset($b['action']) ? (string) $b['action'] : '';
        $val = isset($b['value']) ? (string) $b['value'] : '';
        if (!$ids) { fail('select at least one item', 422); }
        $out = db_update(function (&$db) use ($res, $ids, $act, $val, $me) {
            $n = 0; $invItems = array(); $uid = '';
            foreach ($ids as $id) {
                $i = find_by(items_of($db, $res), 'id', $id);
                if ($i < 0) { continue; }
                $it = $db['items'][$res][$i];
                if ($act === 'status') { if (!in_array($val, array('active', 'pending', 'stopped', 'archived', 'expiring'), true)) { return array('err' => 'invalid status'); } $db['items'][$res][$i]['status'] = $val; }
                elseif ($act === 'payMethod') { $db['items'][$res][$i]['payMethod'] = clean_text($val, 40); }
                elseif ($act === 'noSuspendUntil') { if ($val !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $val)) { return array('err' => 'invalid date'); } $db['items'][$res][$i]['noSuspendUntil'] = $val; }
                elseif ($act === 'delete') { unset($db['items'][$res][$i]); $db['items'][$res] = array_values($db['items'][$res]); }
                elseif ($act === 'invoice') {
                    if ($uid !== '' && $uid !== $it['uid']) { return array('err' => 'pick services of one client only'); }
                    $uid = $it['uid']; $price = (float) (isset($it['price']) ? $it['price'] : 0);
                    $label = $res === 'domains' ? 'Domain ' . $it['name'] : ($res === 'hosting' ? 'Hosting ' . $it['plan'] . ($it['domain'] !== '' ? ' (' . $it['domain'] . ')' : '') : ($res === 'websites' ? 'Website ' . $it['name'] : ($res === 'servers' ? 'Server ' . $it['name'] : 'Mailbox ' . $it['address'])));
                    $nd = !empty($it['nextDue']) ? $it['nextDue'] : (!empty($it['expires']) ? $it['expires'] : '');
                    $invItems[] = array('desc' => $label . ($nd !== '' ? ' — due ' . $nd : ''), 'amount' => $price, 'taxed' => true);
                }
                $n++;
            }
            if ($act === 'invoice') {
                if (!$invItems) { return array('err' => 'nothing to invoice'); }
                $ui = find_user($db, 'id', $uid);
                $calc = inv_calc($db, $invItems, 0, $ui >= 0 && !empty($db['users'][$ui]['taxExempt']));
                $inv = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'number' => inv_next_number($db), 'item' => nc_substr($invItems[0]['desc'] . (count($invItems) > 1 ? ' +' . (count($invItems) - 1) : ''), 160), 'items' => $invItems, 'discount' => 0, 'taxLines' => $calc['taxes'], 'inclusive' => $calc['inclusive'], 'amount' => $calc['total'], 'date' => gmdate('Y-m-d'), 'dueDate' => gmdate('Y-m-d', time() + 7 * 86400), 'status' => 'due', 'payments' => array());
                $db['items']['invoices'][] = $inv;
                log_act($db, $me, 'invoice-create', $inv['number'] . ' (bulk)');
                return array('count' => $n, 'invoice' => $inv['id']);
            }
            log_act($db, $me, 'bulk-' . $act, $res . ' ×' . $n);
            return array('count' => $n);
        });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out);

    case 'admin/billable-invoice':
        // Puts the selected pending billable items of one client on a new invoice.
        $me = need_admin();
        require_post();
        $b = body();
        $uid = isset($b['uid']) ? (string) $b['uid'] : '';
        $ids = isset($b['ids']) && is_array($b['ids']) ? array_map('strval', $b['ids']) : array();
        $out = db_update(function (&$db) use ($uid, $ids, $me) {
            $ui = find_user($db, 'id', $uid);
            if ($ui < 0) { return array('err' => 'client not found'); }
            $items = array(); $mark = array();
            foreach (items_of($db, 'billable') as $k => $bi) { if ($bi['uid'] === $uid && $bi['status'] === 'pending' && in_array($bi['id'], $ids, true)) { $items[] = array('desc' => $bi['desc'], 'amount' => (float) $bi['amount'], 'taxed' => !empty($bi['taxed'])); $mark[] = $k; } }
            if (!$items) { return array('err' => 'select pending items'); }
            $calc = inv_calc($db, $items, 0, !empty($db['users'][$ui]['taxExempt']));
            $inv = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'number' => inv_next_number($db), 'item' => nc_substr($items[0]['desc'] . (count($items) > 1 ? ' +' . (count($items) - 1) : ''), 160), 'items' => $items, 'discount' => 0, 'taxLines' => $calc['taxes'], 'inclusive' => $calc['inclusive'], 'amount' => $calc['total'], 'date' => gmdate('Y-m-d'), 'dueDate' => gmdate('Y-m-d', time() + 7 * 86400), 'status' => 'due', 'payments' => array());
            $db['items']['invoices'][] = $inv;
            foreach ($mark as $k) { $db['items']['billable'][$k]['status'] = 'invoiced'; $db['items']['billable'][$k]['invoiceId'] = $inv['id']; }
            log_act($db, $me, 'invoice-create', $inv['number'] . ' (billable items)');
            return array('invoice' => $inv['id']);
        });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out);

    case 'admin/quote-save':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $items = array();
        foreach ((isset($b['items']) && is_array($b['items']) ? array_slice($b['items'], 0, 60) : array()) as $it) { if (is_array($it)) { $d = clean_text(isset($it['desc']) ? $it['desc'] : '', 200); $am = isset($it['amount']) && is_numeric($it['amount']) ? round((float) $it['amount'], 2) : 0; $qty = isset($it['qty']) && is_numeric($it['qty']) && (float) $it['qty'] > 0 ? round((float) $it['qty'], 2) : 1; $pr = isset($it['price']) && is_numeric($it['price']) && (float) $it['price'] != 0 ? round((float) $it['price'], 2) : null; if ($pr !== null) { $am = round($qty * $pr, 2); } if ($d !== '' || $am != 0) { $row = array('desc' => $d, 'amount' => $am, 'taxed' => !empty($it['taxed'])); if ($pr !== null) { $row['qty'] = $qty; $row['price'] = $pr; } $dt = clean_text(isset($it['details']) ? $it['details'] : '', 400); if ($dt !== '') { $row['details'] = $dt; } $items[] = $row; } } }
        if (!$items) { fail('add at least one item', 422); }
        $subject = clean_text(isset($b['subject']) ? $b['subject'] : '', 160);
        if ($subject === '') { fail('subject is required', 422); }
        $valid = isset($b['validUntil']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $b['validUntil']) ? $b['validUntil'] : '';
        $status = isset($b['status']) && in_array($b['status'], array('draft', 'delivered', 'accepted', 'declined', 'expired'), true) ? $b['status'] : 'draft';
        $notes = clean_text(isset($b['notes']) ? $b['notes'] : '', 1000); $terms = nc_substr(trim(strip_tags(isset($b['terms']) ? (string) $b['terms'] : '')), 3000); $uid = isset($b['uid']) ? (string) $b['uid'] : ''; $disc = isset($b['discount']) ? max(0, (float) $b['discount']) : 0;
        $out = db_update(function (&$db) use ($id, $items, $subject, $valid, $status, $notes, $terms, $uid, $disc, $me) {
            if ($id === '') {
                if (find_user($db, 'id', $uid) < 0) { return array('err' => 'choose a client'); }
                $seq = (int) meta_get($db, 'quoteSeq', 0) + 1; $db['meta']['quoteSeq'] = $seq;
                $db['items']['quotes'][] = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'number' => 'QUO-' . $seq);
                $i = count($db['items']['quotes']) - 1;
            } else { $i = find_by(items_of($db, 'quotes'), 'id', $id); if ($i < 0) { return array('err' => 'quote not found'); } }
            $ui = find_user($db, 'id', $db['items']['quotes'][$i]['uid']);
            $calc = inv_calc($db, $items, $disc, $ui >= 0 && !empty($db['users'][$ui]['taxExempt']));
            $db['items']['quotes'][$i] = array_merge($db['items']['quotes'][$i], array('subject' => $subject, 'items' => $items, 'discount' => $calc['discount'], 'taxLines' => $calc['taxes'], 'inclusive' => $calc['inclusive'], 'total' => $calc['total'], 'validUntil' => $valid, 'status' => $status, 'notes' => $notes, 'terms' => $terms));
            if (empty($db['items']['quotes'][$i]['token'])) { $db['items']['quotes'][$i]['token'] = bin2hex(function_exists('random_bytes') ? random_bytes(12) : md5(uniqid('', true), true)); }
            log_act($db, $me, $id === '' ? 'quote-create' : 'quote-update', $db['items']['quotes'][$i]['number']);
            return array('quote' => $db['items']['quotes'][$i]);
        });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out, $id === '' ? 201 : 200);

    case 'admin/quote-to-order':
        $me = need_admin();
        require_post();
        $b = body(); $qid = isset($b['id']) ? (string) $b['id'] : '';
        $out = db_update(function (&$db) use ($qid, $me) { $k = find_by(items_of($db, 'quotes'), 'id', $qid); if ($k < 0) { return array('err' => 'quote not found'); } if ($db['items']['quotes'][$k]['status'] === 'declined') { return array('err' => 'the client declined this quote'); } return quote_make_order($db, $k, $me); });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out);

    case 'admin/quote-token':
        // The private link of a quote (older quotes get theirs the first time it is asked for).
        need_admin();
        require_post();
        $b = body(); $qid = isset($b['id']) ? (string) $b['id'] : '';
        $tok = db_update(function (&$db) use ($qid) { $k = find_by(items_of($db, 'quotes'), 'id', $qid); if ($k < 0) { return ''; } if (empty($db['items']['quotes'][$k]['token'])) { $db['items']['quotes'][$k]['token'] = bin2hex(function_exists('random_bytes') ? random_bytes(12) : md5(uniqid('', true), true)); } return $db['items']['quotes'][$k]['token']; });
        if ($tok === '') { fail('quote not found', 404); }
        out(array('token' => $tok));

    case 'admin/quote-send':
        $me = need_admin();
        require_post();
        $b = body();
        $db0 = db_read();
        $qi = find_by(items_of($db0, 'quotes'), 'id', isset($b['id']) ? (string) $b['id'] : '');
        if ($qi < 0) { fail('quote not found', 404); }
        $q = $db0['items']['quotes'][$qi]; $ui = find_user($db0, 'id', $q['uid']);
        if ($ui < 0) { fail('the quote has no client', 422); }
        if (empty($q['token'])) { $q['token'] = db_update(function (&$db) use ($q) { $k = find_by(items_of($db, 'quotes'), 'id', $q['id']); if ($k < 0) { return ''; } if (empty($db['items']['quotes'][$k]['token'])) { $db['items']['quotes'][$k]['token'] = bin2hex(function_exists('random_bytes') ? random_bytes(12) : md5(uniqid('', true), true)); } return $db['items']['quotes'][$k]['token']; }); }
        $link = site_link($db0, !empty($q['token']) ? '/quote/' . $q['token'] : '/portal/quotes');
        $cur = meta_get($db0, 'currency', '') ?: 'EGP';
        $r2 = nc_mail($db0, $db0['users'][$ui]['email'], 'Quote ' . $q['number'] . ': ' . $q['subject'], "Hello " . $db0['users'][$ui]['name'] . ",\n\nWe prepared a quote for you: " . $q['subject'] . ' — ' . $q['total'] . ' ' . $cur . (!empty($q['validUntil']) ? ' (valid until ' . $q['validUntil'] . ')' : '') . ".\n" . ($link !== '' ? 'Review and accept it here: ' . $link : 'Open your client area → Quotes to review and accept it.') . "\n\nThank you.");
        if ($r2 !== true) { fail($r2, 502); }
        db_update(function (&$db) use ($q, $me) { $k = find_by(items_of($db, 'quotes'), 'id', $q['id']); if ($k >= 0) { if ($db['items']['quotes'][$k]['status'] === 'draft') { $db['items']['quotes'][$k]['status'] = 'delivered'; } $db['items']['quotes'][$k]['sentAt'] = gmdate('c'); log_act($db, $me, 'quote-sent', $q['number']); } });
        out(array('ok' => true));

    case 'quotes/respond':
        // The client accepts (→ an unpaid invoice is created from the quote) or declines it.
        $u = need_user();
        require_post();
        $b = body();
        $accept = !empty($b['accept']); $qid = isset($b['id']) ? (string) $b['id'] : '';
        $out = db_update(function (&$db) use ($u, $qid, $accept) {
            $k = find_by(items_of($db, 'quotes'), 'id', $qid);
            if ($k < 0 || $db['items']['quotes'][$k]['uid'] !== $u['id'] || $db['items']['quotes'][$k]['status'] !== 'delivered') { return array('err' => 'quote not found or already answered'); }
            $q = $db['items']['quotes'][$k];
            if (!empty($q['validUntil']) && $q['validUntil'] < gmdate('Y-m-d')) { $db['items']['quotes'][$k]['status'] = 'expired'; return array('err' => 'this quote has expired'); }
            if (!$accept) { $db['items']['quotes'][$k]['status'] = 'declined'; log_act($db, $u, 'quote-declined', $q['number']); return array('ok' => true); }
            $res = quote_make_order($db, $k, $u);
            if (isset($res['err'])) { return $res; }
            log_act($db, $u, 'quote-accepted', $q['number']);
            return $res;
        });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out);

    case 'admin/client-email':
        $me = need_admin();
        require_post();
        $b = body();
        $db0 = db_read();
        $ui = find_user($db0, 'id', isset($b['uid']) ? (string) $b['uid'] : '');
        if ($ui < 0) { fail('client not found', 404); }
        $sub = clean_text(isset($b['subject']) ? $b['subject'] : '', 160); $msg = clean_text(isset($b['message']) ? $b['message'] : '', 5000);
        if ($sub === '' || $msg === '') { fail('write a subject and a message', 422); }
        $r2 = nc_mail($db0, $db0['users'][$ui]['email'], $sub, $msg, meta_get($db0, 'contactEmail', ''));
        if ($r2 !== true) { fail($r2, 502); }
        db_update(function (&$db) use ($me, $ui) { log_act($db, $me, 'client-email', $db['users'][$ui]['email']); });
        out(array('ok' => true));

    case 'admin/mail-log':
        need_admin();
        $db = db_read();
        $to = isset($_GET['to']) ? clean_email($_GET['to']) : '';
        $l = array_values(array_filter((array) meta_get($db, 'mailLog', array()), function ($e) use ($to) { return $to === '' || $e['to'] === $to; }));
        out(array('log' => array_slice($l, 0, 200)));

    case 'admin/client-export':
        $me = need_admin();
        $db = db_read();
        $ui = find_user($db, 'id', isset($_GET['uid']) ? (string) $_GET['uid'] : '');
        if ($ui < 0) { fail('client not found', 404); }
        $u = $db['users'][$ui]; unset($u['hash'], $u['resetHash'], $u['resetExp']);
        $x = array('exported' => gmdate('c'), 'client' => $u);
        foreach (array_keys($SCHEMA) as $res) { if (!res_unowned($res)) { $x[$res] = array_values(array_filter(items_of($db, $res), function ($it) use ($u) { return $it['uid'] === $u['id']; })); } }
        $x['tickets'] = array_values(array_filter($db['tickets'], function ($t) use ($u) { return $t['uid'] === $u['id']; }));
        header('Content-Disposition: attachment; filename="client-' . preg_replace('/[^a-z0-9]/i', '', $u['id']) . '.json"');
        log_act($db, $me, 'client-export', $u['email']);
        echo json_encode($x, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT); exit;

    case 'admin/impersonate':
        // "Login as owner": the admin sees the client area exactly as the client does, with a way back.
        $me = need_admin();
        require_post();
        $b = body();
        $db = db_read();
        $ui = find_user($db, 'id', isset($b['uid']) ? (string) $b['uid'] : '');
        if ($ui < 0 || $db['users'][$ui]['role'] === 'admin') { fail('client not found', 404); }
        $_SESSION['admin_uid'] = $me['id'];
        session_regenerate_id(true);
        $_SESSION['uid'] = $db['users'][$ui]['id'];
        db_update(function (&$d) use ($me, $db, $ui) { log_act($d, $me, 'impersonate', $db['users'][$ui]['email']); });
        out(array('user' => public_user($db['users'][$ui])));

    case 'auth/stop-impersonate':
        require_post();
        if (empty($_SESSION['admin_uid'])) { fail('not impersonating', 400); }
        $adminId = $_SESSION['admin_uid'];
        unset($_SESSION['admin_uid']);
        session_regenerate_id(true);
        $_SESSION['uid'] = $adminId;
        $db = db_read(); $ai = find_user($db, 'id', $adminId);
        out(array('user' => $ai >= 0 ? public_user($db['users'][$ai]) : null));

    case 'admin/bulk-add':
        // For services a provider has no API for (e.g. Namecheap VPS / hosting): paste one per line — "name or plan, domain, expiry date, your cost".
        $me = need_admin();
        require_post();
        $b = body();
        $kind = isset($b['kind']) && $b['kind'] === 'servers' ? 'servers' : 'hosting';
        $pid = isset($b['provider']) && in_array($b['provider'], array('hostinger', 'namecheap', 'resellerclub', ''), true) ? $b['provider'] : '';
        $uid = isset($b['uid']) ? (string) $b['uid'] : '';
        $mode = isset($b['mode']) && $b['mode'] === 'shared' ? 'shared' : 'dedicated';
        $lines = preg_split('/\r?\n/', (string) (isset($b['lines']) ? $b['lines'] : ''));
        $out = db_update(function (&$db) use ($kind, $pid, $uid, $mode, $lines, $me) {
            if (find_user($db, 'id', $uid) < 0) { return array('err' => 'choose a client'); }
            $n = 0;
            foreach (array_slice($lines, 0, 200) as $ln) {
                $c = array_map('trim', str_getcsv($ln));
                if (!$c || $c[0] === '') { continue; }
                $exp = isset($c[2]) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $c[2]) ? $c[2] : '';
                $cost = isset($c[3]) && is_numeric($c[3]) ? (float) $c[3] : 0;
                if ($kind === 'servers') { $it = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'name' => clean_text($c[0], 60), 'ip' => clean_text(isset($c[1]) ? $c[1] : '', 64), 'spec' => '', 'cpu' => 0, 'ram' => 0, 'status' => 'active', 'snapshots' => 0, 'provider' => $pid, 'ref' => '', 'cost' => $cost, 'billing' => 'monthly', 'expires' => $exp, 'price' => 0); }
                else { $it = array('id' => new_id(), 'uid' => $uid, 'created' => gmdate('c'), 'plan' => clean_text($c[0], 60), 'domain' => clean_text(isset($c[1]) ? $c[1] : '', 253), 'diskGb' => 0, 'usedGb' => 0, 'status' => 'active', 'provider' => $pid, 'ref' => '', 'cost' => $cost, 'billing' => 'yearly', 'expires' => $exp, 'price' => 0, 'mode' => $mode); }
                $db['items'][$kind][] = $it; $n++;
            }
            log_act($db, $me, 'bulk-add', $kind . ' x' . $n);
            return array('added' => $n);
        });
        if (isset($out['err'])) { fail($out['err'], 422); }
        out($out);

    case 'public/quote':
        // A quote opened from its private link: read-only, no sign-in (accepting still needs the client's account).
        $db = db_read();
        $tk = isset($_GET['t']) ? (string) $_GET['t'] : '';
        $found = -1;
        if (preg_match('/^[a-f0-9]{24}$/', $tk)) { foreach (items_of($db, 'quotes') as $i => $q) { if (isset($q['token']) && hash_equals($q['token'], $tk) && $q['status'] !== 'draft') { $found = $i; } } }
        if ($found < 0) { fail('quote not found', 404); }
        $q = $db['items']['quotes'][$found]; $ui = find_user($db, 'id', $q['uid']);
        if (!empty($q['validUntil']) && $q['validUntil'] < gmdate('Y-m-d') && $q['status'] === 'delivered') { $q['status'] = 'expired'; }
        if (empty($q['viewedAt'])) { db_update(function (&$d2) use ($tk) { foreach (items_of($d2, 'quotes') as $k => $x) { if (isset($x['token']) && $x['token'] === $tk && empty($x['viewedAt'])) { $d2['items']['quotes'][$k]['viewedAt'] = gmdate('c'); } } }); }
        unset($q['uid'], $q['token'], $q['invoiceId']);
        $cu = $ui >= 0 ? $db['users'][$ui] : array();
        out(array('quote' => $q, 'business' => meta_get($db, 'business', new stdClass()), 'customer' => array('name' => isset($cu['name']) ? $cu['name'] : '', 'company' => isset($cu['company']) ? $cu['company'] : '', 'email' => isset($cu['email']) ? $cu['email'] : ''), 'currency' => meta_get($db, 'currency', '') ?: 'EGP'));

    case 'public/terms':
        $db = db_read();
        out(terms_cfg($db));

    case 'me/profile':
        // The client edits their own details (not email / role).
        $u = need_user();
        require_post();
        $b = body();
        $name = isset($b['name']) ? clean_name($b['name']) : '';
        $company = clean_text(isset($b['company']) ? $b['company'] : '', 80);
        $kyc = kyc_clean($b);
        if ($name === '') { fail('name is required', 422); }
        if ($kyc['type'] === 'company' && $company === '') { fail('enter the company name', 422); }
        $addr = array(); foreach (array('address1', 'address2', 'city', 'state', 'zip', 'country') as $k) { $addr[$k] = clean_text(isset($b['addr'][$k]) ? $b['addr'][$k] : '', 160); }
        $res = db_update(function (&$db) use ($u, $b, $name, $company, $kyc, $addr) {
            $i = find_user($db, 'id', $u['id']);
            if ($i < 0) { return false; }
            $db['users'][$i]['name'] = $name; $db['users'][$i]['company'] = $company; $db['users'][$i]['phone'] = clean_text(isset($b['phone']) ? $b['phone'] : '', 30);
            $old = isset($db['users'][$i]['kyc']) && is_array($db['users'][$i]['kyc']) ? $db['users'][$i]['kyc'] : array();
            $db['users'][$i]['kyc'] = array_merge($old, $kyc); $db['users'][$i]['addr'] = array_merge(isset($db['users'][$i]['addr']) && is_array($db['users'][$i]['addr']) ? $db['users'][$i]['addr'] : array(), $addr);
            if (!empty($b['acceptTerms']) && !terms_ok($db, $db['users'][$i])) { $db['users'][$i]['terms'] = terms_stamp($db, 'client'); }
            log_act($db, $u, 'profile-update', $db['users'][$i]['email']);
            return public_user($db['users'][$i]);
        });
        if (!$res) { fail('not found', 404); }
        out(array('user' => $res));

    case 'me/accept-terms':
        $u = need_user();
        require_post();
        db_update(function (&$db) use ($u) { $i = find_user($db, 'id', $u['id']); if ($i >= 0) { $db['users'][$i]['terms'] = terms_stamp($db, 'client'); log_act($db, $u, 'terms-accepted', $db['users'][$i]['email']); } });
        $db = db_read(); $i = find_user($db, 'id', $u['id']);
        out(array('user' => public_user($db['users'][$i])));

    case 'kyc/upload':
        $u = need_user();
        require_post();
        $side = isset($_POST['side']) ? (string) $_POST['side'] : '';
        $old = isset($u['kyc']['files'][$side]) ? $u['kyc']['files'][$side] : '';
        list($ok2, $name) = kyc_store($u['id'], $side, $old);
        if (!$ok2) { fail($name, 422); }
        db_update(function (&$db) use ($u, $side, $name) { $i = find_user($db, 'id', $u['id']); if ($i >= 0) { $db['users'][$i]['kyc']['files'][$side] = $name; log_act($db, $u, 'kyc-upload', $side); } });
        out(array('ok' => true));

    case 'kyc/remove':
        $u = need_user();
        require_post();
        $b = body(); $side = isset($b['side']) ? (string) $b['side'] : '';
        $old = isset($u['kyc']['files'][$side]) ? $u['kyc']['files'][$side] : '';
        if ($old && preg_match('/^[A-Za-z0-9.\-]+$/', $old)) { @unlink(kyc_dir() . '/' . $old); }
        db_update(function (&$db) use ($u, $side) { $i = find_user($db, 'id', $u['id']); if ($i >= 0 && isset($db['users'][$i]['kyc']['files'][$side])) { unset($db['users'][$i]['kyc']['files'][$side]); } });
        out(array('ok' => true));

    case 'kyc/image':
        $u = need_user();
        kyc_send($u, isset($_GET['side']) ? (string) $_GET['side'] : '');

    case 'admin/kyc-image':
        need_admin();
        $db = db_read(); $i = find_user($db, 'id', isset($_GET['uid']) ? (string) $_GET['uid'] : '');
        if ($i < 0) { fail('client not found', 404); }
        kyc_send($db['users'][$i], isset($_GET['side']) ? (string) $_GET['side'] : '');

    case 'admin/kyc-upload':
        $me = need_admin();
        require_post();
        $uid = isset($_POST['uid']) ? (string) $_POST['uid'] : ''; $side = isset($_POST['side']) ? (string) $_POST['side'] : '';
        $db0 = db_read(); $i0 = find_user($db0, 'id', $uid);
        if ($i0 < 0) { fail('client not found', 404); }
        $old = isset($db0['users'][$i0]['kyc']['files'][$side]) ? $db0['users'][$i0]['kyc']['files'][$side] : '';
        list($ok2, $name) = kyc_store($uid, $side, $old);
        if (!$ok2) { fail($name, 422); }
        db_update(function (&$db) use ($uid, $side, $name, $me) { $i = find_user($db, 'id', $uid); if ($i >= 0) { $db['users'][$i]['kyc']['files'][$side] = $name; log_act($db, $me, 'kyc-upload', $db['users'][$i]['email'] . ' ' . $side); } });
        out(array('ok' => true));

    case 'admin/kyc-remove':
        $me = need_admin();
        require_post();
        $b = body(); $uid = isset($b['uid']) ? (string) $b['uid'] : ''; $side = isset($b['side']) ? (string) $b['side'] : '';
        db_update(function (&$db) use ($uid, $side, $me) { $i = find_user($db, 'id', $uid); if ($i >= 0 && isset($db['users'][$i]['kyc']['files'][$side])) { $f = $db['users'][$i]['kyc']['files'][$side]; if (preg_match('/^[A-Za-z0-9.\-]+$/', $f)) { @unlink(kyc_dir() . '/' . $f); } unset($db['users'][$i]['kyc']['files'][$side]); log_act($db, $me, 'kyc-remove', $db['users'][$i]['email'] . ' ' . $side); } });
        out(array('ok' => true));

    case 'admin/mailbox-secret':
        // Stores (encrypted) the password of a mailbox so the admin can read it here. The connection is tested first.
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $pw = isset($b['password']) ? (string) $b['password'] : '';
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        $mi = find_by(items_of($db0, 'mailboxes'), 'id', $id);
        if ($mi < 0) { fail('mailbox not found', 404); }
        if ($pw !== '') {
            try { $im = new NcImap(imap_cfg($db0), $db0['items']['mailboxes'][$mi]['address'], $pw); $im->close(); $sealed = mail_seal($pw); }
            catch (Exception $e) { fail($e->getMessage(), 422); }
        } else { $sealed = ''; }
        db_update(function (&$db) use ($id, $sealed, $me) { $m = meta_get($db, 'mailSecrets', array()); if ($sealed === '') { unset($m[$id]); } else { $m[$id] = $sealed; } $db['meta']['mailSecrets'] = $m; log_act($db, $me, $sealed === '' ? 'mailbox-password-removed' : 'mailbox-password-saved', $id); });
        out(array('ok' => true));

    case 'admin/mail-folders':
    case 'admin/mail-list':
    case 'admin/mail-read':
        need_admin();
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        $id = isset($_GET['id']) ? (string) $_GET['id'] : '';
        $mi = find_by(items_of($db0, 'mailboxes'), 'id', $id);
        if ($mi < 0) { fail('mailbox not found', 404); }
        $sec = meta_get($db0, 'mailSecrets', array());
        if (empty($sec[$id])) { fail('no password saved for this mailbox', 409); }
        try {
            $im = new NcImap(imap_cfg($db0), $db0['items']['mailboxes'][$mi]['address'], mail_unseal($sec[$id]));
            if ($r === 'admin/mail-folders') { $o = array('folders' => $im->folders()); $im->close(); out($o); }
            $folder = isset($_GET['folder']) && $_GET['folder'] !== '' ? (string) $_GET['folder'] : 'INBOX';
            $total = $im->examine($folder);
            if ($r === 'admin/mail-list') {
                $size = 25; $page = max(1, (int) (isset($_GET['page']) ? $_GET['page'] : 1));
                $to = $total - ($page - 1) * $size; $from = max(1, $to - $size + 1);
                $msgs = $to >= 1 ? $im->headers($from, $to) : array();
                $im->close(); out(array('total' => $total, 'page' => $page, 'size' => $size, 'messages' => $msgs));
            }
            $msg = $im->message(isset($_GET['uid']) ? (int) $_GET['uid'] : 0);
            $im->close(); out($msg);
        } catch (Exception $e) { fail($e->getMessage(), 502); }

    case 'mail/boxes':
        $u = need_user();
        $db0 = db_read(); $sec = meta_get($db0, 'mailSecrets', array()); $o = array();
        foreach (items_of($db0, 'mailboxes') as $m) { if ($u['role'] === 'admin' ? false : ($m['uid'] !== $u['id'] || (isset($m['status']) && $m['status'] === 'archived'))) { continue; } if ($u['role'] === 'admin' && !empty($_GET['mine']) && $m['uid'] !== $u['id']) { continue; } $o[] = array('id' => $m['id'], 'address' => $m['address'], 'connected' => !empty($sec[$m['id']]), 'status' => isset($m['status']) ? $m['status'] : 'active'); }
        out(array('boxes' => $o, 'webmail' => (string) meta_get($db0, 'webmailUrl', '')));

    case 'mail/secret':
        $u = need_user();
        require_post();
        $b = body(); $id = isset($b['id']) ? (string) $b['id'] : ''; $pw = isset($b['password']) ? (string) $b['password'] : '';
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        $mb = mail_box($db0, $u, $id);
        if ($pw === '') { db_update(function (&$db) use ($id, $u) { $m = meta_get($db, 'mailSecrets', array()); unset($m[$id]); $db['meta']['mailSecrets'] = $m; log_act($db, $u, 'mailbox-disconnect', $id); }); out(array('ok' => true)); }
        $rk = 'mailpw:' . $id;
        if (rate_blocked($db0, $rk, 8, 900)) { fail('too many attempts, try again later', 429); }
        try { $im = mail_open($db0, $mb, $pw); $im->close(); $sealed = mail_seal($pw); }
        catch (Exception $e) { db_update(function (&$db) use ($rk) { rate_hit($db, $rk); }); fail($e->getMessage(), 422); }
        db_update(function (&$db) use ($id, $sealed, $u) { $m = meta_get($db, 'mailSecrets', array()); $m[$id] = $sealed; $db['meta']['mailSecrets'] = $m; log_act($db, $u, 'mailbox-connect', $id); });
        out(array('ok' => true));

    case 'mail/folders':
    case 'mail/list':
    case 'mail/read':
    case 'mail/attachment':
        $u = need_user();
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        $mb = mail_box($db0, $u, isset($_GET['id']) ? (string) $_GET['id'] : '');
        $pw = mail_pass($db0, $mb);
        $folder = isset($_GET['folder']) && $_GET['folder'] !== '' ? (string) $_GET['folder'] : 'INBOX';
        try {
            $im = mail_open($db0, $mb, $pw);
            if ($r === 'mail/folders') {
                $fl = $im->folders(); $sp = mail_special($fl); $o = array();
                foreach ($fl as $f) { $st = $im->status($f); $o[] = array('name' => $f, 'unseen' => $st['unseen'], 'total' => $st['messages']); }
                $im->close(); out(array('folders' => $o, 'special' => $sp));
            }
            if ($r === 'mail/list') {
                $size = 25; $page = max(1, (int) (isset($_GET['page']) ? $_GET['page'] : 1));
                $q = isset($_GET['q']) ? (string) $_GET['q'] : ''; $unread = isset($_GET['filter']) && in_array($_GET['filter'], array('unread', 'read', 'starred'), true) ? $_GET['filter'] : (!empty($_GET['unread']) ? 'unread' : '');
                $total = $im->select($folder);
                if ($q !== '' || $unread !== '') {
                    $all = $im->searchUids(mail_search_crit($q, $unread)); $total = count($all);
                    $msgs = $im->headersByUids(array_slice($all, ($page - 1) * $size, $size));
                } else {
                    $to = $total - ($page - 1) * $size; $from = max(1, $to - $size + 1);
                    $msgs = $to >= 1 ? $im->headers($from, $to) : array();
                }
                $im->close(); out(array('total' => $total, 'page' => $page, 'size' => $size, 'messages' => $msgs));
            }
            $im->select($folder);
            $uid = isset($_GET['uid']) ? (int) $_GET['uid'] : 0;
            if ($r === 'mail/read') {
                $msg = $im->message($uid);
                if (!isset($_GET['peek'])) { $im->store($uid, '\\Seen', true); }
                $im->close(); out($msg);
            }
            $raw = $im->rawMessage($uid); $im->close();
            $msg = mail_parse($raw, 0, true); $idx = isset($_GET['n']) ? (int) $_GET['n'] : 0;
            if (!isset($msg['attachments'][$idx])) { fail('attachment not found', 404); }
            $a = $msg['attachments'][$idx];
            header('Content-Type: application/octet-stream'); header('X-Content-Type-Options: nosniff'); header('Content-Disposition: attachment; filename*=UTF-8\'\'' . rawurlencode($a['name'])); header('Content-Length: ' . strlen($a['data']));
            echo $a['data']; exit;
        } catch (Exception $e) { fail($e->getMessage(), 502); }

    case 'mail/action':
        $u = need_user();
        require_post();
        require_once __DIR__ . '/providers.php';
        $b = body(); $db0 = db_read();
        $mb = mail_box($db0, $u, isset($b['id']) ? (string) $b['id'] : '');
        $pw = mail_pass($db0, $mb);
        $folder = isset($b['folder']) && $b['folder'] !== '' ? (string) $b['folder'] : 'INBOX';
        $act = isset($b['action']) ? (string) $b['action'] : ''; $uids = array(); foreach ((isset($b['uids']) && is_array($b['uids']) ? $b['uids'] : array()) as $x) { $uids[] = (int) $x; } $uids = array_slice(array_unique($uids), 0, 100);
        if (!in_array($act, array('seen', 'unseen', 'delete', 'spam', 'star', 'unstar'), true) || !$uids) { fail('bad request', 422); }
        try {
            $im = mail_open($db0, $mb, $pw); $im->select($folder); $sp = mail_special($im->folders());
            foreach ($uids as $x) {
                if ($act === 'seen' || $act === 'unseen') { $im->store($x, '\\Seen', $act === 'seen'); }
                elseif ($act === 'star' || $act === 'unstar') { $im->store($x, '\\Flagged', $act === 'star'); }
                elseif ($act === 'spam') { if ($sp['spam'] !== '') { $im->moveTo($x, $sp['spam']); } }
                else { if ($sp['trash'] !== '' && strcasecmp($folder, $sp['trash']) !== 0) { $im->moveTo($x, $sp['trash']); } else { $im->expunge($x); } }
            }
            $im->close();
        } catch (Exception $e) { fail($e->getMessage(), 502); }
        out(array('ok' => true));

    case 'mail/send':
        $u = need_user();
        require_post();
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        $mb = mail_box($db0, $u, isset($_POST['id']) ? (string) $_POST['id'] : '');
        $pw = mail_pass($db0, $mb);
        $rk = 'mailsend:' . $mb['id'];
        if (rate_blocked($db0, $rk, 100, 86400)) { fail('daily sending limit reached for this mailbox', 429); }
        try {
            $to = mail_addr_list(isset($_POST['to']) ? $_POST['to'] : ''); $cc = mail_addr_list(isset($_POST['cc']) ? $_POST['cc'] : '');
            if (!$to) { fail('add at least one recipient', 422); }
            if (count($to) + count($cc) > 30) { fail('too many recipients', 422); }
            $subject = clean_text(isset($_POST['subject']) ? $_POST['subject'] : '', 250); $text = nc_substr(isset($_POST['body']) ? (string) $_POST['body'] : '', 200000);
            $files = array(); $tot = 0;
            if (!empty($_FILES['files']) && is_array($_FILES['files']['name'])) {
                foreach ($_FILES['files']['name'] as $k => $nm) {
                    if ($_FILES['files']['error'][$k] === UPLOAD_ERR_NO_FILE) { continue; }
                    if ($_FILES['files']['error'][$k] !== UPLOAD_ERR_OK || !is_uploaded_file($_FILES['files']['tmp_name'][$k])) { fail('attachment upload failed (too large?)', 422); }
                    $tot += $_FILES['files']['size'][$k]; if ($tot > 8 * 1024 * 1024) { fail('attachments are limited to 8 MB in total', 413); }
                    $files[] = array('name' => clean_text($nm, 120) ?: 'file', 'type' => preg_match('#^[\w.+-]+/[\w.+-]+$#', (string) $_FILES['files']['type'][$k]) ? $_FILES['files']['type'][$k] : 'application/octet-stream', 'data' => file_get_contents($_FILES['files']['tmp_name'][$k]));
                }
            }
            $name = isset($u['name']) ? (string) $u['name'] : '';
            $raw = mail_build($mb['address'], '', $to, $cc, $subject, $text, $files, isset($_POST['inReplyTo']) ? (string) $_POST['inReplyTo'] : '', isset($_POST['references']) ? (string) $_POST['references'] : '');
            smtp_deliver(mail_smtp_cfg($db0), $mb['address'], $pw, $mb['address'], array_merge($to, $cc), $raw);
        } catch (Exception $e) { fail($e->getMessage(), 502); }
        db_update(function (&$db) use ($rk, $u, $mb) { rate_hit($db, $rk); log_act($db, $u, 'mail-sent', $mb['address']); });
        $saved = false;
        try { $im = mail_open($db0, $mb, $pw); $sp = mail_special($im->folders()); if ($sp['sent'] !== '') { $saved = $im->append($sp['sent'], $raw, '\\Seen'); } $im->close(); } catch (Exception $e) { }
        out(array('ok' => true, 'saved' => $saved));

    case 'mail/dns':
    case 'mail/dns-fix':
        $u = need_user();
        require_once __DIR__ . '/providers.php';
        $db0 = db_read();
        if ($r === 'mail/dns-fix') { require_post(); $b = body(); } else { $b = $_GET; }
        $mb = mail_box($db0, $u, isset($b['id']) ? (string) $b['id'] : '');
        $dn = strtolower(substr(strrchr($mb['address'], '@'), 1)); $dk = -1;
        foreach (items_of($db0, 'domains') as $i => $d) { if (strtolower($d['name']) === $dn && ($u['role'] === 'admin' || $d['uid'] === $u['id'])) { $dk = $i; } }
        if ($dk < 0) { out(array('domain' => $dn, 'managed' => false, 'checks' => mail_dns_status(array('name' => $dn), array(), true))); }
        $d = $db0['items']['domains'][$dk];
        if ($r === 'mail/dns') { out(array('domain' => $dn, 'managed' => true, 'dnsOff' => !empty($d['dnsOff']), 'checks' => mail_dns_status($d, isset($d['dns']) && is_array($d['dns']) ? $d['dns'] : array(), true))); }
        if (!empty($d['dnsOff'])) { fail('DNS management is turned off for this domain', 403); }
        $res = mail_dns_apply($d['id'], $u, !empty($b['dkim']), true);
        out(array('ok' => true, 'added' => $res['added'], 'warning' => $res['warning']));

    case 'admin/activity':
        need_admin();
        $db = db_read();
        out(array('log' => array_slice(array_reverse($db['log']), 0, 1000)));

    default:
        fail('not found', 404);
}
