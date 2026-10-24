import { ApiError } from '../lib/api';

const map: Record<string, [string, string]> = {
  'this email is already registered': ['الإيميل ده مسجّل قبل كده.', 'This email is already registered.'],
  'invalid email': ['الإيميل غير صحيح.', 'Invalid email.'],
  'name is required': ['الاسم مطلوب.', 'Name is required.'],
  'password must be at least 8 characters': ['كلمة السر لازم تكون 8 حروف على الأقل.', 'Password must be at least 8 characters.'],
  'there must be at least one admin': ['لازم يفضل أدمن واحد على الأقل.', 'There must be at least one admin.'],
  'you cannot delete your own account': ['ماينفعش تحذف حسابك.', 'You cannot delete your own account.'],
  'current password is wrong': ['كلمة السر الحالية غلط.', 'Current password is wrong.'],
  'choose a client': ['اختر العميل.', 'Choose a client.'],
  'item not found': ['العنصر مش موجود.', 'Item not found.'],
  'server is still being set up': ['السيرفر لسه قيد التجهيز.', 'The server is still being set up.'],
  'DNS management is turned off for this domain': ['إدارة الـ DNS مقفولة للدومين ده.', 'DNS management is turned off for this domain.'],
  'POST required': ['الطلب غير صحيح.', 'Invalid request.'],
  'a domain is required for this service': ['لازم تحدد دومين للخدمة دي.', 'A domain is required for this service.'],
  'add at least one item': ['ضيف بند واحد على الأقل.', 'Add at least one item.'],
  'add at least one recipient': ['ضيف مستلم واحد على الأقل.', 'Add at least one recipient.'],
  'add the new domain to the cart first': ['ضيف الدومين الجديد للسلة الأول.', 'Add the new domain to the cart first.'],
  'add the transfer to the cart first': ['ضيف النقل للسلة الأول.', 'Add the transfer to the cart first.'],
  'attachment not found': ['المرفق مش موجود.', 'Attachment not found.'],
  'attachment upload failed (too large?)': ['فشل رفع المرفق (يمكن حجمه كبير).', 'Attachment upload failed (too large?).'],
  'attachments are limited to 8 MB in total': ['المرفقات لازم متعدّيش 8 ميجا إجمالًا.', 'Attachments are limited to 8 MB in total.'],
  'backup not found': ['النسخة الاحتياطية مش موجودة.', 'Backup not found.'],
  'bad request': ['الطلب غير صحيح.', 'Bad request.'],
  'cannot renew this': ['مينفعش تجديد ده.', 'This cannot be renewed.'],
  'cart is empty': ['السلة فاضية.', 'The cart is empty.'],
  'changes are turned off for this domain — contact support': ['التعديل مقفول للدومين ده، كلّم الدعم.', 'Changes are turned off for this domain — contact support.'],
  'choose a payment method': ['اختار وسيلة الدفع.', 'Choose a payment method.'],
  'choose a provider': ['اختار المزوّد.', 'Choose a provider.'],
  'choose how you get the domain': ['اختار إزاي هتحصل على الدومين.', 'Choose how you get the domain.'],
  'client not found': ['العميل مش موجود.', 'Client not found.'],
  'confirmation required': ['لازم التأكيد.', 'Confirmation required.'],
  'could not save data': ['تعذّر حفظ البيانات.', 'Could not save the data.'],
  'could not save the image': ['تعذّر حفظ الصورة.', 'Could not save the image.'],
  'daily sending limit reached for this mailbox': ['وصلت للحد اليومي للإرسال من الصندوق ده.', 'Daily sending limit reached for this mailbox.'],
  'describe the fee and enter an amount': ['اكتب وصف الرسوم والمبلغ.', 'Describe the fee and enter an amount.'],
  'domain not found': ['الدومين مش موجود.', 'Domain not found.'],
  'enter a domain name to search': ['اكتب اسم الدومين للبحث.', 'Enter a domain name to search.'],
  'enter a valid IP address to point the domain to': ['اكتب عنوان IP صحيح للتوجيه.', 'Enter a valid IP address to point the domain to.'],
  'enter a valid host name to point the domain to': ['اكتب اسم مضيف صحيح للتوجيه.', 'Enter a valid host name to point the domain to.'],
  'enter an amount': ['اكتب المبلغ.', 'Enter an amount.'],
  'enter an amount (negative removes credit)': ['اكتب المبلغ (السالب بيخصم من الرصيد).', 'Enter an amount (negative removes credit).'],
  'enter the company name': ['اكتب اسم الشركة.', 'Enter the company name.'],
  'enter the payment reference': ['اكتب مرجع الدفع.', 'Enter the payment reference.'],
  'enter the transfer (EPP) code': ['اكتب كود النقل (EPP).', 'Enter the transfer (EPP) code.'],
  'forbidden': ['غير مسموح.', 'Not allowed.'],
  'hosting not found': ['الاستضافة مش موجودة.', 'Hosting not found.'],
  'invalid action': ['إجراء غير صحيح.', 'Invalid action.'],
  'invalid color': ['لون غير صحيح.', 'Invalid color.'],
  'invalid domain name': ['اسم دومين غير صحيح.', 'Invalid domain name.'],
  'invalid image': ['صورة غير صالحة.', 'Invalid image.'],
  'invalid record type': ['نوع سجل غير صحيح.', 'Invalid record type.'],
  'invalid sender address': ['عنوان المرسل غير صحيح.', 'Invalid sender address.'],
  'invalid site address (like https://example.com)': ['عنوان الموقع غير صحيح (مثل https://example.com).', 'Invalid site address (like https://example.com).'],
  'invalid status': ['حالة غير صحيحة.', 'Invalid status.'],
  'invalid tax rate': ['نسبة ضريبة غير صحيحة.', 'Invalid tax rate.'],
  'invalid webmail url': ['رابط الويب ميل غير صحيح.', 'Invalid webmail URL.'],
  'invoice not found': ['الفاتورة مش موجودة.', 'Invoice not found.'],
  'lead not found': ['الطلب مش موجود.', 'Request not found.'],
  'mailbox not connected': ['الصندوق مش متوصّل.', 'Mailbox not connected.'],
  'mailbox not found': ['الصندوق مش موجود.', 'Mailbox not found.'],
  'message is required': ['اكتب الرسالة.', 'Message is required.'],
  'new sign-ups are closed': ['التسجيل الجديد مقفول حاليًا.', 'New sign-ups are closed.'],
  'no extensions are enabled for sale yet — choose them in TLD pricing': ['مفيش امتدادات متاحة للبيع لسه. اختارها من أسعار الدومينات.', 'No extensions are enabled for sale yet — choose them in TLD pricing.'],
  'no file': ['مفيش ملف.', 'No file.'],
  'no file received': ['الملف ماوصلش.', 'No file received.'],
  'no password saved for this mailbox': ['مفيش كلمة سر محفوظة للصندوق ده.', 'No password saved for this mailbox.'],
  'no provider prices yet — connect a provider in Apps first': ['مفيش أسعار من مزوّد لسه. اربط مزوّد من التطبيقات الأول.', 'No provider prices yet — connect a provider in Apps first.'],
  'not configured': ['مش متضبط.', 'Not configured.'],
  'not signed in': ['لازم تسجّل دخول.', 'Not signed in.'],
  'order not found or already processed': ['الطلب مش موجود أو اتعالج قبل كده.', 'Order not found or already processed.'],
  'password too long': ['كلمة السر طويلة قوي.', 'Password too long.'],
  'plan not found': ['الباقة مش موجودة.', 'Plan not found.'],
  'quote not found': ['عرض السعر مش موجود.', 'Quote not found.'],
  'request too large': ['الطلب كبير قوي.', 'Request too large.'],
  'select at least one item': ['اختار عنصر واحد على الأقل.', 'Select at least one item.'],
  'server not found': ['السيرفر مش موجود.', 'Server not found.'],
  'service not found': ['الخدمة مش موجودة.', 'Service not found.'],
  'set the site address in Settings first': ['حدد عنوان الموقع من الإعدادات الأول.', 'Set the site address in Settings first.'],
  'set the site address in Settings → Store & tax first': ['حدد عنوان الموقع من الإعدادات ← المتجر والضريبة الأول.', 'Set the site address in Settings → Store & tax first.'],
  'start the setup first': ['ابدأ الإعداد الأول.', 'Start the setup first.'],
  'storage busy': ['التخزين مشغول، حاول تاني.', 'Storage is busy, try again.'],
  'subject and message are required': ['اكتب العنوان والرسالة.', 'Subject and message are required.'],
  'subject is required': ['اكتب العنوان.', 'Subject is required.'],
  'terms': ['لازم توافق على الشروط والأحكام.', 'You must accept the terms and conditions.'],
  'the API address must start with https://': ['عنوان الـ API لازم يبدأ بـ https://', 'The API address must start with https://'],
  'the domain has no client': ['الدومين ده مش تابع لعميل.', 'The domain has no client.'],
  'the image is larger than 1.5 MB': ['الصورة أكبر من 1.5 ميجا.', 'The image is larger than 1.5 MB.'],
  'the invoice has no client': ['الفاتورة مش تابعة لعميل.', 'The invoice has no client.'],
  'the quote has no client': ['عرض السعر مش تابع لعميل.', 'The quote has no client.'],
  'this account is suspended, contact us': ['الحساب موقوف، كلّمنا.', 'This account is suspended, contact us.'],
  'this domain already exists in the system': ['الدومين ده موجود في النظام بالفعل.', 'This domain already exists in the system.'],
  'this domain has no provider — choose one in the domain details first': ['الدومين ده من غير مزوّد. اختار مزوّد من تفاصيل الدومين الأول.', 'This domain has no provider — choose one in the domain details first.'],
  'this domain is not in your account': ['الدومين ده مش في حسابك.', 'This domain is not in your account.'],
  'this extension is not for sale': ['الامتداد ده مش متاح للبيع.', 'This extension is not for sale.'],
  'this link is invalid or expired': ['الرابط غير صالح أو انتهت صلاحيته.', 'This link is invalid or expired.'],
  'this payment method is not an online gateway': ['وسيلة الدفع دي مش بوابة أونلاين.', 'This payment method is not an online gateway.'],
  'this provider cannot start transfers here': ['المزوّد ده مبيدعمش بدء النقل من هنا.', 'This provider cannot start transfers here.'],
  'this provider has no hosting API': ['المزوّد ده ملوش API للاستضافة.', 'This provider has no hosting API.'],
  'this service has no renewal price, contact us': ['الخدمة دي ملهاش سعر تجديد، كلّمنا.', 'This service has no renewal price, contact us.'],
  'ticket not found': ['التذكرة مش موجودة.', 'Ticket not found.'],
  'too many attempts, try again in 10 minutes': ['محاولات كتير. جرّب بعد 10 دقايق.', 'Too many attempts, try again in 10 minutes.'],
  'too many attempts, try again later': ['محاولات كتير. جرّب بعدين.', 'Too many attempts, try again later.'],
  'too many attempts, try later': ['محاولات كتير. جرّب بعدين.', 'Too many attempts, try later.'],
  'too many changes, try again later': ['تعديلات كتير. جرّب بعدين.', 'Too many changes, try again later.'],
  'too many messages, try later': ['رسايل كتير. جرّب بعدين.', 'Too many messages, try later.'],
  'too many recipients': ['مستلمين كتير.', 'Too many recipients.'],
  'too many requests, try again later': ['طلبات كتير. جرّب بعدين.', 'Too many requests, try again later.'],
  'too many searches, try later': ['عمليات بحث كتير. جرّب بعدين.', 'Too many searches, try later.'],
  'two-factor code required': ['اكتب كود التحقق بخطوتين.', 'Enter your two-factor code.'],
  'two-factor is already on': ['التحقق بخطوتين شغّال بالفعل.', 'Two-factor is already on.'],
  'type RESTORE to confirm': ['اكتب RESTORE للتأكيد.', 'Type RESTORE to confirm.'],
  'user not found': ['المستخدم مش موجود.', 'User not found.'],
  'value is required': ['القيمة مطلوبة.', 'Value is required.'],
  'write a subject and a message': ['اكتب العنوان والرسالة.', 'Write a subject and a message.'],
  'wrong email or password': ['الإيميل أو كلمة السر غلط.', 'Wrong email or password.'],
  'wrong two-factor code': ['كود التحقق غلط.', 'Wrong two-factor code.'],
  'you cannot suspend your own account': ['ماينفعش توقف حسابك.', 'You cannot suspend your own account.'],
  'you must accept the terms and conditions': ['لازم توافق على الشروط والأحكام.', 'You must accept the terms and conditions.'],
  'too many records': ['عدد السجلات وصل للحد الأقصى.', 'Record limit reached.'],
};

