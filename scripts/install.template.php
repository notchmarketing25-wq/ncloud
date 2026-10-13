<?php
/**
 * Notch Cloud Services: one-file installer (v__VERSION__).
 * Upload this single file to any PHP hosting (PHP 7.0+), open it in the browser, create the admin account, press Install.
 * No database: accounts are stored in api/data (PHP-guarded, never public). The installer can delete itself afterwards.
 */
$FILES = array(
__FILES__
);

if (!headers_sent()) { header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); header('Cache-Control: no-store'); }
$lang = (isset($_GET['lang']) && $_GET['lang'] === 'en') ? 'en' : 'ar';
function t($ar, $en) { global $lang; return $lang === 'ar' ? $ar : $en; }
function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function post($k) { return isset($_POST[$k]) ? trim((string) $_POST[$k]) : ''; }

@session_start();
if (empty($_SESSION['nt_tok'])) {
    $_SESSION['nt_tok'] = function_exists('random_bytes') ? bin2hex(random_bytes(16)) : md5(uniqid('', true) . mt_rand());
}
$tok = $_SESSION['nt_tok'];

$dir = __DIR__;
$data = $dir . '/api/data';
$locked = is_file($data . '/installed.lock');
$exists = file_exists($dir . '/index.html');
$phpOk = version_compare(PHP_VERSION, '7.0.0', '>=');
$jsonOk = function_exists('json_encode') && function_exists('password_hash');
$writable = is_writable($dir);
$action = isset($_POST['action']) ? $_POST['action'] : '';
$tokenOk = isset($_POST['tok']) && hash_equals($tok, (string) $_POST['tok']);
$errors = array();
$done = false;
$deleted = false;
$updated = false;
$written = 0;
$f = array('site' => post('site'), 'name' => post('name'), 'email' => strtolower(post('email')));

function write_site($FILES, $dir, &$errors, &$written) {
    foreach ($FILES as $path => $b64) {
        if ($path === '' || $path[0] === '/' || strpos($path, '..') !== false) { continue; }
        $target = $dir . '/' . $path;
        $d = dirname($target);
        if (!is_dir($d) && !@mkdir($d, 0755, true)) { $errors[] = t('تعذّر إنشاء الفولدر: ', 'Could not create folder: ') . $path; return false; }
        if (@file_put_contents($target, base64_decode($b64)) === false) { $errors[] = t('تعذّرت كتابة الملف: ', 'Could not write file: ') . $path; return false; }
        $written++;
    }
    return true;
}

