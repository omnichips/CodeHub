import { stepMovement, type GamePlayer, type GameSnapshot } from '../../shared/game';
import type { MovementInput } from '../../shared/protocol';

// Other players are drawn this far in the past, between two real snapshots, so a late or lost packet doesn't stutter.
export const INTERPOLATION_MS = 100;
// Bigger corrections than this snap instead of gliding (respawns, being shoved through a gap).
const SNAP_DISTANCE = 80;

type Point = { x: number; y: number };

// Client-side view of the match: interpolates other players and predicts the local one.
export class NetView {
  readonly shown = new Map<string, Point>();
  private history: { time: number; players: Map<string, Point> }[] = [];
  private pending: { input: MovementInput; seconds: number }[] = [];
  private predicted?: GamePlayer;

  // predict is off for the host: its own snapshots are already instant
  constructor(private readonly localId: string, private readonly predict: boolean) {}

  receive(state: GameSnapshot, now: number) {
    this.history.push({ time: now, players: new Map(state.players.map((player) => [player.id, { x: player.x, y: player.y }])) });
    while (this.history.length > 2 && this.history[0].time < now - 1000) this.history.shift();
    if (!this.predict) return;
    const server = state.players.find((player) => player.id === this.localId);
    if (!server || state.phase !== 'active' || !server.alive) { this.predicted = undefined; this.pending = []; return; }
    // reconcile: start from the host's word, then replay the inputs it hasn't applied yet
    this.pending = this.pending.filter((entry) => entry.input.sequence > state.ack);
    const predicted = { ...server };
    for (const entry of this.pending) this.step(predicted, entry.input, entry.seconds, state);
    this.predicted = predicted;
  }

  input(input: MovementInput, seconds: number, state: GameSnapshot) {
    if (!this.predicted || state.phase !== 'active') return;
    this.pending.push({ input, seconds });
    if (this.pending.length > 90) this.pending.shift();
    this.step(this.predicted, input, seconds, state);
  }

  position(player: GamePlayer, now: number): Point {
    const isLocal = player.id === this.localId;
    const target = isLocal ? this.predicted ?? player : this.interpolate(player.id, now - INTERPOLATION_MS) ?? player;
    const shown = this.shown.get(player.id);
    // the local player glides out small corrections; interpolated players are already smooth
    const next = !shown || Math.hypot(target.x - shown.x, target.y - shown.y) > SNAP_DISTANCE || !isLocal
      ? { x: target.x, y: target.y }
      : { x: shown.x + (target.x - shown.x) * 0.5, y: shown.y + (target.y - shown.y) * 0.5 };
    this.shown.set(player.id, next);
    return next;
  }

  private step(player: GamePlayer, input: MovementInput, seconds: number, state: GameSnapshot) {
    player.stun = Math.max(0, player.stun - seconds);
    player.exhausted = Math.max(0, player.exhausted - seconds);
    stepMovement(player, input, seconds, state.mode, state.itBoost);
  }

  private interpolate(id: string, time: number): Point | undefined {
    for (let index = this.history.length - 1; index > 0; index -= 1) {
      const before = this.history[index - 1], after = this.history[index];
      if (before.time > time) continue;
      const a = before.players.get(id), b = after.players.get(id);
      if (!a || !b) return b ?? a;
      const t = Math.min(1, (time - before.time) / Math.max(1, after.time - before.time));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    return undefined;
  }
}