/** Turn an API error into a friendly message in the current language. */
export function errText(e: unknown, t: (ar: string, en: string) => string): string {
  const m = e instanceof ApiError ? e.message : '';
  const hit = map[m];
  if (hit) return t(hit[0], hit[1]);
  if (m.startsWith('domain is no longer available')) return t('الدومين اتحجز قبل كده. اختار غيره.', 'That domain is no longer available. Pick another.');
  if (m.startsWith('enter the transfer (EPP) code for')) return t('اكتب كود النقل (EPP) للدومين.', 'Enter the transfer (EPP) code for the domain.');
  if (m.startsWith('database error')) return t('حصل خطأ في قاعدة البيانات.', 'Database error.');
  if (/ is required$/.test(m)) return t('فيه حقل مطلوب فاضي.', 'A required field is empty.');
  return m || t('حصل خطأ، حاول تاني.', 'Something went wrong, try again.');
}

/** Ledger methods are stored in English; show them in the reader's language (free-text methods pass through). */
export function methodLabel(m: string | undefined, t: (ar: string, en: string) => string): string {
  switch ((m || '').toLowerCase()) {
    case 'cash': return t('كاش', 'Cash');
    case 'bank': case 'bank transfer': return t('تحويل بنكي', 'Bank transfer');
    case 'card': return t('كارت', 'Card');
    case 'credit': return t('رصيد', 'Credit');
    case 'manual': return t('يدوي', 'Manual');
    case 'instapay': return t('إنستاباي', 'InstaPay');
    default: return m || '-';
  }
}
