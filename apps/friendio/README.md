# Friend.io

Friend.io is a peer-to-peer multiplayer pixel arena in CodeHub. The room creator's browser is the authoritative host; no Friend.io game server or database is required.

## Local development

```powershell
cd apps/friendio/web
npm install
npm run dev
```

Create a room in one browser and share the six-character code with another browser. PeerJS provides signaling and WebRTC connects players directly. TURN relays are intentionally not configured, so some networks may be unable to connect.

## Checks

```powershell
cd apps/friendio/web
npm run build
npm test
```

The root `npm run build` publishes the client at `/friendio/`.

## Menus

Title (the playground at dusk, `web/src/TitleBackdrop.tsx`) → sketchbook mode cards → create room (public or private). Public rooms register on one of 8 well-known PeerJS ids for the host's UTC offset, and the "Public rooms near you" list probes those ids. Players draw a 12×12 top-view avatar in the lobby. A faint "dummies" button at the bottom left starts a practice match against 3 stationary dummies.

## Current modes

- Tag (up to 6 players): host-authoritative tagging, push stun, and survival scoring (+1 per second untagged, +5 per 10s streak, +10 for the longest streak at the end). The arena is a pixel-art playground painted in code (`web/src/playground.ts`, 1 art pixel = 4 world pixels); each prop in `PLAYGROUND` in `shared/obstacles.ts` is both its picture and its wall. Gladiator and Laser keep the plain blocks. The map is 1200x676 (layouts are written for 960x540 and grown 25% in `shared/obstacles.ts`). `web/src/ambience.ts` animates grass, swings, the merry-go-round, dust, tree canopies and butterflies on top; it is visual only. Every player is the pixel kid from `web/src/sprite.ts`: shirt from their room colour slot, head from their lobby drawing. IT moves 12% faster; the newly tagged player is immune to pushes for 3s; emptying the sprint bar slows you for 2s.
- Gladiator: host-authoritative free-aim spear thrusts and eliminations.
- Laser Shoot: host-authoritative cone, range, cooldown, kills, and respawns. Clients only receive opponents visible to them.

The match ends when the host leaves. Host migration, persistence, TURN configuration, and server-side anti-cheat are intentionally not included.
