import { describe, expect, it } from 'vitest';
import { Engine } from '../../shared/engine';
import { ROUND_MS } from '../../shared/modes/tap';
import { AWAY_MS, BLANK_AVATAR, SEAT_HOLD_MS } from '../../shared/protocol';

const join = (e: Engine, name: string, now = 0, token?: string) => {
  const r = e.join(name, BLANK_AVATAR, token, now);
  if (!r.ok) throw new Error(r.reason);
  return r.player;
};

describe('engine', () => {
  it('seats up to 8 players and rejects the 9th, duplicates and blanks', () => {
    const e = new Engine('ABCD', 'tap');
    for (let i = 0; i < 8; i++) join(e, `P${i}`);
    expect(e.join('Nine', '', undefined, 0)).toEqual({ ok: false, reason: 'The room is full.' });
    const f = new Engine('ABCD', 'tap');
    join(f, 'Ann');
    expect(f.join(' ann ', '', undefined, 0).ok).toBe(false);
    expect(f.join('   ', '', undefined, 0).ok).toBe(false);
  });

  it('gives a rejoining phone its seat back by token, even mid-game', () => {
    const e = new Engine('ABCD', 'tap');
    const ann = join(e, 'Ann');
    e.start(0);
    e.disconnect(ann.id);
    expect(e.join('Someone', '', undefined, 1).ok).toBe(false); // started: no new players
    expect(join(e, 'whatever', 1, ann.token).id).toBe(ann.id);
  });

  it('marks a silent phone away and frees its lobby seat after the hold time', () => {
    const e = new Engine('ABCD', 'tap');
    const ann = join(e, 'Ann');
    expect(e.publicPlayers(AWAY_MS + 1)[0].status).toBe('away');
    e.disconnect(ann.id);
    e.tick(SEAT_HOLD_MS - 1);
    expect(e.players).toHaveLength(1);
    e.tick(SEAT_HOLD_MS + 1);
    expect(e.players).toHaveLength(0);
  });

  it('runs the tap mode to a result on its timer, and each phone sees only its own count', () => {
    const e = new Engine('ABCD', 'tap');
    const a = join(e, 'Ann'), b = join(e, 'Bob');
    e.start(0);
    expect(e.view(a.id, 0).timeLeftMs).toBe(ROUND_MS);
    e.input(a.id, 'tap', 'tap', 100);
    e.input(a.id, 'tap', 'tap', 200);
    e.input(b.id, 'tap', 'tap', 300);
    expect(e.view(b.id, 300).widgets).toContainEqual({ kind: 'text', text: '1' });
    e.tick(ROUND_MS);
    expect(e.phase).toBe('ended');
    expect(e.results).toEqual({ [a.id]: 2, [b.id]: 1 });
    e.input(a.id, 'tap', 'tap', ROUND_MS + 1); // late taps do nothing
    expect(e.results![a.id]).toBe(2);
  });

  it('restores from a JSON snapshot with the timer resuming, not catching up', () => {
    const e = new Engine('ABCD', 'tap');
    const a = join(e, 'Ann');
    e.start(0);
    e.input(a.id, 'tap', 'tap', 1000);
    const saved = JSON.parse(JSON.stringify(e.snapshot(4000)));
    const r = Engine.restore(saved, 60_000); // host was gone for 56 s
    expect(r.players[0].connected).toBe(false);
    r.tick(60_000);
    expect(r.phase).toBe('playing');
    expect(r.view(a.id, 60_000).timeLeftMs).toBe(ROUND_MS - 4000);
    expect(join(r, 'x', 60_000, a.token).id).toBe(a.id);
    r.tick(60_000 + ROUND_MS);
    expect(r.results).toEqual({ [a.id]: 1 });
  });

  it('drops away players at the start and needs the mode minimum', () => {
    const e = new Engine('ABCD', 'tap');
    expect(e.start(0)).toMatch(/at least/);
    const a = join(e, 'Ann');
    join(e, 'Bob', -AWAY_MS - 1);
    expect(e.start(0)).toBeUndefined();
    expect(e.players.map((p) => p.id)).toEqual([a.id]);
  });
});
