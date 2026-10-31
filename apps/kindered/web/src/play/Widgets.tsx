import { useState } from 'react';
import type { Widget } from '../../../shared/protocol';

type Send = (widget: string, value: unknown, fast?: boolean) => void;

// Draws whatever list of widgets the host sent. Modes never ship phone code of their own.
export function Widgets({ widgets, send }: { widgets: Widget[]; send: Send }) {
  return <div className="widgets">{widgets.map((w, i) => <One key={`${w.kind}-${'id' in w ? w.id : i}`} w={w} send={send} />)}</div>;
}

function One({ w, send }: { w: Widget; send: Send }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<number>();
  switch (w.kind) {
    case 'text': return <p className={w.big ? 'w-text big glow' : 'w-text'}>{w.text}</p>;
    case 'wait': return <p className="w-wait">{w.text}</p>;
    case 'choice': return <div className="w-choices">{w.options.map((o, i) =>
      <button key={i} className={`btn choice c${i}`} aria-pressed={picked === i} onClick={() => { setPicked(i); send(w.id, i); }}>{o}</button>)}</div>;
    case 'input': return <form className="w-input" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { send(w.id, text.trim()); setText(''); } }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={w.placeholder} maxLength={80} enterKeyHint="send" aria-label={w.placeholder ?? 'Your answer'} />
      <button className="btn">SEND</button>
    </form>;
    case 'tap': return <button className="btn w-tap"
      onPointerDown={() => send(w.id, w.hold ? 'down' : 'tap')}
      onPointerUp={() => { if (w.hold) send(w.id, 'up'); }}
      onPointerCancel={() => { if (w.hold) send(w.id, 'up'); }}
      onContextMenu={(e) => e.preventDefault()}>{w.label}</button>;
    case 'dpad': return <div className="w-dpad" onContextMenu={(e) => e.preventDefault()}>{(['up', 'left', 'right', 'down'] as const).map((d) =>
      <button key={d} className={`btn pad-${d}`} aria-label={d}
        onPointerDown={() => send(w.id, d, true)} onPointerUp={() => send(w.id, 'stop', true)} onPointerCancel={() => send(w.id, 'stop', true)}>
        {{ up: '▲', left: '◀', right: '▶', down: '▼' }[d]}
      </button>)}</div>;
  }
}
