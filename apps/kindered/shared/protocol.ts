export const MAX_PLAYERS = 8;
export const NAME_MAX = 12;
export const ROOM_CODE_LENGTH = 4;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: easy to misread on a TV
export const PING_MS = 3000;
export const AWAY_MS = 8000; // silent this long: shown as away
export const SEAT_HOLD_MS = 120000; // an away seat is kept this long in the lobby
export const peerId = (code: string) => `kindered-${code}`;

// 16-color arcade palette. Indexes 4-11 are the eight player colors, so a player is the same color on the TV and phone.
export const PALETTE = [
  '#0d0b1e', '#2b2554', '#f5f0ff', '#9d94c9',
  '#ff4d6d', '#ff9f1c', '#ffe66d', '#3ddc84', '#2ee6d6', '#4d8dff', '#a78bfa', '#ff5fd2',
  '#8a4b2a', '#ffd1a1', '#1e7a46', '#7a1f3d',
];
export const PLAYER_COLORS = PALETTE.slice(4, 12);

// avatars: a 12x12 grid as one string; '.' is transparent, '0'-'f' index PALETTE
export const AVATAR_SIZE = 12;
export const BLANK_AVATAR = '.'.repeat(AVATAR_SIZE * AVATAR_SIZE);
export const isAvatar = (v: unknown): v is string =>
  typeof v === 'string' && v.length === AVATAR_SIZE * AVATAR_SIZE && /^[.0-9a-f]+$/.test(v);

// What a phone can draw. A mode's phoneView() returns a list of these; a new mode usually needs no phone changes.
// ponytail: no drawing pad yet, add a widget kind when the first mode needs one
export type Widget =
  | { kind: 'text'; text: string; big?: boolean }
  | { kind: 'wait'; text: string }
  | { kind: 'choice'; id: string; options: string[] }
  | { kind: 'input'; id: string; placeholder?: string }
  | { kind: 'tap'; id: string; label: string; hold?: boolean } // sends 'tap', or 'down'/'up' when hold
  | { kind: 'dpad'; id: string }; // sends 'up' | 'down' | 'left' | 'right' | 'stop'

export type PublicPlayer = { id: string; name: string; avatar: string; color: number; status: 'here' | 'away' };
export type Phase = 'lobby' | 'playing' | 'ended';

// the host never sends a phone anything but its own view
export type PhoneState = {
  phase: Phase;
  me: string;
  players: PublicPlayer[]; // lobby only
  widgets: Widget[];
  timeLeftMs?: number; // counted down on the phone; the host stamps answer times
};

export type HostMsg =
  | { t: 'welcome'; id: string; token: string; color: number }
  | { t: 'reject'; reason: string }
  | { t: 'state'; state: PhoneState; rtt?: number }
  | { t: 'ping'; n: number; rtt?: number };

export type PhoneMsg =
  | { t: 'join'; name: string; avatar: string; token?: string }
  | { t: 'avatar'; avatar: string }
  | { t: 'input'; widget: string; value: unknown }
  | { t: 'pong'; n: number };

export const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX) : '');
