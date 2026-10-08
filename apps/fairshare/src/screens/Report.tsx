import { useEffect, useState } from 'react';
import { downloadFile } from '../backup';
import { buildReport } from '../report/data';
import { today } from '../store';
import type { TripData } from './Expenses';

/**
 * The PDF is built first, then shared on a second tap: iOS only allows the share sheet straight from a tap,
 * and building the PDF can take a moment.
 */
export function Report({ data }: { data: TripData }) {
  const { trip } = data;
  const [ready, setReady] = useState<{ file: File; replaced: boolean }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Any write to the trip bumps its clock, which makes a prepared PDF out of date.
  useEffect(() => setReady(undefined), [trip.clock]);

  async function prepare() {
    setBusy(true);
    setError('');
    try {
      const report = buildReport(data, today());
      const { renderReport } = await import('../report/pdf'); // jsPDF and the font load only when needed
      const name = `${trip.name.replace(/[^\p{L}\p{N}-]+/gu, '_')}.pdf`;
      setReady({ file: new File([renderReport(report)], name, { type: 'application/pdf' }), replaced: report.replaced });
    } catch (e) {
      setError(`Could not create the PDF: ${(e as Error).message}`);
    }
    setBusy(false);
  }

  const canShare = !!ready && typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] });

  return (
    <div className="card">
      <h2>Report</h2>
      <p>A PDF with the expenses, each member's totals, balances and who pays whom.</p>
      {!ready ? (
        <button className="primary" disabled={busy} onClick={prepare}>{busy ? 'Creating PDF…' : 'Create PDF'}</button>
      ) : (
        <>
          <p role="status">PDF ready: {ready.file.name}</p>
          {ready.replaced && <p>Some characters (such as Chinese, Thai or emoji) cannot be printed and appear as ?</p>}
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
        </>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}
