import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { exportTrip } from '../backup';
import { toFrames } from '../sync/payload';
import type { TripData } from './Expenses';
import { ImportFileButton, Receive } from './Receive';

const FRAME_MS = 300;

export function Sync({ data }: { data: TripData }) {
  const { trip } = data;
  const [frames, setFrames] = useState<string[]>();
  const [receive, setReceive] = useState<{ file?: File }>();

  return (
    <>
      <div className="card">
        <h2>Send to another phone</h2>
        <p>Shows a series of QR codes that the other phone scans. Do the same the other way round to sync both phones.</p>
        <button
          className="primary"
          onClick={async () => {
            const { text, sum } = await exportTrip(trip.id);
            setFrames(toFrames(text, sum));
          }}
        >
          Show QR codes
        </button>
        <p className="hint">QR codes carry the expenses but not receipt photos. To send the photos too, use <strong>Back up trip</strong> below and share the file (AirDrop, Messages), then use Import trip file on the other phone.</p>
      </div>
      <div className="card">
        <h2>Receive from another phone</h2>
        <p>Changes are merged, so nothing on this phone is lost. You see a summary before anything is applied.</p>
        <button onClick={() => setReceive({})}>Scan QR codes</button>
        <ImportFileButton onFile={(file) => setReceive({ file })} />
      </div>
      {frames && <ShowCodes frames={frames} onClose={() => setFrames(undefined)} />}
      {receive && <Receive file={receive.file} only={trip.id} onClose={() => setReceive(undefined)} onDone={() => setReceive(undefined)} />}
    </>
  );
}

function ShowCodes({ frames, onClose }: { frames: string[]; onClose: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = setInterval(() => setI((n) => (n + 1) % frames.length), FRAME_MS);
    return () => clearInterval(timer);
  }, [frames]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Trip QR codes">
      <header className="bar">
        <button onClick={onClose}>Done</button>
        <h1>Show to the other phone</h1>
      </header>
      <main className="screen">
        <QRCodeSVG value={frames[i]} level="M" size={512} marginSize={4} className="qr" title={`Code ${i + 1} of ${frames.length}`} />
        <p className="count">Code {i + 1} of {frames.length}</p>
        <p className="empty">On the other phone, tap Scan QR codes and keep both phones still until it has read all {frames.length}.</p>
      </main>
    </div>
  );
}
