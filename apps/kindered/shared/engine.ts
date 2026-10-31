import type { Effect, ModeEvent } from './mode';
import { MODES } from './modes';
import { AWAY_MS, MAX_PLAYERS, SEAT_HOLD_MS, cleanName, isAvatar, BLANK_AVATAR, type Phase, type PhoneState, type PublicPlayer } from './protocol';

// The engine is pure: no network, no clock of its own, no timers. The host passes `now` (ms) into every call and
// calls tick() regularly; everything it holds is plain JSON, so snapshot() / restore() survive a host refresh.

type Player = { id: string; name: string; avatar: string; color: number; token: string; connected: boolean; lastSeen: number };
type Timer = { id: string; at: number; visible: boolean };

export type EngineSnapshot = {
  code: string; modeId: string; phase: Phase; players: Player[]; modeState: unknown;
  timers: Timer[]; results: Record<string, number> | null; savedAt: number;
};

export type JoinResult = { ok: true; player: Player } | { ok: false; reason: string };

export class Engine {
  phase: Phase = 'lobby';
  players: Player[] = [];
  modeState: unknown = null;
  timers: Timer[] = [];
  results: Record<string, number> | null = null;

  constructor(readonly code: string, public modeId: string) {}

  private get mode() { return MODES[this.modeId]; }
  private find = (id: string) => this.players.find((p) => p.id === id);
  private status = (p: Player, now: number): PublicPlayer['status'] => (p.connected && now - p.lastSeen <= AWAY_MS ? 'here' : 'away');

  join(name: string, avatar: string, token: string | undefined, now: number): JoinResult {
    const back = token ? this.players.find((p) => p.token === token) : undefined;
    if (back) { back.connected = true; back.lastSeen = now; return { ok: true, player: back }; }
    if (this.phase !== 'lobby') return { ok: false, reason: 'This game has already started.' };
    if (this.players.length >= MAX_PLAYERS) return { ok: false, reason: 'The room is full.' };
    const clean = cleanName(name);
    if (!clean) return { ok: false, reason: 'Pick a name first.' };
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return { ok: false, reason: 'That name is taken.' };
    const color = [...Array(MAX_PLAYERS).keys()].find((i) => !this.players.some((p) => p.color === i))!;
    const player: Player = { id: `p${color}`, name: clean, avatar: isAvatar(avatar) ? avatar : BLANK_AVATAR, color, token: crypto.randomUUID(), connected: true, lastSeen: now };
    this.players.push(player);
    return { ok: true, player };
  }

  heard(id: string, now: number) { const p = this.find(id); if (p) { p.connected = true; p.lastSeen = now; } }
  disconnect(id: string) { const p = this.find(id); if (p) p.connected = false; }
  setAvatar(id: string, avatar: string) { const p = this.find(id); if (p && this.phase === 'lobby' && isAvatar(avatar)) p.avatar = avatar; }

  start(now: number): string | undefined {
    if (this.phase !== 'lobby') return 'Already started.';
    const here = this.players.filter((p) => this.status(p, now) === 'here');
    if (here.length < this.mode.minPlayers) return `Needs at least ${this.mode.minPlayers} player${this.mode.minPlayers > 1 ? 's' : ''}.`;
    this.players = here; // away seats are dropped at the start
    this.modeState = this.mode.init(here.map(({ id, name, color }) => ({ id, name, color })));
    this.phase = 'playing';
    this.run({ type: 'start' }, now);
  }

  input(id: string, widget: string, value: unknown, now: number) {
    this.heard(id, now);
    if (this.phase === 'playing' && this.find(id)) this.run({ type: 'input', player: id, widget, value }, now);
  }

  tick(now: number) {
    if (this.phase === 'lobby') this.players = this.players.filter((p) => p.connected || now - p.lastSeen <= SEAT_HOLD_MS);
    for (;;) {
      const due = this.timers.filter((t) => t.at <= now).sort((a, b) => a.at - b.at)[0];
      if (!due || this.phase !== 'playing') break;
      this.timers = this.timers.filter((t) => t !== due);
      this.run({ type: 'timer', id: due.id }, now);
    }
  }

  reset() { this.phase = 'lobby'; this.modeState = null; this.timers = []; this.results = null; }

  private run(event: ModeEvent, now: number) {
    const out = this.mode.reduce(this.modeState, event);
    this.modeState = out.state;
    out.effects.forEach((e: Effect) => {
      if ('end' in e) { this.phase = 'ended'; this.results = e.end; this.timers = []; }
      else if (this.phase === 'playing') this.timers = [...this.timers.filter((t) => t.id !== e.event), { id: e.event, at: now + e.after, visible: !!e.visible }];
    });
  }

  private timeLeft(now: number) {
    const at = Math.min(...this.timers.filter((t) => t.visible).map((t) => t.at));
    return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
  }

  publicPlayers(now: number): PublicPlayer[] {
    return this.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, status: this.status(p, now) }));
  }

  // what one phone sees: its own widgets and, in the lobby, who else is in. Never the whole game state.
  view(id: string, now: number): PhoneState {
    const widgets = this.phase === 'playing' ? this.mode.phoneView(this.modeState, id)
      : this.phase === 'ended' ? [{ kind: 'text' as const, text: 'Game over', big: true }, { kind: 'wait' as const, text: 'Look at the big screen' }] : [];
    return { phase: this.phase, me: id, players: this.phase === 'lobby' ? this.publicPlayers(now) : [], widgets, timeLeftMs: this.timeLeft(now) };
  }

  hostView(now: number) {
    const scene = this.phase === 'playing' || this.phase === 'ended' ? this.mode.hostView(this.modeState) : { scene: 'lobby', data: null };
    return { phase: this.phase, code: this.code, mode: this.mode.name, players: this.publicPlayers(now), scene, results: this.results, timeLeftMs: this.timeLeft(now) };
  }

  snapshot(now: number): EngineSnapshot {
    return JSON.parse(JSON.stringify({ code: this.code, modeId: this.modeId, phase: this.phase, players: this.players, modeState: this.modeState, timers: this.timers, results: this.results, savedAt: now }));
  }

  // Phones must reconnect with their tokens. Seats are held and timers resume where they stopped, not catch up.
  static restore(s: EngineSnapshot, now: number): Engine {
    const e = new Engine(s.code, MODES[s.modeId] ? s.modeId : Object.keys(MODES)[0]);
    e.phase = s.phase; e.modeState = s.modeState; e.results = s.results;
    e.players = s.players.map((p) => ({ ...p, connected: false, lastSeen: now }));
    e.timers = s.timers.map((t) => ({ ...t, at: t.at + (now - s.savedAt) }));
    return e;
  }
}
