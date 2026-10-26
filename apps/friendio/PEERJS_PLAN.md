# Friend.io: PeerJS host-authoritative plan

Status: implemented. Friend.io now uses a browser-hosted PeerJS transport and shared TypeScript simulation.

## Goal

Make Friend.io free to run with no server. The player who creates the room becomes the server.
Other players connect to the host's browser with PeerJS (WebRTC).

## How it would work

1. The host creates a room. Their browser gets a PeerJS ID. The room code is that ID.
2. Other players enter the code. PeerJS connects them straight to the host.
3. The host's browser runs the whole game 30 times a second.
4. Players send inputs to the host. The host sends the world state back.
5. The frontend stays on Vercel. No other hosting is needed.

QSendr already uses PeerJS (`apps/qrscans/peerjs.min.js`), so there is a working example in this repo.

## Limitations

### Host problems
- The host's phone or PC runs the whole game. It uses their battery and CPU.
- If the host closes the tab, the match ends for everyone.
- If the host's phone locks or the browser goes to the background, the game freezes.
- If the host has a slow connection, everyone lags.
- The host sees their own moves instantly. Others always have a delay.

### Connection problems
- Some networks block direct connections (school, office, some mobile data).
- Those players cannot join. A TURN relay fixes it, but free ones are unreliable.
- PeerJS's free signaling server is best-effort. If it is down, nobody can join.
- Room codes would be PeerJS IDs. They must be unique, so a code could clash or be reused.

### Fairness
- The host can cheat (fast speed, never tagged).
- Players can read the game data in their browser. Laser mode's hidden positions are not really hidden.
- Fine between friends. Not fine for strangers.

### Features lost or weakened
- The Reconnect button will not work well. A player who drops cannot easily rejoin.
- No host migration unless we build it on purpose.
- No stats or match history. Nothing is stored.

## Work involved

1. Done: rules moved to `shared/game.ts`.
2. Done: browser host runs the game at 30 Hz.
3. Done: PeerJS transport exchanges lobby, input, action, and snapshot messages.
4. Done: React and Phaser use the new transport.
5. Done: host runs lobby, ready-up, countdown, and results.
6. Done: Colyseus server and dependency removed.
7. Done for existing protocol tests; real-device testing remains.
8. Owner action: test on real phones.

## Open decisions

- Use a TURN relay, or accept that some networks cannot join?
- Keep Laser mode's hidden positions as "honest host" only, or drop the hiding?
- Add host migration, or end the match when the host leaves?
- Keep the Colyseus server code for later, or delete it?

## Alternative

Host the existing Colyseus server on Render's free tier. Keeps the game as it is.
Catch: the server sleeps after about 15 minutes idle, and the first connect takes 30 to 60 seconds.
