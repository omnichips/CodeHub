import { describe, expect, it } from 'vitest';
import { clampInputAxis, pointInVisionCone, segmentIntersectsCircle } from '../../shared/protocol';
import { FriendGame } from '../../shared/game';

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
