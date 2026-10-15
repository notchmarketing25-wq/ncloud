import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Ltr, useI18n } from '../i18n';
import { ApiError, api, apiUrl, post } from '../lib/api';
import { errText } from '../admin/errors';
import { Modal, Page } from '../ui';
import { usePortal } from './PortalData';

type Box = { id: string; address: string; connected: boolean; status: string };
type Folder = { name: string; unseen: number; total: number };
type Msg = { uid: number; from: string; subject: string; date: string; seen: boolean; size: number };
type Full = { headers: Record<string, string>; text: string; html: boolean; attachments: { name: string; type: string; size: number }[] };
type Check = { key: string; ok: boolean; live: boolean; required: boolean; records: { host: string; type: string; value: string; ok: boolean; saved: boolean }[] };
type Draft = { to: string; cc: string; subject: string; body: string; inReplyTo: string; references: string };

const when = (d: string) => { const t = Date.parse(d); if (Number.isNaN(t)) return d.slice(0, 22); const x = new Date(t); const same = x.toDateString() === new Date().toDateString(); return same ? x.toTimeString().slice(0, 5) : x.toISOString().slice(0, 10); };
const nameOf = (a: string) => a.replace(/<.*>/, '').replace(/"/g, '').trim() || a;
const addrOf = (a: string) => { const m = a.match(/<([^>]+)>/); return (m ? m[1] : a).trim(); };
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
const sigKey = (id: string) => `nc.sig.${id}`;
const getSig = (id: string) => { try { return localStorage.getItem(sigKey(id)) ?? ''; } catch { return ''; } };
const setSig = (id: string, v: string) => { try { localStorage.setItem(sigKey(id), v); } catch { /* private mode */ } };

/** "N Emails": the client's own webmail over IMAP/SMTP, inside the portal. */
export function PortalMail() {
  const { t } = useI18n();
  const { demo } = usePortal();
  const [qs, setQs] = useSearchParams();
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [webmail, setWebmail] = useState('');
  const [err, setErr] = useState('');
  const sel = qs.get('box') ?? '';

  const loadBoxes = useCallback(() => {
    api<{ boxes: Box[]; webmail: string }>('mail/boxes').then((r) => { setBoxes(r.boxes); setWebmail(r.webmail); }).catch((e) => { setErr(errText(e, t)); setBoxes([]); });
  }, [t]);
  useEffect(() => { if (!demo) loadBoxes(); }, [demo, loadBoxes]);

  if (demo) return <Page title="N Emails"><div className="card"><p className="muted">{t('صندوق الإيميل المدمج بيشتغل على المنصة الفعلية (مش في وضع التجربة).', 'The built-in mailbox works on the live platform (not in demo mode).')}</p></div></Page>;
  if (boxes === null) return <Page title="N Emails"><p className="muted">…</p></Page>;
  const box = boxes.find((b) => b.id === sel) ?? boxes[0];
  return (
    <Page title="N Emails" action={<div className="row-actions">{boxes.length > 1 && box && <select className="select" aria-label={t('الصندوق', 'Mailbox')} value={box.id} onChange={(e) => setQs({ box: e.target.value })}>{boxes.map((b) => <option key={b.id} value={b.id}>{b.address}</option>)}</select>}<Link to="/portal/email" className="btn btn-ghost btn-sm">{t('كل الصناديق', 'All mailboxes')}</Link></div>}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {!box ? <div className="card"><p className="muted">{t('مفيش صناديق إيميل على حسابك لسه.', 'No mailboxes on your account yet.')} <Link className="link" to="/portal/support?new=mailbox">{t('اطلب صندوق', 'Request a mailbox')}</Link></p></div>
        : !box.connected ? <Connect box={box} onDone={loadBoxes} webmail={webmail} />
          : <Client key={box.id} box={box} onDisconnect={loadBoxes} />}
    </Page>
  );
}

function Connect({ box, onDone, webmail }: { box: Box; onDone: () => void; webmail: string }) {
  const { t } = useI18n();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e: FormEvent) => { e.preventDefault(); setErr(''); setBusy(true); try { await post('mail/secret', { id: box.id, password: pw }); setPw(''); onDone(); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); } };
  return (
    <form className="card form" onSubmit={go} style={{ maxWidth: 520 }}>
      <h3 style={{ margin: 0 }}><Ltr>{box.address}</Ltr></h3>
      <p className="muted">{t('اربط الصندوق مرة واحدة بباسورده، وبعدها تفتحه وتبعت وتستقبل من هنا. الباسورد بيتخزّن مشفّر ومش بيظهر لأي حد.', 'Connect the mailbox once with its password, then open, send and receive from here. The password is stored encrypted and never shown to anyone.')}</p>
      <div className="field"><label htmlFor="nm-pw">{t('باسورد الصندوق', 'Mailbox password')}</label><input id="nm-pw" className="input latin" dir="ltr" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="row-actions"><button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('اتصل', 'Connect')}</button>{webmail && <a className="link" href={webmail} target="_blank" rel="noreferrer">{t('نسيت الباسورد؟ غيّره من Hostinger', 'Forgot it? Reset in Hostinger')}</a>}</div>
    </form>
  );
}

