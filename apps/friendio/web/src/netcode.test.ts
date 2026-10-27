import { describe, expect, it } from 'vitest';
import { FriendGame } from '../../shared/game';
import { NetView } from './netcode';

const activeGame = () => {
  const game = new FriendGame('NET001');
  game.mode = 'gladiator'; // plain movement, no sprint or IT speed
  game.addPlayer('host', 'Host');
  game.addPlayer('guest', 'Guest');
  game.toggleReady('host');
  game.toggleReady('guest');
  game.start('host');
  for (let tick = 0; tick < 31; tick += 1) game.tick(100);
  return game;
};

describe('netcode', () => {
  it('draws other players between two snapshots, 100ms in the past', () => {
    const game = activeGame();
    const view = new NetView('guest', true);
    const other = game.players.get('host')!;
    Object.assign(other, { x: 100, y: 100 });
    view.receive(game.snapshot('guest'), 1000);
    Object.assign(other, { x: 200, y: 100 });
    view.receive(game.snapshot('guest'), 1100);
    expect(view.position({ ...other }, 1150).x).toBeCloseTo(150);
  });

  it('predicts the local player and replays inputs the host has not applied yet', () => {
    const game = activeGame();
    const view = new NetView('guest', true);
    const guest = game.players.get('guest')!;
    Object.assign(guest, { x: 480, y: 270 - 120 });
    view.receive(game.snapshot('guest'), 0);
    const input = (sequence: number) => ({ sequence, x: 1, y: 0, sprint: false });
    view.input(input(1), 1 / 30, game.snapshot('guest'));
    view.input(input(2), 1 / 30, game.snapshot('guest'));
    const predicted = view.position({ ...guest }, 0).x;
    expect(predicted).toBeGreaterThan(480 + 14);
    // the host applies input 1 only; the guest keeps input 2 on top of the host's position
    game.receiveMovement('guest', input(1));
    game.tick(1000 / 30);
    view.receive(game.snapshot('guest'), 33);
    for (let frame = 0; frame < 10; frame += 1) view.position({ ...guest }, 33);
    expect(view.position({ ...guest }, 33).x).toBeCloseTo(guest.x + 220 / 30, 0);
  });
});
