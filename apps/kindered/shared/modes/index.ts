import type { GameMode } from '../mode';
import { tap } from './tap';

// Adding a game = a folder next to this one plus one line here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MODES: Record<string, GameMode<any, any>> = { [tap.id]: tap };
