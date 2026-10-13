<?php
/**
 * Notch Cloud Services: one-file installer (v__VERSION__).
 * Upload this single file to any PHP hosting, open it in the browser, press Install. No database, no unzip.
 * It writes the website next to itself and can delete itself afterwards.
 */
$FILES = array(
__FILES__
);

if (!headers_sent()) { header('Content-Type: text/html; charset=utf-8'); header('X-Robots-Tag: noindex'); }
$lang = (isset($_GET['lang']) && $_GET['lang'] === 'en') ? 'en' : 'ar';
function t($ar, $en) { global $lang; return $lang === 'ar' ? $ar : $en; }
function h($s) { return htmlspecialchars($s, ENT_QUOTES, 'UTF-8'); }

@session_start();
if (empty($_SESSION['nt_tok'])) {
    $_SESSION['nt_tok'] = function_exists('random_bytes') ? bin2hex(random_bytes(16)) : md5(uniqid('', true) . mt_rand());
}
$tok = $_SESSION['nt_tok'];
$sessionOk = isset($_SESSION['nt_tok']);

$dir = __DIR__;
$exists = file_exists($dir . '/index.html');
$phpOk = version_compare(PHP_VERSION, '5.4.0', '>=');
$writable = is_writable($dir);
$action = isset($_POST['action']) ? $_POST['action'] : '';
$tokenOk = !$sessionOk || (isset($_POST['tok']) && hash_equals($tok, (string) $_POST['tok']));
$errors = array();
$done = false;
$deleted = false;
$written = 0;

