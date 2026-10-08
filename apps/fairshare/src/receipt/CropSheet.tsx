import { useEffect, useRef, useState } from 'react';

type Rect = { x: number; y: number; w: number; h: number }; // fractions of the (rotated) photo, 0..1
type Grip = 'move' | 'nw' | 'ne' | 'sw' | 'se';

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const MIN = 0.08;
/** Longest side kept while cropping; the reader shrinks to 2000 anyway, and phone canvases have a size limit. */
const MAX_SIDE = 3000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The photo, turned a quarter-turn `turns` times (EXIF rotation applied by the browser) and scaled to MAX_SIDE. */
async function turned(photo: Blob, turns: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  const sideways = turns % 2 === 1;
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const g = canvas.getContext('2d')!;
  g.translate(canvas.width / 2, canvas.height / 2);
  g.rotate((turns * Math.PI) / 2);
  g.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();
  return canvas;
}

function moved(start: Rect, grip: Grip, dx: number, dy: number): Rect {
  if (grip === 'move') return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  let { x, y, w, h } = start;
  if (grip.includes('w')) {
    const nx = clamp(x + dx, 0, x + w - MIN);
    w += x - nx;
    x = nx;
  } else w = clamp(w + dx, MIN, 1 - x);
  if (grip.includes('n')) {
    const ny = clamp(y + dy, 0, y + h - MIN);
    h += y - ny;
    y = ny;
  } else h = clamp(h + dy, MIN, 1 - y);
  return { x, y, w, h };
}

const GRIPS: [Grip, string, string][] = [
  ['nw', 'Top left corner', 'left: 0; top: 0'],
  ['ne', 'Top right corner', 'left: 100%; top: 0'],
  ['sw', 'Bottom left corner', 'left: 0; top: 100%'],
  ['se', 'Bottom right corner', 'left: 100%; top: 100%'],
];
const place = (css: string) => Object.fromEntries(css.split(';').map((p) => p.split(':').map((s) => s.trim()))) as React.CSSProperties;

/** Crop and rotate one photo before reading it. onDone gets the cropped photo; "Use whole photo" gets it uncropped. */
export function CropSheet(props: { photo: File; position: string; onDone: (photo: Blob) => void; onCancel: () => void }) {
  const [turns, setTurns] = useState(0);
  const [rect, setRect] = useState<Rect>(FULL);
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const view = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ grip: Grip; x: number; y: number; start: Rect } | null>(null);

  useEffect(() => {
    let live = true;
    turned(props.photo, turns).then(
      (c) => live && (setBase(c), setRect(FULL)),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [props.photo, turns]);

  useEffect(() => {
    if (!base || !view.current) return;
    view.current.width = base.width;
    view.current.height = base.height;
    view.current.getContext('2d')!.drawImage(base, 0, 0);
  }, [base]);

  function finish(r: Rect) {
    if (!base) return props.onDone(props.photo);
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(base.width * r.w));
    out.height = Math.max(1, Math.round(base.height * r.h));
    out.getContext('2d')!.drawImage(base, base.width * r.x, base.height * r.y, out.width, out.height, 0, 0, out.width, out.height);
    out.toBlob((b) => (b ? props.onDone(b) : props.onDone(props.photo)), 'image/jpeg', 0.92);
  }

  const down = (grip: Grip) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { grip, x: e.clientX, y: e.clientY, start: rect };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    const box = stage.current?.getBoundingClientRect();
    if (!d || !box) return;
    setRect(moved(d.start, d.grip, (e.clientX - d.x) / box.width, (e.clientY - d.y) / box.height));
  };
  const up = () => (drag.current = null);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Crop receipt">
      <header className="bar">
        <button onClick={props.onCancel}>Cancel</button>
        <h1>Crop receipt{props.position && ` · ${props.position}`}</h1>
      </header>
      <div className="screen">
        <p className="hint">Drag the corners so only the receipt is inside the box. Tap Rotate if it is sideways.</p>
        {failed ? (
          <p role="alert" className="error">This photo cannot be cropped. Use the whole photo instead.</p>
        ) : (
          <div className="crop-stage">
            <div className="crop-image" ref={stage}>
            <canvas ref={view} role="img" aria-label="Your photo" />
            {base && (
              <div
                className="crop-box"
                data-testid="crop-box"
                style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
                onPointerDown={down('move')}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
              >
                {GRIPS.map(([grip, label, css]) => (
                  <div key={grip} className="crop-grip" role="presentation" data-grip={grip} title={label} style={place(css)} onPointerDown={down(grip)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
                ))}
              </div>
            )}
            </div>
          </div>
        )}
        <div className="two">
          <button onClick={() => setTurns((turns + 1) % 4)} disabled={failed}>Rotate</button>
          <button onClick={() => props.onDone(props.photo)}>Use whole photo</button>
        </div>
        <button className="primary" disabled={!base} onClick={() => finish(rect)}>Read receipt</button>
      </div>
    </div>
  );
}
