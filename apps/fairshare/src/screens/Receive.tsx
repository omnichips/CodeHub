import { useEffect, useRef, useState } from 'react';
import { applyImport, previewImport } from '../backup';
import type { Snapshot, Summary } from '../sync/merge';
import { createCollector, decodePayload, MAX_SIZE } from '../sync/payload';

const SCAN_EVERY_MS = 120;

async function readTripFile(file: File): Promise<string> {
  if (file.size > MAX_SIZE) throw new Error('This trip is too large to import');
  return file.text();
}

export function ImportFileButton({ onFile }: { onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        aria-label="Trip file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onFile(file);
        }}
      />
      <button type="button" onClick={() => input.current?.click()}>Import trip file</button>
    </>
  );
}

/**
 * One modal for the whole receive flow, so the camera never survives a screen change: scan (or pick a file),
 * then preview, then apply. Nothing is written until the person taps Apply.
 */
export function Receive({ file, only, onClose, onDone }: { file?: File; only?: string; onClose: () => void; onDone: (tripId: string) => void }) {
  const [remote, setRemote] = useState<Snapshot>();
  const [error, setError] = useState('');

  const accept = async (text: string) => {
    try {
      const incoming = await decodePayload(text);
      if (only && incoming.trip.id !== only) throw new Error('This is a different trip. Import it from the trip list instead.');
      setRemote(incoming);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    if (file) readTripFile(file).then(accept, (e: Error) => setError(e.message));
  }, [file]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Receive trip">
      <header className="bar">
        <button onClick={onClose}>Cancel</button>
        <h1>{remote ? 'Review changes' : 'Receive trip'}</h1>
      </header>
      <main className="screen">
        {remote ? <Preview remote={remote} onClose={onClose} onDone={onDone} /> : <Scan onText={accept} onError={setError} />}
        {error && <p role="alert" className="error">{error}</p>}
      </main>
    </div>
  );
}

function Preview({ remote, onClose, onDone }: { remote: Snapshot; onClose: () => void; onDone: (tripId: string) => void }) {
  const [summary, setSummary] = useState<Summary>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    previewImport(remote).then(setSummary, (e: Error) => setError(e.message));
  }, [remote]);
  if (!summary) return error ? <p role="alert" className="error">{error}</p> : null;

  const changes = (
    [[summary.added, 'new'], [summary.updated, 'updated'], [summary.deleted, 'deleted']] as const
  ).filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`);
  const upToDate = !summary.newTrip && changes.length === 0;

  return (
    <div className="card">
      <h2>{remote.trip.name}</h2>
      {summary.newTrip && <p>This trip is not on this phone yet.</p>}
      <p><strong>{upToDate ? 'Already up to date' : changes.join(', ') || 'No expenses yet'}</strong></p>
      {error && <p role="alert" className="error">{error}</p>}
      {upToDate ? (
        <button className="primary" onClick={onClose}>Done</button>
      ) : (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              onDone(await applyImport(remote));
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Apply
        </button>
      )}
    </div>
  );
}

function Scan({ onText, onError }: { onText: (text: string) => void; onError: (message: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const collector = useRef(createCollector());
  const stopCamera = useRef(() => {});
  const [live, setLive] = useState(false);
  const [progress, setProgress] = useState({ have: 0, total: 0 });
  useEffect(() => () => stopCamera.current(), []);

  /** Adds scanned text to the collector. Returns true once every code is in and the payload was handed on. */
  const feed = (codes: string[]): boolean => {
    const c = collector.current;
    codes.forEach((code) => c.add(code));
    setProgress({ have: c.have, total: c.total });
    if (!c.complete) return false;
    collector.current = createCollector(); // start fresh whether or not this one turns out to be valid
    setProgress({ have: 0, total: 0 });
    try {
      onText(c.text());
    } catch (e) {
      onError((e as Error).message);
      return false;
    }
    return true;
  };

  async function start() {
    onError('');
    let stream: MediaStream | undefined;
    try {
      // The camera is requested straight from this tap, as iOS expects; the scanner code loads while the prompt is open.
      const asking = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      const loading = import('../sync/scan');
      stream = await asking;
      const { readCodes } = await loading;
      const el = video.current!;
      el.srcObject = stream;
      await el.play();

      let running = true;
      const tracks = stream.getTracks();
      stopCamera.current = () => {
        running = false;
        tracks.forEach((t) => t.stop());
      };
      setLive(true);
      void (async () => {
        while (running) {
          try {
            // Keeps going after a full set: if the payload was good this screen unmounts and stops the camera,
            // if it was rejected the person can simply keep scanning.
            feed(await readCodes(el));
          } catch {
            // a frame that cannot be read yet (camera still warming up); try the next one
          }
          await new Promise((r) => setTimeout(r, SCAN_EVERY_MS));
        }
      })();
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      onError(
        (e as Error).name === 'NotAllowedError'
          ? 'Camera access was denied. Allow it in Settings, or import photos or a trip file below.'
          : 'The camera is not available. Import photos of the codes or a trip file below.',
      );
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    onError('');
    try {
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const [{ readCodes }, bitmap] = await Promise.all([import('../sync/scan'), createImageBitmap(file)]);
          const done = feed(await readCodes(bitmap));
          bitmap.close();
          if (done) return;
        } else {
          onText(await readTripFile(file));
          return;
        }
      }
      const { have, total } = collector.current;
      onError(have === 0 ? 'No QR code found in those photos.' : `Read ${have} of ${total} codes. Add the remaining photos.`);
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <>
      {/* Always rendered (a display:none video may not deliver frames on iOS); black until the camera starts. */}
      <video ref={video} className="viewfinder" muted playsInline aria-label="Camera view" />
      {live ? (
        <p>Point the camera at the codes on the other phone and keep both phones still.</p>
      ) : (
        <button className="primary" onClick={start}>Start camera</button>
      )}
      {progress.total > 0 && (
        <>
          <progress max={progress.total} value={progress.have} aria-label="Codes read" />
          <p>{progress.have} of {progress.total} codes read</p>
        </>
      )}
      <label>
        Or import photos of the codes, or a trip file
        <input type="file" multiple aria-label="Photos or trip file" onChange={(e) => {
          const files = e.target.files;
          void importFiles(files).then(() => (e.target.value = ''));
        }} />
      </label>
    </>
  );
}
