import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { downloadFile, exportAll, restoreAll } from '../backup';
import { db } from '../db';
import pkg from '../../package.json';
import { defaultCurrency, myName, scanEnabled, setPref } from '../prefs';
import { deleteFontPack, deletePack, FONT_PACK, hasFontPack, hasPack, PACKS, saveLang, savedLang, type Lang } from '../receipt/packs';
import { eraseTrip, KEEP_DELETED_MS, updateTrip } from '../store';
import { isDark, setDark } from '../theme';
import { CurrencySelect, HoldButton } from '../ui';

const REPO = 'https://github.com/omnichips/CodeHub';
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const DAY = 24 * 60 * 60 * 1000;

/** The downloadable packs: receipt languages (English is built in) and the Japanese PDF font. */
const DOWNLOADS = [
  ...PACKS.filter((p) => p.code !== 'eng').map((p) => ({ name: `${p.name} receipts`, size: p.size, has: () => hasPack(p.code), remove: () => deletePack(p.code) })),
  { name: FONT_PACK.name, size: FONT_PACK.size, has: hasFontPack, remove: deleteFontPack },
];

export function Settings({ onClose }: { onClose: () => void }) {
  const [dark, setDarkState] = useState(isDark);
  const [installed, setInstalled] = useState<boolean[]>();
  const check = () => void Promise.all(DOWNLOADS.map((d) => d.has())).then(setInstalled);
  useEffect(check, []);
  const deleted = useLiveQuery(async () => (await db.trips.toArray()).filter((t) => t.deleted).sort((a, b) => b.updatedAt - a.updatedAt));
  const [erasing, setErasing] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [name, setName] = useState(myName);
  const [scan, setScan] = useState(scanEnabled);
  const [lang, setLang] = useState<Lang>(savedLang);
  const [note, setNote] = useState('');
  const [used, setUsed] = useState<number>();
  const measure = () => void navigator.storage?.estimate?.().then((e) => setUsed(e.usage), () => undefined);
  useEffect(measure, []);
  const covers = useLiveQuery(() => db.photos.count());
  const restore = useRef<HTMLInputElement>(null);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Settings">
      <header className="bar centered">
        <button onClick={onClose}>Done</button>
        <h1>Settings</h1>
        <span />
      </header>
      <div className="screen">
        <h2>Appearance</h2>
        <label className="check row">
          <span>Dark mode</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={dark}
            onChange={(e) => {
              setDark(e.target.checked);
              setDarkState(e.target.checked);
            }}
          />
        </label>

        <h2>New trips and expenses</h2>
        <div className="card">
          <label>
            Default currency
            <CurrencySelect label="Default currency" value={currency} onChange={(c) => (setPref('default-currency', c), setCurrency(c))} />
          </label>
          <label>
            Your name
            <input value={name} placeholder="As it appears in your trips" onChange={(e) => (setPref('my-name', e.target.value), setName(e.target.value))} />
          </label>
          <p className="hint">“Paid by” starts on the member with this name.</p>
        </div>

        <h2>Receipts</h2>
        <div className="card">
          <label className="check row">
            <span>Offer to read receipts</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={scan}
              onChange={(e) => (setPref('receipt-scan', e.target.checked ? 'on' : 'off'), setScan(e.target.checked))}
            />
          </label>
          <label>
            Receipt language
            <select aria-label="Receipt language" value={lang} onChange={(e) => (saveLang(e.target.value as Lang), setLang(e.target.value as Lang))}>
              {PACKS.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </label>
          <p className="hint">Off: a receipt photo is just attached to the expense.</p>
        </div>

        <h2>Backup</h2>
        <div className="card">
          <div className="two">
            <button onClick={async () => downloadFile(`fairshare-backup-${new Date().toLocaleDateString('en-CA')}.json`, await exportAll(), 'application/json')}>
              Back up all trips
            </button>
            <button onClick={() => restore.current?.click()}>Restore from backup</button>
          </div>
          <input
            ref={restore}
            type="file"
            hidden
            aria-label="Backup file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const n = await restoreAll(await file.text());
                setNote(`Restored ${n} ${n === 1 ? 'trip' : 'trips'}.`);
              } catch (err) {
                setNote((err as Error).message);
              }
            }}
          />
          {note && <p role="status" className="hint">{note}</p>}
          <p className="hint">One file with every trip and its receipt photos. Restoring merges: newer changes already here are kept.</p>
        </div>

        <h2>Downloaded packs</h2>
        <ul className="list">
          {DOWNLOADS.map((d, i) => (
            <li key={d.name} className="row">
              <span>
                {d.name}
                <small>{installed?.[i] ? `On this phone · ${d.size}` : 'Not downloaded'}</small>
              </span>
              {installed?.[i] && (
                <button aria-label={`Delete ${d.name}`} onClick={() => d.remove().finally(check)}>Delete</button>
              )}
            </li>
          ))}
        </ul>
        <p className="hint">A deleted pack can be downloaded again the next time it is needed.</p>

        <h2>Storage</h2>
        <div className="card">
          <p>{used === undefined ? 'Used by FairsHare on this phone' : `${mb(used)} used by FairsHare on this phone`}</p>
          <button
            disabled={!covers}
            onClick={() => void db.photos.clear().then(measure)}
          >
            Remove trip cover photos{covers ? ` (${covers})` : ''}
          </button>
          <p className="hint">Cover photos only live on this phone. Receipt photos stay with their expenses.</p>
        </div>

        <h2>Recently deleted</h2>
        {deleted?.length === 0 && <p className="hint">Deleted trips stay here for 7 days.</p>}
        <ul className="list">
          {deleted?.map((t) => {
            const left = Math.max(1, Math.ceil((t.updatedAt + KEEP_DELETED_MS - Date.now()) / DAY));
            return (
              <li key={t.id} className="card">
                <span>
                  <strong>{t.name}</strong>
                  <small className="muted"> · erased in {left} {left === 1 ? 'day' : 'days'}</small>
                </span>
                {erasing === t.id ? (
                  <div className="two">
                    <HoldButton onDone={() => void eraseTrip(t.id)}>Hold to erase</HoldButton>
                    <button onClick={() => setErasing('')}>Keep</button>
                  </div>
                ) : (
                  <div className="two">
                    <button onClick={() => updateTrip(t.id, { deleted: false })} aria-label={`Restore ${t.name}`}>Restore</button>
                    <button className="danger" onClick={() => setErasing(t.id)} aria-label={`Delete ${t.name} forever`}>Delete forever</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <h2>About</h2>
        <p className="hint">
          FairsHare {pkg.version} · <a href={REPO} target="_blank" rel="noreferrer">Source</a> · <a href={`${REPO}/issues/new`} target="_blank" rel="noreferrer">Report a problem</a>
        </p>
      </div>
    </div>
  );
}
