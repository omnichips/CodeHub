import type { GamePlayer, GameSnapshot } from '../../shared/game';

export const rank = (state: GameSnapshot) => [...state.players].sort((a, b) => state.mode === 'gladiator'
  ? Number(b.alive) - Number(a.alive) || b.eliminations - a.eliminations
  : state.mode === 'laser' ? b.kills - a.kills || a.deaths - b.deaths : b.score - a.score);

export const resultText = (mode: string, player: GamePlayer) => mode === 'gladiator'
  ? `${player.eliminations} KO${player.alive ? ' · ALIVE' : ''}`
  : mode === 'laser' ? `${player.kills} K / ${player.deaths} D` : `${Math.floor(player.score)} pts`;
