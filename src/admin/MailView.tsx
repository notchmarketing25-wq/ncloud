import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Ltr, useI18n } from '../i18n';
import { api, post } from '../lib/api';
import { Modal } from '../ui';
import { errText } from './errors';

type Msg = { uid: number; from: string; subject: string; date: string; seen: boolean; size: number };
type Full = { headers: Record<string, string>; text: string; html: boolean; attachments: { name: string; type: string; size: number }[] };

const when = (d: string) => { const t = Date.parse(d); return Number.isNaN(t) ? d.slice(0, 22) : new Date(t).toISOString().slice(0, 16).replace('T', ' '); };

/** Read-only inbox of one mailbox, straight from the mail server (needs the mailbox password, kept encrypted). */
export function MailViewer({ id, address, hasPass, onClose, onChanged }: { id: string; address: string; hasPass: boolean; onClose: () => void; onChanged: () => void }) {
  const { t } = useI18n();
  const [has, setHas] = useState(hasPass);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [folder, setFolder] = useState('INBOX');
  const [page, setPage] = useState(1);
  const [list, setList] = useState<{ total: number; size: number; messages: Msg[] } | null>(null);
  const [open, setOpen] = useState<{ uid: number; msg: Full | null } | null>(null);

  const loadList = useCallback(() => {
    setList(null); setErr('');
    api<{ total: number; size: number; messages: Msg[] }>('admin/mail-list', undefined, { id, folder, page: String(page) }).then(setList).catch((e) => { setErr(errText(e, t)); setList({ total: 0, size: 25, messages: [] }); });
  }, [id, folder, page, t]);
  useEffect(() => { if (has) api<{ folders: string[] }>('admin/mail-folders', undefined, { id }).then((r) => setFolders(r.folders)).catch(() => undefined); }, [has, id]);
  useEffect(() => { if (has) loadList(); }, [has, loadList]);

  const savePw = async (e: FormEvent) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await post('admin/mailbox-secret', { id, password: pw }); setHas(true); setPw(''); onChanged(); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  const forget = async () => { if (!window.confirm(t('تمسح الباسورد المحفوظ؟', 'Remove the saved password?'))) return; await post('admin/mailbox-secret', { id, password: '' }); setHas(false); setList(null); setOpen(null); onChanged(); };
  const read = (uid: number) => {
    setOpen({ uid, msg: null });
    api<Full>('admin/mail-read', undefined, { id, folder, uid: String(uid) }).then((msg) => setOpen({ uid, msg })).catch((e) => { setErr(errText(e, t)); setOpen(null); });
  };
  const pages = list ? Math.max(1, Math.ceil(list.total / list.size)) : 1;

  return (
    <Modal title={address} wide onClose={onClose}>
      {!has ? (
        <form className="form" onSubmit={savePw}>
          <p className="muted">{t('Hostinger مبيدّيش API لقراءة الإيميلات، فبنقراها من سيرفر الإيميل (IMAP) بباسورد الصندوق. الباسورد بيتخزّن مشفّر على سيرفرك وبيُستخدم للقراءة بس (من غير ما نعلّم الرسايل كمقروءة أو نمسح حاجة).', 'Hostinger has no API to read mail, so the mailbox is read from the mail server (IMAP) with the mailbox password. It is stored encrypted on your server and used for reading only (nothing is marked as read or deleted).')}</p>
          <div className="field"><label htmlFor="mv-pw">{t('باسورد الصندوق', 'Mailbox password')}</label><input id="mv-pw" className="input latin" dir="ltr" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          {err && <div className="form-error" role="alert">{err}</div>}
          <button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('اتصل واحفظ', 'Connect & save')}</button>
        </form>
      ) : (
        <div className="mailview">
          <aside className="mv-folders">
            {(folders.length ? folders : ['INBOX']).map((f) => <button key={f} className={f === folder ? 'on' : ''} onClick={() => { setFolder(f); setPage(1); setOpen(null); }}>{f}</button>)}
            <button className="link" onClick={forget}>{t('نسيان الباسورد', 'Forget password')}</button>
          </aside>
          <section className="mv-list">
            <div className="row-actions" style={{ justifyContent: 'space-between' }}>
              <b>{folder} {list && <span className="muted latin">({list.total})</span>}</b>
              <span className="row-actions"><button className="btn btn-ghost btn-sm" onClick={loadList}>↻</button><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>‹</button><span className="latin">{page}/{pages}</span><button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>›</button></span>
            </div>
            {err && <div className="form-error" role="alert">{err}</div>}
            {list === null ? <p className="muted">…</p> : list.messages.length === 0 ? <p className="muted">{t('مفيش رسايل.', 'No messages.')}</p> : list.messages.map((m) => (
              <button key={m.uid} className={`mv-row${open?.uid === m.uid ? ' on' : ''}${m.seen ? '' : ' unread'}`} onClick={() => read(m.uid)}>
                <span className="mv-from">{m.from.replace(/<.*>/, '').trim() || m.from}</span><span className="mv-sub">{m.subject || t('(بدون عنوان)', '(no subject)')}</span><span className="mv-date latin">{when(m.date)}</span>
              </button>
            ))}
          </section>
          <section className="mv-read">
            {!open ? <p className="muted">{t('اختار رسالة لقراءتها.', 'Pick a message to read it.')}</p> : !open.msg ? <p className="muted">…</p> : (
              <>
                <h3 style={{ margin: 0 }}>{open.msg.headers.subject || t('(بدون عنوان)', '(no subject)')}</h3>
                <p className="muted">{t('من', 'From')}: <Ltr>{open.msg.headers.from}</Ltr><br />{t('إلى', 'To')}: <Ltr>{open.msg.headers.to}</Ltr><br /><Ltr>{open.msg.headers.date}</Ltr></p>
                <div className="mv-body" dir="auto">{open.msg.text || t('(رسالة فاضية)', '(empty message)')}</div>
                {open.msg.attachments.length > 0 && <p className="muted">{t('مرفقات', 'Attachments')}: {open.msg.attachments.map((a) => <span key={a.name} className="tag latin">{a.name} · {Math.max(1, Math.round(a.size / 1024))} KB</span>)}</p>}
                {open.msg.html && <p className="muted">{t('الرسالة HTML وبتتعرض كنص عادي للأمان.', 'This is an HTML message, shown as plain text for safety.')}</p>}
              </>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}
