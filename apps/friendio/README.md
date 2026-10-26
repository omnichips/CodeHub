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

## Current modes

- Tag: host-authoritative tagging, sprint, push stun, and cumulative It-time scoring.
- Gladiator: host-authoritative free-aim spear thrusts and eliminations.
- Laser Shoot: host-authoritative cone, range, cooldown, kills, and respawns. Clients only receive opponents visible to them.

The match ends when the host leaves. Host migration, persistence, TURN configuration, and server-side anti-cheat are intentionally not included.