const folderLabel = (f: string, t: (a: string, e: string) => string) => ({ inbox: t('الوارد', 'Inbox'), sent: t('المرسل', 'Sent'), trash: t('المحذوفات', 'Trash'), drafts: t('المسودات', 'Drafts'), spam: t('السبام', 'Spam'), junk: t('السبام', 'Spam') } as Record<string, string>)[f.toLowerCase().replace(/^inbox[./]/, '')] ?? f;

function Client({ box, onDisconnect }: { box: Box; onDisconnect: () => void }) {
  const { t } = useI18n();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [special, setSpecial] = useState<Record<string, string>>({});
  const [folder, setFolder] = useState('INBOX');
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(false);
  const [list, setList] = useState<{ total: number; size: number; messages: Msg[] } | null>(null);
  const [open, setOpen] = useState<{ uid: number; msg: Full | null } | null>(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dns, setDns] = useState(false);
  const [sigEdit, setSigEdit] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const loadFolders = useCallback(() => { api<{ folders: Folder[]; special: Record<string, string> }>('mail/folders', undefined, { id: box.id }).then((r) => { if (alive.current) { setFolders(r.folders); setSpecial(r.special); } }).catch(() => undefined); }, [box.id]);
  const loadList = useCallback((quiet = false) => {
    if (!quiet) setList(null);
    const p: Record<string, string> = { id: box.id, folder, page: String(page) }; if (query) p.q = query; if (unread) p.unread = '1';
    api<{ total: number; size: number; messages: Msg[] }>('mail/list', undefined, p).then((r) => { if (alive.current) { setList(r); setErr(''); } }).catch((e) => { if (!alive.current) return; if (e instanceof ApiError && e.status === 409) onDisconnect(); setErr(errText(e, t)); setList({ total: 0, size: 25, messages: [] }); });
  }, [box.id, folder, page, query, unread, t, onDisconnect]);
  useEffect(() => { loadFolders(); }, [loadFolders]);
  useEffect(() => { loadList(); }, [loadList]);
  // New mail arrives by polling while the page is open (shared hosting has no push).
  useEffect(() => { const i = window.setInterval(() => { if (document.visibilityState === 'visible') { loadList(true); loadFolders(); } }, 60000); return () => window.clearInterval(i); }, [loadList, loadFolders]);

  const read = (uid: number) => {
    setOpen({ uid, msg: null });
    api<Full>('mail/read', undefined, { id: box.id, folder, uid: String(uid) }).then((msg) => { setOpen({ uid, msg }); setList((l) => l && { ...l, messages: l.messages.map((m) => m.uid === uid ? { ...m, seen: true } : m) }); loadFolders(); }).catch((e) => { setErr(errText(e, t)); setOpen(null); });
  };
  const act = async (action: 'seen' | 'unseen' | 'delete' | 'spam', uid: number) => {
    setErr('');
    try { await post('mail/action', { id: box.id, folder, action, uids: [uid] }); if (action !== 'seen' && action !== 'unseen') setOpen(null); loadList(true); loadFolders(); } catch (e) { setErr(errText(e, t)); }
  };
  const search = (e: FormEvent) => { e.preventDefault(); setPage(1); setQuery(q.trim()); setOpen(null); };
  const pages = list ? Math.max(1, Math.ceil(list.total / list.size)) : 1;
  const sig = getSig(box.id);
  const withSig = (b: string) => (sig ? `${b}\n\n-- \n${sig}` : b);

  const reply = (all: boolean) => {
    if (!open?.msg) return; const h = open.msg.headers;
    const to = addrOf(h['reply-to'] || h.from || '');
    const mine = box.address.toLowerCase();
    const cc = all ? [h.to, h.cc].filter(Boolean).join(', ').split(',').map((x) => x.trim()).filter((x) => x && addrOf(x).toLowerCase() !== mine && addrOf(x).toLowerCase() !== to.toLowerCase()).join(', ') : '';
    const sub = h.subject || '';
    setDraft({ to, cc, subject: /^re:/i.test(sub) ? sub : `Re: ${sub}`, body: withSig(`\n\n${t('في', 'On')} ${h.date}, ${nameOf(h.from || '')} ${t('كتب:', 'wrote:')}\n${open.msg.text.split('\n').map((l) => `> ${l}`).join('\n')}`).replace(/^\n\n/, '\n\n'), inReplyTo: h['message-id'] || '', references: h.references || '' });
  };
  const forward = () => {
    if (!open?.msg) return; const h = open.msg.headers; const sub = h.subject || '';
    setDraft({ to: '', cc: '', subject: /^fwd?:/i.test(sub) ? sub : `Fwd: ${sub}`, body: withSig(`\n\n---------- ${t('رسالة محوّلة', 'Forwarded message')} ----------\n${t('من', 'From')}: ${h.from}\n${t('التاريخ', 'Date')}: ${h.date}\n${t('الموضوع', 'Subject')}: ${sub}\n\n${open.msg.text}`), inReplyTo: '', references: '' });
  };

  const trashed = special.trash && folder === special.trash;
  return (
    <div className="nmail">
      <div className="nm-bar">
        <button className="btn btn-accent" onClick={() => setDraft({ to: '', cc: '', subject: '', body: withSig('\n'), inReplyTo: '', references: '' })}>{t('+ رسالة جديدة', '+ Compose')}</button>
        <form className="nm-search" onSubmit={search} role="search"><input className="input" type="search" aria-label={t('بحث', 'Search')} placeholder={t('ابحث في المرسل أو الموضوع…', 'Search sender or subject…')} value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn btn-ghost btn-sm" type="submit">{t('بحث', 'Search')}</button></form>
        <label className="nm-chk"><input type="checkbox" checked={unread} onChange={(e) => { setUnread(e.target.checked); setPage(1); }} /> {t('غير المقروء', 'Unread')}</label>
        <button className="btn btn-ghost btn-sm" onClick={() => { loadList(); loadFolders(); }} aria-label={t('تحديث', 'Refresh')}>↻</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setDns(true)}>{t('إعداد الدومين', 'Domain setup')}</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setSigEdit(true)}>{t('التوقيع', 'Signature')}</button>
      </div>
      {note && <div className="card nm-note" role="status">{note}</div>}
      {err && <div className="form-error" role="alert">{err}</div>}
      <div className="nm-grid">
        <aside className="nm-folders">
          {(folders.length ? folders : [{ name: 'INBOX', unseen: 0, total: 0 }]).map((f) => (
            <button key={f.name} className={f.name === folder ? 'on' : ''} onClick={() => { setFolder(f.name); setPage(1); setOpen(null); setQuery(''); setQ(''); }}><span>{folderLabel(f.name, t)}</span>{f.unseen > 0 && <b className="nm-badge latin">{f.unseen}</b>}</button>
          ))}
          <button className="link" onClick={async () => { if (window.confirm(t('تفصل الصندوق؟ هتحتاج الباسورد تاني.', 'Disconnect this mailbox? You will need the password again.'))) { await post('mail/secret', { id: box.id, password: '' }); onDisconnect(); } }}>{t('فصل الصندوق', 'Disconnect')}</button>
        </aside>
        <section className={`nm-list${open ? ' has-open' : ''}`}>
          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <b>{folderLabel(folder, t)} {list && <span className="muted latin">({list.total})</span>}</b>
            <span className="row-actions"><button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label={t('السابق', 'Previous')}>‹</button><span className="latin">{page}/{pages}</span><button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label={t('التالي', 'Next')}>›</button></span>
          </div>
          {list === null ? <p className="muted">…</p> : list.messages.length === 0 ? <p className="muted">{query || unread ? t('مفيش نتايج.', 'No results.') : t('مفيش رسايل.', 'No messages.')}</p> : list.messages.map((m) => (
            <button key={m.uid} className={`mv-row${open?.uid === m.uid ? ' on' : ''}${m.seen ? '' : ' unread'}`} onClick={() => read(m.uid)}>
              <span className="mv-from">{special.sent && folder === special.sent ? '' : ''}{nameOf(m.from)}</span><span className="mv-sub">{m.subject || t('(بدون عنوان)', '(no subject)')}</span><span className="mv-date latin">{when(m.date)}</span>
            </button>
          ))}
        </section>
        <section className={`nm-read${open ? ' has-open' : ''}`}>
          {!open ? <p className="muted">{t('اختار رسالة لقراءتها.', 'Pick a message to read it.')}</p> : !open.msg ? <p className="muted">…</p> : (
            <>
              <button className="btn btn-ghost btn-sm nm-back" onClick={() => setOpen(null)}>{t('← الرسايل', '← Messages')}</button>
              <h3 style={{ margin: 0 }} dir="auto">{open.msg.headers.subject || t('(بدون عنوان)', '(no subject)')}</h3>
              <p className="muted">{t('من', 'From')}: <Ltr>{open.msg.headers.from}</Ltr><br />{t('إلى', 'To')}: <Ltr>{open.msg.headers.to}</Ltr>{open.msg.headers.cc && <><br />Cc: <Ltr>{open.msg.headers.cc}</Ltr></>}<br /><Ltr>{open.msg.headers.date}</Ltr></p>
              <div className="row-actions">
                <button className="btn btn-primary btn-sm" onClick={() => reply(false)}>{t('رد', 'Reply')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => reply(true)}>{t('رد على الكل', 'Reply all')}</button>
                <button className="btn btn-ghost btn-sm" onClick={forward}>{t('تحويل', 'Forward')}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => act('unseen', open.uid)}>{t('غير مقروء', 'Mark unread')}</button>
                {special.spam && folder !== special.spam && <button className="btn btn-ghost btn-sm" onClick={() => act('spam', open.uid)}>{t('سبام', 'Spam')}</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => { if (!trashed || window.confirm(t('تمسح الرسالة نهائيًا؟', 'Delete permanently?'))) act('delete', open.uid); }}>{trashed ? t('حذف نهائي', 'Delete forever') : t('حذف', 'Delete')}</button>
              </div>
              <div className="mv-body" dir="auto">{open.msg.text || t('(رسالة فاضية)', '(empty message)')}</div>
              {open.msg.attachments.length > 0 && <p className="muted">{t('مرفقات', 'Attachments')}: {open.msg.attachments.map((a, i) => <a key={i} className="tag latin" href={apiUrl('mail/attachment', { id: box.id, folder, uid: String(open.uid), n: String(i) })}>{a.name} · {kb(a.size)}</a>)}</p>}
              {open.msg.html && <p className="muted">{t('الرسالة HTML وبتتعرض كنص عادي للأمان.', 'This is an HTML message, shown as plain text for safety.')}</p>}
            </>
          )}
        </section>
      </div>
      {draft && <Compose box={box} draft={draft} onClose={() => setDraft(null)} onSent={(saved) => { setDraft(null); setNote(saved ? t('تم الإرسال.', 'Sent.') : t('تم الإرسال (من غير نسخة في المرسل).', 'Sent (no copy kept in Sent).')); window.setTimeout(() => setNote(''), 5000); loadFolders(); if (special.sent && folder === special.sent) loadList(true); }} />}
      {dns && <DnsPanel box={box} onClose={() => setDns(false)} />}
      {sigEdit && <Signature id={box.id} onClose={() => setSigEdit(false)} />}
    </div>
  );
}

