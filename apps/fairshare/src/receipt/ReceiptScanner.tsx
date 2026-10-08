import { useEffect, useRef, useState } from 'react';
import { downloadPack, hasPack, PACKS, saveLang, savedLang, type Lang } from './packs';

/** Language picker, pack download and "Scan receipt". onRead gets the text and returns an error message or null. */
export function ReceiptScanner({ onRead }: { onRead: (text: string) => string | null }) {
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

  async function run(label: string, task: (progress: (p: number) => void) => Promise<void>, failure: string) {
    setError('');
    setBusy(`${label}…`);
    try {
      await task((p) => setBusy(`${label}… ${Math.round(p * 100)}%`));
    } catch {
      setError(failure);
    } finally {
      setBusy(null);
    }
  }

  const scan = (photo: File) =>
    run('Reading receipt', async (progress) => {
      const { readReceipt } = await import('./ocr'); // about 7 MB, so only loaded when used
      const problem = onRead(await readReceipt(photo, lang, progress));
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
          hidden
          aria-label="Receipt photo"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void scan(file);
          }}
        />
        {ready ? (
          <button disabled={busy !== null} onClick={() => input.current?.click()}>{busy ?? 'Scan receipt'}</button>
        ) : (
          <button disabled={busy !== null} onClick={download}>{busy ?? `Download pack (${pack.size})`}</button>
        )}
      </div>
      {!ready && !busy && <p className="hint">{pack.name} needs a one-time download. After that it works offline.</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </>
  );
}
