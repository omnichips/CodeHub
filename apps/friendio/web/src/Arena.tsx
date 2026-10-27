import { useEffect, useRef, useState, type PointerEvent } from 'react';
import Phaser from 'phaser';
import { ARENA_HEIGHT, ARENA_WIDTH, LASER_RANGE, MATCH_DURATION_SECONDS, PLAYER_RADIUS, SPEAR_LENGTH, type MovementInput } from '../../shared/protocol';
import type { GameSnapshot } from '../../shared/game';
import type { Transport } from './peer';
import { createAmbience, type Walker } from './ambience';
import { paintPlayerSprite, SPRITE_SCALE, SPRITE_SIZE } from './sprite';
import { drawArena } from './obstacles';
import { NetView } from './netcode';
import { rank, resultText } from './scoring';

export function Arena({ transport, state, onLeave }: { transport: Transport; state: GameSnapshot; onLeave: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const touchRef = useRef({ x: 0, y: 0, aim: 0, used: false, sprint: false });
  const knob = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  stateRef.current = state;
  const net = useRef<NetView | null>(null);
  if (!net.current) net.current = new NetView(transport.id, !transport.isHost);
  useEffect(() => { net.current!.receive(state, performance.now()); }, [state]);
  const stopStick = () => { touchRef.current.x = 0; touchRef.current.y = 0; if (knob.current) knob.current.style.transform = ''; };
  const moveStick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const reach = box.width / 2;
    const dx = event.clientX - (box.left + reach);
    const dy = event.clientY - (box.top + reach);
    const length = Math.min(Math.hypot(dx, dy), reach);
    const angle = Math.atan2(dy, dx);
    touchRef.current.used = true;
    touchRef.current.aim = angle;
    touchRef.current.x = length / reach > 0.2 ? Math.cos(angle) * length / reach : 0;
    touchRef.current.y = length / reach > 0.2 ? Math.sin(angle) * length / reach : 0;
    if (knob.current) knob.current.style.transform = `translate(${Math.cos(angle) * length}px, ${Math.sin(angle) * length}px)`;
  };

  useEffect(() => {
    if (!mount.current) return;
    let sequence = 0;
    const keys = new Set<string>();
    const view = net.current!;
    const ambience = createAmbience();
    const lastShown = new Map<string, { x: number; y: number }>();
    const game = new Phaser.Game({ type: Phaser.CANVAS, parent: mount.current, width: ARENA_WIDTH, height: ARENA_HEIGHT, pixelArt: true, backgroundColor: '#161429',
      scene: {
        create(this: Phaser.Scene) {
          this.input.keyboard?.on('keydown', (event: KeyboardEvent) => keys.add(event.key.toLowerCase()));
          this.input.keyboard?.on('keyup', (event: KeyboardEvent) => keys.delete(event.key.toLowerCase()));
          this.time.addEvent({ delay: 1000 / 30, loop: true, callback: () => {
            const x = Number(keys.has('d')) - Number(keys.has('a')) || touchRef.current.x;
            const y = Number(keys.has('s')) - Number(keys.has('w')) || touchRef.current.y;
            // on PC the mouse sets where you look; on a phone the stick does
            const me = view.shown.get(transport.id);
            const pointer = this.input.activePointer;
            const aim = touchRef.current.used || !me ? touchRef.current.aim : Math.atan2(pointer.worldY - me.y, pointer.worldX - me.x);
            const input: MovementInput = { sequence: sequence++, x, y, sprint: keys.has('shift') || touchRef.current.sprint, aim };
            transport.send({ type: 'move', input });
            view.input(input, 1 / 30, stateRef.current);
          } });
          this.input.keyboard?.on('keydown-SPACE', () => transport.send({ type: 'push' }));
          this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            if (pointer.wasTouch) return;
            touchRef.current.used = false;
            transport.send({ type: stateRef.current.mode === 'laser' ? 'fire' : 'push' });
          });
        },
        update(this: Phaser.Scene, time: number, delta: number) {
          // immediate-mode drawing: clear last frame's objects, then draw this frame
          for (const child of [...this.children.list]) child.destroy();
          const state = stateRef.current;
          const mode = state.mode;
          const now = performance.now();
          drawArena(this, mode);
          const local = state.players.find((player) => player.id === transport.id);
          const placed = state.players.filter((player) => player.alive).map((player) => ({ player, position: view.position(player, now) }))
            .filter(({ player }) => mode !== 'laser' || !local || player.id === local.id || (Math.hypot(player.x - local.x, player.y - local.y) <= LASER_RANGE
              && Math.abs(Math.atan2(Math.sin(Math.atan2(player.y - local.y, player.x - local.x) - local.aimAngle), Math.cos(Math.atan2(player.y - local.y, player.x - local.x) - local.aimAngle))) <= Math.PI / 6));
          const walkers: Walker[] = placed.map(({ player, position }) => ({ id: player.id, position, sprinting: player.sprinting, isLocal: player.id === transport.id }));
          if (mode === 'tag') ambience.under(this, time, delta, walkers);
          for (const { player, position } of placed) {
            const heading = mode === 'gladiator' ? player.spearAngle : player.aimAngle;
            const marks = this.add.graphics();
            // ash glow for runners; IT pulses red; the player who just passed the tag pulses blue while immune
            if (mode === 'tag') {
              const pulse = Math.sin(time / (player.immune > 0 ? 70 : 220));
              if (player.immune > 0) marks.fillStyle(0x4da6ff, 0.35 + 0.2 * pulse).fillCircle(position.x, position.y, PLAYER_RADIUS + 10 + 3 * pulse);
              else if (player.isIt) marks.fillStyle(0xff3b3b, 0.3 + 0.2 * pulse).fillCircle(position.x, position.y, PLAYER_RADIUS + 10 + 3 * pulse);
              else marks.fillStyle(0xd9d4cf, 0.2).fillCircle(position.x, position.y, PLAYER_RADIUS + 8);
            }
            this.add.ellipse(position.x + 3, position.y + 6, PLAYER_RADIUS * 2.2, PLAYER_RADIUS * 1.4, 0x0b0914, 0.3);
            // the shared pixel-art kid; hands swing while it is moving
            const before = lastShown.get(player.id) ?? position;
            const walking = Math.hypot(position.x - before.x, position.y - before.y) > 0.4;
            lastShown.set(player.id, { ...position });
            const spriteFrame = walking ? 1 + (Math.floor(time / 140) % 2) : 0;
            const it = mode === 'tag' && player.isIt;
            const key = `kid-${player.color}-${player.avatar || 'none'}-${spriteFrame}-${it ? 1 : 0}`;
            if (!this.textures.exists(key)) this.textures.addCanvas(key, paintPlayerSprite(document.createElement('canvas'), { color: player.color, avatar: player.avatar, frame: spriteFrame, it }));
            this.add.image(position.x, position.y, key).setDisplaySize(SPRITE_SIZE * SPRITE_SCALE, SPRITE_SIZE * SPRITE_SCALE).setRotation(heading + Math.PI / 2);
            if (mode === 'tag') {
              // faint ghost ">" ahead of the player, doubled while sprinting
              for (let index = 0; index < (player.sprinting ? 2 : 1); index += 1) {
                const distance = PLAYER_RADIUS + 18 + index * 9;
                this.add.text(position.x + Math.cos(heading) * distance, position.y + Math.sin(heading) * distance, '>', { color: '#fff4e6', fontSize: '16px' })
                  .setOrigin(0.5).setRotation(heading).setAlpha(0.18);
              }
              if (player.sprint < 100) this.add.graphics().fillStyle(0x0b0914).fillRect(position.x - 20, position.y - 36, 40, 5)
                .fillStyle(player.exhausted > 0 ? 0xff8c8c : 0xf7c95b).fillRect(position.x - 20, position.y - 36, 40 * player.sprint / 100, 5);
            }
            if (mode === 'gladiator') this.add.line(0, 0, position.x, position.y, position.x + Math.cos(player.spearAngle) * SPEAR_LENGTH, position.y + Math.sin(player.spearAngle) * SPEAR_LENGTH, 0xf7c95b).setLineWidth(6);
            this.add.text(position.x, position.y - (mode === 'tag' ? 48 : 40), player.nickname, { color: '#fff4e6', fontSize: '12px', stroke: '#0b0914', strokeThickness: 3 }).setOrigin(0.5);
          }
          if (mode === 'tag') ambience.over(this, time, walkers);
        },
      } });
    return () => game.destroy(true);
  }, [transport]);

  // the screen shakes harder with each count, and once more on GO
  useEffect(() => {
    const go = state.phase === 'active' && state.timeRemaining === MATCH_DURATION_SECONDS;
    if ((state.phase !== 'countdown' && !go) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const amp = go ? 16 : 14 - 3 * state.countdown;
    frame.current?.animate([0, 1, 2, 3, 4].map((step) => ({ transform: step === 4 ? 'translate(0, 0)' : `translate(${(step % 2 ? -1 : 1) * amp * (1 - step / 4)}px, ${(step % 2 ? 1 : -1) * amp * 0.5 * (1 - step / 4)}px)` })), { duration: 400 });
  }, [state.phase, state.countdown, state.timeRemaining]);

  return <main className="game-screen sketch"><div className="game-layout"><div className="game-main"><div className="game-hud"><strong className="time-note">{state.phase === 'countdown' ? `STARTING ${state.countdown}` : `TIME ${state.timeRemaining}`}</strong><button className="secondary" onClick={onLeave}>Leave</button></div><div className="arena-frame" ref={frame}><div className="arena-wrap" ref={mount} /><Countdown state={state} /></div>
    <div className="touch-controls">
      <div className="stick" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); moveStick(event); }} onPointerMove={(event) => { if (event.buttons || event.pointerType === 'touch') moveStick(event); }} onPointerUp={stopStick} onPointerCancel={stopStick}><div className="knob" ref={knob} /></div>
      <div className="action-controls">
        {state.mode !== 'tag' && <button onPointerDown={() => transport.send({ type: state.mode === 'laser' ? 'fire' : 'push' })}>{state.mode === 'gladiator' ? 'THRUST' : 'FIRE'}</button>}
        {state.mode === 'tag' && <button onPointerDown={() => { touchRef.current.sprint = true; }} onPointerUp={() => { touchRef.current.sprint = false; }} onPointerCancel={() => { touchRef.current.sprint = false; }}>SPRINT</button>}
      </div>
    </div>
    <p className="hint">{state.mode === 'gladiator' ? 'GLADIATOR: WASD to move, mouse to aim, click or SPACE to strike.' : state.mode === 'laser' ? 'LASER: WASD to move, mouse to aim, click to fire.' : 'TAG: WASD to move, mouse to look, SHIFT to sprint, click or SPACE to push. IT glows red and is faster (after a 1s head start for whoever you tag). Run the bar dry and you slow down.'}</p>
  </div><Scoreboard state={state} meId={transport.id} /></div></main>;
}