function Compose({ box, draft, onClose, onSent }: { box: Box; draft: Draft; onClose: () => void; onSent: (saved: boolean) => void }) {
  const { t } = useI18n();
  const [f, setF] = useState(draft);
  const [files, setFiles] = useState<File[]>([]);
  const [showCc, setShowCc] = useState(!!draft.cc);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const total = files.reduce((n, x) => n + x.size, 0);
  const send = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (total > 8 * 1024 * 1024) { setErr(t('المرفقات أكبر من 8 ميجا.', 'Attachments exceed 8 MB.')); return; }
    setBusy(true);
    const fd = new FormData();
    fd.append('id', box.id); fd.append('to', f.to); fd.append('cc', f.cc); fd.append('subject', f.subject); fd.append('body', f.body); fd.append('inReplyTo', f.inReplyTo); fd.append('references', f.references);
    files.forEach((x) => fd.append('files[]', x, x.name));
    try {
      const res = await fetch(apiUrl('mail/send'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
      let j: { ok?: boolean; saved?: boolean; error?: string } = {}; try { j = await res.json(); } catch { /* not JSON */ }
      if (!res.ok) throw new ApiError(j.error ?? `HTTP ${res.status}`, res.status);
      onSent(!!j.saved);
    } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('رسالة جديدة', 'New message')} wide onClose={onClose}>
      <form className="form" onSubmit={send}>
        <p className="muted" style={{ margin: 0 }}>{t('من', 'From')}: <Ltr>{box.address}</Ltr></p>
        <div className="field"><label htmlFor="c-to">{t('إلى', 'To')}</label><input id="c-to" className="input latin" dir="ltr" required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} placeholder="name@example.com, other@example.com" />{!showCc && <button type="button" className="link" style={{ justifySelf: 'start', width: 'auto', background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setShowCc(true)}>+ Cc</button>}</div>
        {showCc && <div className="field"><label htmlFor="c-cc">Cc</label><input id="c-cc" className="input latin" dir="ltr" value={f.cc} onChange={(e) => setF({ ...f, cc: e.target.value })} /></div>}
        <div className="field"><label htmlFor="c-sub">{t('الموضوع', 'Subject')}</label><input id="c-sub" className="input" dir="auto" maxLength={250} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
        <div className="field"><label htmlFor="c-body">{t('الرسالة', 'Message')}</label><textarea id="c-body" className="input" dir="auto" rows={12} style={{ minHeight: 260, height: 'auto', resize: 'vertical' }} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></div>
        <div className="field"><label htmlFor="c-files">{t('مرفقات (حتى 8 ميجا)', 'Attachments (up to 8 MB)')}</label><input id="c-files" type="file" multiple onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
          {files.length > 0 && <div>{files.map((x, i) => <span key={i} className="tag latin">{x.name} · {kb(x.size)} <button type="button" className="link" aria-label={t('إزالة', 'Remove')} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button></span>)}</div>}</div>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="row-actions"><button className="btn btn-accent" type="submit" disabled={busy}>{busy ? '…' : t('إرسال', 'Send')}</button><button type="button" className="btn btn-ghost" onClick={onClose}>{t('إلغاء', 'Cancel')}</button></div>
      </form>
    </Modal>
  );
}