if ($action !== '' && !$tokenOk) {
    $errors[] = t('انتهت الجلسة، حدّث الصفحة وحاول تاني.', 'Session expired, reload the page and try again.');
} elseif ($action === 'install') {
    if ($exists && empty($_POST['overwrite'])) {
        $errors[] = t('فيه موقع موجود في الفولدر ده. علّم على "اكتب فوقه" لو عايز تستبدله.', 'A site already exists in this folder. Tick "overwrite" to replace it.');
    } elseif (!$writable) {
        $errors[] = t('الفولدر ده مش قابل للكتابة. اضبط الصلاحيات على 755 وحاول تاني.', 'This folder is not writable. Set its permissions to 755 and try again.');
    } else {
        foreach ($FILES as $path => $b64) {
            if ($path === '' || $path[0] === '/' || strpos($path, '..') !== false) { continue; }
            $target = $dir . '/' . $path;
            $d = dirname($target);
            if (!is_dir($d) && !@mkdir($d, 0755, true)) { $errors[] = t('تعذّر إنشاء الفولدر: ', 'Could not create folder: ') . $path; break; }
            if (@file_put_contents($target, base64_decode($b64)) === false) { $errors[] = t('تعذّرت كتابة الملف: ', 'Could not write file: ') . $path; break; }
            $written++;
        }
        $done = !$errors;
    }
} elseif ($action === 'delete') {
    $deleted = @unlink(__FILE__);
    if (!$deleted) { $errors[] = t('تعذّر حذف الملف تلقائيًا. احذف install.php يدويًا من File Manager.', 'Could not delete the installer. Remove install.php manually in File Manager.'); }
}
$self = basename(__FILE__);
$siteUrl = './index.html';
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
h1{margin:0;font-size:22px;line-height:1.4}p{margin:0;color:#6b6b6b}
ul{list-style:none;margin:0;padding:0;border:1px solid #ddddda;border-radius:16px}li{display:flex;justify-content:space-between;gap:12px;padding:11px 16px;border-bottom:1px solid #ddddda;font-size:14.5px}li:last-child{border:0}
.ok{color:#3f5400;font-weight:600}.bad{color:#b00020;font-weight:600}
.err{background:#fbeaed;color:#b00020;border-radius:14px;padding:12px 16px;font-size:14.5px}
.good{background:#eef4d4;color:#3f5400;border-radius:14px;padding:12px 16px;font-size:14.5px}
label{display:flex;gap:10px;align-items:center;font-size:14.5px}
.btn{display:inline-flex;justify-content:center;align-items:center;height:48px;padding:0 26px;border-radius:999px;border:1.5px solid #0a0a0a;font:600 15px inherit;font-family:inherit;cursor:pointer;text-decoration:none;color:#fff;background:#0a0a0a}
.btn.v{background:#c8f03c;color:#0a0a0a;border-color:#c8f03c}.btn.g{background:#fff;color:#0a0a0a}.btn:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:10px;flex-wrap:wrap}.lang{font-size:13px;color:#ffffffa6;text-decoration:none;float:<?= $lang === 'ar' ? 'left' : 'right' ?>}
code{font-family:ui-monospace,Menlo,Consolas,monospace;direction:ltr;unicode-bidi:isolate;font-size:13px}
</style>
</head>
<body>
<div class="box">
  <div class="top"><a class="lang" href="?lang=<?= $lang === 'ar' ? 'en' : 'ar' ?>"><?= $lang === 'ar' ? 'English' : 'عربي' ?></a><div class="logo">Notch<i></i></div><div class="sub">CLOUD SERVICES · INSTALLER</div></div>
  <div class="in">
<?php if ($deleted): ?>
    <h1><?= h(t('تم حذف ملف التثبيت', 'Installer deleted')) ?></h1>
    <div class="good"><?= h(t('الموقع جاهز ومحمي.', 'Your site is ready and the installer is gone.')) ?></div>
    <div class="row"><a class="btn v" href="<?= h($siteUrl) ?>"><?= h(t('افتح الموقع', 'Open the site')) ?></a></div>
<?php elseif ($done): ?>
    <h1><?= h(t('اتثبّت بنجاح', 'Installed successfully')) ?></h1>
    <div class="good"><?= h(t('تم نسخ ', 'Wrote ')) ?><?= (int) $written ?><?= h(t(' ملف.', ' files.')) ?></div>
    <ul id="chk"><li><span><?= h(t('فحص الملفات...', 'Checking files...')) ?></span><span>…</span></li></ul>
    <script>
    (function(){
      var ul=document.getElementById('chk'); function row(a,b,ok){var li=document.createElement('li');var x=document.createElement('span');x.textContent=a;var y=document.createElement('span');y.textContent=b;y.className=ok?'ok':'bad';li.appendChild(x);li.appendChild(y);ul.appendChild(li);}
      ul.innerHTML='';
      fetch('./index.html',{cache:'no-store'}).then(function(r){return r.text().then(function(html){
        row('index.html',r.status+'',r.ok);
        var urls=[],re=/(?:src|href)="(\.\/assets\/[^"]+)"/g,m;while((m=re.exec(html)))urls.push(m[1]);
        urls.forEach(function(u){fetch(u,{cache:'no-store'}).then(function(rr){var ct=(rr.headers.get('content-type')||'').split(';')[0];var bad=/\.js$/.test(u)&&!/javascript|ecmascript/.test(ct);row(u.replace('./',''),rr.status+' '+ct,rr.ok&&!bad);}).catch(function(e){row(u,String(e),false);});});
        if(!urls.length)row('assets','not found in index.html',false);
      });}).catch(function(e){row('index.html',String(e),false);});
    })();
    </script>
    <p><?= h(t('احذف ملف التثبيت دلوقتي عشان الأمان.', 'Delete the installer now, for safety.')) ?></p>
    <form method="post" class="row"><input type="hidden" name="tok" value="<?= h($tok) ?>">
      <a class="btn v" href="<?= h($siteUrl) ?>"><?= h(t('افتح الموقع', 'Open the site')) ?></a>
      <button class="btn g" name="action" value="delete" type="submit"><?= h(t('احذف ملف التثبيت', 'Delete installer')) ?></button></form>
<?php else: ?>
    <h1><?= h(t('تثبيت Notch Cloud Services', 'Install Notch Cloud Services')) ?></h1>
    <p><?= h(t('هيتم نسخ ملفات الموقع في نفس الفولدر. مفيش قاعدة بيانات.', 'The site files are written into this folder. No database needed.')) ?></p>
<?php foreach ($errors as $e): ?><div class="err"><?= h($e) ?></div><?php endforeach; ?>
    <ul>
      <li><span>PHP</span><span class="<?= $phpOk ? 'ok' : 'bad' ?>"><?= h(PHP_VERSION) ?></span></li>
      <li><span><?= h(t('صلاحية الكتابة', 'Folder writable')) ?></span><span class="<?= $writable ? 'ok' : 'bad' ?>"><?= $writable ? h(t('تمام', 'OK')) : h(t('لا', 'No')) ?></span></li>
      <li><span><?= h(t('الفولدر', 'Folder')) ?></span><code><?= h($dir) ?></code></li>
      <li><span><?= h(t('الإصدار', 'Version')) ?></span><code>__VERSION__</code></li>
    </ul>
    <form method="post" style="display:grid;gap:14px"><input type="hidden" name="tok" value="<?= h($tok) ?>">
<?php if ($exists): ?>
      <div class="err"><?= h(t('فيه index.html موجود في الفولدر ده.', 'An index.html already exists in this folder.')) ?></div>
      <label><input type="checkbox" name="overwrite" value="1"> <?= h(t('اكتب فوقه', 'Overwrite it')) ?></label>
<?php endif; ?>
      <div class="row"><button class="btn v" name="action" value="install" type="submit" <?= ($phpOk && $writable) ? '' : 'disabled' ?>><?= h(t('تثبيت', 'Install')) ?></button></div>
    </form>
<?php endif; ?>
  </div>
</div>
</body>
</html>
