import { useEffect, useState } from 'react';
import { downloadFile } from '../backup';
import { FONT_PACK, downloadFontPack, fontPackBase64 } from '../receipt/packs';
import { buildReport } from '../report/data';
import { today } from '../store';
import { DownloadAsk } from '../ui';
import type { TripData } from './Expenses';

/**
 * The PDF is built first, then shared on a second tap: iOS only allows the share sheet straight from a tap,
 * and building the PDF can take a moment.
 */
export function Report({ data }: { data: TripData }) {
  const { trip } = data;
  const [ready, setReady] = useState<{ file: File; replaced: boolean; needsJapanese: boolean }>();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(''); // what is happening: shown under the animation
  const [error, setError] = useState('');
  // Any write to the trip bumps its clock, which makes a prepared PDF out of date.
  useEffect(() => setReady(undefined), [trip.clock]);

  async function prepare() {
    setBusy('Creating PDF…');
    setError('');
    const shown = new Promise((done) => setTimeout(done, 1200)); // the little page animation plays through once
    try {
      let report = buildReport(data, today());
      // Japanese or Chinese characters need the downloadable font. With it, the whole report is set in that font.
      const font = report.needsJapanese ? await fontPackBase64() : null;
      if (font) report = buildReport(data, today(), true);
      const { renderReport } = await import('../report/pdf'); // jsPDF and the font load only when needed
      const name = `${trip.name.replace(/[^\p{L}\p{N}-]+/gu, '_')}.pdf`;
      const file = new File([renderReport(report, font ?? undefined)], name, { type: 'application/pdf' });
      await shown;
      setReady({ file, replaced: report.replaced, needsJapanese: report.needsJapanese });
    } catch (e) {
      setError(`Could not create the PDF: ${(e as Error).message}`);
    }
    setBusy('');
  }

  async function getFont() {
    setAsking(false);
    setBusy('Downloading font…');
    setError('');
    try {
      await downloadFontPack(() => undefined);
    } catch {
      setError('Could not download the font. Check your internet connection and try again.');
      setBusy('');
      return;
    }
    await prepare();
  }

  const canShare = !!ready && typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] });

  return (
    <div className="card">
      <h2>Report</h2>
      <p>A PDF with the expenses, each member's totals, balances and who pays whom.</p>
      {busy ? (
        <div className="pdf-making" role="status">
          <span className="pdf-page" aria-hidden="true"><i /><i /><i /><i /></span>
          {busy}
        </div>
      ) : !ready ? (
        <button className="primary" onClick={prepare}>Create PDF</button>
      ) : (
        <>
          <p role="status" className="pdf-ready">PDF ready: {ready.file.name}</p>
          {ready.replaced && <p>Some characters (such as Thai, Arabic or emoji) cannot be printed and appear as ?</p>}
          {ready.needsJapanese && !asking && (
            <>
              <p>Japanese or Chinese characters appear as ? because the PDF font does not have them.</p>
              <button onClick={() => setAsking(true)}>{`Get the ${FONT_PACK.name} (${FONT_PACK.size})`}</button>
            </>
          )}
          {asking && <DownloadAsk what={`the ${FONT_PACK.name}`} size={FONT_PACK.size} onYes={getFont} onNo={() => setAsking(false)} />}
          {canShare && (
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.share({ files: [ready.file], title: trip.name });
                } catch (e) {
                  if ((e as Error).name !== 'AbortError') setError('Sharing did not work. Use Download instead.');
                }
              }}
            >
              Share PDF
            </button>
          )}
          <button className={canShare ? '' : 'primary'} onClick={() => downloadFile(ready.file.name, ready.file, 'application/pdf')}>
            Download PDF
          </button>
          <button onClick={prepare}>Generate again</button>
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
