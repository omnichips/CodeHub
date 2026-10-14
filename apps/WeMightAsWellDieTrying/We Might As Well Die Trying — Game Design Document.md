# We Might As Well Die Trying — Game Design Document

Oct 14, 2026 · @mj

## Overview

**We Might As Well Die Trying** is a top-down pixel-art defence game where the player commands an army/militia holding a city against zombie hordes of hundreds to thousands. It plays in a browser on phone and desktop, installs with its own icon, and lives on the user's Vercel site as one of the Hub apps.

**Inspiration:** *Sir, We Have an Orc Problem* (cone-based shooting, skill-tree web, huge hordes). Visual reference: old top-down GTA and Hotline Miami.

**Pillars**

- **Positioning is the puzzle.** Soldiers fire in a cone with no auto-aim and no reload; where you place and point them decides the run.
- **Huge, readable hordes.** Hundreds to thousands of zombies on screen, with special types that change priorities.
- **Plan, then adapt.** Set up before the wave, then pause, reposition, and call in strikes during it.
- **Steady progression.** Every run pays chips, even a loss, spent in one big skill web.

**First milestone scope:** all soldier classes, all zombie classes, all structures and usables, one map (New York), and the full skill tree. More maps (target: at least 8) come after.

## Core gameplay and rules

A run is: plan the defence, press Start, survive short gapped waves, then collect chips win or lose.

**Run loop**

1. **Pick a map.** The next map unlocks when the current one is cleared within the leak limit.
2. **Plan.** Place the soldiers, structures and usables you own from the skill tree. There is no in-map budget: you deploy what you have unlocked, up to the quantity unlocked.
3. **Start.** The horde arrives in short waves with brief gaps, so it feels nearly continuous.
4. **Adapt.** Pause or slow time, move soldiers, rotate and reshape cones, and call usables.
5. **End.** Win by surviving every wave without exceeding the leak limit. Chips are paid either way.

**Leaks and failure**

- Each zombie that reaches the city or safe area costs 1 to 3 leak points (see Zombie classes).
- Default limit: 50 leak points. The skill tree raises it.
- Hitting the limit ends the run as a loss.

**Soldiers**

- Placed on the road (outdoor) or in building slots (indoor: windows and roofs the map defines).
- **Indoor:** cannot die; bigger range, lower damage.
- **Outdoor:** have HP; zombies that reach them attack them. A soldier killed in a run stays dead for that run only. Units are never re-bought.
- **Moving:** soldiers can shoot while moving with a slight slow. When not shooting they move fast. Indoor soldiers can be ordered out mid-wave.

**Firing cone**

- Each soldier fires inside a cone: no auto-aim, no reload.
- Drag the cone handle to rotate it. Drag it farther out and it narrows toward a straight line, like the inspiration game.
- No trade-off between wide and narrow for now; the values live in data so one can be added later.
- Cones can be changed during a wave.

**Friendly fire:** none, except mines and activated explosives.

**Zombie behaviour**

- Goal: reach the finish line by the shortest route.
- Zombies collide: with each other (a horde packs and pushes, never stacks), with buildings, roadblocks and outdoor soldiers.
- Each zombie has a sight radius. If it sees an outdoor soldier, it goes for that soldier. Indoor soldiers are never targeted.
- Zombies attack a roadblock only when it is directly in front of them. Those behind push forward; others step around it.
- A roadblock takes damage in proportion to how many zombies press on it.

**Time controls:** pause (orders can be given while paused), plus 1x, 2x and 3x speed.

**Controls (touch and mouse)**

- Drag from the bar to place units and structures; tap to select.
- Drag a selected soldier to move it; drag its cone handle to aim and reshape.
- Usables: drag the icon onto the target area (and the direction, for strafing runs).
- Pinch to zoom, two-finger drag to pan; mouse wheel and right-drag on desktop.
- Landscape only. Left-handed UI option.

**Onboarding:** the first map has a short guided start teaching placing, aiming cones, pausing and falling back.

## Soldier classes

Thirteen classes, all in the first milestone. Ratings are relative starting points (1 low, 5 high) to be tuned in play; exact numbers live in `units.json`.

| Class | Role | Range | Damage | Fire rate | Special |
| --- | --- | --- | --- | --- | --- |
| Rifleman (M4A1) | All-rounder | 3 | 3 | 3 | Baseline unit |
| Sniper | Long-range picker | 5 | 5 | 1 | Bullets pierce several zombies; per-sniper target priority: highest HP, fastest, slowest, nearest, farthest |
| Machine gunner | Crowd shredder | 2.5 | 2 | 5 | Large ammo pool, never reloads like all units |
| Flamethrower | Close crowd control | 1 | 2 | 5 | Sets zombies on fire (damage over time) |
| Bazooka | Splash damage | 3 | 4 | 1 | Area damage on impact |
| Shield | Frontline blocker | 1 | 1 | 2 | High HP, holds zombies in place, protects units behind |
| Mortar | Indirect fire | 5 | 4 | 1 | Lobs over buildings, area damage, minimum range |
| Medic | Support | 2 | 0 | — | Heals nearby outdoor soldiers |
| Marksman (DMR) | Mid-range precision | 4 | 4 | 2 | No pierce; fills the gap between Rifleman and Sniper |
| Shotgunner | Close defence | 1 | 4 | 2 | Wide spread, knockback |
| Engineer | Support | 1 | 0 | — | Repairs roadblocks, makes nearby structures tougher |
| Grenadier | Light indirect fire | 3 | 3 | 1 | Throws over walls; cheaper, shorter-range mortar |
| Sentry operator | Turret placer | 3 | 2 | 4 | Deploys a fixed-cone turret anywhere |

