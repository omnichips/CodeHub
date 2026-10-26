# Friend.io Progress

Updated: 2026-10-26

Friend.io is a mobile-first multiplayer pixel arena game registered in CodeHub at
`/friendio/`. The frontend is React + Phaser, and the authoritative multiplayer
server is Colyseus running separately from the frontend.

## Current status

### Complete

- New app registered in `apps.json`
- React/Vite web client
- Phaser arena rendering
- Separate TypeScript Colyseus server
- Shared TypeScript protocol/configuration
- Guest nickname validation and sanitization
- Six-character room codes
- Two-to-four-player room capacity
- Lobby player list and ready state
- Host indicator and host transfer
- Host-only match start
- Server-controlled match phases:
  - lobby
  - countdown
  - active
  - results
- Fixed 30 Hz server simulation
- Server-authoritative movement and arena bounds
- Sequence-numbered movement input
- Stale-input rejection
- Input-axis clamping
- Remote-player interpolation
- Tag mode:
  - server-authoritative It transfer
  - cumulative It time
  - sprint energy
  - push stun
  - cooldowns
  - touch controls
  - results ranking
- Gladiator mode:
  - server-authoritative spear angle
  - thrust/recovery timing
  - spear/player collision geometry
  - eliminations
  - survival and elimination ranking
- Laser Shoot mode:
  - server-authoritative aiming and firing
  - vision cone and range
  - fire cooldown
  - kills and deaths
  - respawning
  - mobile aim buttons
  - server-side Colyseus visibility filtering
- Connection diagnostics panel with copyable error reports
- Reconnect button using Colyseus reconnection tokens
- Pointer-cancel cleanup for touch controls
- PWA manifest and mobile-safe styling
- Local setup documentation in `apps/friendio/README.md`

## Validation completed

The following checks passed:

```powershell
# Friend.io web
cd apps/friendio/web
npm run build
npm test -- --run src/protocol.test.ts

# Friend.io server
cd ../server
npm run build

# CodeHub
cd ../../..
npm test
npm run build
```

The shared tests currently cover:

- Movement input clamping
- Laser vision-cone angle/range checks
- Spear segment/circle collision checks

## Run Friend.io locally

Open two terminals.

### Terminal 1: Colyseus server

```powershell
cd C:\Users\Acer\OneDrive\Documents\VSCode\Hub\apps\friendio\server
npm install
npm run dev
```

Expected output:

```text
Friend.io server listening on 2567
```

The missing `.env` message is optional and can be ignored. The server defaults
to port `2567`.

### Terminal 2: Vite client

```powershell
cd C:\Users\Acer\OneDrive\Documents\VSCode\Hub\apps\friendio\web
npm install
npm run dev
```

Open the displayed Vite URL, normally:

```text
http://localhost:5173/
```

For a two-player test:

1. Open the URL in one browser window.
2. Enter a nickname and create a room.
3. Open the URL in another browser window or incognito window.
4. Enter another nickname and join using the room code.
5. Ready both players.
6. Select Tag, Gladiator, or Laser Shoot.
7. Start the match from the host window.

## What still needs improvement

### Highest priority: real multiplayer testing

This has not yet been verified through a full two-browser match. Test:

- Create and join
- Ready synchronization
- Host-only start
- Tag transfer and push
- Gladiator elimination
- Laser visibility from different angles
- Laser firing and respawning
- Results screens
- Leaving and reconnecting

If anything fails, use **Show technical details** and **Copy error report** in
the app, then paste the report into the development chat.

### Mobile controls

The current controls are functional but are not yet polished:

- Movement uses directional buttons instead of a true analog joystick.
- Laser aiming uses four direction buttons instead of a right virtual joystick.
- Pointer capture and multi-touch need testing on real phones.
- Sprint, push, thrust, and fire need visible cooldown/energy feedback.
- Landscape and safe-area behavior need real-device verification.

### Synchronization

- Local movement prediction and server reconciliation are not implemented.
- Reconnection is implemented but needs testing during an active match.
- Interpolation is basic and should be tuned under real network latency.
- Network status should be made more visible during gameplay.

### Gameplay rules and polish

- Tag needs a clearer final tie-break display and polished HUD.
- Gladiator spear physics are a constrained free-aim model, not a full physical
  swinging/rope simulation.
- Gladiator spear-spear collision behavior is not implemented yet.
- Laser has cone/range visibility but intentionally does not have wall occlusion.
- Arenas currently have no obstacles or map hazards.
- Procedural shapes are placeholders, not final pixel-art assets.
- Match settings such as duration are not yet selectable in the lobby.
- Rematch currently requires leaving and creating/joining another room.

### Testing

- Dedicated server-room tests are not implemented.
- Browser-level Friend.io Playwright tests are not implemented.
- No real-device test has been completed.
- No poor-network or server-interruption test has been completed.

### Production

The frontend and Colyseus server are not deployed together yet. The frontend
can be hosted through the existing CodeHub/Vercel flow, but the Colyseus server
requires a persistent Node.js host.

No production host has been selected. Do not set a production
`VITE_GAME_SERVER_URL` until the server has been deployed and its WebSocket
endpoint is known.

## What you need to do

### You can do now

1. Run the local server and client using the commands above.
2. Test each mode with two browser windows.
3. Test on a real phone in landscape orientation.
4. Test iPhone Safari if available.
5. Test Android Chrome if available.
6. Try disconnecting/reconnecting one client during a match.
7. Paste any copied error reports here.
8. Decide which mode needs the most gameplay polish first.

### You need to provide or decide later

- A persistent Node.js hosting provider for the Colyseus server
- The production server URL
- Whether the frontend and server should remain in this repository
- Final game art direction and assets
- Whether Laser should receive wall/obstacle occlusion
- Whether Gladiator should use more complex spear physics
- Whether match history or player statistics should be added

Supabase is not required for the current guest-only version.

## Suggested next development order

1. Run and report the two-browser local tests.
2. Fix any issues found during those tests.
3. Add Friend.io Playwright browser tests.
4. Replace directional buttons with real movement and aiming joysticks.
5. Add gameplay HUDs for sprint, cooldowns, kills, and visibility state.
6. Add obstacles and Laser wall occlusion if desired.
7. Add Gladiator spear-spear collision tests and behavior.
8. Choose and configure a persistent server host.
9. Test the deployed frontend and server on real phones.
10. Only then consider final art, balancing, and public release.

## Important limitations

- Multiplayer currently requires the local Colyseus server to be running.
- Production deployment is intentionally not configured.
- The Phaser bundle is larger than the recommended Vite warning threshold.
- No commit or push has been made by the coding agent.
