import type { ReactNode } from 'react';
import type { PublicPlayer } from '../../../../shared/protocol';
import { tapScenes } from './tap';

export type SceneProps = { data: unknown; players: PublicPlayer[] };

// One big-screen scene per mode phase, keyed by mode id then by the scene name its hostView() returns.
export const SCENES: Record<string, Record<string, (p: SceneProps) => ReactNode>> = { tap: tapScenes };
