# Friend.io

Friend.io is the multiplayer pixel arena app in CodeHub.

## Local development

Start the authoritative Colyseus server:

```powershell
cd apps/friendio/server
npm install
npm run dev
```

In another terminal, start the Vite client:

```powershell
cd apps/friendio/web
npm install
npm run dev
```

The client uses `ws://localhost:2567` by default. Set `VITE_GAME_SERVER_URL` when using another server.

## Checks

```powershell
cd apps/friendio/web
npm run build
npm test

cd ../server
npm run build
```

The root `npm run build` publishes the client at `/friendio/`. The Colyseus server is separate and must remain running.

## Current modes

- Tag: server-authoritative tagging, sprint, push stun, and cumulative It-time scoring.
- Gladiator: server-authoritative free-aim spear thrusts and eliminations.
- Laser Shoot: server-authoritative forward cone, range, cooldown, kills, and respawns.

Laser gameplay state uses Colyseus `StateView` filtering. A client receives its own player and only opponents currently visible in its cone and range.

Production hosting is intentionally not configured yet. Vercel can host the frontend, but the Colyseus server requires a persistent Node.js host.
