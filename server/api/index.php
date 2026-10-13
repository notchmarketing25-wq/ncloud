<?php
/**
 * Notch Cloud Services: API (single file, flat-file storage, PHP 7.0+).
 * Written to api/ by install.php. Data lives in api/data/db.php (PHP-guarded JSON), never in a public file.
 * Routes: ?r=status | auth/me | auth/login | auth/logout | auth/password | admin/overview | admin/users | admin/user-update | admin/user-delete
 */
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

define('NC_DATA', __DIR__ . '/data');
define('NC_DB', NC_DATA . '/db.php');
const NC_GUARD = "<?php http_response_code(404); exit; ?>\n";

function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 400) { out(array('error' => $msg), $code); }

function db_default() { return array('users' => array(), 'attempts' => new stdClass(), 'meta' => new stdClass()); }
function db_read() {
    if (!is_file(NC_DB)) { return db_default(); }
    $raw = file_get_contents(NC_DB);
    $nl = strpos($raw, "\n");
    $d = json_decode($nl === false ? '' : substr($raw, $nl + 1), true);
    if (!is_array($d)) { return db_default(); }
    if (!isset($d['users']) || !is_array($d['users'])) { $d['users'] = array(); }
    if (!isset($d['attempts']) || !is_array($d['attempts'])) { $d['attempts'] = array(); }
    if (!isset($d['meta']) || !is_array($d['meta'])) { $d['meta'] = array(); }
    return $d;
}
/** Locked read-modify-write. $fn receives the db array by reference and may return a value. */
function db_update($fn) {
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

function public_user($u) { return array('id' => $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'role' => $u['role'], 'created' => isset($u['created']) ? $u['created'] : null); }
function new_id() { return function_exists('random_bytes') ? bin2hex(random_bytes(8)) : md5(uniqid('', true)); }
function find_user($db, $key, $val) { foreach ($db['users'] as $i => $u) { if ($u[$key] === $val) { return $i; } } return -1; }
function clean_email($e) { return strtolower(trim((string) $e)); }
function clean_name($n) { return trim(preg_replace('/\s+/u', ' ', strip_tags((string) $n))); }

function body() {
    $raw = file_get_contents('php://input');
    $d = json_decode($raw, true);
    return is_array($d) ? $d : array();
}
function require_post() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { fail('POST required', 405); }
    // Custom header + JSON body: a cross-site form cannot send these, which is our CSRF guard (with SameSite cookies).
    if (!isset($_SERVER['HTTP_X_NC']) || $_SERVER['HTTP_X_NC'] !== '1') { fail('bad request', 400); }
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
function admin_count($db) { $n = 0; foreach ($db['users'] as $u) { if ($u['role'] === 'admin') { $n++; } } return $n; }
function check_password($p) { if (!is_string($p) || strlen($p) < 8) { fail('password must be at least 8 characters', 422); } if (strlen($p) > 200) { fail('password too long', 422); } }

$r = isset($_GET['r']) ? (string) $_GET['r'] : '';
if (!is_file(NC_DATA . '/installed.lock')) {
    if ($r === 'status') { out(array('installed' => false)); }
    fail('not installed', 503);
}
start_session();

switch ($r) {
    case 'status':
        $db = db_read();
        out(array('installed' => true, 'site' => isset($db['meta']['site']) ? $db['meta']['site'] : ''));

    case 'auth/me':
        $u = current_user();
        out(array('user' => $u ? public_user($u) : null));

    case 'auth/login':
        require_post();
        $b = body();
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $pass = isset($b['password']) ? (string) $b['password'] : '';
        $ip = md5(isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
        $now = time();
        $blocked = db_update(function (&$db) use ($ip, $now) {
            $list = isset($db['attempts'][$ip]) ? $db['attempts'][$ip] : array();
            $list = array_values(array_filter($list, function ($t) use ($now) { return $t > $now - 600; }));
            $db['attempts'][$ip] = $list;
            foreach ($db['attempts'] as $k => $v) { if (!$v) { unset($db['attempts'][$k]); } }
            return count($list) >= 8;
        });
        if ($blocked) { fail('too many attempts, try again in 10 minutes', 429); }
        $db = db_read();
        $i = find_user($db, 'email', $email);
        $hash = $i >= 0 ? $db['users'][$i]['hash'] : '$2y$10$8Y16n8v4IzI3OW35lCBnoODimb31iLg1sMQ/8idOIoa4jptGzb9rW';
        $ok = password_verify($pass, $hash) && $i >= 0;
        if (!$ok) {
            db_update(function (&$db) use ($ip, $now) { $db['attempts'][$ip][] = $now; });
            fail('wrong email or password', 401);
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = $db['users'][$i]['id'];
        out(array('user' => public_user($db['users'][$i])));

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
        db_update(function (&$db) use ($u, $h) { $i = find_user($db, 'id', $u['id']); if ($i >= 0) { $db['users'][$i]['hash'] = $h; } });
        out(array('ok' => true));

    case 'admin/overview':
        need_admin();
        $db = db_read();
        $admins = admin_count($db);
        out(array('users' => count($db['users']), 'admins' => $admins, 'clients' => count($db['users']) - $admins, 'site' => isset($db['meta']['site']) ? $db['meta']['site'] : ''));

    case 'admin/users':
        need_admin();
        $db = db_read();
        if ($_SERVER['REQUEST_METHOD'] === 'GET') { out(array('users' => array_map('public_user', $db['users']))); }
        require_post();
        $b = body();
        $name = clean_name(isset($b['name']) ? $b['name'] : '');
        $email = clean_email(isset($b['email']) ? $b['email'] : '');
        $role = (isset($b['role']) && $b['role'] === 'admin') ? 'admin' : 'client';
        if ($name === '' || mb_strlen($name) > 80) { fail('name is required', 422); }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) { fail('invalid email', 422); }
        check_password(isset($b['password']) ? $b['password'] : '');
        $hash = password_hash($b['password'], PASSWORD_DEFAULT);
        $user = array('id' => new_id(), 'name' => $name, 'email' => $email, 'role' => $role, 'hash' => $hash, 'created' => gmdate('c'));
        $dup = db_update(function (&$db) use ($user) {
            if (find_user($db, 'email', $user['email']) >= 0) { return true; }
            $db['users'][] = $user;
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
        $res = db_update(function (&$db) use ($id, $name, $role, $hash, $me) {
            $i = find_user($db, 'id', $id);
            if ($i < 0) { return 'missing'; }
            if ($role !== null && $role !== 'admin' && $db['users'][$i]['role'] === 'admin' && admin_count($db) <= 1) { return 'last-admin'; }
            if ($name !== null && $name !== '') { $db['users'][$i]['name'] = $name; }
            if ($role !== null) { $db['users'][$i]['role'] = $role; }
            if ($hash !== null) { $db['users'][$i]['hash'] = $hash; }
            return 'ok';
        });
        if ($res === 'missing') { fail('user not found', 404); }
        if ($res === 'last-admin') { fail('there must be at least one admin', 409); }
        out(array('ok' => true));

    case 'admin/user-delete':
        $me = need_admin();
        require_post();
        $b = body();
        $id = isset($b['id']) ? (string) $b['id'] : '';
        if ($id === $me['id']) { fail('you cannot delete your own account', 409); }
        $res = db_update(function (&$db) use ($id) {
            $i = find_user($db, 'id', $id);
            if ($i < 0) { return 'missing'; }
            if ($db['users'][$i]['role'] === 'admin' && admin_count($db) <= 1) { return 'last-admin'; }
            array_splice($db['users'], $i, 1);
            return 'ok';
        });
        if ($res === 'missing') { fail('user not found', 404); }
        if ($res === 'last-admin') { fail('there must be at least one admin', 409); }
        out(array('ok' => true));

    default:
        fail('not found', 404);
}
