import type { Bi } from '../i18n';

/** All prices and numbers below are PLACEHOLDERS. Set to false once real values are in. */
export const SHOW_PLACEHOLDER = true;
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
export const tlds: Tld[] = [
  { ext: '.com', register: 599, renew: 749, popular: true },
  { ext: '.net', register: 649, renew: 799 },
  { ext: '.org', register: 649, renew: 799 },
  { ext: '.co', register: 1099, renew: 1299 },
  { ext: '.io', register: 1899, renew: 2099 },
  { ext: '.eg', register: 899, renew: 899 },
  { ext: '.com.eg', register: 399, renew: 399 },
  { ext: '.online', register: 249, renew: 1399 },
];

export type Plan = { id: string; name: Bi; price: number; featured?: boolean; specs: { label: Bi; value: Bi }[]; features: Bi[] };
const v = (ar: string, en = ar): Bi => ({ ar, en });

export const hostingPlans: Plan[] = [
  { id: 'start', name: v('ستارت', 'Start'), price: 79, specs: [
    { label: v('مساحة', 'Storage'), value: v('10 GB SSD') }, { label: v('مواقع', 'Websites'), value: v('1') }, { label: v('باندويث', 'Bandwidth'), value: v('غير محدود', 'Unmetered') }, { label: v('إيميلات', 'Mailboxes'), value: v('3') },
  ], features: [v('شهادة SSL مجانية', 'Free SSL'), v('نسخ احتياطي أسبوعي', 'Weekly backup'), v('لوحة تحكم سهلة', 'Easy control panel')] },
  { id: 'business', name: v('بيزنس', 'Business'), price: 169, featured: true, specs: [
    { label: v('مساحة', 'Storage'), value: v('50 GB NVMe') }, { label: v('مواقع', 'Websites'), value: v('10') }, { label: v('باندويث', 'Bandwidth'), value: v('غير محدود', 'Unmetered') }, { label: v('إيميلات', 'Mailboxes'), value: v('25') },
  ], features: [v('دومين مجاني أول سنة', 'Free domain, first year'), v('نسخ احتياطي يومي', 'Daily backup'), v('أداء أعلى وكاش', 'Higher performance + cache')] },
  { id: 'pro', name: v('برو', 'Pro'), price: 349, specs: [
    { label: v('مساحة', 'Storage'), value: v('150 GB NVMe') }, { label: v('مواقع', 'Websites'), value: v('غير محدود', 'Unlimited') }, { label: v('باندويث', 'Bandwidth'), value: v('غير محدود', 'Unmetered') }, { label: v('إيميلات', 'Mailboxes'), value: v('100') },
  ], features: [v('أولوية في الدعم', 'Priority support'), v('Staging للمواقع', 'Staging sites'), v('مراقبة 24/7', '24/7 monitoring')] },
];

export const emailPlans: Plan[] = [
  { id: 'mail-basic', name: v('إيميل بيسك', 'Mail Basic'), price: 39, specs: [{ label: v('الصندوق', 'Mailbox'), value: v('5 GB') }, { label: v('الحسابات', 'Accounts'), value: v('1') }], features: [v('حماية من السبام', 'Spam protection'), v('IMAP / POP / Webmail', 'IMAP / POP / Webmail')] },
  { id: 'mail-team', name: v('إيميل تيم', 'Mail Team'), price: 59, featured: true, specs: [{ label: v('الصندوق', 'Mailbox'), value: v('30 GB') }, { label: v('الحسابات', 'Accounts'), value: v('لكل مستخدم', 'Per user') }], features: [v('تقويم وجهات اتصال', 'Calendar + contacts'), v('تطبيقات موبايل', 'Mobile apps'), v('SPF / DKIM / DMARC جاهزين', 'SPF / DKIM / DMARC set up')] },
  { id: 'mail-pro', name: v('إيميل برو', 'Mail Pro'), price: 99, specs: [{ label: v('الصندوق', 'Mailbox'), value: v('100 GB') }, { label: v('الحسابات', 'Accounts'), value: v('لكل مستخدم', 'Per user') }], features: [v('أرشفة وحفظ قانوني', 'Archiving + retention'), v('أمان متقدم', 'Advanced security')] },
];

export const vpsPlans: Plan[] = [
  { id: 'vps-s', name: v('VPS S'), price: 299, specs: [{ label: v('معالج', 'vCPU'), value: v('1 vCPU') }, { label: v('رام', 'RAM'), value: v('2 GB') }, { label: v('تخزين', 'NVMe'), value: v('40 GB') }, { label: v('باندويث', 'Transfer'), value: v('2 TB') }], features: [v('Root كامل', 'Full root'), v('Snapshots', 'Snapshots')] },
  { id: 'vps-m', name: v('VPS M'), price: 599, featured: true, specs: [{ label: v('معالج', 'vCPU'), value: v('2 vCPU') }, { label: v('رام', 'RAM'), value: v('4 GB') }, { label: v('تخزين', 'NVMe'), value: v('80 GB') }, { label: v('باندويث', 'Transfer'), value: v('4 TB') }], features: [v('Root كامل', 'Full root'), v('نسخ احتياطي يومي', 'Daily backup')] },
  { id: 'vps-l', name: v('VPS L'), price: 1199, specs: [{ label: v('معالج', 'vCPU'), value: v('4 vCPU') }, { label: v('رام', 'RAM'), value: v('8 GB') }, { label: v('تخزين', 'NVMe'), value: v('160 GB') }, { label: v('باندويث', 'Transfer'), value: v('8 TB') }], features: [v('Root كامل', 'Full root'), v('IP مخصص', 'Dedicated IP')] },
];

