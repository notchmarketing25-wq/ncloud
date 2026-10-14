<?php
/**
 * Version updates: an admin uploads a small package (ncloud-update-X.Y.Z.json) that holds only the files that changed.
 * The package never touches api/data, only an allow-list of site files, and the replaced files are backed up first.
 */
function upd_allowed($p) {
    return (bool) preg_match('#^(index\.html|favicon\.svg|nc-api\.php|assets/[A-Za-z0-9._\-]+|api/(index|schema|providers|update)\.php)$#', $p);
}
/** The site folder: NC_DATA is <site>/api/data. */
function upd_site() { return dirname(dirname(NC_DATA)); }
function upd_write($rel, $bytes) {
    $target = upd_site() . '/' . $rel;
    $dir = dirname($target);
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { throw new Exception('could not create ' . dirname($rel)); }
    $tmp = $target . '.upd';
    if (@file_put_contents($tmp, $bytes) === false) { throw new Exception('could not write ' . $rel . ' (check the folder permissions)'); }
    if (!@rename($tmp, $target)) { @unlink($tmp); throw new Exception('could not replace ' . $rel); }
    if (function_exists('opcache_invalidate')) { @opcache_invalidate($target, true); } // otherwise the host may keep serving the old PHP for a while
}
/** The installed version is the one baked into index.php, so "Update site files" in install.php keeps it right too. */
function upd_current($db) { return preg_match('/^\d+\.\d+\.\d+$/', NC_VERSION) ? NC_VERSION : '0.0.0'; }

function upd_route($r, $me) {
    $db = db_read();
    $cur = upd_current($db);
    if ($r === 'admin/update' && $_SERVER['REQUEST_METHOD'] === 'GET') {
        out(array('version' => $cur, 'php' => PHP_VERSION, 'storage' => use_sql() ? 'mysql' : 'file', 'maxUpload' => ini_get('upload_max_filesize'), 'history' => array_slice(array_reverse(meta_get($db, 'updates', array())), 0, 10)));
    }
    if ($r !== 'admin/update') { return false; }
    require_post();
    if (empty($_FILES['pkg']) || !is_uploaded_file($_FILES['pkg']['tmp_name'])) {
        fail('no file received — the host may limit uploads to ' . ini_get('upload_max_filesize'), 422);
    }
    $raw = file_get_contents($_FILES['pkg']['tmp_name']);
    $pkg = json_decode($raw, true);
    if (!is_array($pkg) || (isset($pkg['format']) ? $pkg['format'] : 0) !== 1 || empty($pkg['version']) || !isset($pkg['files']) || !is_array($pkg['files'])) { fail('this is not a Notch Cloud update file', 422); }
    $ver = (string) $pkg['version'];
    if (!preg_match('/^\d+\.\d+\.\d+$/', $ver)) { fail('invalid version', 422); }
    if (version_compare($ver, $cur, '<=')) { fail('this update (' . $ver . ') is not newer than the installed version (' . $cur . ')', 409); }
    $need = isset($pkg['requires']) ? (string) $pkg['requires'] : '0.0.0';
    if (version_compare($cur, $need, '<')) { fail('install update ' . $need . ' (or newer) first — this one starts from ' . $need, 409); }
    $files = array();
    foreach ($pkg['files'] as $path => $b64) {
        if (!upd_allowed((string) $path)) { fail('the update contains a file that is not allowed: ' . clean_text((string) $path, 80), 422); }
        $bytes = base64_decode((string) $b64, true);
        if ($bytes === false) { fail('the update file is damaged', 422); }
        if (substr($path, -4) === '.php' && strpos($bytes, '<?php') !== 0) { fail('the update file is damaged (' . $path . ')', 422); }
        $files[$path] = $bytes;
    }
    $delete = array();
    foreach (isset($pkg['delete']) && is_array($pkg['delete']) ? $pkg['delete'] : array() as $path) { if (upd_allowed((string) $path)) { $delete[] = (string) $path; } }
    // 1) back up what is about to be replaced
    $site = upd_site();
    $backup = NC_DATA . '/backup/' . $cur . '-to-' . $ver;
    foreach (array_merge(array_keys($files), $delete) as $rel) {
        $src = $site . '/' . $rel;
        if (is_file($src)) {
            $dst = $backup . '/' . $rel;
            if (!is_dir(dirname($dst))) { @mkdir(dirname($dst), 0755, true); }
            @copy($src, $dst);
        }
    }
    // 2) write the files (PHP last, so a half-applied update never leaves a new index.php without its assets)
    $order = array_keys($files);
    usort($order, function ($a, $b) { return (substr($a, -4) === '.php') <=> (substr($b, -4) === '.php'); });
    try {
        foreach ($order as $rel) { upd_write($rel, $files[$rel]); }
        foreach ($delete as $rel) { @unlink($site . '/' . $rel); }
    } catch (Exception $e) {
        fail('update stopped: ' . $e->getMessage() . ' — your data is untouched; the previous files are in api/data/backup', 500);
    }
    // 3) database tables (idempotent) and the new version number
    $migrated = false;
    if (use_sql() && is_file(__DIR__ . '/schema.php')) {
        try { require_once __DIR__ . '/schema.php'; nc_schema(nc_pdo()); $migrated = true; } catch (Exception $e) { /* tables are created on demand; report below */ $migrated = false; }
    }
    $note = isset($pkg['notes']) && is_array($pkg['notes']) ? $pkg['notes'] : array();
    db_update(function (&$db) use ($ver, $cur, $me, $note, $files) {
        $db['meta']['version'] = $ver;
        $h = meta_get($db, 'updates', array());
        $h[] = array('from' => $cur, 'to' => $ver, 'at' => gmdate('c'), 'by' => $me['name'], 'files' => count($files), 'notes' => $note);
        $db['meta']['updates'] = array_slice($h, -20);
        log_act($db, $me, 'update', $cur . ' → ' . $ver);
    });
    out(array('ok' => true, 'from' => $cur, 'version' => $ver, 'files' => count($files), 'migrated' => $migrated, 'backup' => 'api/data/backup/' . $cur . '-to-' . $ver));
}
