import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, LASER_RANGE, PLAYER_RADIUS, SPEAR_LENGTH, type MovementInput } from '../../shared/protocol';
import type { GameSnapshot } from '../../shared/game';
import type { Transport } from './peer';

export function Arena({ transport, state, onLeave }: { transport: Transport; state: GameSnapshot; onLeave: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const touchRef = useRef({ x: 0, y: 0, aimX: 1, aimY: 0, sprint: false });
  stateRef.current = state;
  const stopTouch = () => { touchRef.current.x = 0; touchRef.current.y = 0; touchRef.current.sprint = false; };

  useEffect(() => {
    if (!mount.current) return;
    let sequence = 0;
    const keys = new Set<string>();
    const displayed = new Map<string, { x: number; y: number }>();
    const game = new Phaser.Game({ type: Phaser.CANVAS, parent: mount.current, width: ARENA_WIDTH, height: ARENA_HEIGHT, pixelArt: true, backgroundColor: '#161429',
      scene: {
        create(this: Phaser.Scene) {
          this.input.keyboard?.on('keydown', (event: KeyboardEvent) => keys.add(event.key.toLowerCase()));
          this.input.keyboard?.on('keyup', (event: KeyboardEvent) => keys.delete(event.key.toLowerCase()));
          this.time.addEvent({ delay: 1000 / 30, loop: true, callback: () => {
            const x = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) || touchRef.current.x;
            const y = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup')) || touchRef.current.y;
            const input: MovementInput = { sequence: sequence++, x, y, sprint: keys.has('shift') || touchRef.current.sprint, aim: Math.atan2(touchRef.current.aimY, touchRef.current.aimX) };
            transport.send({ type: 'move', input });
          } });
          this.input.keyboard?.on('keydown-SPACE', () => transport.send({ type: 'push' }));
        },
        update(this: Phaser.Scene) {
          this.children.removeAll();
          this.add.rectangle(ARENA_WIDTH / 2, ARENA_HEIGHT / 2, ARENA_WIDTH, ARENA_HEIGHT, 0x211c38);
          const local = stateRef.current.players.find((player) => player.id === transport.id);
          for (const player of stateRef.current.players) {
            if (!player.alive) continue;
            const previous = displayed.get(player.id) || { x: player.x, y: player.y };
            const position = { x: previous.x + (player.x - previous.x) * 0.35, y: previous.y + (player.y - previous.y) * 0.35 };
            displayed.set(player.id, position);
            const isLocal = player.id === transport.id;
            if (stateRef.current.mode === 'laser' && local && !isLocal && (Math.hypot(player.x - local.x, player.y - local.y) > LASER_RANGE
              || Math.abs(Math.atan2(Math.sin(Math.atan2(player.y - local.y, player.x - local.x) - local.aimAngle), Math.cos(Math.atan2(player.y - local.y, player.x - local.x) - local.aimAngle))) > Math.PI / 6)) continue;
            this.add.circle(position.x, position.y, PLAYER_RADIUS, stateRef.current.mode === 'gladiator' ? (isLocal ? 0xf7c95b : 0xe85d75) : (player.isIt ? 0x7de2a8 : (isLocal ? 0xf7c95b : 0xe85d75)));
            if (stateRef.current.mode === 'gladiator') this.add.line(0, 0, position.x, position.y, position.x + Math.cos(player.spearAngle) * SPEAR_LENGTH, position.y + Math.sin(player.spearAngle) * SPEAR_LENGTH, 0xf7c95b).setLineWidth(6);
            this.add.text(position.x, position.y - 34, player.nickname, { color: '#fff4e6', fontSize: '12px' }).setOrigin(0.5);
          }
        },
      } });
    return () => game.destroy(true);
  }, [transport]);

  return <main className="game-screen"><div className="game-hud"><strong>{state.phase === 'countdown' ? `STARTING ${state.countdown}` : `TIME ${state.timeRemaining}`}</strong><button onClick={onLeave}>Leave</button></div><div className="arena-wrap" ref={mount} />
    <div className="touch-controls"><div className="dpad">
      <button onPointerDown={() => { touchRef.current.y = -1; }} onPointerUp={stopTouch} onPointerCancel={stopTouch}>▲</button><button onPointerDown={() => { touchRef.current.x = -1; }} onPointerUp={stopTouch} onPointerCancel={stopTouch}>◀</button><button onPointerDown={() => { touchRef.current.y = 1; }} onPointerUp={stopTouch} onPointerCancel={stopTouch}>▼</button><button onPointerDown={() => { touchRef.current.x = 1; }} onPointerUp={stopTouch} onPointerCancel={stopTouch}>▶</button>
    </div><div className="action-controls">{state.mode === 'laser' && <div className="aim-controls"><button onPointerDown={() => { touchRef.current.aimX = 0; touchRef.current.aimY = -1; }}>AIM ▲</button><button onPointerDown={() => { touchRef.current.aimX = -1; touchRef.current.aimY = 0; }}>AIM ◀</button><button onPointerDown={() => { touchRef.current.aimX = 1; touchRef.current.aimY = 0; }}>AIM ▶</button><button onPointerDown={() => { touchRef.current.aimX = 0; touchRef.current.aimY = 1; }}>AIM ▼</button></div>}<button onPointerDown={() => { touchRef.current.sprint = true; }} onPointerUp={stopTouch} onPointerCancel={stopTouch}>SPRINT</button><button onPointerDown={() => transport.send({ type: state.mode === 'laser' ? 'fire' : 'push' })}>{state.mode === 'gladiator' ? 'THRUST' : state.mode === 'laser' ? 'FIRE' : 'PUSH'}</button></div></div>
    <p className="hint">{state.mode === 'gladiator' ? 'GLADIATOR: aim with movement, press SPACE or THRUST to strike.' : state.mode === 'laser' ? 'LASER: aim with the right controls and press FIRE.' : 'TAG: move with WASD/arrows or touch controls. Green is IT.'}</p>
  </main>;
}
