// Plays one scene on its own canvas over the game: 320 × 180, scaled by a whole number, centred on black. Shots one
// after another, dissolving in ordered dither; the lines typed into the bottom bar in each speaker's voice; the squad
// row at its left; ash; a hold anywhere to skip. A map shot leaves its picture clear and the game (or a painted map)
// shows through. However the scene ends, it is recorded (seen, its notebook page written) before `done` is called.
import { persist, profile } from '../meta/profile.ts';
import { backdrop, quietBackdrop, blip, dropVoices, hordeLevel, hush, loadVoices, music, play, say, storyBed, voicePlaying } from '../game/sound.ts';
import voiceIndex from '../data/storyvoices.json' with { type: 'json' };
import { closeup, diorama, notebook, notebookMs, travel } from './art.ts';
import { glow, rain, type Act } from './kit.ts';
import { portrait, squadPhoto, xAt } from './faces.ts';
import { BAYER, INK, Pen } from './draw.ts';
import { FONT, LINE_H, advance as letterWidth, measure, shown } from './font.ts';
import { record, story } from './record.ts';
import { STORY } from './storyConfig.ts';
import { TEXT_X, dropRate, dropout, goneAtStart, letterDelay, moodAt, order, pagesOf, readTime, shortened, silenceOf, titleCard } from './text.ts';
import { mapOf, voiceOf, type Camera, type Member, type Mood, type Shot, type Voice } from './types.ts';

const { W, H, BAR } = STORY, PIC_Y = STORY.TOP, PIC_H = H - STORY.TOP - BAR;
const HALF = STORY.dissolve / 2;
const TITLE = 'WE MIGHT AS WELL DIE TRYING';

/** A map under a map shot: the game's own view (live, drawn under the canvas), or a painted map drawn into it. */
export interface View {
  live: boolean;
  /** The camera `p` of the way through the shot, `t` seconds in; `still` holds it (reduced motion). `pictureH` is
   *  the picture's height in screen pixels, `lift` how far its middle is above the screen's. */
  frame(camera: Camera | undefined, p: number, t: number, still: boolean, pictureH: number, lift: number): void;
  /** A painted map draws itself into the picture. */
  draw?(pen: Pen, camera: Camera | undefined, p: number, t: number, still: boolean): void;
  end(): void;
  /** Where a world point is on the screen now, in CSS pixels (a live map only). */
  project?(x: number, y: number): [number, number];
  /** The map's ways in (centre and the way inward), its safe zone's middle, and the way from each way in to it. */
  points?(): { entries: [number, number, number, number][]; goal: [number, number]; paths: [number, number][][] };
}

export interface Options { id: string; mode: 'full' | 'short'; view?: View; done: () => void; from?: number; rate?: number } // from: the shot to start at; rate: faster, for checking

/** Where a map shot's camera is `p` of the way through, `t` seconds in: its centre, and its zoom as a share of the
 *  zoom it rests at. `view` is the world height the picture shows at rest; `mapH` the map's. */
export function pose(camera: Camera | undefined, p: number, t: number, still: boolean, home: { x: number; y: number }, view: number, mapH: number) {
  const q = still ? 1 : 1 - (1 - Math.min(1, p)) ** 2, step = still ? 0 : Math.floor(t / 0.3) * (view / PIC_H); // a stage pixel each 0.3 s
  const lerp = (a: number, b: number) => a + (b - a) * q;
  switch (camera) {
    case 'descend': return { x: home.x, y: home.y, f: 0.3 + 0.7 * q };
    case 'pull-back': return { x: home.x, y: home.y, f: 1 - 0.4 * q };
    case 'push-in': return { x: home.x, y: home.y, f: 1 + 0.5 * q };
    case 'drift-left': return { x: home.x - step, y: home.y, f: 1 };
    case 'tilt-up': return { x: home.x, y: home.y - step, f: 1 };
    case 'pan-north': return { x: home.x, y: lerp(mapH - view / 2, view / 2), f: 1 };
    case 'pan-south': return { x: home.x, y: lerp(home.y, mapH - view / 2), f: 1 };
    case 'follow-tracks': return { x: home.x, y: lerp(home.y, mapH + view / 2), f: 1 };
    case 'hold': return { x: home.x, y: home.y, f: 1 };
    default: return { x: home.x + step, y: home.y, f: 1 }; // drift, unless told to hold
  }
}

