import { describe, expect, it } from 'vitest';
import { clampInputAxis, pointInVisionCone, segmentIntersectsCircle } from '../../shared/protocol';
import { FriendGame } from '../../shared/game';
import { OBSTACLES } from '../../shared/obstacles';

describe('movement input validation', () => {
  it('clamps invalid and oversized axes', () => {
    expect(clampInputAxis(2)).toBe(1);
    expect(clampInputAxis(-2)).toBe(-1);
    expect(clampInputAxis('right')).toBe(0);
  });

  it('accepts targets inside the laser cone and rejects targets outside range', () => {
    expect(pointInVisionCone(0, 0, 0, 100, 0)).toBe(true);
    expect(pointInVisionCone(0, 0, 0, 100, 100)).toBe(false);
    expect(pointInVisionCone(0, 0, 0, 500, 0)).toBe(false);
  });

  it('detects spear segments intersecting player circles', () => {
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 10, 12)).toBe(true);
    expect(segmentIntersectsCircle(0, 0, 100, 0, 50, 20, 12)).toBe(false);
  });

  it('starts a ready room and advances host-authoritative movement', () => {
    const game = new FriendGame('ABC123');
    game.addPlayer('host', 'Host');
    game.addPlayer('guest', 'Guest');
    game.toggleReady('host');
    game.toggleReady('guest');
    game.start('host');
    for (let tick = 0; tick < 30; tick += 1) game.tick(100);
    game.receiveMovement('host', { sequence: 1, x: 1, y: 0, sprint: false });
    const before = game.players.get('host')!.x;
    game.tick(1000);
    expect(game.phase).toBe('active');
    expect(game.players.get('host')!.x).toBeGreaterThan(before);
  });

  it('applies tag rules: 6 players, IT speed, immunity, exhaustion, still dummies', () => {
    const game = new FriendGame('TAG001');
    game.addPlayer('host', 'Host');
    for (let index = 0; index < 5; index += 1) game.addBot(true);
    expect(() => game.addPlayer('extra', 'Extra')).toThrow('Room is full.');
    game.removePlayer('dummy-5');
    game.toggleReady('host');
    game.start('host');
    for (let tick = 0; tick < 31; tick += 1) game.tick(100);
    const host = game.players.get('host')!;
    const dummy = game.players.get('dummy-1')!;
    const spawn = { x: dummy.x, y: dummy.y };
    // IT outruns the normal speed
    const before = host.x;
    game.receiveMovement('host', { sequence: 1, x: 1, y: 0, sprint: false });
    game.tick(100);
    expect(host.x - before).toBeGreaterThan(22);
    // tagging passes IT on; the old IT is immune and gets a 1s head start before IT speed applies
    Object.assign(host, { x: dummy.x - 10, y: dummy.y });
    game.tick(10);
    expect(dummy.isIt && !dummy.immune && host.immune > 0).toBe(true);
    game.action('dummy-1');
    expect(host.stun).toBe(0);
    expect({ x: dummy.x, y: dummy.y }).toEqual(spawn);
    // sprinting the bar dry leaves you winded
    host.x = 100;
    game.receiveMovement('host', { sequence: 2, x: 0, y: 1, sprint: true });
    for (let tick = 0; tick < 25; tick += 1) game.tick(100);
    expect(host.exhausted).toBeGreaterThan(0);
  });

  it('blocks movement through walls', () => {
    const game = new FriendGame('WALL01');
    game.mode = 'gladiator'; // the plain block layout
    game.addPlayer('host', 'Host');
    game.addPlayer('guest', 'Guest');
    game.toggleReady('host');
    game.toggleReady('guest');
    game.start('host');
    for (let tick = 0; tick < 31; tick += 1) game.tick(100);
    const host = game.players.get('host')!;
    Object.assign(host, { x: 120, y: 200 });
    game.receiveMovement('host', { sequence: 1, x: 1, y: 0, sprint: false });
    for (let tick = 0; tick < 20; tick += 1) game.tick(100);
    expect(host.x).toBeLessThanOrEqual(OBSTACLES[1].x - 18 + 0.01);
  });

  it('scores tag by survival: seconds, streak bonus, last-survivor bonus', () => {
    const game = new FriendGame('SCORE1');
    game.addPlayer('host', 'Host');
    game.addBot(true);
    game.toggleReady('host');
    game.start('host');
    for (let tick = 0; tick < 31; tick += 1) game.tick(100);
    for (let tick = 0; tick < 150; tick += 1) game.tick(100);
    expect(game.players.get('host')!.score).toBe(0);
    expect(game.players.get('dummy-1')!.score).toBeGreaterThan(19);
    for (let tick = 0; tick < 1800 && game.phase !== 'results'; tick += 1) game.tick(100);
    expect(game.phase).toBe('results');
    // 180s untagged = 180 + 18 streak bonuses (90) + 10 last survivor, minus a little for the countdown tick rounding
    expect(game.players.get('dummy-1')!.score).toBeGreaterThan(270);
  });

  it.each(['tag', 'gladiator', 'laser'] as const)('runs a solo %s match where bots move and score', (mode) => {
    const game = new FriendGame('SOLO01');
    game.mode = mode;
    game.addPlayer('host', 'Host');
    for (let bot = 0; bot < 3; bot += 1) game.addBot();
    game.toggleReady('host');
    game.start('host');
    expect(game.phase).toBe('countdown');
    // a bot starts as IT so the tag check proves it catches the idle host
    game.players.get('host')!.isIt = false;
    game.players.get('bot-0')!.isIt = true;
    const spawn = game.players.get('bot-0')!.x;
    for (let tick = 0; tick < 30 * 60 && game.phase !== 'results'; tick += 1) game.tick(1000 / 30);
    const bots = [...game.players.values()].filter((player) => player.id.startsWith('bot-'));
    expect(game.players.get('bot-0')!.x).not.toBe(spawn);
    if (mode === 'tag') expect(game.players.get('host')!.itTime).toBeGreaterThan(0);
    if (mode === 'gladiator') expect(bots.reduce((sum, bot) => sum + bot.eliminations, 0)).toBeGreaterThan(0);
    if (mode === 'laser') expect(bots.reduce((sum, bot) => sum + bot.kills, 0)).toBeGreaterThan(0);
  });
});