function Countdown({ state }: { state: GameSnapshot }) {
  const [go, setGo] = useState(false);
  const previous = useRef(state.phase);
  useEffect(() => {
    const started = previous.current === 'countdown' && state.phase === 'active';
    previous.current = state.phase;
    if (!started) return;
    setGo(true);
    const timer = window.setTimeout(() => setGo(false), 900);
    return () => window.clearTimeout(timer);
  }, [state.phase]);
  if (state.phase === 'countdown' && state.countdown > 0) return <div className="countdown" data-n={state.countdown} key={state.countdown} role="status"><span>{state.countdown}</span></div>;
  return go ? <div className="countdown go" key="go" role="status"><span>GO!</span></div> : null;
}

function Scoreboard({ state, meId }: { state: GameSnapshot; meId: string }) {
  return <aside className="scoreboard" aria-label="Scores"><h2 className="crayon-title">Scores</h2>
    <ol>{rank(state).map((player) => <li key={player.id} className={player.id === meId ? 'me' : ''}>
      <span>{player.nickname}{state.mode === 'tag' && player.isIt ? ' · IT' : ''}</span><b>{resultText(state.mode, player)}</b>
    </li>)}</ol>
    {state.mode === 'tag' && <p className="hint">+1 per second untagged. +5 for every 10s streak. +10 for the longest streak at the end.</p>}
  </aside>;
}

