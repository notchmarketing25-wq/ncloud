<?php
/**
 * Version updates. An admin uploads one update file (ncloud-update-X.Y.Z.zip, or the older .json), sees what it changes,
 * and installs it. Only an allow-list of site files can be written, never api/data; the replaced files are backed up
 * first (the newest 3 backups are kept) and can be restored.
 */
function upd_allowed($p) {
    return (bool) preg_match('#^(index\.html|favicon\.svg|nc-api\.php|assets/[A-Za-z0-9._\-]+|api/(index|schema|providers|update)\.php|api/changelog\.json)$#', $p);
}
/** The site folder: NC_DATA is <site>/api/data. */
function upd_site() { return dirname(dirname(NC_DATA)); }
function upd_current() { return preg_match('/^\d+\.\d+\.\d+$/', NC_VERSION) ? NC_VERSION : '0.0.0'; }
function upd_write($rel, $bytes) {
    $target = upd_site() . '/' . $rel;
    $dir = dirname($target);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { throw new Exception('could not create ' . dirname($rel)); }
    $tmp = $target . '.upd';
    if (@file_put_contents($tmp, $bytes) === false) { throw new Exception('could not write ' . $rel . ' (check the folder permissions)'); }
    if (!@rename($tmp, $target)) { @unlink($tmp); throw new Exception('could not replace ' . $rel); }
    if (function_exists('opcache_invalidate')) { @opcache_invalidate($target, true); }
}
function upd_rrmdir($d) { if (!is_dir($d)) { return; } foreach (scandir($d) as $f) { if ($f === '.' || $f === '..') { continue; } $p = $d . '/' . $f; is_dir($p) ? upd_rrmdir($p) : @unlink($p); } @rmdir($d); }
function upd_dirsize($d) { $n = 0; if (!is_dir($d)) { return 0; } foreach (scandir($d) as $f) { if ($f === '.' || $f === '..') { continue; } $p = $d . '/' . $f; $n += is_dir($p) ? upd_dirsize($p) : (int) @filesize($p); } return $n; }

