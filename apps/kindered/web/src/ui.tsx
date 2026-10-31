import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { AVATAR_SIZE, PALETTE, PLAYER_COLORS } from '../../shared/protocol';

export function paintAvatar(canvas: HTMLCanvasElement, avatar: string, background: string) {
  canvas.width = canvas.height = AVATAR_SIZE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = background;
  g.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  [...avatar].forEach((c, i) => {
    if (c === '.') return;
    g.fillStyle = PALETTE[parseInt(c, 16)];
    g.fillRect(i % AVATAR_SIZE, Math.floor(i / AVATAR_SIZE), 1, 1);
  });
}

export function Avatar({ avatar, color, size = 48 }: { avatar: string; color: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) paintAvatar(ref.current, avatar, PALETTE[1]); }, [avatar]);
  return <canvas ref={ref} className="avatar" style={{ width: size, height: size, outlineColor: PLAYER_COLORS[color] }} aria-hidden="true" />;
}

// 12x12 pixel editor: pick a color, drag to paint. '.' (the eraser) is transparent.
export function AvatarEditor({ value, onChange }: { value: string; onChange: (avatar: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ink, setInk] = useState('2');
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => { if (ref.current) paintAvatar(ref.current, value, PALETTE[1]); }, [value]);

  const paint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - box.left) / box.width) * AVATAR_SIZE);
    const y = Math.floor(((e.clientY - box.top) / box.height) * AVATAR_SIZE);
    if (x < 0 || y < 0 || x >= AVATAR_SIZE || y >= AVATAR_SIZE) return;
    const i = y * AVATAR_SIZE + x;
    if (latest.current[i] === ink) return;
    onChange(latest.current.slice(0, i) + ink + latest.current.slice(i + 1));
  };

  return <div className="avatar-editor">
    <canvas ref={ref} className="avatar-canvas" aria-label="Draw your avatar"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); paint(e); }}
      onPointerMove={(e) => { if (e.buttons) paint(e); }} />
    <div className="swatches" role="radiogroup" aria-label="Paint color">
      {['.', ...PALETTE.map((_, i) => i.toString(16))].map((c) =>
        <button key={c} role="radio" aria-checked={ink === c} aria-label={c === '.' ? 'Eraser' : `Color ${parseInt(c, 16) + 1}`}
          className={`swatch${c === '.' ? ' eraser' : ''}`} style={c === '.' ? undefined : { background: PALETTE[parseInt(c, 16)] }}
          onClick={() => setInk(c)} />)}
    </div>
  </div>;
}

export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount() + 4; // 2-module quiet zone
    const canvas = ref.current!;
    canvas.width = canvas.height = n;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, n, n);
    g.fillStyle = '#000';
    for (let r = 0; r < n - 4; r++) for (let c = 0; c < n - 4; c++) if (q.isDark(r, c)) g.fillRect(c + 2, r + 2, 1, 1);
  }, [text]);
  return <canvas ref={ref} className="qr" style={{ width: size, height: size }} role="img" aria-label={`QR code for ${text}`} />;
}

// whole seconds left until a performance.now() deadline, re-rendering a few times a second
export function useSecondsLeft(endsAt: number | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    if (endsAt === undefined) return;
    const t = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, [endsAt]);
  return endsAt === undefined ? undefined : Math.max(0, Math.ceil((endsAt - performance.now()) / 1000));
}
