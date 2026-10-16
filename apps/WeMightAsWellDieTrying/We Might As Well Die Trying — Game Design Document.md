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
\text{chips} = \left\lfloor \frac{\text{kills}}{15} \right\rfloor \times (1 + \text{time bonus} + \text{leak bonus}) + \text{first-clear bonus}
```

- **Time bonus:** up to +30% for finishing under the map's par time, scaled linearly.
- **Leak bonus:** +25% for zero leaks, falling linearly to 0% at the leak limit.
- **First-clear bonus:** a flat +100 the first time a map is won.
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

**Later maps (target 8+):** nine maps are built: Main Street, Chicago, New York, Manila, Mexico City, Rome, Tokyo, London and the White House, all in the New York tileset for now (see Decisions).

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
- [x] Starting unlocks: 4 Riflemen, plastic and wood roadblocks and 1 Missile (decided, see below).
- [x] Cone trade-off: narrow lines do not dominate (see Decisions), so none is added.
- [x] How many waves and how many zombies in total on New York? 4,000 in 10 waves (see Decisions).

## Decisions

Settled while building; not to be reopened without playtesting a reason.

- **Starting loadout:** 4 Riflemen, 3 plastic and 2 wooden roadblocks, 1 Missile.
- **Time controls:** Pause, ½×, 1×, 2× and 5×, all from the start (5× added back in October 2026). 1× runs the fight five times faster than real time (what was 5×; 2× is the old 10×), so a city takes minutes, not a quarter of an hour (October 2026; before that 1×, 2×, 4×, 5× and 10×, and before that skill web unlocks). Bodies stay on screen as long as before.
- **Skill web:** rebuilt in October 2026 with levelled nodes: each node can be bought up to 3 times (a cost per level, about 1.5x the last), so there are fewer nodes on screen but more to buy (167 nodes, 364 levels; everything costs 16,730 chips; every cost was raised 1.5× in October 2026, rounded to 5). Each soldier class: unlock, then +1 (2 levels), then range, damage and fire rate (3 each), then +1 again (2) off damage, then toughness (3) and the class's perk. Medic and Engineer have their work stat in place of damage and fire rate. Structures and strikes: unlock, +1 or +1 use (2), then power or toughness (3). Saves from the old web get every chip they spent back. One category is shown at a time (Soldiers, Build, Strikes, Base), each hanging off the Command node. Since October 2026 it is a skill tree: cards laid out left to right, a column per depth, each parent level with the middle of its children, joined by square-cornered lines; a mouse over a card lights the way back to Command. A soldier's card (his unlock or one more of him) has an eye: a demo of him, with your upgrades, holding a short street of his own (the medic and the engineer with riflemen to keep up, the shield in front of one), round after round.
- **Chips:** kills/15 (kills/10 before October 2026). The time bonus reaches its full +30% at 75% of par (par 420). Leak bonus +25% at zero leaks, falling to 0 at the limit. First clear +100 (was +200). A loss, retreat included, keeps half the kill chips.
- **Aiming:** soldiers auto-aim at a zombie inside their cone (the nearest, or by the priority set: the Sniper has that button), with a little scatter; pellets scatter wider. The flamethrower burns its whole cone. Mortar and Grenadier aim at a point. The A-10 flies the way your finger was moving when you let go. The rigged car's direction is chosen while planning.
- **Generator:** powers puddles within 220 px.
- **Friendly fire:** mines and explosives are the only things that hurt your own soldiers.
- **Buildings:** Shield and turret are outdoor-only; one soldier per window or roof spot; mid-wave a soldier can leave a building but not enter one.
- **Map dressing:** decor (trees, lamps, wrecks) is only drawn and never collides, so it stays off the streets; New York's burned wrecks sit on the parking garage roof. The plaza in front of the safe zone is its own tile (`,`), walked like a street and paved.
- **Install:** the game is a PWA scoped to its own folder; a cache-first service worker, renamed on every build, keeps it playable offline. Landscape only: a phone held upright is asked to turn sideways.
- **Sound:** gunfire, rockets, shells, small blasts and napalm are made in code like the art: shaped noise and falling tones, one recipe per weapon family. The rest are recordings in `src/sounds` (October 2026): the A-10 (cannon, then the jet, once per run), the missile (its whoosh and boom, started 0.4 s in so the boom lands on impact), big blasts (mines, explosives, artillery), a few seconds of military alarm as each wave starts, the screamer's scream, a screech when a brute or hordemother arrives, single groans now and then and death rattles cut from longer takes, and the horde's growl looping underneath, louder the more zombies are on screen. A recording repeated within its window is dropped, not merged. There is no music yet. Anti-noise numbers: repeats of one sound within 50-250 ms merge into the playing copy (louder, up to 2x), 1-4 copies per sound and 16 in all, ±6% pitch, ducking once more than about 6 sounds a second are playing, and a compressor on the output. Off-screen sounds fade with distance. Volume is master × effects. A hidden tab goes silent.
- **Soldier strength:** base damage and fire rate of every class raised 1.5× after playtesting (October 2026).
- **The horde:** zombies keep apart by their drawn size (1.25× the body they are hit by), so a crowd is a carpet of zombies shoulder to shoulder, never stacked, and each wave arrives as mobs of about 50, each pouring in at one spawn point, spread over the wave's duration.
- **Maps, in order:** 1 Main Street, one straight east-west street (landscape screens show most of it), where the guided start runs; 2 Chicago, an F with two ways in, both from the right; 3 New York, the city grid with three ways in (the tops of its avenues); 4 Manila, the slums by an estero: shanties packed roof to roof, alleys winding through them, a basketball court, the main road bridging the canal, three ways in; 5 Mexico City, the Zócalo: one great open square between two avenues with the Metropolitan Cathedral, the National Palace and the Templo Mayor ruins standing in it and the giant flag in its middle, painted casitas round it; 6 Rome, Via Labicana bent into an M (in from both feet, over the two peaks, down into the safe zone where it dips in the middle), the Colosseum between the peaks; 7 Tokyo, Shibuya, on the biggest map (192 by 192): the safe zone in the middle of the scramble crossing, every road into it a way in (Inokashira-dori, Center Gai, Meiji-dori, Bunkamura-dori, Dogenzaka, Miyamasuzaka, Route 246), Hachiko Square and the station with its tracks south of it, video screens round it; 8 London, one bridge over the Thames end to end, no buildings, two piers that widen it; 9 White House, the last stand: one long open mown lawn with the horde coming off Pennsylvania Avenue along the whole north side and the White House itself as the safe zone, past a fountain in a ring of path, flower gardens, a helipad, groves and hedges down the sides, the drive to the north portico and a few barricades. They were put in this order in October 2026 (it was Central Park, London, White House, Rome, Queens, Tokyo), each horde sized to its new place; then Brooklyn became Chicago, Queens Manila and Central Park Mexico City (a save that cleared one counts the new city cleared); a save that cleared a map keeps it open whatever comes before it. London, the White House, Rome and Tokyo took the places of Harlem, Red Hook, Wall Street and Times Square in October 2026; a save that cleared one of those counts the city in its place as cleared.
- **Horde size:** a fixed number per map that grows map to map: Main Street sends about 1,250 zombies in 5 waves (125 to 326 each), Chicago about 3,750 in 8 (255 to 673), New York 4,000 in 10 (230 to 514), then Manila 4,600 in 10, Mexico City 5,300 in 10, Rome 6,000 in 11, Tokyo 6,800 in 11, London 7,600 in 12 and the White House 8,500 in 12. Par for maps 4 to 9 was scaled from the measured undefended runs by zombie count when they were reordered, and every par got the longer walk when the maps doubled: `node scripts/undefended.ts <map id>` gives the exact figure. Every zombie has 20% more HP than before October 2026 (a normal one 120).
- **No map is won at once (October 2026):** every map takes a few tries: the starting loadout loses Main Street, and what won one map loses the next until the chips from a try or two (a loss keeps half the kill chips) buy more. `node scripts/balance.ts [map id] [seed]` plays the campaign that way (a sensible defence, every chip spent between tries, each try listed) and is the check; the target is about three tries a map. Main Street, Brooklyn, London and Queens were made bigger for it (before the maps were reordered) (they were won at once in that simulation; Main Street's starting loadout used to win, leaking 0 to 30 of 50). That alone did not do it: a first clear paid for 20 to 40 upgrades, so Brooklyn and New York still fell at once; chips were cut (kills/15, first clear +100) and costs raised 1.5×. Not yet checked in the simulation since.
- **Par:** about what an undefended run of every wave takes (`node scripts/undefended.ts <map id>` prints it), so the time bonus is earned by killing the horde on its way in. A formula of 1.35 × the wave time fell far short on the later maps, where a mob pours in only as fast as there is room and the crowd takes long to walk in (Rome's undefended run takes 1,331 s against 586 s of waves).
- **Spawning:** a mob pours in only as fast as there is room at its spawn point (a crowd that cannot fit would be shoved into the buildings): each newcomer keeps 60% of its own size clear of anyone there, counting the ones that came in the same step (a whole mob once landed in one step, piled up and jammed for good). A way in that stays full for 2 seconds sends the mob to another. Late zombies of one wave carry into the next, and any zombie still shoved into a building is put back on the nearest open tile; a zombie wider than half a tile is pushed out only from the tiles it started on (following its pushes once hung the game).
- **Where they come from:** spawn tiles glow red with arrows pointing in (and "THEY COME FROM HERE" while planning). No street may run off the map except where the horde comes in or into the safe zone; a test checks every map.
- **Saves:** three slots, each with its own chips, skills, cities and statistics; settings are shared by all. The main menu is Continue (the save played last, once there is one), New save, Load save, Statistics, Settings; a save opens on its cities (with about how many zombies each sends per soldier you can field), with Settings and the skill tree in the top right corner. Settings has a storage bar (the saves against the 5 MB or so of browser storage they live in, and the game's total on the device as the browser reports it) and a Debug screen with cheats for the save in use.
- **Menu backdrop (October 2026):** a ruined city painted by the map painter (game/menucity.ts) rather than a picture: shell holes, burned-out cars, caved-in roofs, soot, fires on the roofs and in the street with smoke drifting off, a few zombies shambling along its streets; the view drifts slowly across it.
- **Looks:** each class wears its own colours (the Sniper all white, Häyhä style); the machine gunner is a crew of two on a bigger sprite with a wider footprint. Skill web upgrades show what they do (a bullet for damage, a gun for fire rate, a crosshair for range, a heart for HP); unlocks and +1 nodes show the unit.
- **Controls:** R turns the selected roadblock or structure, or the one being dragged from the bar. Hovering a bar item or a soldier (or holding a finger on a bar item) says who it is.
- **Touch (October 2026):** besides dragging up out of the bar, a finger can tap a bar item (it lights up) and then tap the map to put it there; tapping the item again lets go. Whatever a finger drags (from the bar, or a soldier, roadblock or structure on the map) is held 36 px above it, so the finger does not hide where it goes. A finger picks up a soldier or his aiming handle from 34 px away (a mouse 22). The page itself cannot be pinch-zoomed.
- **Shooting from buildings:** an indoor soldier's shots leave from the side of his tile that opens onto the street most in line with the shot (his window, or the roof edge), and he aims from there, so he can fire down the street almost along the building front. Walls still stop shots aimed back through a building.
- **Zombie pathing:** zombies follow the street as if no roadblock stood in it, and turn to go round (or push through) one only once it is within about 2.5 tiles ahead; they no longer veer off far up the street.
- **Vehicles:** cars and taxis take 2 by 3 tiles, the bus 2 by 5; any roadblock can be turned with R, including the ones already in the street (a soldier hauls those).
- **Map art:** maps are painted tile by tile (road, crosswalk, sidewalk, plaza, grass, tree, safe zone, roof, roof edge with its wall), each tile clipped to its square, so nothing spills into the road. Building kinds: brownstone (b), apartments with a water tower (a), shops (h), offices (o), a parking deck with cars (g), the hospital with a red cross (m), warehouses (w). Decor only goes where it belongs (lamps and trees off the road, manholes in it).
- **Chicago, an F (was Brooklyn):** the spine is an 8-lane road down the left side to the plaza and the safe zone, its top closed; the two bars of the F are 4-lane roads that run from it to the right edge, and the horde comes in at the right end of both, the L running over the top one. Around it: warehouses, the hospital, a parking deck, three skyscrapers, apartments, a park between the bars, greystones, shops. A hedge closes the park's north edge, so the top bar's horde keeps to the top bar instead of cutting through the park to the bottom one.
- **New York (level 3):** the city grid: three avenues the horde comes down, cross streets, the plaza and the safe zone at the bottom; closed at the left and right edges by buildings, so no cross street runs off the map. Warehouses along the top, a hospital block, parking decks, a pocket park and a park with paths, brownstones and apartments with an alley, shops on the plaza.
- **Street clutter:** barrels, crates, trash bags, dumpsters, hydrants, traffic cones, benches and bins, each drawn only where it belongs (cones in the road, hydrants and dumpsters on sidewalks, benches in parks and plazas, barrels and crates on roofs too).
- **Lanes:** a road is a tile per lane; every stretch shows all its lanes (a solid line down the middle, dashes between the rest), crosswalks next to a crossing, no lanes in a crossing.
- **Calm roofs:** roofs darken the deeper they are inside a block, fading all the way to black 6 tiles in (full detail on the first row facing a street; since October 2026, it stopped at 35% before), counted from ground anyone can walk to, so walled-in spaces darken too. The hospital cross stays as a landmark; no decor is drawn deep in the shadow.
- **Maps 4 to 9:** drawn by `scripts/maps.ts` from a few rectangles each (streets, entries, parks, plazas, the safe zone, any block of one building kind); it fills each block with lots of one kind, puts windows and roofs along street fronts at least 4 tiles apart, parks cars, taxis, buses and barricades along streets away from the entries and the safe zone, scatters the street clutter, and writes the waves (more each time, specials coming in one by one, hordemothers from halfway, brutes from 60%, eight brutes in the last). It checks every map in the simulation before writing it.
- **Camera:** you can zoom out until the whole map fits between the status row and the bar (the Map button beside Menu goes there and back); a map narrower or shorter than that room sits in its middle, and the map's top and bottom edges can be pulled out from under the bars. Off the map is black. A city opens on the street nearest the point halfway between the map's middle and the safe zone, zoomed to show about 480 px of it top to bottom.
- **Twice as big (October 2026):** every map was doubled each way, every tile made 2 by 2, so streets, sidewalks and buildings are twice as big while zombies, soldiers, cars and roadblocks keep their size: room for the horde (Main Street's road is 8 tiles of asphalt, its sidewalks 2). Maps record `scale: 2` and the painter draws their lanes, sidewalks, crosswalks, lots and roof shade that much wider, so they look as they did, only bigger. Maps 4 to 9 are laid out at design size in `scripts/maps.ts` and doubled as they are written (`scripts/upscale.ts`); maps 1 to 3 were doubled once. Map thumbnails are painted from the design-size map. Only the city being played keeps its painting (all of them would fill a phone). Saves went to version 4: a kept setup from before would land in the wrong places, so those were dropped.
- **Life on the map:** fire flickers in burned-out wrecks and in some oil drums, smoke drifts off them downwind, grey smoke off some rubble, steam off some manholes: only drawn, and only where the decor itself was drawn; 24 spots at most on high quality, fewer on lower.
- **Building kinds added (October 2026):** `k` Chicago greystones (stone fronts), `z` skyscrapers (their tops drawn above the roof shade, a plant room and two masts), `y` shanties (each roof its own tin, rust or tarp, rows of roofs of uneven widths, tyres and stones holding them down, plywood walls), `x` casitas (each its own colour), `c` colonial red stone (tezontle). Landmarks added: the Metropolitan Cathedral, the giant flag, the L, washing lines, a basketball court. The White House is drawn bigger on bigger grounds.
- **Last setup:** pressing Start keeps the defence as it stands for that city in the save; next time, Last setup (beside Start) clears the map and puts it back, as far as what you own allows. The map's own cars go back where they were moved to.
- **Kills by who:** every kill is credited to a soldier class, a structure or a strike (fire counts for whoever lit it), and the end panel lists the top six beside the chips.
- **Soldier down:** a soldier killed in a wave gives a notice under the status (tap it to look) and a red ring where he fell.
- **Cone trade-off, tested:** none added. Four Riflemen across Main Street over its first three waves: wide and middle cones held with no leaks, the narrowest leaked about 86. A wide cone sees more targets; a narrow one only shoots straighter.
- **Fast speeds on slow devices:** each frame works out at most 25 ms of fighting; a device that cannot keep up runs the fight slower than the speed chosen (the status says "slowed") rather than freezing.
- **Crash report:** if the game throws, it stops and shows the error with a report to copy (error and stack, build time, browser, screen, settings, and how the fight stood) and a Reload button. A hang cannot be caught that way.
- **Parked cars on drawn maps:** at least 6 tiles apart, and every way in keeps a path two tiles wide past them to the safe zone.
- **Dead bodies setting:** None, 50, 150 or 300 (the default) bodies lying about at once, within the quality setting's own cap; fewer is lighter on a slow device.
- **Crowd freezes (fixed October 2026):** two things stood a crowd still for good on Wall Street. An intelligent zombie draws those near it to a spot just ahead of it, and one already standing on that spot (in its path) was drawn back onto it whichever way its own way went, so it held the leader up and neither moved; now a pull never points against a zombie's own way. And a big zombie squeezed into a flat wall was pushed out slantwise off the corner of one wall tile as if the next one were not there, which undid its walking; now a corner with a solid tile beside it pushes straight out. Water and hedges are solid to zombies and to a soldier walking, as buildings are.