function Signature({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(getSig(id));
  return (
    <Modal title={t('التوقيع', 'Signature')} onClose={onClose}>
      <div className="form"><p className="muted">{t('بيتضاف تلقائي في الرسايل الجديدة والردود (محفوظ في المتصفح ده).', 'Added automatically to new messages and replies (saved in this browser).')}</p>
        <textarea className="input" dir="auto" rows={5} style={{ minHeight: 110, height: 'auto' }} value={v} onChange={(e) => setV(e.target.value)} />
        <div className="row-actions"><button className="btn btn-accent" onClick={() => { setSig(id, v.trim()); onClose(); }}>{t('حفظ', 'Save')}</button></div></div>
    </Modal>
  );
}

const dnsName: Record<string, [string, string, string, string]> = {
  mx: ['استقبال الإيميل (MX)', 'Receiving mail (MX)', 'بدونها مفيش إيميلات هتوصلك.', 'Without it, no mail reaches you.'],
  spf: ['SPF', 'SPF', 'بتسمح لسيرفرات Hostinger تبعت باسم دومينك.', 'Lets Hostinger send as your domain.'],
  dkim: ['DKIM', 'DKIM', 'توقيع الرسايل عشان ماتروحش سبام (فعّلها كمان من hPanel).', 'Signs messages so they avoid spam (also enable it in hPanel).'],
  dmarc: ['DMARC', 'DMARC', 'سياسة الحماية من انتحال الدومين.', 'Policy against spoofing of your domain.'],
};
function DnsPanel({ box, onClose }: { box: Box; onClose: () => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<{ domain: string; managed: boolean; dnsOff?: boolean; checks: Check[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => { api<{ domain: string; managed: boolean; dnsOff?: boolean; checks: Check[] }>('mail/dns', undefined, { id: box.id }).then(setD).catch((e) => setErr(errText(e, t))); }, [box.id, t]);
  useEffect(() => { load(); }, [load]);
  const fix = async (dkim: boolean) => {
    setBusy(true); setErr(''); setMsg('');
    try { const r = await post<{ added: number; warning: string }>('mail/dns-fix', { id: box.id, dkim }); setMsg(r.warning ? `${t('اتحفظت لكن مابعتتش للمزوّد:', 'Saved, but not sent to the provider:')} ${r.warning}` : r.added ? t(`اتضافت ${r.added} سجلات. التغيير ممكن ياخد من دقائق لساعات عشان ينتشر.`, `${r.added} record(s) added. It may take minutes to hours to propagate.`) : t('كل السجلات موجودة بالفعل.', 'All records are already in place.')); load(); } catch (x) { setErr(errText(x, t)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`${t('إعداد الإيميل للدومين', 'Mail setup for')} ${d?.domain ?? ''}`} wide onClose={onClose}>
      {!d ? <p className="muted">{err || '…'}</p> : (
        <div className="form">
          {d.checks.map((c) => { const n = dnsName[c.key]; const saved = !c.ok && c.records.every((r) => r.ok || r.saved); return (
            <div key={c.key} className="card" style={{ padding: 12 }}>
              <div className="row-actions" style={{ justifyContent: 'space-between' }}><b>{t(n[0], n[1])}</b><span className={`tag ${c.ok ? 'ok' : saved ? '' : 'warn'}`}>{c.ok ? t('تمام', 'OK') : saved ? t('محفوظة — بتنتشر', 'Saved — propagating') : c.required ? t('ناقصة', 'Missing') : t('مش مفعّلة', 'Not set')}</span></div>
              <p className="muted" style={{ margin: '4px 0' }}>{t(n[2], n[3])}</p>
              {!c.ok && c.records.map((r, i) => <div key={i} className="latin" dir="ltr" style={{ fontSize: '.85rem', overflowWrap: 'anywhere' }}>{r.type} · {r.host} → {r.value}</div>)}
            </div>); })}
          {msg && <div className="card" role="status">{msg}</div>}
          {err && <div className="form-error" role="alert">{err}</div>}
          {d.managed && !d.dnsOff ? <div className="row-actions"><button className="btn btn-accent" disabled={busy} onClick={() => fix(false)}>{busy ? '…' : t('أضف السجلات المطلوبة (MX/SPF/DMARC)', 'Add the required records (MX/SPF/DMARC)')}</button><button className="btn btn-ghost" disabled={busy} onClick={() => fix(true)}>{t('وأضف DKIM كمان', 'Also add DKIM')}</button><button className="btn btn-ghost btn-sm" onClick={load}>↻</button></div>
            : <p className="muted">{d.dnsOff ? t('إدارة الـ DNS متوقفة لدومينك — اتواصل مع الدعم.', 'DNS management is off for your domain — contact support.') : t('الدومين ده مش مُدار من حسابك هنا — أضف السجلات عند مزوّد الدومين.', 'This domain is not managed from your account here — add the records at your domain provider.')}</p>}
        </div>
      )}
    </Modal>
  );
}
