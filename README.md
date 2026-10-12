# Notch Cloud Services

موقع تسويقي + لوحة عميل لشركة **Notch Cloud Services** (دومينات، إيميلات، تصميم مواقع، استضافة، VPS وكلاود)، بنفس نظام تصميم Notch Brand Guidelines v1.0، عربي (RTL) + English.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm run build
```

## المحتوى
- **الموقع:** `/` الرئيسية، `/domains`، `/email`، `/websites`، `/hosting`، `/cloud`، `/pricing`، `/status`، `/contact`
- **لوحة العميل:** `/portal` (نظرة عامة، دومينات + DNS، إيميلات، استضافة، سيرفرات، فواتير، دعم). الدخول تجريبي: أي بيانات بتدخل.

## كل الأرقام تجريبية
الأسعار والإحصائيات في `src/data/content.ts`، وبيانات اللوحة في `src/portal/data.ts`، وكلها placeholder وعليها علامة "تجريبي".
لما الأرقام الحقيقية تجهز: عدّلها وخلي `SHOW_PLACEHOLDER = false` في `src/data/content.ts` تختفي العلامات.
بحث الدومين نتائجه تجريبية ومحتاج ربط بـ registrar API.

## نظام التصميم
- `src/brand/tokens.css`: الألوان والخطوط والـ utilities (Black / Volt / Graphite / Slate / Fog / Paper / Olive).
- الأبيض والأسود هما الأساس، وVolt لمسة واحدة (زرار البحث، الكلمة المميزة، نقطة الحالة)، والنص فوق Volt أسود دايمًا.
- Unbounded للعناوين، Manrope للنص، JetBrains Mono للمواصفات. في العربي IBM Plex Sans Arabic بدون letter-spacing.
- أي نص تقني (دومين، IP، DNS) بيتعرض LTR بخط Mono حتى جوه العربي (`<Ltr>`).
- `src/i18n.tsx`: اللغة في localStorage وبتغيّر `lang` و`dir` على `<html>`؛ النصوص بـ `t('عربي', 'English')`.
