import type { Bi } from '../i18n';

/** All prices and numbers below are PLACEHOLDERS. Set to false once real values are in. */
export const CURRENCY: Bi = { ar: 'ج.م', en: 'EGP' };

export type ServiceKey = 'domains' | 'email' | 'websites' | 'hosting' | 'vps' | 'cloud';
export type Service = { key: ServiceKey; path: string; title: Bi; text: Bi; spec: Bi };

export const services: Service[] = [
  { key: 'domains', path: '/domains', title: { ar: 'الدومينات', en: 'Domains' }, text: { ar: 'سجّل اسم براندك على .com و .net و .eg وغيرهم، مع إدارة DNS كاملة.', en: 'Register your brand on .com, .net, .eg and more, with full DNS control.' }, spec: { ar: 'DNS · WHOIS · تجديد تلقائي', en: 'DNS · WHOIS · AUTO-RENEW' } },
  { key: 'email', path: '/email', title: { ar: 'إيميلات الأعمال', en: 'Business email' }, text: { ar: 'إيميلات باسم شركتك، مع حماية من السبام وتطبيقات موبايل.', en: 'Email on your own domain, with spam protection and mobile apps.' }, spec: { ar: 'IMAP · SPF · DKIM', en: 'IMAP · SPF · DKIM' } },
  { key: 'websites', path: '/websites', title: { ar: 'تصميم المواقع', en: 'Web design' }, text: { ar: 'مواقع شركات ومتاجر بتصميم سريع ومتجاوب، تسلّمها جاهزة.', en: 'Company sites and stores, fast and responsive, delivered ready to launch.' }, spec: { ar: 'RESPONSIVE · SEO · CMS', en: 'RESPONSIVE · SEO · CMS' } },
  { key: 'hosting', path: '/hosting', title: { ar: 'الاستضافة', en: 'Hosting' }, text: { ar: 'استضافة سريعة على SSD مع شهادة SSL ونسخ احتياطي يومي.', en: 'Fast SSD hosting with SSL and daily backups included.' }, spec: { ar: 'SSD · SSL · DAILY BACKUP', en: 'SSD · SSL · DAILY BACKUP' } },
  { key: 'vps', path: '/cloud', title: { ar: 'سيرفرات VPS', en: 'VPS servers' }, text: { ar: 'سيرفرات افتراضية بصلاحيات root كاملة وتشغيل في دقائق.', en: 'Virtual servers with full root access, ready in minutes.' }, spec: { ar: 'VCPU · RAM · NVME', en: 'VCPU · RAM · NVME' } },
  { key: 'cloud', path: '/cloud', title: { ar: 'كلاود وباك أب', en: 'Cloud & backup' }, text: { ar: 'تخزين سحابي ونسخ احتياطي ومراقبة لبنيتك كلها.', en: 'Cloud storage, backups and monitoring for your whole stack.' }, spec: { ar: 'S3 · SNAPSHOTS · MONITORING', en: 'S3 · SNAPSHOTS · MONITORING' } },
];

export type Tld = { ext: string; register: number; renew: number; popular?: boolean };

export type Plan = { id: string; name: Bi; price: number; featured?: boolean; specs: { label: Bi; value: Bi }[]; features: Bi[] };

export const steps: { title: Bi; text: Bi }[] = [
  { title: { ar: 'اختار الخدمة', en: 'Pick a service' }, text: { ar: 'دومين، إيميل، موقع أو سيرفر. أو باقة كاملة.', en: 'Domain, email, site or server. Or the full bundle.' } },
  { title: { ar: 'إحنا نجهّزها', en: 'We set it up' }, text: { ar: 'نربط الدومين، نظبط DNS والإيميلات ونشغّل الاستضافة.', en: 'We connect the domain, set DNS and mailboxes and launch hosting.' } },
  { title: { ar: 'تبدأ شغل', en: 'You go live' }, text: { ar: 'تدير كل حاجة من لوحة واحدة، والدعم معاك.', en: 'Manage everything from one panel, with support on call.' } },
];

export const faqs: { q: Bi; a: Bi }[] = [
  { q: { ar: 'أقدر أنقل دومين عندي لنوتش كلاود؟', en: 'Can I transfer my existing domain?' }, a: { ar: 'أيوه، بنساعدك في النقل بدون توقف في الموقع أو الإيميلات.', en: 'Yes. We handle the transfer with no downtime for your site or email.' } },
  { q: { ar: 'الأسعار شاملة الضريبة؟', en: 'Do prices include tax?' }, a: { ar: 'الأسعار المعروضة هي سعر الخدمة، وأي ضرائب مطبّقة بتظهر في الفاتورة.', en: 'Listed prices are the price of the service; any applicable tax is shown on the invoice.' } },
  { q: { ar: 'إيه طرق الدفع؟', en: 'How can I pay?' }, a: { ar: 'كروت بنكية، InstaPay، محافظ إلكترونية وتحويل بنكي للشركات.', en: 'Bank cards, InstaPay, e-wallets and bank transfer for companies.' } },
  { q: { ar: 'فيه نسخ احتياطي؟', en: 'Are backups included?' }, a: { ar: 'نسخ يومية على خطط الاستضافة من بيزنس وأعلى، واسترجاع بضغطة.', en: 'Daily backups on Business hosting and above, with one-click restore.' } },
  { q: { ar: 'الدعم بيشتغل إمتى؟', en: 'When is support available?' }, a: { ar: 'الدعم الفني والمراقبة 24/7 على كل الخدمات.', en: 'Technical support and monitoring are available 24/7 on all services.' } },
];