interface PageRun {
  who: string; voice: Voice; lines: string[]; lost: boolean[][]; text: string; hits: Set<number>; pause: number; gloss?: string; moods: [number, Mood][];
  cum: number[]; at?: number; readEnd?: number; typed: number; spoken?: boolean;
}
interface ShotRun { s: Shot; k: number; start: number; pages: PageRun[]; pi: number; out?: number; left?: number; banged?: boolean }

let active: { stop: () => void } | undefined;
/** Is a scene playing (the game keeps its fight still meanwhile)? */
export const playing = () => !!active;
/** Stops whatever scene is playing, without carrying on after it (the screen under it is going away). */
export const stopScene = () => active?.stop();

export function playScene(o: Options) {
  active?.stop();
  const sc = story.scenes.find((s) => s.id === o.id)!, all = order(story), row = mapOf(o.id, story), mapNo = story.maps.indexOf(row) + 1;
  const shots = o.mode === 'short' ? shortened(sc) : sc.shots.filter((s) => !s.optional || STORY.sting);
  const instant = o.mode === 'short', acting = profile.settings.voices === 'acting';
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- The canvas: whole-number scale, the stage in its middle ----
  const canvas = document.createElement('canvas'), main = canvas.getContext('2d')!;
  canvas.id = 'story';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Story scene. Hold to skip.');
  const stageCanvas = document.createElement('canvas');
  stageCanvas.width = W;
  stageCanvas.height = H;
  const sx = stageCanvas.getContext('2d')!, pen = new Pen(sx);
  pen.stage = row.stage;
  let scale = 1, ox = 0, oy = 0;
  const fit = () => {
    scale = Math.max(1, Math.floor(Math.min(innerWidth / W, innerHeight / H)));
    canvas.width = Math.ceil(innerWidth / scale);
    canvas.height = Math.ceil(innerHeight / scale);
    canvas.style.width = `${canvas.width * scale}px`;
    canvas.style.height = `${canvas.height * scale}px`;
    ox = Math.floor((canvas.width - W) / 2);
    oy = Math.floor((canvas.height - H) / 2);
    main.imageSmoothingEnabled = false;
  };
  fit();
  addEventListener('resize', fit);
  document.body.append(canvas);

  // ---- Who is in the squad row: those gone before the scene, and anyone leaving in it ----
  const gone = new Set<Member>(goneAtStart(o.id, story)), leaving = new Map<Member, number>();

  // ---- Ash: two layers, more each map ----
  const ASH = Math.min(STORY.ash.most, STORY.ash.base + STORY.ash.perMap * (mapNo - 1));
  const ax = new Float32Array(ASH), ay = new Float32Array(ASH), av = new Float32Array(ASH), near = new Uint8Array(ASH);
  for (let k = 0; k < ASH; k++) { ax[k] = Math.random() * W; ay[k] = PIC_Y + Math.random() * PIC_H; near[k] = k % 3 === 0 ? 1 : 0; av[k] = near[k] ? 6 + Math.random() * 4 : 2.5 + Math.random() * 2; }

  // ---- Time: our own clock, so a hidden tab picks up where it left off ----
  let clock = 0, last = performance.now(), raf = 0, tearUntil = 0, tearY = 0, flashUntil = 0, paperUntil = 0;
  let run = begin(o.from ?? 0);

  function begin(k: number): ShotRun {
    const s = shots[k], pages: PageRun[] = [];
    for (const l of s?.lines ?? []) {
      const voice = voiceOf(l, o.id, all), rate = l.who === 'Nora' ? dropRate(story, o.id, !!s.dropout) : 0, ps = pagesOf(l, voice);
      ps.forEach((p, j) => {
        const d = dropout(p.text, rate);
        let at = 0;
        // Each line as written, and which of its letters the signal lost (shown as static, in their own space).
        const lost = p.lines.map((ln) => { const part = [...ln].map((ch, k) => d.text[at + k] !== ch); at += ln.length + 1; return part; });
        const cum: number[] = [];
        let n = 0;
        for (const ch of p.text) cum.push((n += letterDelay(ch)));
        pages.push({ who: l.who, voice, lines: p.lines, lost, text: p.text, hits: d.hits, pause: p.pause, gloss: j === ps.length - 1 ? l.gloss : undefined, moods: p.moods, cum, typed: 0 });
      });
    }
    if (s) beds(s, k);
    return { s, k, start: clock, pages, pi: 0 };
  }

  /** The beds under a shot: a low hum, static under the radio, rain where it rains; nothing in a silence. */
  function beds(s: Shot, k: number) {
    const radio = s.type === 'closeup' && s.object === 'radio', wet = ['manila-alley', 'tokyo-crossing'].includes(s.backdrop ?? '') || (o.id === 'opening' && k <= 1); // the Opening: light rain
    if (s.backdrop) backdrop(s.backdrop); // the place's own sound, kept through the shots after it until the next place
    quietBackdrop(['closeup', 'notebook', 'photo'].includes(s.type)); // the radio, the notebook, the photo: the crowd well down under them
    storyBed('hum', s.silence ? 0 : 0.5);
    storyBed('static', radio ? 0.7 : 0);
    storyBed('rain', wet ? 0.7 : 0);
    if (s.silence) setTimeout(() => { if (run?.s === s) storyBed('hum', 0.5); }, silenceOf(s));
  }

  // ---- Input: a tap moves the words on; a hold skips the scene ----
  const downs = new Set<string>();
  let pressAt = -1, drainFrom = 0, drainAt = -1, skipAt = -1;
  const press = (id: string) => { if (!downs.size) pressAt = clock; downs.add(id); };
  const release = (id: string) => {
    if (!downs.delete(id) || downs.size || pressAt < 0) return;
    const held = clock - pressAt;
    pressAt = -1;
    if (skipAt >= 0) return;
    if (held < STORY.tap) tap();
    else { drainFrom = Math.min(1, held / STORY.hold); drainAt = clock; }
  };
  const ring = () => (pressAt >= 0 ? (clock - pressAt) / STORY.hold : drainAt >= 0 ? drainFrom * Math.max(0, 1 - (clock - drainAt) / STORY.drain) : 0);
  const onDown = (e: PointerEvent) => { e.preventDefault(); press(`p${e.pointerId}`); };
  const onUp = (e: PointerEvent) => release(`p${e.pointerId}`);
  const onKey = (e: KeyboardEvent) => { e.stopImmediatePropagation(); e.preventDefault(); if (e.type === 'keydown') { if (!e.repeat) press(`k${e.code}`); } else release(`k${e.code}`); };
  canvas.addEventListener('pointerdown', onDown);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('keydown', onKey, true);
  addEventListener('keyup', onKey, true);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function tap() {
    if (run.out !== undefined || !run.s) return;
    const pg = run.pages[run.pi];
    if (run.s.type === 'title' && !instant && titleTyped() < titleText().length) { run.start = clock - HALF - titleText().length * STORY.titleChar; return; }
    if (pg?.at !== undefined && clock >= pg.at) {
      if (pg.typed < pg.text.length) { pg.at = clock - pg.cum.at(-1)!; pg.readEnd = clock + readTime(pg.text); } // the rest of the line at once
      else { pg.readEnd = clock; hush(); } // on to the next
    } else if (run.pi >= run.pages.length && clock - run.start > HALF + silenceOf(run.s)) run.out = clock; // nothing left to read: the next shot
  }

  const titleText = () => (run.s.text ?? (run.s.lines?.length ? '' : titleCard(sc, story).text));
  const titleTyped = () => (instant ? Infinity : Math.max(0, Math.floor((clock - run.start - HALF) / STORY.titleChar)));

  // ---- Each frame ----
  function step() {
    const t = performance.now(), dt = Math.min(100, t - last) * (o.rate ?? 1);
    last = t;
    clock += dt;
    if (skipAt >= 0 && clock - skipAt >= STORY.skipFade) return finish();
    if (skipAt < 0 && ring() >= 1) skipAt = clock;
    advance();
    if (!run.s) return finish();
    draw(dt / 1000);
    raf = requestAnimationFrame(step);
  }

  function advance() {
    const s = run.s;
    if (!s) return;
    const t = clock - run.start;
    if (s.bang !== undefined && !run.banged && t >= s.bang * 1000) { run.banged = true; if (!instant) play('shield'); } // the one shot
    if (run.out === undefined) {
      if (t >= HALF + silenceOf(s)) {
        const pg = run.pages[run.pi];
        if (pg) {
          if (pg.at === undefined) {
            pg.at = clock + pg.pause;
            if (import.meta.env.DEV) ((window as unknown as { storyLog?: string[] }).storyLog ??= []).push(`${o.id}|${run.k}|${pg.who}|${pg.text}`); // for checking every page shows
            // Reading from paper: a rustle and *paper* between one page and the next.
            if (s.paper && run.pi > 0 && !instant) { paperUntil = pg.at + 700; pg.at += 700; play('paper'); }
            pg.readEnd = pg.at + (instant ? 0 : pg.cum.at(-1)!) + readTime(pg.text);
            if (pg.voice !== 'person' && !instant) play('static');
            // Nora or JEC about to speak: the radio's beep, once as each starts (not on every page of a long line).
            if ((pg.who === 'Nora' || pg.who === 'JEC') && run.pages[run.pi - 1]?.who !== pg.who && !instant) play('police');
          }
          if (clock >= pg.at) {
            // Its recorded voice (Voices on Voice acting), once, as it appears; the page stays up until it is done.
            if (!pg.spoken) {
              // Tried again each frame while the words are still typing, in case the scene's voices are still loading.
              const clip = acting ? (voiceIndex as unknown as Record<string, Record<string, [number, number]>>)[o.id]?.[`${pg.who}|${pg.text}`] : undefined;
              const secs = clip ? say(clip[0], clip[1]) : 0;
              if (secs || !clip || pg.typed >= pg.text.length) {
                pg.spoken = true;
                if (secs) pg.readEnd = Math.max(pg.readEnd!, clock + secs * 1000 + 350);
                if (import.meta.env.DEV) ((window as unknown as { storyVoiced?: number[] }).storyVoiced ??= []).push(secs); // for checking the voices play
              }
            }
            const n = instant ? pg.text.length : pg.cum.findIndex((c) => c > clock - pg.at!);
            const typed = n < 0 ? pg.text.length : n;
            for (let k = pg.typed; k < typed; k++) {
              // A blip of the speaker's voice a letter (Blips), or the typewriter's tick (no recorded voice playing).
              if (pg.text[k] !== ' ' && !instant && !voicePlaying()) { if (profile.settings.voices === 'blips') blip(pg.who, moodAt(pg.moods, k)); else play('tick'); }
              if (pg.hits.has(k) && (s.dropout || s.motion?.includes('tear'))) tear();
            }
            pg.typed = typed;
          }
          if (clock >= pg.readEnd!) run.pi++;
        }
      }
      const said = run.pi >= run.pages.length;
      if (said && s.leaves && !leaving.has(s.leaves) && !gone.has(s.leaves)) leaving.set(s.leaves, clock); // they go once their words are said
      const titleDone = s.type !== 'title' || titleTyped() >= titleText().length;
      const written = s.type !== 'notebook' || instant || t >= notebookMs(s) - HALF; // a notebook page is never cut off
      if (said && titleDone && written && t >= s.ms - HALF) run.out = clock;
    } else if (clock - run.out >= HALF) {
      if (s.leaves) { leaving.delete(s.leaves); gone.add(s.leaves); }
      run = begin(run.k + 1);
    }
    for (const [m, at] of leaving) if (clock - at > 600) { leaving.delete(m); gone.add(m); }
  }

  function tear() { if (!still) { tearUntil = clock + 70; tearY = PIC_Y + 8 + Math.floor(Math.random() * (PIC_H - 16)); } }

  function draw(dt: number) {
    const s = run.s, t = (clock - run.start) / 1000, p = Math.min(1, (clock - run.start) / Math.max(1, s.ms));
    sx.clearRect(0, 0, W, H);
    sx.fillStyle = '#000';
    const live = s.type === 'map' && !!o.view?.live;
    const act: Act = { pen, t, p, dt, shot: s, k: run.k, sceneId: o.id, row, still, line: run.pi, said: run.pi >= run.pages.length, flash: () => { flashUntil = clock + 34; }, tear, sound: (kind: string) => { if (!instant) play(kind); } };

    // The picture.
    if (s.type === 'map') {
      if (o.view?.live) { o.view.frame(s.camera, p, t, still, PIC_H * scale, (H / 2 - PIC_Y - PIC_H / 2) * scale); mapBeats(t, p); }
      else if (o.view?.draw) { sx.save(); sx.beginPath(); sx.rect(0, PIC_Y, W, PIC_H); sx.clip(); o.view.draw(pen, s.camera, p, t, still); sx.restore(); }
      else pen.rect(0, PIC_Y, W, PIC_H, 'asphalt0');
      if (s.objective && t > 0.6) objective(s.objective, t);
      if (s.overlay === 'title') bigTitle(Math.min(1, (t - 0.6) / 3));
    } else if (s.type === 'diorama') diorama(act);
    else if (s.type === 'closeup') closeup(act);
    else if (s.type === 'notebook') notebook(act, instant);
    else if (s.type === 'travel') travel(act);
    else if (s.type === 'photo') photo(t);
    else titleCard_(t);

    if (s.type !== 'title' && s.type !== 'notebook' && s.type !== 'photo') ash(dt);
    if (s.clock?.length) clocks(s.clock, clock - run.start);
    if (clock < flashUntil) pen.lit(0, PIC_Y, W, PIC_H, '#ffffff');

    // The bar over the picture, the text box under it.
    sx.fillStyle = '#000';
    sx.fillRect(0, 0, W, PIC_Y);
    sx.fillRect(0, H - BAR, W, BAR);
    words();

    // Dissolves: in, out, and the skip's own fade.
    const tIn = clock - run.start, out = run.out === undefined ? 0 : (clock - run.out) / HALF;
    const level = Math.max(tIn < HALF ? 1 - tIn / HALF : 0, out, skipAt >= 0 ? (clock - skipAt) / STORY.skipFade : 0);
    pen.dither(0, 0, W, H, Math.min(1, level));
    skipRing();

    // Onto the screen: black round the stage (and the map showing through its picture).
    main.clearRect(0, 0, canvas.width, canvas.height);
    main.fillStyle = '#000';
    if (live) {
      main.fillRect(0, 0, canvas.width, oy + PIC_Y);
      main.fillRect(0, oy + H - BAR, canvas.width, canvas.height);
      main.fillRect(0, oy + PIC_Y, ox, PIC_H);
      main.fillRect(ox + W, oy + PIC_Y, canvas.width, PIC_H);
    } else main.fillRect(0, 0, canvas.width, canvas.height);
    if (clock < tearUntil) {
      main.drawImage(stageCanvas, 0, 0, W, tearY, ox, oy, W, tearY);
      main.drawImage(stageCanvas, 0, tearY, W, H - tearY, ox + 2, oy + tearY, W, H - tearY);
    } else main.drawImage(stageCanvas, ox, oy);
  }

  /** Black, the day, time and place typing in a letter at a time, the last tally under it in small type. */
  function titleCard_(t: number) {
    pen.rect(0, PIC_Y, W, PIC_H, '#000000');
    const s = run.s, text = titleText(), typed = titleTyped();
    if (s.text) { // the sting: a faint broken line, and the LED once
      if (t > 0.3 && t < 0.8) pen.led(W / 2 - 1, PIC_Y + 50, 2, 2, 'red1');
      if (t > 1) pen.text(text, Math.round((W - measure(text, 'radio')) / 2), PIC_Y + 64, (t * 7) % 1 < 0.8 ? INK.dim : '#3a3d40', 'radio', typed);
      return;
    }
    if (!text) return;
    const x = Math.round((W - measure(text, 'person')) / 2), y = PIC_Y + 56;
    pen.text(text, x, y, INK.person, 'person', typed);
    if (typed >= text.length) {
      const after = (clock - run.start - HALF - text.length * STORY.titleChar) / 1000;
      // The Opening's cursor blinks twice, then dithers out.
      if (o.id === 'opening' && after < 1.4) { if (after % 0.7 < 0.35) pen.rect(x + measure(text, 'person') + 2, y, 4, 7, INK.person); }
      const tal = titleCard(sc, story).tally;
      if (tal) pen.text(tal, Math.round((W - measure(tal, 'person')) / 2), y + 16, INK.dim);
    } else if (!instant) pen.rect(x + measure(text.slice(0, typed), 'person') + 2, y, 4, 7, INK.person);
  }

  /** The objective, on a card across the top of the picture (the map below it stays clear). */
  function objective(text: string, t: number) {
    const w = measure(text, 'radio') + 12, x = Math.round((W - w) / 2), y = PIC_Y + 8, show = Math.min(1, (t - 0.6) / 0.4);
    pen.rect(x, y, w, 15, '#000000');
    pen.rect(x, y, w, 1, 'flash0');
    pen.rect(x, y + 14, w, 1, 'flash0');
    pen.text(text, x + 6, y + 4, INK.label, 'radio');
    pen.dither(x, y, w, 15, 1 - show);
  }

  /** The title, put together a few pixels at a time, twice the font's size. */
  function bigTitle(level: number) {
    if (level <= 0) return;
    const w = measure(TITLE, 'person') * 2, x0 = Math.round((W - w) / 2), y0 = PIC_Y + 30;
    sx.fillStyle = INK.person;
    let at = x0;
    for (const ch of TITLE) {
      const f = FONT[ch];
      if (f) for (const [x, y] of f.px) {
        const gx = at + x * 2, gy = y0 + y * 2;
        if (BAYER[(gx & 3) + (gy & 3) * 4] < level * 16) sx.fillRect(gx, gy, 2, 2);
      }
      at += ((f?.w ?? 2) + 1) * 2;
    }
  }

  function ash(dt: number) {
    for (let k = 0; k < ASH; k++) {
      ay[k] += av[k] * dt;
      ax[k] += (near[k] ? 3 : 1.5) * dt + Math.sin((clock / 1000) * 0.7 + k) * 0.05;
      if (ay[k] > PIC_Y + PIC_H) { ay[k] = PIC_Y; ax[k] = Math.random() * W; }
      if (ax[k] > W) ax[k] -= W;
      sx.fillStyle = near[k] ? 'rgba(201,196,184,0.7)' : 'rgba(150,150,145,0.45)';
      sx.fillRect(ax[k] | 0, ay[k] | 0, near[k] ? 2 : 1, near[k] ? 2 : 1);
    }
  }

  /** The words being said, in the bottom bar; a name over the picture the first time someone speaks. */
  /** What happens on the map itself in a map shot, drawn over it: the ways in pulsing once (the Opening), lights
   *  tracing the way to the safe zone (Manila; fewer after), night going to a dirty pink dawn as the rain stops (Manila
   *  after), the train waiting at the dip with its windows lit (Rome), rain on the way down (Tokyo). */
  let points: ReturnType<NonNullable<View['points']>> | undefined;
  function mapBeats(t: number, p: number) {
    const v = o.view, id = o.id;
    if (!v?.project || !v.points) return;
    points ??= v.points();
    const at = (x: number, y: number) => { const [a, b] = v.project!(x, y); return [Math.round(a / scale - ox), Math.round(b / scale - oy)]; };
    if (id === 'opening' && t > 1 && t < 2.2) {
      const size = Math.round(2 + Math.sin(((t - 1) / 1.2) * Math.PI) * 4);
      for (const [x, y, dx, dy] of points.entries) {
        // Where the way in is, or at the picture's edge toward it when it is off the picture.
        const [ex, ey] = at(x + dx * 48, y + dy * 48), cx = Math.max(10, Math.min(W - 10, ex)), cy = Math.max(PIC_Y + 10, Math.min(PIC_Y + PIC_H - 10, ey));
        for (let i = 0; i <= size; i++) for (const side of [-1, 1]) pen.lit(cx - dx * i - dy * i * side, cy - dy * i + dx * i * side, 2, 2, '#c9473a');
      }
    }
    if (id === 'before:manila' || id === 'after:manila') {
      const all = points.paths.flat(), shown = id === 'before:manila' ? Math.floor(all.length * Math.min(1, p * 1.3)) : all.length;
      all.forEach(([x, y], k) => {
        if (k >= shown || (id === 'after:manila' && k % 3)) return;
        const [sx2, sy2] = at(x, y);
        if (sy2 < PIC_Y || sy2 >= PIC_Y + PIC_H) return;
        glow(pen, sx2, sy2, 4, '#d6a23e', 0.6);
        pen.lit(sx2, sy2, 1, 1, '#eadfae');
      });
    }
    if (id === 'after:manila') {
      const q = Math.min(1, Math.max(0, (t - 0.6) / 2));
      pen.dither(0, PIC_Y, W, PIC_H, 0.2 * (1 - q), '#1f2536');
      pen.dither(0, PIC_Y, W, PIC_H, 0.1 * q, '#80404a');
      rainOver(Math.max(0, 1 - t / 4));
    }
    if (id === 'before:tokyo') rainOver(0.8);
    if (id === 'before:rome') {
      // In the road just above the safe zone, where the M dips: five cars across it.
      const [gx, goalY] = points.goal, gy = goalY - 170, car = 44;
      for (let k = 0; k < 5; k++) {
        const [x0, y0] = at(gx - car * 2.5 + k * car + 2, gy - 7), [x1, y1] = at(gx - car * 2.5 + (k + 1) * car - 2, gy + 7), w = x1 - x0, h = y1 - y0;
        if (w < 2) continue;
        pen.rect(x0 - 1, y0 - 1, w + 2, h + 2, 'outline'); pen.rect(x0, y0, w, h, 'metal1'); pen.rect(x0, y0, w, 1, 'metal2');
        for (let j = 1; j < 4; j++) { pen.lit(x0 + Math.round((j * w) / 4) - 1, y0 + 1, 2, 1, '#eadfae'); pen.lit(x0 + Math.round((j * w) / 4) - 1, y1 - 2, 2, 1, '#eadfae'); }
      }
    }
  }
  /** Rain over the picture, `heavy` 0 to 1. */
  function rainOver(heavy: number) {
    if (heavy <= 0) return;
    sx.save();
    sx.beginPath(); sx.rect(0, PIC_Y, W, PIC_H); sx.clip();
    sx.translate(0, PIC_Y);
    rain(pen, clock / 1000, W, PIC_H, heavy);
    sx.restore();
  }

  /** Times typed in the corner of the picture, each in turn. */
  function clocks(list: string[], ms: number) {
    const each = Math.max(1, run.s.ms - HALF) / list.length, k = Math.min(list.length - 1, Math.floor(Math.max(0, ms - HALF) / each));
    const typed = instant ? 5 : Math.floor((ms - HALF - k * each) / STORY.titleChar);
    if (typed <= 0) return;
    pen.rect(6, PIC_Y + 5, 31, 11, '#000000');
    pen.text(list[k], 9, PIC_Y + 6, INK.person, 'jec', typed);
  }

  /** The text box: who is speaking in their framed portrait at its left, the face moving with the mood of the words
   *  and the mouth while they come (or the voice plays); their name over the words. */
  function words() {
    const top = H - BAR;
    if (clock < paperUntil) pen.text('*paper*', TEXT_X, top + 14, INK.gloss);
    const pg = run.pages[run.pi];
    if (pg?.at === undefined || clock < pg.at) return;
    const talking = pg.typed < pg.text.length || voicing(), mood = moodAt(pg.moods, Math.max(0, pg.typed - 1));
    const bad = pg.who === 'Nora' && pg.lost.some((l) => l.some(Boolean)), signal = bad ? 1 : mood === 'sad' || mood === 'worried' ? 2 : mood === 'shocked' ? 3 : 4;
    portrait(pen, pg.who, 4, top + 4, { mood, talk: talking && Math.floor(clock / 125) % 2 === 0, t: clock / 1000, tired: pg.who === 'Reyes' ? row.posture : 1, signal });
    pen.text(pg.who, TEXT_X, top + 3, INK.label);
    let left = pg.typed, start = 0;
    pg.lines.forEach((ln, j) => { say_(ln, pg.lost[j], TEXT_X, top + 14 + j * LINE_H, INK[pg.voice], pg.voice, left, (k) => pg.at! + (instant ? 0 : pg.cum[start + k])); left -= ln.length + 1; start += ln.length + 1; });
    if (pg.gloss && pg.typed >= pg.text.length) pen.text(`(${pg.gloss})`, TEXT_X, top + 14 + LINE_H, INK.gloss);
  }

  /** The squad's snapshot: an X over each one gone, the ones gone in this city marked now, a squeak of the marker each. */
  const goneBefore = goneAtStart(o.id, story), squeaked = new Set<number>();
  function photo(t: number) {
    const fresh = [...gone].filter((m) => !goneBefore.includes(m));
    fresh.forEach((_, k) => { for (const half of [0, 1]) if (t >= xAt(k) + half * 0.35 && !squeaked.has(k * 2 + half)) { squeaked.add(k * 2 + half); if (!instant) play('paper'); } });
    squadPhoto(pen, instant ? 99 : t, [...gone], fresh);
  }

  /** A line of words as far as typed. A letter the signal lost comes up as static, then a moment later the right
   *  letter pops in through it (white for a blink), so the line can always be read in the end. `typedAt` is when
   *  each letter of the line was typed. */
  function say_(line: string, lost: boolean[], x: number, y: number, col: string, voice: Voice, upto: number, typedAt: (k: number) => number) {
    if (!lost.some(Boolean)) { pen.text(line, x, y, col, voice, upto); return; }
    const text = shown(line, voice);
    let at = x;
    for (let k = 0; k < text.length && k < upto; k++) {
      const w = letterWidth(text[k], voice), since = clock - typedAt(k);
      if (!lost[k] || since >= STORY.dropPop) pen.text(text[k], at, y, lost[k] && since < STORY.dropPop + 90 ? '#ffffff' : col, voice);
      else for (let py = 1; py < 7; py++) for (let px = 0; px < w - 1; px++) if (Math.random() < 0.3) { sx.fillStyle = INK.dim; sx.fillRect(at + px, y + py, 1, 1); }
      at += w;
    }
  }

  /** Is a voice line playing now? */
  function voicing() { return voicePlaying(); }

  /** The hold-to-skip ring: 12 segments lighting up, from 200 ms into a hold. */
  function skipRing() {
    const v = ring();
    if (v <= 0 || (pressAt >= 0 && clock - pressAt < STORY.ringAt)) return;
    const cx = W - 12, cy = H - 11, n = STORY.ringSegments, lit = Math.floor(Math.min(1, v) * n);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / n) * Math.PI * 2;
      sx.fillStyle = k < lit ? INK.person : '#3a3d40';
      sx.fillRect(Math.round(cx + Math.cos(a) * 6) - 1, Math.round(cy + Math.sin(a) * 6) - 1, 2, 2);
    }
    pen.text('HOLD TO SKIP', cx - 12 - measure('HOLD TO SKIP', 'person'), cy - 3, INK.dim);
  }

  let ended = false;
  function finish() {
    if (ended) return;
    ended = true;
    stop();
    record(profile.save.story, o.id);
    persist();
    o.done();
  }
  function stop() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', fit);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    removeEventListener('keydown', onKey, true);
    removeEventListener('keyup', onKey, true);
    canvas.remove();
    for (const b of ['hum', 'rain', 'static'] as const) storyBed(b, 0);
    backdrop();
    quietBackdrop(false);
    dropVoices();
    o.view?.end();
    active = undefined;
  }

  active = { stop };
  if (acting) loadVoices(o.id);
  music('story');
  hordeLevel(0);
  raf = requestAnimationFrame(step);
}

/** Plays a scene as the Story setting says: in full, cut short, or not at all (still recorded). */
export function runScene(id: string, view: View | undefined, done: () => void) {
  const mode = profile.settings.story;
  if (mode === 'off') { record(profile.save.story, id); persist(); done(); return; }
  playScene({ id, mode, view, done });
}

/** Whether a scene has not been seen in the save in use. */
export const unseen = (id: string) => !profile.save.story.seen.includes(id);
