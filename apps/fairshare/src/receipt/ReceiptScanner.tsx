import { useEffect, useRef, useState } from 'react';
import { CropSheet } from './CropSheet';
import { DownloadAsk } from '../ui';
import { downloadPack, hasPack, PACKS, saveLang, savedLang, type Lang } from './packs';

/** Language picker, pack download and "Scan receipts". onRead gets one text and one (cropped) photo per photo and returns an error message or null. */
export function ReceiptScanner({ onRead }: { onRead: (texts: string[], photos: Blob[]) => string | null | Promise<string | null> }) {
  const [lang, setLang] = useState<Lang>(savedLang);
  const [ready, setReady] = useState(lang === 'eng');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Photos waiting to be cropped, and the ones already cropped. Each photo gets its own crop screen.
  const [queue, setQueue] = useState<File[]>([]);
  const [cropped, setCropped] = useState<Blob[]>([]);
  const pack = PACKS.find((p) => p.code === lang)!;

  useEffect(() => {
    let live = true;
    hasPack(lang).then((has) => live && setReady(has));
    return () => {
      live = false;
    };
  }, [lang]);

  async function run(label: string, task: (progress: (p: number, step?: string) => void) => Promise<void>, failure: string) {
    setError('');
    setBusy(`${label}…`);
    try {
      await task((p, step = label) => setBusy(`${step}… ${Math.round(p * 100)}%`));
    } catch (e) {
      // The reason is shown too (e.g. "out of memory", "Failed to fetch"), so a failure on a phone can be diagnosed.
      const why = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      setError(why ? `${failure} (${why.slice(0, 120)})` : failure);
    } finally {
      setBusy(null);
    }
  }

  const scan = (photos: Blob[]) =>
    run('Reading receipt', async (progress) => {
      const { readReceipts } = await import('./ocr'); // about 7 MB, so only loaded when used
      const texts = await readReceipts(photos, lang, (i, p) =>
        progress(p, photos.length > 1 ? `Reading receipt ${i + 1} of ${photos.length}` : 'Reading receipt'),
      );
      const problem = await onRead(texts, photos);
      if (problem) setError(problem);
    }, 'Could not read that photo. Try again, or add the items by hand.');

  const download = () => {
    setAsking(false);
    return run(`Downloading ${pack.name}`, async (progress) => {
      await downloadPack(lang, progress);
      setReady(true);
    }, `Could not download the ${pack.name} pack. Check your internet connection and try again.`);
  };

  return (
    <>
      <div className="two scan">
        <label>
          Receipt language
          <select
            value={lang}
            disabled={busy !== null}
            onChange={(e) => {
              const code = e.target.value as Lang;
              setLang(code);
              saveLang(code);
              setError('');
              setAsking(false);
            }}
          >
            {PACKS.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </label>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Receipt photos"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            if (files.length) {
              setQueue(files);
              setCropped([]);
              setError('');
            }
          }}
        />
        {ready ? (
          <button disabled={busy !== null} onClick={() => input.current?.click()}>{busy ?? 'Scan receipts'}</button>
        ) : (
          <button disabled={busy !== null} onClick={() => setAsking(true)}>{busy ?? `Download pack (${pack.size})`}</button>
        )}
      </div>
      {queue.length > 0 && (
        <CropSheet
          key={cropped.length}
          photo={queue[cropped.length]}
          position={queue.length > 1 ? `${cropped.length + 1} of ${queue.length}` : ''}
          onCancel={() => setQueue([])}
          onDone={(photo) => {
            const all = [...cropped, photo];
            if (all.length < queue.length) return setCropped(all);
            setQueue([]);
            setCropped([]);
            void scan(all);
          }}
        />
      )}
      {!ready && !busy && !asking && <p className="hint">{pack.name} needs a one-time download. After that it works offline.</p>}
      {asking && <DownloadAsk what={`the ${pack.name} receipt pack`} size={pack.size} onYes={download} onNo={() => setAsking(false)} />}
      {error && <p role="alert" className="error">{error}</p>}
    </>
  );
}
