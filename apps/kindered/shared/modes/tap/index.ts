import type { GameMode } from '../../mode';

// The trivial test mode: mash the button for 10 seconds, most taps wins. It exists to exercise the engine.
type State = { names: Record<string, string>; taps: Record<string, number>; done: boolean };

export const ROUND_MS = 10000;

export const tap: GameMode<State, unknown> = {
  id: 'tap',
  name: 'Tap Race',
  minPlayers: 1,
  maxPlayers: 8,
  init: (players) => ({
    names: Object.fromEntries(players.map((p) => [p.id, p.name])),
    taps: Object.fromEntries(players.map((p) => [p.id, 0])),
    done: false,
  }),
  reduce(state, event) {
    if (event.type === 'start') return { state, effects: [{ after: ROUND_MS, event: 'time', visible: true }] };
    if (state.done) return { state, effects: [] };
    if (event.type === 'input' && event.widget === 'tap' && event.player in state.taps) {
      return { state: { ...state, taps: { ...state.taps, [event.player]: state.taps[event.player] + 1 } }, effects: [] };
    }
    if (event.type === 'timer' && event.id === 'time') return { state: { ...state, done: true }, effects: [{ end: state.taps }] };
    return { state, effects: [] };
  },
  phoneView: (state, id) => state.done
    ? [{ kind: 'text', text: `${state.taps[id]} taps`, big: true }, { kind: 'wait', text: 'Look at the big screen' }]
    : [{ kind: 'tap', id: 'tap', label: 'TAP!' }, { kind: 'text', text: `${state.taps[id]}` }],
  hostView: (state) => ({ scene: state.done ? 'end' : 'play', data: { names: state.names, taps: state.taps } }),
};