**Skill-tree upgrades per class:** range, damage, fire rate, HP, and class-specific perks (more pierce for the Sniper, burn duration for the Flamethrower, blast radius for the Bazooka and Mortar, heal amount for the Medic).

## Zombie classes

Ten classes. Bigger and more dangerous zombies cost more leak points when they get through (limit: 50, upgradable).

| Class | Leak cost | Behaviour |
| --- | --- | --- |
| Normal | 1 | Baseline walker |
| Fast | 1 | Low HP, high speed |
| Jumper | 1 | Leaps over roadblocks and barbed wire |
| Screamer | 1 | Scream speeds up nearby zombies; a priority target |
| Bloater | 2 | Explodes on death, damaging nearby zombies; survivors get a 1-second speed boost |
| Intelligent | 2 | Pulls nearby zombies in front of itself as a meat shield |
| Armored/Riot | 2 | High damage resistance (not immune); splash and pierce work best |
| Tanky | 3 | Very high HP, slow |
| Brute (boss) | 3 | Smashes roadblocks quickly; appears at the end of a map |
| Hordemother | 3 | Spawns extra zombies while alive; kill it fast |

**Waves:** each wave mixes classes in data (`waves.json`), with special types growing more common in later waves.

## Structures and usables

Structures are placed before or during a wave; usables are one-shot strikes with a cooldown or a per-run count.

**Structures**

| Structure | Effect |
| --- | --- |
| Roadblock (tiered) | Slows and blocks; has HP. Tiers: plastic, wood, sandbags, cars, cement. Cement is immovable and very limited. Some are already on the map and need a soldier ordered to move them; others are placed by the player |
| Watchtower | Raises range for the soldier in it; outdoors only |
| Incendiary ammo box | Soldiers in range fire burning rounds |
| Extra ammo box | Soldiers in range get a fire-rate boost |
| Mines | Explode on contact; can hurt soldiers |
| Barbed wire | Slows zombies |
| Activated explosives | Player-triggered blast; can hurt soldiers |
| Rigged car | Rams zombies within a set distance until its kill count runs out, then stops and becomes a roadblock |
| Sandbag nest | Cover spot: damage reduction for the outdoor soldier in it |
| Electric puddle | Damages and slows zombies standing in it; powered by a generator placed inside a building |
| Spike strip | Cheap, short-lived, strong against Fast zombies |
| Noise maker | Pulls zombies toward a side street for a few seconds |

**Usables**

| Usable | Effect |
| --- | --- |
| Missile | Single heavy hit at a point |
| A-10 Warthog run | Strafes a line in the direction you drag |
| Napalm bomb | Area fire that lingers |
| Smoke/Flash | Stalls zombies in an area briefly |
| Artillery barrage | Wide area, hits after a delay |
| Decoy flare | Draws zombies away from your lines |

## Progression

Every run pays **chips**, spent in one big skill web; cleared maps can be replayed to farm chips.

**Skill tree**

- One large web of connected nodes, each with a name, icon, cost and description, like the inspiration game.
- A filter shows one category at a time: Soldiers, Structures, Usables, Base.
- **Unlocks:** each soldier class, structure and usable, plus extra quantity (more of a unit you can deploy).
- **Upgrades:** per-class range, damage, fire rate, HP and class perks; structure HP and strength; usable power and charges.
- **Base:** leak limit (+5 per node), chip gain, starting time controls.
- Bought once, kept forever. Dead soldiers return free next run.
- Starting unlocks (proposed): 4 Riflemen, plastic and wood roadblocks, 1 Missile.

**Chips formula** (all numbers in `economy.json`)

```latex
\text{chips} = \left\lfloor \frac{\text{kills}}{10} \right\rfloor \times (1 + \text{time bonus} + \text{leak bonus}) + \text{first-clear bonus}
```

- **Time bonus:** up to +30% for finishing under the map's par time, scaled linearly.
- **Leak bonus:** +25% for zero leaks, falling linearly to 0% at the leak limit.
- **First-clear bonus:** a flat +200 the first time a map is won.
- **Loss:** keep 50% of the kill chips, with no time, leak or first-clear bonus.

## Map: New York

The first map is a Manhattan-style street grid, laid out the way a real top-down view of the city looks, not randomly.