export const sitePackages: Plan[] = [
  { id: 'site-landing', name: v('صفحة هبوط', 'Landing page'), price: 4500, specs: [{ label: v('الصفحات', 'Pages'), value: v('1') }, { label: v('التسليم', 'Delivery'), value: v('7 أيام', '7 days') }], features: [v('تصميم متجاوب', 'Responsive design'), v('نموذج تواصل', 'Contact form'), v('SEO أساسي', 'Basic SEO')] },
  { id: 'site-company', name: v('موقع شركة', 'Company site'), price: 12000, featured: true, specs: [{ label: v('الصفحات', 'Pages'), value: v('حتى 8', 'Up to 8') }, { label: v('التسليم', 'Delivery'), value: v('3 أسابيع', '3 weeks') }], features: [v('لوحة تحكم للمحتوى', 'Content CMS'), v('عربي + English', 'Arabic + English'), v('استضافة سنة', '1 year hosting')] },
  { id: 'site-store', name: v('متجر إلكتروني', 'Online store'), price: 24000, specs: [{ label: v('المنتجات', 'Products'), value: v('غير محدود', 'Unlimited') }, { label: v('التسليم', 'Delivery'), value: v('5 أسابيع', '5 weeks') }], features: [v('بوابات دفع وشحن', 'Payments + shipping'), v('إدارة مخزون', 'Inventory'), v('تدريب الفريق', 'Team training')] },
];

export const stats: { value: string; label: Bi }[] = [
  { value: '99.9%', label: { ar: 'Uptime', en: 'Uptime' } },
  { value: '1,200+', label: { ar: 'عميل', en: 'Clients' } },
  { value: '< 15m', label: { ar: 'زمن رد الدعم', en: 'Support response' } },
  { value: '24/7', label: { ar: 'مراقبة', en: 'Monitoring' } },
];

export const steps: { title: Bi; text: Bi }[] = [
  { title: { ar: 'اختار الخدمة', en: 'Pick a service' }, text: { ar: 'دومين، إيميل، موقع أو سيرفر. أو باقة كاملة.', en: 'Domain, email, site or server. Or the full bundle.' } },
  { title: { ar: 'إحنا نجهّزها', en: 'We set it up' }, text: { ar: 'نربط الدومين، نظبط DNS والإيميلات ونشغّل الاستضافة.', en: 'We connect the domain, set DNS and mailboxes and launch hosting.' } },
  { title: { ar: 'تبدأ شغل', en: 'You go live' }, text: { ar: 'تدير كل حاجة من لوحة واحدة، والدعم معاك.', en: 'Manage everything from one panel, with support on call.' } },
];

export const bundle = {
  title: { ar: 'باقة الشركة الكاملة', en: 'The complete company bundle' } as Bi,
  text: { ar: 'دومين + إيميلات للفريق + موقع + استضافة، بفاتورة واحدة وتجديد واحد.', en: 'Domain + team email + website + hosting, on one invoice and one renewal.' } as Bi,
  price: 15900,
  items: [{ ar: 'دومين .com', en: '.com domain' }, { ar: '10 إيميلات', en: '10 mailboxes' }, { ar: 'موقع شركة', en: 'Company site' }, { ar: 'استضافة بيزنس', en: 'Business hosting' }] as Bi[],
};

export const faqs: { q: Bi; a: Bi }[] = [
  { q: { ar: 'أقدر أنقل دومين عندي لنوتش كلاود؟', en: 'Can I transfer my existing domain?' }, a: { ar: 'أيوه، بنساعدك في النقل بدون توقف في الموقع أو الإيميلات.', en: 'Yes. We handle the transfer with no downtime for your site or email.' } },
  { q: { ar: 'الأسعار شاملة الضريبة؟', en: 'Do prices include tax?' }, a: { ar: 'الأسعار المعروضة هي سعر الخدمة، وأي ضرائب مطبّقة بتظهر في الفاتورة.', en: 'Listed prices are the price of the service; any applicable tax is shown on the invoice.' } },
  { q: { ar: 'إيه طرق الدفع؟', en: 'How can I pay?' }, a: { ar: 'كروت بنكية، InstaPay، محافظ إلكترونية وتحويل بنكي للشركات.', en: 'Bank cards, InstaPay, e-wallets and bank transfer for companies.' } },
  { q: { ar: 'فيه نسخ احتياطي؟', en: 'Are backups included?' }, a: { ar: 'نسخ يومية على خطط الاستضافة من بيزنس وأعلى، واسترجاع بضغطة.', en: 'Daily backups on Business hosting and above, with one-click restore.' } },
  { q: { ar: 'الدعم بيشتغل إمتى؟', en: 'When is support available?' }, a: { ar: 'الدعم الفني والمراقبة 24/7 على كل الخدمات.', en: 'Technical support and monitoring are available 24/7 on all services.' } },
];
