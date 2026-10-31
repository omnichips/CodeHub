import type { SceneProps } from '.';
import { PLAYER_COLORS } from '../../../../shared/protocol';
import { Avatar } from '../../ui';

type Data = { names: Record<string, string>; taps: Record<string, number> };

function Bars({ data, players, final }: SceneProps & { final?: boolean }) {
  const { taps } = data as Data;
  const max = Math.max(10, ...Object.values(taps));
  const rows = players.filter((p) => p.id in taps).sort((a, b) => (final ? taps[b.id] - taps[a.id] : 0));
  return <ol className="bars">{rows.map((p, i) =>
    <li key={p.id} style={{ ['--c' as string]: PLAYER_COLORS[p.color] }}>
      <Avatar avatar={p.avatar} color={p.color} size={56} />
      <span className="bar-name">{final && i === 0 ? '★ ' : ''}{p.name}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${(taps[p.id] / max) * 100}%` }} /></span>
      <span className="bar-n">{taps[p.id]}</span>
    </li>)}</ol>;
}

export const tapScenes = {
  play: (p: SceneProps) => <><h2 className="scene-title glow">MASH IT!</h2><Bars {...p} /></>,
  end: (p: SceneProps) => <><h2 className="scene-title glow">RESULTS</h2><Bars {...p} final /></>,
};
