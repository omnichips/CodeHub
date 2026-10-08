import { useEffect, useRef, useState } from 'react';
import { downloadPack, hasPack, PACKS, saveLang, savedLang, type Lang } from './packs';

/** Language picker, pack download and "Scan receipts". onRead gets one text per photo and returns an error message or null. */
export function ReceiptScanner({ onRead }: { onRead: (texts: string[]) => string | null }) {
  const [lang, setLang] = useState<Lang>(savedLang);
  const [ready, setReady] = useState(lang === 'eng');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
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

  const scan = (photos: File[]) =>
    run('Reading receipt', async (progress) => {
      const { readReceipts } = await import('./ocr'); // about 7 MB, so only loaded when used
      const texts = await readReceipts(photos, lang, (i, p) =>
        progress(p, photos.length > 1 ? `Reading receipt ${i + 1} of ${photos.length}` : 'Reading receipt'),
      );
      const problem = onRead(texts);
      if (problem) setError(problem);
    }, 'Could not read that photo. Try again, or add the items by hand.');

  const download = () =>
    run(`Downloading ${pack.name}`, async (progress) => {
      await downloadPack(lang, progress);
      setReady(true);
    }, `Could not download the ${pack.name} pack. Connect to the internet and try again.`);

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
            if (files.length) void scan(files);
          }}
        />
        {ready ? (
          <button disabled={busy !== null} onClick={() => input.current?.click()}>{busy ?? 'Scan receipts'}</button>
        ) : (
          <button disabled={busy !== null} onClick={download}>{busy ?? `Download pack (${pack.size})`}</button>
        )}
      </div>
      {!ready && !busy && <p className="hint">{pack.name} needs a one-time download. After that it works offline.</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </>
  );
}
