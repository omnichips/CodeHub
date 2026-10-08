import { useEffect, useRef, useState } from 'react';
import { DownloadAsk } from '../ui';
import { CropSheet } from './CropSheet';
import { downloadPack, hasPack, PACKS, saveLang, savedLang, type Lang } from './packs';

type Props = {
  /** One text and one (cropped) photo per photo; returns an error message or null. */
  onRead: (texts: string[], photos: Blob[]) => string | null | Promise<string | null>;
  /** "No, just attach": keep the photos with the expense without reading them. */
  onAttach: (photos: Blob[]) => Promise<void>;
};

/**
 * The camera button and its steps: the phone's own photo picker (iOS offers Photo Library, Take Photo, Choose File),
 * then "Scan as receipt?" (with the accuracy warning),
 * the receipt language (downloading its pack if needed, after asking), then crop and read.
 */
export function ReceiptScanner({ onRead, onAttach }: Props) {
  const [step, setStep] = useState<'ask' | 'lang' | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [lang, setLang] = useState<Lang>(savedLang);
  const [installed, setInstalled] = useState<Partial<Record<Lang, boolean>>>({ eng: true });
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Photos waiting to be cropped, and the ones already cropped. Each photo gets its own crop screen.
  const [queue, setQueue] = useState<File[]>([]);
  const [cropped, setCropped] = useState<Blob[]>([]);
  const library = useRef<HTMLInputElement>(null);
  const pack = PACKS.find((p) => p.code === lang)!;

  useEffect(() => {
    if (step !== 'lang') return;
    let live = true;
    Promise.all(PACKS.map(async (p) => [p.code, await hasPack(p.code)] as const)).then((all) => live && setInstalled(Object.fromEntries(all)));
    return () => {
      live = false;
    };
  }, [step]);

  async function run(label: string, task: (progress: (p: number, step?: string) => void) => Promise<void>, failure: string) {
    setError('');
    setBusy(`${label}…`);
    try {
      await task((p, s = label) => setBusy(`${s}… ${Math.round(p * 100)}%`));
    } catch (e) {
      // The reason is shown too (e.g. "out of memory", "Failed to fetch"), so a failure on a phone can be diagnosed.
      const why = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
      setError(why ? `${failure} (${why.slice(0, 120)})` : failure);
    } finally {
      setBusy(null);
    }
  }

  const picked = (list: FileList | null) => {
    const chosen = [...(list ?? [])];
    if (!chosen.length) return;
    setFiles(chosen);
    setError('');
    setStep('ask');
  };

  const read = (photos: Blob[]) =>
    run('Reading receipt', async (progress) => {
      const { readReceipts } = await import('./ocr'); // about 7 MB, so only loaded when used
      const texts = await readReceipts(photos, lang, (i, p) => progress(p, photos.length > 1 ? `Reading receipt ${i + 1} of ${photos.length}` : 'Reading receipt'));
      const problem = await onRead(texts, photos);
      if (problem) setError(problem);
    }, 'Could not read that photo. Try again, or add the items by hand.');

  const startCrop = () => {
    setStep(null);
    setCropped([]);
    setQueue(files);
  };

  const download = () => {
    setAsking(false);
    return run(`Downloading ${pack.name}`, async (progress) => {
      await downloadPack(lang, progress);
      setInstalled((i) => ({ ...i, [lang]: true }));
      startCrop();
    }, `Could not download the ${pack.name} pack. Check your internet connection and try again.`);
  };


  return (
    <>
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        hidden
        aria-label="Receipt photos"
        onChange={(e) => {
          picked(e.target.files);
          e.target.value = '';
        }}
      />
      {busy && <p role="status" className="scan-status">{busy}</p>}
      {error && <p role="alert" className="error">{error}</p>}

      <button className="fab-add fab-camera" aria-label="Add receipt photo" disabled={busy !== null} onClick={() => library.current?.click()}>
        <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
          <path d="M9 4h6l1.5 2H20a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="12" cy="12.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>

      {step === 'ask' && (
        <ActionSheet label="Scan as receipt?" onClose={() => setStep(null)}>
          <h2 className="sheet-title">Scan as receipt?</h2>
          <p>
            FairShare can read the items and prices from {files.length > 1 ? `these ${files.length} photos` : 'this photo'} on your phone.{' '}
            <strong>Reading is automatic and may not be accurate:</strong> check every line and price before saving.
          </p>
          <button className="primary" onClick={() => setStep('lang')}>Yes, scan it</button>
          <button
            onClick={() => {
              setStep(null);
              void run('Attaching photo', () => onAttach(files), 'Could not use that photo. Try another one.');
            }}
          >
            No, just attach the photo
          </button>
        </ActionSheet>
      )}

      {step === 'lang' && (
        <ActionSheet label="Receipt language" onClose={() => (setStep(null), setAsking(false))}>
          <h2 className="sheet-title">Receipt language</h2>
          <fieldset className="choices">
            <legend className="hint">The language printed on the receipt.</legend>
            {PACKS.map((p) => (
              <label key={p.code} className="check">
                <input
                  type="radio"
                  name="receipt-lang"
                  checked={lang === p.code}
                  onChange={() => {
                    setLang(p.code);
                    saveLang(p.code);
                    setAsking(false);
                  }}
                />
                <span>
                  {p.name}
                  {!installed[p.code] && p.size && <small className="muted"> · download {p.size}</small>}
                </span>
              </label>
            ))}
          </fieldset>
          {asking ? (
            <DownloadAsk what={`the ${pack.name} receipt pack`} size={pack.size} onYes={download} onNo={() => setAsking(false)} />
          ) : (
            <button className="primary" disabled={busy !== null} onClick={() => (installed[lang] ? startCrop() : setAsking(true))}>
              Scan
            </button>
          )}
        </ActionSheet>
      )}

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
            void read(all);
          }}
        />
      )}
    </>
  );
}

/** A panel that slides up from the bottom over a dimmed screen, iOS action-sheet style, with Cancel at the bottom. */
function ActionSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label={label}>
        {children}
        <button className="cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
