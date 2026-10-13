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
  'too many records': ['عدد السجلات وصل للحد الأقصى.', 'Record limit reached.'],
};

/** Turn an API error into a friendly message in the current language. */
export function errText(e: unknown, t: (ar: string, en: string) => string): string {
  const m = e instanceof ApiError ? e.message : '';
  const hit = map[m];
  if (hit) return t(hit[0], hit[1]);
  if (/ is required$/.test(m)) return t('فيه حقل مطلوب فاضي.', 'A required field is empty.');
  return m || t('حصل خطأ، حاول تاني.', 'Something went wrong, try again.');
}