/** Reads an update file into array(version, requires, notes, date, files => path => bytes, delete => paths). Fails with a clear message. */
function upd_parse($raw) {
    $pkg = null; $files = array();
    if (substr($raw, 0, 2) === 'PK') { // a zip
        if (!class_exists('ZipArchive')) { fail('this server has no PHP zip extension — upload the .json update file instead, or ask the host to enable zip', 422); }
        $tmp = tempnam(sys_get_temp_dir(), 'ncu');
        file_put_contents($tmp, $raw);
        $z = new ZipArchive();
        if ($z->open($tmp) !== true) { @unlink($tmp); fail('this is not a valid update file', 422); }
        $meta = $z->getFromName('update.json');
        $pkg = $meta === false ? null : json_decode($meta, true);
        if (is_array($pkg)) {
            for ($i = 0; $i < $z->numFiles; $i++) {
                $name = $z->getNameIndex($i);
                if ($name === 'update.json' || substr($name, -1) === '/') { continue; }
                $files[$name] = $z->getFromIndex($i);
            }
        }
        $z->close(); @unlink($tmp);
    } else {
        $pkg = json_decode($raw, true);
        if (is_array($pkg) && isset($pkg['files']) && is_array($pkg['files'])) {
            foreach ($pkg['files'] as $path => $b64) { $b = base64_decode((string) $b64, true); if ($b === false) { fail('the update file is damaged', 422); } $files[(string) $path] = $b; }
        }
    }
    if (!is_array($pkg) || empty($pkg['version']) || !preg_match('/^\d+\.\d+\.\d+$/', (string) $pkg['version'])) { fail('this is not a Notch Cloud update file', 422); }
    foreach ($files as $path => $bytes) {
        if (!upd_allowed($path)) { fail('the update contains a file that is not allowed: ' . clean_text($path, 80), 422); }
        if (substr($path, -4) === '.php' && strpos($bytes, '<?php') !== 0) { fail('the update file is damaged (' . $path . ')', 422); }
    }
    $delete = array();
    foreach (isset($pkg['delete']) && is_array($pkg['delete']) ? $pkg['delete'] : array() as $path) { if (upd_allowed((string) $path)) { $delete[] = (string) $path; } }
    return array('version' => (string) $pkg['version'], 'requires' => isset($pkg['requires']) ? (string) $pkg['requires'] : '0.0.0', 'date' => isset($pkg['date']) ? (string) $pkg['date'] : '',
        'notes' => isset($pkg['notes']) && is_array($pkg['notes']) ? $pkg['notes'] : array(), 'files' => $files, 'delete' => $delete);
}
function upd_check($u, $cur) {
    if (version_compare($u['version'], $cur, '<=')) { fail('this update (' . $u['version'] . ') is not newer than the installed version (' . $cur . ')', 409); }
    if (version_compare($cur, $u['requires'], '<')) { fail('install update ' . $u['requires'] . ' (or newer) first — this one starts from ' . $u['requires'], 409); }
}
function upd_changelog() {
    $f = __DIR__ . '/changelog.json';
    $j = is_file($f) ? json_decode(file_get_contents($f), true) : null;
    return is_array($j) ? $j : array();
}
function upd_backups() {
    $o = array(); $dir = NC_DATA . '/backup';
    if (!is_dir($dir)) { return $o; }
    foreach (scandir($dir) as $n) {
        if ($n === '.' || $n === '..' || !is_dir($dir . '/' . $n)) { continue; }
        $o[] = array('name' => $n, 'version' => preg_replace('/-to-.*/', '', $n), 'at' => gmdate('c', (int) @filemtime($dir . '/' . $n)), 'size' => upd_dirsize($dir . '/' . $n));
    }
    usort($o, function ($a, $b) { return strcmp($b['at'], $a['at']); });
    return $o;
}
function upd_apply($u, $me) {
    $cur = upd_current(); $ver = $u['version']; $site = upd_site();
    $name = $cur . '-to-' . $ver;
    $backup = NC_DATA . '/backup/' . $name;
    upd_rrmdir($backup);
    foreach (array_merge(array_keys($u['files']), $u['delete']) as $rel) {
        $src = $site . '/' . $rel;
        if (is_file($src)) { $dst = $backup . '/' . $rel; if (!is_dir(dirname($dst))) { @mkdir(dirname($dst), 0755, true); } @copy($src, $dst); }
    }
    $order = array_keys($u['files']);
    usort($order, function ($a, $b) { return (substr($a, -4) === '.php') <=> (substr($b, -4) === '.php'); }); // PHP last
    try {
        foreach ($order as $rel) { upd_write($rel, $u['files'][$rel]); }
        foreach ($u['delete'] as $rel) { @unlink($site . '/' . $rel); }
    } catch (Exception $e) {
        fail('update stopped: ' . $e->getMessage() . ' — your data is untouched; the previous files are in api/data/backup/' . $name, 500);
    }
    $migrated = false;
    if (use_sql() && is_file(__DIR__ . '/schema.php')) { try { require_once __DIR__ . '/schema.php'; nc_schema(nc_pdo()); $migrated = true; } catch (Exception $e) { $migrated = false; } }
    // keep only the newest 3 backups
    foreach (array_slice(upd_backups(), 3) as $old) { upd_rrmdir(NC_DATA . '/backup/' . $old['name']); }
    db_update(function (&$db) use ($ver, $cur, $me, $u) {
        $db['meta']['version'] = $ver;
        $h = meta_get($db, 'updates', array());
        $h[] = array('from' => $cur, 'to' => $ver, 'at' => gmdate('c'), 'by' => $me['name'], 'files' => count($u['files']), 'notes' => $u['notes']);
        $db['meta']['updates'] = array_slice($h, -20);
        log_act($db, $me, 'update', $cur . ' → ' . $ver);
    });
    return array('ok' => true, 'from' => $cur, 'version' => $ver, 'files' => count($u['files']), 'migrated' => $migrated, 'backup' => 'api/data/backup/' . $name);
}