- **Layout:** long north–south avenues crossed by short east–west streets, giving rectangular blocks. One diagonal avenue (Broadway-style) cuts across for a varied choke point.
- **Flow:** zombies enter from the north edge along two or three avenues and head south to the safe zone (a barricaded plaza and evacuation point).
- **Size:** larger than one screen; the camera scrolls and zooms.
- **Buildings:** brownstones, office towers, a parking garage, shops and a small park. Each building defines its indoor slots (windows and roof spots), so the designer controls how many indoor soldiers fit.
- **Pre-placed props:** abandoned cars, taxis, bus, sandbags and a police barricade that soldiers can be ordered to move into place as roadblocks.
- **Details:** crosswalks, sidewalks, manholes, street lamps, trees, rubble and burned cars for atmosphere.
- **Par time and waves** are set in the map's data file.

**Later maps (target 8+):** Tokyo Shinjuku and other real cities, each built from its own tileset.

## Art, audio and settings

All art is pixel art drawn by code from pixel grids, in a muted palette, viewed straight down.

**Art rules**

- **Pure top-down:** you see helmets, shoulders and roofs, like Hotline Miami.
- **Sprite size:** 32×32 px for soldiers and zombies; larger for bosses, vehicles and buildings.
- **Palette:** one shared file of about 24 muted colors (olive drab, dusty khaki, faded asphalt grey, desaturated reds). Every sprite uses only these.
- **Detail:** shading, outlines, gear and weapon shapes, not flat squares.
- **Soldiers:** idle, walk and shoot animations, drawn in 8 facing directions (rotating pixel art by code looks rough).
- **Zombies:** a 2-frame walk cycle, rotated freely by code to keep them cheap.
- **Effects:** muzzle flashes, tracers, fire, explosions, splash for bloaters.
- **Pipeline:** a script turns the grids into sprite sheets (atlases) the game loads.

**Audio**

- First version: shooting and explosion sounds only. Music and other sounds come later.
- Anti-noise rules: a cap on how many copies of one sound play at once, same-class shots merged into one sound per short window, slight pitch variation, and overall volume ducking in huge firefights.

**Settings**

- Gore: None, Some, Normal (blood splatter and corpses; corpses fade out to save performance).
- Volume: master and sound effects.
- Graphics quality: low, medium, high (particle and corpse limits).
- Left-handed UI.

## Technical plan

The game is a static web app built with Phaser 3, Vite and TypeScript, installed as a PWA and hosted on the user's Vercel site as a Hub app.

**Platform**

- PWA: installs from Chrome or Edge with a desktop icon and its own window; "Add to Home Screen" on phones; works offline.
- Icons at 192 px and 512 px; landscape locked.
- Deployed into its own folder on the Vercel site.

**Performance** (target: 60 fps with 1,000 zombies on a mid-range phone, tested on a real phone)

- **Object pooling:** reuse zombie, bullet and effect objects instead of creating new ones.
- **Flow field pathing:** one shared direction map per map, computed once, that every zombie follows; no per-zombie route finding.
- **Spatial grid:** soldiers check only zombies in nearby grid cells, so cone checks stay cheap.
- **Caps:** limits on particles, corpses and blood decals, scaled by the graphics setting.
- **Batching:** sprite atlases so thousands of sprites draw in few calls.
- **Fixed-timestep simulation:** steady results at 1x, 2x and 3x speed.

**Data files** (all balance lives here, not in code)

| File | Holds |
| --- | --- |
| `palette.json` | The \~24 muted colors |
| `units.json` | Soldier stats, cone shapes, animations |
| `zombies.json` | Zombie stats, leak costs, behaviours |
| `structures.json` | Structure and usable stats |
| `waves.json` | Wave mixes per map |
| `maps/new-york.json` | Tile layout, spawn edges, indoor slots, props, par time |
| `skilltree.json` | Nodes, links, costs, descriptions, categories |
| `economy.json` | Chips formula values |

**Saving**

- Local save on the device (browser storage), with a version number so old saves upgrade cleanly.
- Export and import buttons, since clearing browser data would wipe progress.

## Roadmap and open questions

Build in seven phases, each ending with something playable or viewable.

1. **Art style test:** one Rifleman (idle, walk, shoot in 8 directions) and one Normal zombie (2-frame walk) in the muted palette.
2. **Core engine:** scrolling map, flow-field zombies, cone shooting, roadblocks, leaks, pause and speed.
3. **All soldier and zombie classes.**
4. **All structures and usables.**
5. **Skill tree, chips and saving.**
6. **New York map, tutorial, settings, PWA install, Vercel deploy.**
7. **Sound:** shooting and explosions with anti-noise rules.

**Open questions**

- [ ] Soldier and zombie HP and damage: placeholders now, tuned by playing.
- [ ] Starting unlocks: is 4 Riflemen, plastic and wood roadblocks and 1 Missile right?
- [ ] Cone trade-off: revisit after playtesting if narrow lines dominate.
- [ ] How many waves and how many zombies in total on New York?
