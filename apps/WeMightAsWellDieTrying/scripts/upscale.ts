// Makes a map S times bigger across and down: every tile becomes S by S tiles, so streets, sidewalks and buildings
// are that much bigger while zombies, soldiers, cars and roadblocks keep their size (room for the horde). A window
// goes to the tile of its block that still looks onto the street; a car or barricade keeps its middle; decor moves
// with its spot. The map records its scale, and the painter draws lanes and sidewalks that much wider.
import structures from '../src/data/structures.json' with { type: 'json' };
import { Grid, type MapData } from '../src/sim/grid.ts';

export function upscale(map: MapData, s = 2): MapData {
  const rows = map.rows.flatMap((row) => Array<string>(s).fill([...row].map((c) => c.repeat(s)).join('')));
  const g = new Grid({ ...map, rows, slots: [], props: [] });
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < g.w && y < g.h && !g.wall[y * g.w + x];
  const slots = (map.slots ?? []).map(([x, y]) => {
    const subs = Array.from({ length: s * s }, (_, k) => [s * x + (k % s), s * y + Math.floor(k / s)]);
    return subs.find(([a, b]) => open(a - 1, b) || open(a + 1, b) || open(a, b - 1) || open(a, b + 1)) ?? subs[0];
  });
  const widths = structures.roadblocks as Record<string, { width?: number }>;
  const props = (map.props ?? []).map((p) => {
    // A roadblock is centred on its tile along its length, and reaches below (or right of) it across.
    const width = widths[p.kind]?.width ?? 1, along = (c: number) => s * c + Math.floor((s - 1) / 2), across = (c: number) => s * c + Math.floor(((s - 1) * width) / 2);
    return p.vertical ? { ...p, tx: across(p.tx), ty: along(p.ty) } : { ...p, tx: along(p.tx), ty: across(p.ty) };
  });
  return { ...map, rows, slots, props, decor: (map.decor ?? []).map((d) => ({ ...d, x: d.x * s, y: d.y * s })), scale: (map.scale ?? 1) * s };
}
