import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../db';
import { deleteFontPack, deletePack, FONT_PACK, hasFontPack, hasPack, PACKS } from '../receipt/packs';
import { eraseTrip, KEEP_DELETED_MS, updateTrip } from '../store';
import { isDark, setDark } from '../theme';
import { HoldButton } from '../ui';

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
      </div>
    </div>
  );
}