function upd_route($r, $me) {
    $db = db_read();
    $cur = upd_current();
    $method = $_SERVER['REQUEST_METHOD'];
    if ($r === 'admin/update' && $method === 'GET') {
        $site = upd_site();
        out(array('version' => $cur, 'php' => PHP_VERSION, 'storage' => use_sql() ? 'mysql' : 'file', 'maxUpload' => ini_get('upload_max_filesize'),
            'checks' => array('zip' => class_exists('ZipArchive'), 'siteWritable' => is_writable($site), 'apiWritable' => is_writable($site . '/api'), 'dataWritable' => is_writable(NC_DATA)),
            'backups' => upd_backups(), 'applied' => meta_get($db, 'updates', array()), 'changelog' => upd_changelog()));
    }
    if ($r === 'admin/update/restore') {
        require_post();
        $b = body(); $name = isset($b['name']) ? (string) $b['name'] : '';
        if (!preg_match('/^\d+\.\d+\.\d+-to-\d+\.\d+\.\d+$/', $name) || !is_dir(NC_DATA . '/backup/' . $name)) { fail('backup not found', 404); }
        $dir = NC_DATA . '/backup/' . $name; $n = 0;
        $walk = function ($d, $prefix) use (&$walk, $dir, &$n) {
            foreach (scandir($d) as $f) {
                if ($f === '.' || $f === '..') { continue; }
                $p = $d . '/' . $f; $rel = ltrim($prefix . '/' . $f, '/');
                if (is_dir($p)) { $walk($p, $rel); continue; }
                if (upd_allowed($rel)) { upd_write($rel, file_get_contents($p)); $n++; }
            }
        };
        try { $walk($dir, ''); } catch (Exception $e) { fail('restore stopped: ' . $e->getMessage(), 500); }
        db_update(function (&$db) use ($me, $name) { log_act($db, $me, 'update-restore', $name); });
        out(array('ok' => true, 'files' => $n, 'version' => preg_replace('/-to-.*/', '', $name)));
    }
    if ($r !== 'admin/update') { return false; }
    require_post();
    $step = isset($_POST['step']) ? (string) $_POST['step'] : '';
    if ($step === 'apply') { // install a file that was previewed
        $token = isset($_POST['token']) ? preg_replace('/[^a-f0-9]/', '', (string) $_POST['token']) : '';
        $f = NC_DATA . '/tmp/upd-' . $token . '.pkg';
        if ($token === '' || !is_file($f)) { fail('the uploaded file expired — upload it again', 410); }
        $u = upd_parse(file_get_contents($f));
        upd_check($u, $cur);
        @unlink($f);
        out(upd_apply($u, $me));
    }
    if (empty($_FILES['pkg']) || !is_uploaded_file($_FILES['pkg']['tmp_name'])) { fail('no file received — the host may limit uploads to ' . ini_get('upload_max_filesize'), 422); }
    $raw = file_get_contents($_FILES['pkg']['tmp_name']);
    $u = upd_parse($raw);
    upd_check($u, $cur);
    if ($step === 'preview') {
        $site = upd_site(); $rows = array();
        foreach ($u['files'] as $path => $bytes) {
            $cp = $site . '/' . $path;
            $rows[] = array('path' => $path, 'action' => !is_file($cp) ? 'new' : (md5_file($cp) === md5($bytes) ? 'same' : 'changed'), 'size' => strlen($bytes));
        }
        $tmpDir = NC_DATA . '/tmp';
        if (!is_dir($tmpDir)) { @mkdir($tmpDir, 0755, true); }
        foreach (glob($tmpDir . '/upd-*.pkg') ?: array() as $old) { if (filemtime($old) < time() - 3600) { @unlink($old); } }
        $token = bin2hex(function_exists('random_bytes') ? random_bytes(8) : md5(uniqid('', true), true));
        if (@file_put_contents($tmpDir . '/upd-' . $token . '.pkg', $raw) === false) { fail('could not stage the update (is api/data writable?)', 500); }
        out(array('token' => $token, 'version' => $u['version'], 'from' => $cur, 'requires' => $u['requires'], 'date' => $u['date'], 'notes' => $u['notes'], 'files' => $rows, 'delete' => $u['delete']));
    }
    out(upd_apply($u, $me)); // upload and install in one step (older clients)
}
