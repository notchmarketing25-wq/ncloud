# التثبيت خطوة بخطوة

## الطريقة السهلة: ملف واحد `install.php` (أي استضافة فيها PHP)
1. نزّل الملف **`release/install.php`** من الريبو (زرار Download raw file في GitHub).
2. من لوحة الاستضافة افتح **File Manager ← `public_html`** (أو فولدر فرعي لو عايز الموقع في مسار زي `/shop`).
3. ارفع `install.php` هناك.
4. افتح في المتصفح: `https://your-domain.com/install.php`
5. اضغط **تثبيت**. هتتنسخ ملفات الموقع في نفس الفولدر (مفيش قاعدة بيانات، ولا فك ضغط).
6. اضغط **افتح الموقع**، وبعدها **احذف ملف التثبيت** (للأمان).

بيشتغل على أي استضافة بـ PHP 5.4 أو أحدث (Hostinger، cPanel، Plesk، DirectAdmin...) وفي أي فولدر، ومن غير أي إعدادات للسيرفر. الروابط بتكون بالشكل `your-domain.com/#/hosting`.

لو الفولدر فيه موقع قديم، الـ installer هيسألك تعلّم على "اكتب فوقه".

## استضافة من غير PHP (Static فقط)
1. نزّل **`release/ncloud-site.zip`**.
2. ارفعه في `public_html` واعمل **Extract** من File Manager.
3. افتح الدومين.

## تشغيل للتجربة على جهازك
1. ثبّت **Node.js** (نسخة LTS) من nodejs.org.
2. داخل فولدر المشروع:
   ```bash
   npm install
   npm run dev
   ```
3. افتح `http://localhost:5173`. لوحة العميل على `/portal` (أي بيانات بتدخلك).

**ماتفتحش `index.html` بالضغط المزدوج:** المتصفح بيمنع تشغيله من `file://` وتطلع صفحة بيضا.

## بناء نسخة جديدة بعد أي تعديل (للمطوّر)
```bash
npm install
npm run package     # بيبني الموقع ويولّد release/install.php و release/ncloud-site.zip
```
ارفع `release/install.php` الجديد زي ما فوق (مع "اكتب فوقه").

### روابط نظيفة (`/hosting` بدل `/#/hosting`) - اختياري
على جذر الدومين ومع Apache/LiteSpeed فقط:
```bash
npm run build:clean
```
وارفع محتوى `dist` كله (فيه `.htaccess` المخفي). الـ installer مش بيستخدم الوضع ده.

## ملاحظات
- كل الأسعار والأرقام تجريبية (`src/data/content.ts`، وخلي `SHOW_PLACEHOLDER = false` لإخفاء العلامات).
- بيانات لوحة العميل وهمية وبتتخزن في المتصفح فقط.
- لو ظهرت "الفولدر مش قابل للكتابة": خلّي صلاحيات الفولدر 755 من File Manager.
