import { useCallback, useEffect, useRef, useState } from 'react';
import { Ltr, useI18n } from '../i18n';
import { api, apiUrl, post } from '../lib/api';
import { day, Page, Table } from '../ui';
import { errText } from './errors';

type Notes = { en?: string[]; ar?: string[] };
type Info = {
  version: string; php: string; storage: string; maxUpload: string;
  checks: { zip: boolean; siteWritable: boolean; apiWritable: boolean; dataWritable: boolean };
  backups: { name: string; version: string; at: string; size: number }[];
  applied: { from: string; to: string; at: string; by: string; files: number }[];
  changelog: ({ version: string; date?: string } & Notes)[];
};
type Preview = { token: string; version: string; from: string; requires: string; date: string; notes: Notes; files: { path: string; action: 'new' | 'changed' | 'same'; size: number }[]; delete: string[] };

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const cmpV = (a: string, b: string) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; };

/** Admin → Updates: current version and health, upload an update file, see what it changes, install, restore a backup, read the version history. */
export function AdminUpdates() {
  const { t, lang } = useI18n();
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [prev, setPrev] = useState<Preview | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { api<Info>('admin/update').then(setInfo).catch((e) => setErr(errText(e, t))); }, [t]);
  useEffect(load, [load]);

  const send = async (fields: Record<string, string | File>) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    const res = await fetch(apiUrl('admin/update'), { method: 'POST', credentials: 'same-origin', headers: { 'X-NC': '1', Accept: 'application/json' }, body: fd });
    const j = await res.json().catch(() => null) as (Record<string, unknown> & { error?: string }) | null;
    if (!res.ok || !j) throw new Error(j?.error ?? `HTTP ${res.status}`);
    return j;
  };
  const choose = async (list: FileList | File[] | null) => {
    const f = list && list[0];
    if (!f) return;
    setErr(''); setOk(''); setPrev(null); setBusy(true);
    try { setPrev(await send({ step: 'preview', pkg: f }) as unknown as Preview); } catch (e) { setErr(e instanceof Error ? e.message : 'error'); } finally { setBusy(false); }
  };
  const install = async () => {
    if (!prev) return;
    setErr(''); setBusy(true);
    try {
      const r = await send({ step: 'apply', token: prev.token }) as { from: string; version: string; files: number };
      setOk(t(`اتحدّث من ${r.from} إلى ${r.version} (${r.files} ملف). حدّث الصفحة (Ctrl+F5) عشان تشوف الواجهة الجديدة.`, `Updated ${r.from} → ${r.version} (${r.files} files). Reload the page (Ctrl+F5) to see the new interface.`));
      setPrev(null); load();
    } catch (e) { setErr(e instanceof Error ? e.message : 'error'); } finally { setBusy(false); }
  };
  const restore = async (name: string, version: string) => {
    if (!window.confirm(t(`ترجّع ملفات النسخة ${version}؟ بياناتك مش هتتأثر.`, `Restore the files of version ${version}? Your data is not affected.`))) return;
    setErr(''); setOk('');
    try { await post('admin/update/restore', { name }); setOk(t(`اترجعت ملفات ${version}. حدّث الصفحة (Ctrl+F5).`, `Restored the files of ${version}. Reload the page (Ctrl+F5).`)); load(); } catch (e) { setErr(errText(e, t)); }
  };
  const chk = (okay: boolean, label: string) => <div className="upd-check"><span className={`tag ${okay ? 'ok' : 'bad'}`}>{okay ? 'OK' : t('لا', 'No')}</span> {label}</div>;
  const notes = (n: Notes) => (n[lang] && n[lang]!.length ? n[lang]! : n.en ?? []);
  const log = (info?.changelog ?? []).slice().sort((a, b) => cmpV(b.version, a.version));
  const cur = info?.version ?? '';

  return (
    <Page title={t('التحديثات', 'Update')}>
      {err && <div className="form-error" role="alert">{err}</div>}
      {ok && <div className="form-ok" role="status">{ok}</div>}
      {info && (
        <div className="card upd-card">
          <div className="upd-top">
            <div><span className="muted">{t('النسخة الحالية', 'Current version')}</span><div className="upd-ver latin">v{info.version}</div></div>
            <div><span className="muted">{t('التخزين', 'Storage')}</span><div className="upd-big latin">{info.storage}</div></div>
            <div><span className="muted">PHP</span><div className="upd-big latin">{info.php}</div></div>
          </div>
          <hr />
          {chk(info.checks.zip, t('إضافة zip في PHP (لملفات .zip)', 'PHP zip extension (for .zip files)'))}
          {chk(info.checks.siteWritable, t('فولدر الموقع قابل للكتابة', 'Site folder writable'))}
          {chk(info.checks.apiWritable, t('فولدر api قابل للكتابة', 'api folder writable'))}
          {chk(info.checks.dataWritable, t('فولدر البيانات قابل للكتابة', 'Data folder writable'))}
        </div>
      )}

      <div className="card upd-card" style={{ marginTop: 16 }}>
        <h3>{t('ثبّت تحديث', 'Install an update')}</h3>
        <p className="muted">{t('ارفع ملف الإصدار الجديد (ncloud-update-X.Y.Z.zip). هتشوف التغييرات قبل ما أي حاجة تتثبّت. بياناتك وحسابات العملاء وإعدادات قاعدة البيانات بتفضل زي ما هي.', 'Upload the new release file (ncloud-update-X.Y.Z.zip). You will see what changes before anything is installed. Your data, client accounts and database settings are kept.')}</p>
        <div className={`upd-drop${drag ? ' is-drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void choose(e.dataTransfer.files); }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => input.current?.click()}>{busy ? '…' : t('اختار ملف التحديث', 'Choose update file')}</button>
          <p className="muted">{t('أو اسحب الملف .zip هنا', 'or drop the .zip here')}</p>
          <input ref={input} type="file" hidden accept=".zip,.json,application/zip,application/json" onChange={(e) => { void choose(e.target.files); e.target.value = ''; }} />
        </div>
        <p className="muted">{t('أكبر ملف بيقبله السيرفر', 'Largest file this server accepts')}: <span className="latin">{info?.maxUpload ?? ''}</span></p>
      </div>

      {prev && (
        <div className="card upd-card" style={{ marginTop: 16 }}>
          <h3>{t('جاهز للتثبيت', 'Ready to install')}: <span className="latin">v{prev.from} → v{prev.version}</span> {prev.date && <span className="muted">· <Ltr>{prev.date}</Ltr></span>}</h3>
          {notes(prev.notes).length > 0 && <ul className="upd-notes">{notes(prev.notes).map((n, i) => <li key={i}>{n}</li>)}</ul>}
          <Table head={[t('الملف', 'File'), t('التغيير', 'Change'), t('الحجم', 'Size')]}>
            {prev.files.map((f) => <tr key={f.path}><td><Ltr>{f.path}</Ltr></td><td><span className={`tag ${f.action === 'new' ? 'ok' : f.action === 'changed' ? 'warn' : ''}`}>{f.action === 'new' ? t('جديد', 'New') : f.action === 'changed' ? t('متغيّر', 'Changed') : t('زي ما هو', 'Same')}</span></td><td className="latin">{kb(f.size)}</td></tr>)}
            {prev.delete.map((f) => <tr key={`d-${f}`}><td><Ltr>{f}</Ltr></td><td><span className="tag bad">{t('هيتحذف', 'Removed')}</span></td><td /></tr>)}
          </Table>
          <p className="muted">{t('هتتاخد نسخة احتياطية من الملفات اللي هتتغيّر قبل التثبيت.', 'The files that change are backed up before installing.')}</p>
          <div className="row-actions"><button className="btn btn-accent" onClick={() => void install()} disabled={busy}>{busy ? '…' : t(`تثبيت v${prev.version}`, `Install v${prev.version}`)}</button><button className="btn btn-ghost" onClick={() => setPrev(null)} disabled={busy}>{t('إلغاء', 'Cancel')}</button></div>
        </div>
      )}

      {info && info.backups.length > 0 && (
        <div className="card upd-card" style={{ marginTop: 16 }}>
          <h3>{t('النسخ الاحتياطية', 'Backups')}</h3>
          <p className="muted">{t('بتتاخد نسخة من ملفات الموقع قبل كل تحديث (بنحتفظ بآخر 3). الاسترجاع بيرجّع ملفات النسخة دي وبياناتك زي ما هي.', 'A backup of the site files is taken before every update (the newest 3 are kept). Restoring brings back the files of that version; your data stays as it is.')}</p>
          <div className="linked">
            {info.backups.map((b) => (
              <div key={b.name}><span><b className="latin">v{b.version}</b> <span className="muted"><Ltr>{b.at.slice(0, 16).replace('T', ' ')}</Ltr> · {kb(b.size)}</span></span><button className="btn btn-ghost btn-sm" onClick={() => void restore(b.name, b.version)}>{t('استرجاع', 'Restore')}</button></div>
            ))}
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="card upd-card" style={{ marginTop: 16 }}>
          <h3>{t('سجل الإصدارات', 'Version history')}</h3>
          <ol className="upd-history">
            {log.map((v) => (
              <li key={v.version} className={v.version === cur ? 'is-current' : ''}>
                <div className="upd-h-head"><span className={`tag latin ${v.version === cur ? 'ok' : ''}`}>v{v.version}</span>{v.version === cur && <b className="ok-text">{t('مثبّت', 'Installed')}</b>}{v.date && <span className="muted"><Ltr>{v.date}</Ltr></span>}</div>
                <ul>{notes(v).map((n, i) => <li key={i}>{n}</li>)}</ul>
              </li>
            ))}
          </ol>
        </div>
      )}
      {info && info.applied.length > 0 && <p className="muted">{t('آخر تحديث اتطبّق', 'Last update applied')}: <span className="latin">v{info.applied[info.applied.length - 1].to}</span> · <Ltr>{day(info.applied[info.applied.length - 1].at)}</Ltr></p>}
    </Page>
  );
}
