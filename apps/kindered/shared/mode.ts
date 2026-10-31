import type { Widget } from './protocol';

export type Question = { id: string; text: string; choices: string[]; answer: number; category: string; difficulty: 1 | 2 | 3 };
export type ContentPack = { id: string; title: string; language: string; version: number; questions: Question[] };

export type ModePlayer = { id: string; name: string; color: number };

export type ModeEvent<M = unknown> =
  | { type: 'start' }
  | { type: 'input'; player: string; widget: string; value: M }
  | { type: 'timer'; id: string };

// Effects are plain data. A timer with the same id replaces the earlier one; `visible` shows it as a phone countdown.
export type Effect =
  | { after: number; event: string; visible?: boolean }
  | { end: Record<string, number> };

// A mode is a pure, JSON-serializable state machine. The engine owns networking, lobby, timers and saving.
export interface GameMode<S = unknown, M = unknown> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  init(players: ModePlayer[], pack?: ContentPack): S;
  reduce(state: S, event: ModeEvent<M>): { state: S; effects: Effect[] };
  phoneView(state: S, playerId: string): Widget[];
  hostView(state: S): { scene: string; data: unknown };
}