if ($action !== '' && !$tokenOk) {
    $errors[] = t('انتهت الجلسة، حدّث الصفحة وحاول تاني.', 'Session expired, reload the page and try again.');
} elseif ($action === 'install' && !$locked) {
    $pass = isset($_POST['password']) ? (string) $_POST['password'] : '';
    $pass2 = isset($_POST['password2']) ? (string) $_POST['password2'] : '';
    $nameClean = trim(preg_replace('/\s+/u', ' ', strip_tags($f['name'])));
    if ($nameClean === '') { $errors[] = t('اكتب اسم الأدمن.', 'Enter the admin name.'); }
    if (!filter_var($f['email'], FILTER_VALIDATE_EMAIL)) { $errors[] = t('الإيميل غير صحيح.', 'The email is not valid.'); }
    if (strlen($pass) < 8) { $errors[] = t('كلمة السر لازم تكون 8 حروف على الأقل.', 'The password must be at least 8 characters.'); }
    if ($pass !== $pass2) { $errors[] = t('كلمتا السر غير متطابقتين.', 'The passwords do not match.'); }
    if ($exists && empty($_POST['overwrite'])) { $errors[] = t('فيه موقع موجود في الفولدر ده. علّم على "اكتب فوقه" لو عايز تستبدله.', 'A site already exists in this folder. Tick "overwrite" to replace it.'); }
    if (!$writable) { $errors[] = t('الفولدر ده مش قابل للكتابة. اضبط الصلاحيات على 755 وحاول تاني.', 'This folder is not writable. Set its permissions to 755 and try again.'); }
    if (!$errors && write_site($FILES, $dir, $errors, $written)) {
        if (!is_dir($data) && !@mkdir($data, 0755, true)) { $errors[] = t('تعذّر إنشاء فولدر البيانات.', 'Could not create the data folder.'); }
        else {
            @file_put_contents($data . '/.htaccess', "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
            @file_put_contents($data . '/index.html', '');
            $db = array(
                'users' => array(array('id' => function_exists('random_bytes') ? bin2hex(random_bytes(8)) : md5(uniqid('', true)), 'name' => $nameClean, 'email' => $f['email'], 'role' => 'admin', 'hash' => password_hash($pass, PASSWORD_DEFAULT), 'created' => gmdate('c'))),
                'attempts' => new stdClass(),
                'meta' => array('site' => trim(strip_tags($f['site'])), 'version' => '__VERSION__'),
            );
            $ok = @file_put_contents($data . '/db.php', "<?php http_response_code(404); exit; ?>\n" . json_encode($db, JSON_UNESCAPED_UNICODE), LOCK_EX);
            if ($ok === false) { $errors[] = t('تعذّرت كتابة بيانات الأدمن.', 'Could not write the admin data.'); }
            else {
                @chmod($data . '/db.php', 0600);
                @file_put_contents($data . '/installed.lock', gmdate('c'));
                $done = true;
            }
        }
    }
} elseif ($action === 'update' && $locked) {
    if (!$writable) { $errors[] = t('الفولدر ده مش قابل للكتابة.', 'This folder is not writable.'); }
    elseif (write_site($FILES, $dir, $errors, $written)) { $updated = true; }
} elseif ($action === 'delete') {
    $deleted = @unlink(__FILE__);
    if (!$deleted) { $errors[] = t('تعذّر حذف الملف تلقائيًا. احذف install.php يدويًا من File Manager.', 'Could not delete the installer. Remove install.php manually in File Manager.'); }
}
$siteUrl = './index.html';
$loginUrl = './index.html#/portal/login';
?><!doctype html>
<html lang="<?= $lang ?>" dir="<?= $lang === 'ar' ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Notch Cloud Services | <?= h(t('التثبيت', 'Installer')) ?></title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f4f4f2;color:#0a0a0a;font:16px/1.7 'IBM Plex Sans Arabic',Manrope,system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif}
.box{width:min(560px,100%);background:#fff;border:1px solid #ddddda;border-radius:24px;overflow:hidden}
.top{background:#0a0a0a;color:#fff;padding:28px 32px;border-bottom:10px solid #c8f03c}
.logo{font:600 24px/1 system-ui,sans-serif;letter-spacing:-.02em}.logo i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#c8f03c;margin-inline-start:5px;vertical-align:top}
.sub{font:12px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.14em;color:#ffffffa6;margin-top:8px;direction:ltr;text-align:start}
.in{padding:28px 32px;display:grid;gap:16px}
h1{margin:0;font-size:22px;line-height:1.4}h2{margin:6px 0 0;font-size:16px}p{margin:0;color:#6b6b6b}
ul{list-style:none;margin:0;padding:0;border:1px solid #ddddda;border-radius:16px}li{display:flex;justify-content:space-between;gap:12px;padding:11px 16px;border-bottom:1px solid #ddddda;font-size:14.5px}li:last-child{border:0}
.ok{color:#3f5400;font-weight:600}.bad{color:#b00020;font-weight:600}
.err{background:#fbeaed;color:#b00020;border-radius:14px;padding:12px 16px;font-size:14.5px}
.good{background:#eef4d4;color:#3f5400;border-radius:14px;padding:12px 16px;font-size:14.5px}
.field{display:grid;gap:5px}.field label{font-size:13px;font-weight:600}
input[type=text],input[type=email],input[type=password]{width:100%;height:46px;padding:0 14px;border:1.5px solid #cfcfca;border-radius:14px;font:inherit;font-size:15px;background:#fff;color:#0a0a0a}
input:focus{outline:none;border-color:#0a0a0a;box-shadow:0 0 0 3px #0a0a0a1f}
input.l{direction:ltr;text-align:start}
label.c{display:flex;gap:10px;align-items:center;font-size:14.5px}
.btn{display:inline-flex;justify-content:center;align-items:center;height:48px;padding:0 26px;border-radius:999px;border:1.5px solid #0a0a0a;font:600 15px inherit;font-family:inherit;cursor:pointer;text-decoration:none;color:#fff;background:#0a0a0a}
.btn.v{background:#c8f03c;color:#0a0a0a;border-color:#c8f03c}.btn.g{background:#fff;color:#0a0a0a}.btn:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.lang{font-size:13px;color:#ffffffa6;text-decoration:none;float:<?= $lang === 'ar' ? 'left' : 'right' ?>}
code{font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr;unicode-bidi:isolate;font-size:13px;word-break:break-all}
</style>
</head>
<body>
<div class="box">
  <div class="top"><a class="lang" href="?lang=<?= $lang === 'ar' ? 'en' : 'ar' ?>"><?= $lang === 'ar' ? 'English' : 'عربي' ?></a><div class="logo">Notch<i></i></div><div class="sub">CLOUD SERVICES · INSTALLER</div></div>
  <div class="in">
<?php if ($deleted): ?>
    <h1><?= h(t('تم حذف ملف التثبيت', 'Installer deleted')) ?></h1>
    <div class="good"><?= h(t('الموقع جاهز ومحمي.', 'Your site is ready and the installer is gone.')) ?></div>
    <div class="row"><a class="btn v" href="<?= h($loginUrl) ?>"><?= h(t('تسجيل الدخول', 'Sign in')) ?></a><a class="btn g" href="<?= h($siteUrl) ?>"><?= h(t('افتح الموقع', 'Open the site')) ?></a></div>
<?php elseif ($done || $updated): ?>
    <h1><?= h($done ? t('اتثبّت بنجاح', 'Installed successfully') : t('اتحدّث بنجاح', 'Updated successfully')) ?></h1>
    <div class="good"><?= h(t('تم نسخ ', 'Wrote ')) ?><?= (int) $written ?><?= h(t(' ملف.', ' files.')) ?><?= $done ? ' ' . h(t('وتم إنشاء حساب الأدمن.', 'The admin account was created.')) : ' ' . h(t('بياناتك لم تتغيّر.', 'Your data was not touched.')) ?></div>
    <ul id="chk"></ul>
    <script>
    (function(){
      var ul=document.getElementById('chk'); function row(a,b,ok){var li=document.createElement('li');var x=document.createElement('span');x.textContent=a;var y=document.createElement('span');y.textContent=b;y.className=ok?'ok':'bad';li.appendChild(x);li.appendChild(y);ul.appendChild(li);}
      fetch('./api/index.php?r=status',{cache:'no-store'}).then(function(r){return r.json().then(function(j){row('API',j&&j.installed?'OK':'not installed',!!(j&&j.installed));});}).catch(function(e){row('API',String(e),false);});
      fetch('./index.html',{cache:'no-store'}).then(function(r){return r.text().then(function(html){
        row('index.html',r.status+'',r.ok);
        var urls=[],re=/(?:src|href)="(\.\/assets\/[^"]+)"/g,m;while((m=re.exec(html)))urls.push(m[1]);
        urls.forEach(function(u){fetch(u,{cache:'no-store'}).then(function(rr){var ct=(rr.headers.get('content-type')||'').split(';')[0];var bad=/\.js$/.test(u)&&!/javascript|ecmascript/.test(ct);row(u.replace('./',''),rr.status+' '+ct,rr.ok&&!bad);}).catch(function(e){row(u,String(e),false);});});
        if(!urls.length)row('assets','not found in index.html',false);
      });}).catch(function(e){row('index.html',String(e),false);});
    })();
    </script>
<?php if ($done): ?><p><?= h(t('سجّل الدخول بالإيميل وكلمة السر اللي كتبتهم. لوحة الإدارة على ', 'Sign in with the email and password you chose. The admin panel is at ')) ?><code>#/admin</code></p><?php endif; ?>
    <p><?= h(t('احذف ملف التثبيت دلوقتي عشان الأمان.', 'Delete the installer now, for safety.')) ?></p>
    <form method="post" class="row"><input type="hidden" name="tok" value="<?= h($tok) ?>">
      <a class="btn v" href="<?= h($loginUrl) ?>"><?= h(t('تسجيل الدخول', 'Sign in')) ?></a>
      <button class="btn g" name="action" value="delete" type="submit"><?= h(t('احذف ملف التثبيت', 'Delete installer')) ?></button></form>
<?php elseif ($locked): ?>
    <h1><?= h(t('الموقع مثبّت بالفعل', 'Already installed')) ?></h1>
    <p><?= h(t('حسابات الأدمن موجودة ومحمية. تقدر تحدّث ملفات الموقع من غير ما تتأثر البيانات.', 'The admin accounts exist and are protected. You can update the site files without touching your data.')) ?></p>
<?php foreach ($errors as $e): ?><div class="err"><?= h($e) ?></div><?php endforeach; ?>
    <form method="post" class="row"><input type="hidden" name="tok" value="<?= h($tok) ?>">
      <button class="btn v" name="action" value="update" type="submit" <?= $writable ? '' : 'disabled' ?>><?= h(t('تحديث ملفات الموقع', 'Update site files')) ?></button>
      <button class="btn g" name="action" value="delete" type="submit"><?= h(t('احذف ملف التثبيت', 'Delete installer')) ?></button></form>
<?php else: ?>
    <h1><?= h(t('تثبيت Notch Cloud Services', 'Install Notch Cloud Services')) ?></h1>
    <p><?= h(t('هتنشئ حساب الأدمن وتتنسخ ملفات الموقع في نفس الفولدر. مفيش قاعدة بيانات.', 'You create the admin account and the site files are written into this folder. No database needed.')) ?></p>
<?php foreach ($errors as $e): ?><div class="err"><?= h($e) ?></div><?php endforeach; ?>
    <ul>
      <li><span>PHP</span><span class="<?= ($phpOk && $jsonOk) ? 'ok' : 'bad' ?>"><?= h(PHP_VERSION) ?><?= $phpOk ? '' : ' (7.0+)' ?></span></li>
      <li><span><?= h(t('صلاحية الكتابة', 'Folder writable')) ?></span><span class="<?= $writable ? 'ok' : 'bad' ?>"><?= $writable ? h(t('تمام', 'OK')) : h(t('لا', 'No')) ?></span></li>
      <li><span><?= h(t('الفولدر', 'Folder')) ?></span><code><?= h($dir) ?></code></li>
    </ul>
    <form method="post" style="display:grid;gap:14px" autocomplete="off"><input type="hidden" name="tok" value="<?= h($tok) ?>">
      <h2><?= h(t('حساب الأدمن', 'Admin account')) ?></h2>
      <div class="field"><label for="site"><?= h(t('اسم الشركة (اختياري)', 'Company name (optional)')) ?></label><input id="site" name="site" type="text" value="<?= h($f['site']) ?>"></div>
      <div class="field"><label for="name"><?= h(t('الاسم', 'Name')) ?></label><input id="name" name="name" type="text" required value="<?= h($f['name']) ?>"></div>
      <div class="field"><label for="email"><?= h(t('الإيميل', 'Email')) ?></label><input id="email" name="email" type="email" class="l" required value="<?= h($f['email']) ?>"></div>
      <div class="field"><label for="password"><?= h(t('كلمة السر (8 حروف على الأقل)', 'Password (8+ characters)')) ?></label><input id="password" name="password" type="password" class="l" minlength="8" required></div>
      <div class="field"><label for="password2"><?= h(t('تأكيد كلمة السر', 'Confirm password')) ?></label><input id="password2" name="password2" type="password" class="l" minlength="8" required></div>
<?php if ($exists): ?>
      <div class="err"><?= h(t('فيه index.html موجود في الفولدر ده.', 'An index.html already exists in this folder.')) ?></div>
      <label class="c"><input type="checkbox" name="overwrite" value="1"> <?= h(t('اكتب فوقه', 'Overwrite it')) ?></label>
<?php endif; ?>
      <div class="row"><button class="btn v" name="action" value="install" type="submit" <?= ($phpOk && $jsonOk && $writable) ? '' : 'disabled' ?>><?= h(t('تثبيت', 'Install')) ?></button></div>
    </form>
<?php endif; ?>
  </div>
</div>
</body>
</html>
