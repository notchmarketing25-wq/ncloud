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
    'domains' => array('name' => array('str', 253, 'req'), 'status' => array('enum', array('active', 'pending', 'expiring', 'stopped', 'archived')), 'expires' => array('date'), 'autoRenew' => array('bool'), 'provider' => array('str', 30), 'cost' => array('num'), 'price' => array('num'), 'notes' => array('str', 500), 'mail' => array('str', 20)),
    'mailboxes' => array('address' => array('str', 254, 'req'), 'quotaGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'expires' => array('date')),
    'hosting' => array('plan' => array('str', 60, 'req'), 'domain' => array('str', 253), 'diskGb' => array('num'), 'usedGb' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'provider' => array('str', 30), 'ref' => array('str', 80), 'cost' => array('num'), 'billing' => array('enum', array('monthly', 'yearly')), 'expires' => array('date'), 'price' => array('num')),
    'servers' => array('name' => array('str', 60, 'req'), 'ip' => array('str', 64), 'spec' => array('str', 120), 'cpu' => array('num'), 'ram' => array('num'), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'expires' => array('date')),
    'invoices' => array('item' => array('str', 160, 'req'), 'amount' => array('num', 'req'), 'date' => array('date'), 'status' => array('enum', array('due', 'paid', 'void'))),
    // Websites: each one is linked to a hosting plan and a domain (and, through the domain, to its mailboxes).
    'websites' => array('name' => array('str', 120, 'req'), 'url' => array('str', 253), 'status' => array('enum', array('active', 'pending', 'stopped', 'archived')), 'domainId' => array('str', 32), 'hostingId' => array('str', 32), 'provider' => array('str', 30), 'ref' => array('str', 80), 'notes' => array('str', 500), 'diskGb' => array('num'), 'usedGb' => array('num'), 'expires' => array('date')),
    // Public price list shown on the website (edited in Admin → Plans). Not owned by a client.
    'plans' => array('category' => array('enum', array('hosting', 'email', 'vps', 'site', 'bundle')), 'nameAr' => array('str', 80, 'req'), 'nameEn' => array('str', 80), 'price' => array('num', 'req'), 'per' => array('enum', array('month', 'year', 'once')), 'featured' => array('bool'), 'active' => array('bool'), 'sort' => array('num'), 'specs' => array('str', 700), 'features' => array('str', 900)),
    // Orders placed from the cart. Lines, number and totals are set by the server; admin edits status / payment fields only.
    'orders' => array('status' => array('enum', array('pending', 'paid', 'active', 'cancelled')), 'method' => array('str', 40), 'payRef' => array('str', 160), 'adminNote' => array('str', 1000)),
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
function public_user($u) { return array('id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => isset($u['created']) ? $u['created'] : null, 'phone' => isset($u['phone']) ? $u['phone'] : '', 'company' => isset($u['company']) ? $u['company'] : '', 'source' => isset($u['source']) ? $u['source'] : '', 'disabled' => !empty($u['disabled'])); }
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
function dns_norm($v) { return rtrim(strtolower(trim(preg_replace('/\s+/', ' ', (string) $v))), '.'); }

/** Every service gets a stable subscription ID (derived from its id, so it never changes) and a start date. */
function sub_prefix($res) { $p = array('domains' => 'DOM', 'hosting' => 'HST', 'websites' => 'WEB', 'servers' => 'SRV', 'mailboxes' => 'MBX'); return isset($p[$res]) ? $p[$res] : ''; }
function deco_item($res, $it) {
    $p = sub_prefix($res);
    if ($p === '' || !isset($it['id'])) { return $it; }
    $it['sub'] = $p . '-' . strtoupper(substr(md5($it['id']), 0, 8));
    $it['started'] = isset($it['created']) ? substr($it['created'], 0, 10) : '';
    return $it;
}
function deco_list($res, $list) { return array_map(function ($it) use ($res) { return deco_item($res, $it); }, $list); }
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
    $fp = @stream_socket_client(($sec === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port, $en, $es, 12);
    if (!$fp) { throw new Exception('cannot connect to ' . $host . ':' . $port . ' (' . $es . ')'); }
    stream_set_timeout($fp, 12);
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

/* ───────── orders ───────── */
/** Creates an order and its invoice inside a db_update callback. */
function nc_new_order(&$db, $u, $lines, $total, $o) {
    $now = gmdate('c');
    $cur = isset($o['cur']) ? $o['cur'] : (meta_get($db, 'currency', '') ?: 'EGP');
    $seq = (int) meta_get($db, 'orderSeq', 1000) + 1; $db['meta']['orderSeq'] = $seq;
    $iseq = (int) meta_get($db, 'invoiceSeq', 1000) + 1; $db['meta']['invoiceSeq'] = $iseq;
    $summary = implode(' + ', array_map(function ($l) { return $l['nameEn']; }, $lines));
    $order = array('id' => new_id(), 'uid' => $u['id'], 'created' => $now, 'number' => 'ORD-' . $seq, 'status' => 'pending', 'method' => isset($o['method']) ? $o['method'] : '', 'methodName' => isset($o['mname']) ? $o['mname'] : '', 'payRef' => '', 'adminNote' => '', 'lines' => $lines, 'subtotal' => isset($o['subtotal']) ? $o['subtotal'] : $total, 'discount' => isset($o['discount']) ? $o['discount'] : 0, 'coupon' => isset($o['coupon']) ? $o['coupon'] : '', 'total' => $total, 'currency' => $cur, 'domain' => isset($o['domain']) ? $o['domain'] : '', 'note' => isset($o['note']) ? $o['note'] : '', 'summary' => nc_substr($summary, 160), 'provisioned' => false, 'auto' => !empty($o['auto']));
    $inv = array('id' => new_id(), 'uid' => $u['id'], 'created' => $now, 'number' => 'INV-' . $iseq, 'item' => nc_substr('Order ' . $order['number'] . ': ' . $summary, 160), 'amount' => $total, 'date' => gmdate('Y-m-d'), 'status' => 'due', 'orderId' => $order['id']);
    $order['invoiceId'] = $inv['id'];
    $db['items']['orders'][] = $order;
    $db['items']['invoices'][] = $inv;
    $text = ($order['auto'] ? 'Renewal order ' : 'New order ') . $order['number'] . ' — ' . $total . ' ' . $cur . "\n" . implode("\n", array_map(function ($l) { return '• ' . $l['nameEn'] . ' × ' . $l['qty'] . ' = ' . $l['price']; }, $lines)) . ($order['domain'] !== '' ? "\nDomain: " . $order['domain'] : '') . ($order['note'] !== '' ? "\n\n" . $order['note'] : '');
    $db['tickets'][] = array('id' => new_id(), 'uid' => $u['id'], 'subject' => ($order['auto'] ? 'Renewal ' : 'Order ') . $order['number'], 'status' => $order['auto'] ? 'answered' : 'open', 'updated' => $now, 'created' => $now, 'messages' => array(array('from' => 'client', 'name' => $u['name'], 'text' => $text, 'at' => $now)));
    return array('order' => $order, 'invoice' => $inv, 'text' => $text);
}
function add_period($date, $qty, $unit) {
    $base = ($date !== '' && $date > gmdate('Y-m-d')) ? $date : gmdate('Y-m-d');
    return gmdate('Y-m-d', strtotime($base . ' +' . (int) $qty . ' ' . $unit));
}
/** Moves an order to a status (paid → invoice paid; active → also provisions / extends services, once; cancelled → invoice void). */
function order_set_status(&$db, $id, $st, $actor) {
    global $SCHEMA;
    $i = find_by(items_of($db, 'orders'), 'id', $id);
    if ($i < 0) { return array('err' => 'order not found'); }
    $o = $db['items']['orders'][$i];
    if ($o['status'] === $st) { return array('order' => $o); }
    $o['status'] = $st;
    $ii = find_by(items_of($db, 'invoices'), 'id', isset($o['invoiceId']) ? $o['invoiceId'] : '');
    if ($ii >= 0) { $db['items']['invoices'][$ii]['status'] = $st === 'cancelled' ? 'void' : ($st === 'pending' ? 'due' : 'paid'); }
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
                $made[] = 'renewed ' . $l['nameEn'];
            } elseif ($l['kind'] === 'domain') {
                $d = clean_fields($SCHEMA['domains'], array('name' => $l['ref'], 'status' => 'pending', 'autoRenew' => true, 'price' => $l['unitPrice'], 'notes' => 'Order ' . $o['number']), $e);
                $db['items']['domains'][] = array_merge(array('id' => new_id(), 'uid' => $uid, 'created' => $now, 'dns' => array(), 'orderId' => $o['id'], 'regYears' => $l['qty']), $d); $made[] = 'domain ' . $l['ref'];
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
                    $mails[] = array($u['email'], $days < 0 ? 'Expired: ' . $label : 'Renewal in ' . $days . ' days: ' . $label, ($days < 0 ? $label . ' expired on ' . $svc['expires'] . '.' : $label . ' expires on ' . $svc['expires'] . ' (' . $days . " days).") . $line . "\n\nRenew it any time from your client area.");
                }
                if ($days < 0 && $res === 'domains' && $svc['status'] === 'active') { $db['items'][$res][$k]['status'] = 'expiring'; }
            }
        }
        return array('ran' => true, 'mails' => $mails, 'created' => $created, 'db' => $db);
    });
    if (!empty($res['ran'])) { foreach ($res['mails'] as $m) { nc_mail($res['db'], $m[0], $m[1], $m[2]); } }
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
        if ($ok && !empty($db['users'][$i]['disabled']) && $db['users'][$i]['role'] !== 'admin') { fail('this account is suspended, contact us', 403); }
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
        $db0 = db_read();
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
        $made = db_update(function (&$db) use ($lines, $total, $subtotal, $discount, $coupon, $u, $note, $domain, $method, $mname, $cur) {
            if ($coupon !== '') {
                list($cp, $cerr) = coupon_find($db, $coupon, $subtotal);
                if (!$cp) { return array('err' => $cerr); }
                foreach ($db['meta']['coupons'] as $ci => $cc) { if (strtoupper($cc['code']) === strtoupper($coupon)) { $db['meta']['coupons'][$ci]['used'] = (int) $cc['used'] + 1; } }
            }
            $r = nc_new_order($db, $u, $lines, $total, array('domain' => $domain, 'note' => $note, 'method' => $method, 'mname' => $mname, 'coupon' => $coupon, 'discount' => $discount, 'subtotal' => $subtotal, 'cur' => $cur));
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

    case 'cron/run':
        // For a hosting cron job: curl "https://your-site/api/index.php?r=cron/run&key=…" once a day.
        $db = db_read();
        $k = (string) meta_get($db, 'cronKey', '');
        if ($k === '' || !isset($_GET['key']) || !hash_equals($k, (string) $_GET['key'])) { fail('forbidden', 403); }
        $r2 = nc_daily(true);
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
            if (res_unowned($res)) { continue; }
            // Our cost and supplier are never shown to clients.
            $o[$res] = array_values(array_map(function ($it) { unset($it['cost'], $it['provider'], $it['ref'], $it['adminNote']); return $it; }, array_filter(deco_list($res, mine($db, $res, $u['id'])), function ($it) { return !isset($it['status']) || $it['status'] !== 'archived'; })));
        }
        $o['tickets'] = array_values(array_filter($db['tickets'], function ($t) use ($u) { return $t['uid'] === $u['id']; }));
        $o['payments'] = pay_methods($db, true);
        $o['webmail'] = meta_get($db, 'webmailUrl', 'https://mail.hostinger.com');
        $o['business'] = meta_get($db, 'business', new stdClass());
        $o['taxRate'] = (float) meta_get($db, 'taxRate', 0);
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
        nc_daily(); // once a day, the first time an admin opens the panel (a cron job does it more reliably)
        $db = db_read();
        $admins = admin_count($db);
        $active = 0; $counts = array();
        foreach (array_keys($SCHEMA) as $res) {
            $list = items_of($db, $res);
            $counts[$res] = count($list);
            if ($res !== 'invoices' && $res !== 'orders') { foreach ($list as $it) { if ($it['status'] === 'active') { $active++; } } }
        }
        $paid = 0; $due = 0;
        foreach (items_of($db, 'invoices') as $inv) { if ($inv['status'] === 'paid') { $paid += $inv['amount']; } elseif ($inv['status'] === 'due') { $due += $inv['amount']; } }
        $open = 0; foreach ($db['tickets'] as $t) { if ($t['status'] === 'open') { $open++; } } // open = waiting for an admin reply
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
        $disabled = isset($b['disabled']) ? !empty($b['disabled']) : null;
        if ($disabled && $id === $me['id']) { fail('you cannot suspend your own account', 409); }
        $res = db_update(function (&$db) use ($id, $name, $role, $hash, $me, $phone, $company, $email, $disabled) {
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
        out(array('ok' => true));

    /* ── admin: client services ── */
    case 'admin/items':
        need_admin();
        $res = res_name();
        $db = db_read();
        out(array('items' => deco_list($res, items_of($db, $res))));

    case 'admin/all':
        need_admin();
        $db = db_read();
        $o = array('users' => array_map('public_user', $db['users']), 'items' => array(), 'tickets' => array());
        foreach (array_keys($SCHEMA) as $res) { if (!res_unowned($res)) { $o['items'][$res] = deco_list($res, items_of($db, $res)); } }
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
                'brand' => meta_get($db, 'brand', new stdClass()), 'business' => meta_get($db, 'business', new stdClass()),
                'payments' => meta_get($db, 'payments', array()), 'webmailUrl' => meta_get($db, 'webmailUrl', 'https://mail.hostinger.com'),
                'defaultLang' => meta_get($db, 'defaultLang', 'ar'), 'siteUrl' => meta_get($db, 'siteUrl', ''), 'cleanUrls' => (bool) meta_get($db, 'cleanUrls', false), 'taxRate' => (float) meta_get($db, 'taxRate', 0), 'autoActivate' => (bool) meta_get($db, 'autoActivate', false), 'autoRenewInvoices' => (bool) meta_get($db, 'autoRenewInvoices', true),
                'smtp' => smtp_public(meta_get($db, 'smtp', array())), 'gateways' => gw_public(meta_get($db, 'gateways', array())), 'coupons' => meta_get($db, 'coupons', array()),
                'cronKey' => cron_key($db), 'lastDaily' => meta_get($db, 'lastDaily', ''), 'providerRegister' => (bool) meta_get($db, 'providerRegister', false)));
        }
        require_post();
        $b = body();
        $site = clean_text(isset($b['site']) ? $b['site'] : '', 80);
        $ce = clean_email(isset($b['contactEmail']) ? $b['contactEmail'] : '');
        if ($ce !== '' && !filter_var($ce, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        $cur = clean_text(isset($b['currency']) ? $b['currency'] : '', 8);
        $ph = !empty($b['placeholder']);
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
        if (isset($b['defaultLang'])) { $extra['defaultLang'] = $b['defaultLang'] === 'en' ? 'en' : 'ar'; }
        if (isset($b['siteUrl'])) {
            $su = rtrim(trim((string) $b['siteUrl']), '/');
            if ($su !== '' && !preg_match('#^https?://[A-Za-z0-9.\-]+(:\d+)?(/[A-Za-z0-9._~\-/]*)?$#', $su)) { fail('invalid site address (like https://example.com)', 422); }
            $extra['siteUrl'] = $su;
        }
        foreach (array('cleanUrls', 'autoActivate', 'autoRenewInvoices', 'providerRegister') as $fk) { if (isset($b[$fk])) { $extra[$fk] = !empty($b[$fk]); } }
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
        // Marks an invoice paid / due / void. An invoice that belongs to an order moves the order too, and "paid" activates the service.
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        $st = isset($b['status']) ? (string) $b['status'] : '';
        if (!in_array($st, array('due', 'paid', 'void'), true)) { fail('invalid status', 422); }
        $res = db_update(function (&$db) use ($id, $st, $me) {
            $i = find_by(items_of($db, 'invoices'), 'id', $id);
            if ($i < 0) { return array('err' => 'invoice not found'); }
            $inv = $db['items']['invoices'][$i];
            $oi = isset($inv['orderId']) ? find_by(items_of($db, 'orders'), 'id', $inv['orderId']) : -1;
            if ($oi >= 0) {
                $to = $st === 'paid' ? 'active' : ($st === 'void' ? 'cancelled' : 'pending');
                $r = order_set_status($db, $inv['orderId'], $to, $me);
                if (isset($r['err'])) { return $r; }
            } else {
                $db['items']['invoices'][$i]['status'] = $st;
                log_act($db, $me, 'invoice-' . $st, $inv['number']);
            }
            return array('invoice' => $db['items']['invoices'][$i]);
        });
        if (isset($res['err'])) { fail($res['err'], 404); }
        out($res);

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

    case 'admin/activity':
        need_admin();
        $db = db_read();
        out(array('log' => array_slice(array_reverse($db['log']), 0, 1000)));

    default:
        fail('not found', 404);
}
