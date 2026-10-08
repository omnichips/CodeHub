// Runs the e2e tests including the receipt-reading ones (slow: they run the real text-reading engine).
// Normal `npm run test:e2e` skips those. Run this when src/receipt/, the receipt part of ExpenseSheet,
// the OCR/pack settings in vite.config.ts or the tesseract.js / language-pack versions change.
// Extra arguments go to Playwright, e.g. npm run test:e2e:ocr -- receipt -g "kept".
import { spawnSync } from 'node:child_process';

const run = spawnSync('npx', ['playwright', 'test', ...process.argv.slice(2)], { stdio: 'inherit', shell: true, env: { ...process.env, OCR: '1' } });
process.exit(run.status ?? 1);
