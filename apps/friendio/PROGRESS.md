# Friend.io progress

## Implemented

- React + Phaser mobile-first arena client.
- PeerJS browser-to-browser rooms with six-character room codes.
- Room creator is the host and runs the shared 30 Hz `FriendGame` simulation.
- Host-authoritative lobby, ready state, mode selection, countdown, gameplay, and results.
- Tag, Gladiator, and Laser Shoot modes.
- Laser snapshots only include opponents inside the viewer's cone and range.
- Host departure ends the match for connected guests; host migration is not implemented.
- Diagnostics and copyable error reports.
- Friend.io is registered in the CodeHub launcher with an original pixel-art icon.

## Local checks

```powershell
cd apps/friendio/web
npm install
npm run build
npm test
```

The root build publishes the app at `/friendio/`. No Colyseus server or `.env` file is needed.

## Known limitations

- PeerJS signaling and direct WebRTC connections are best-effort.
- TURN is not configured, so restrictive networks may not connect.
- The host can cheat and its browser performs all simulation work.
- Host disconnects end the room.
- Real iPhone Safari and Android testing is still required.
- Touch aiming remains four directional buttons rather than an analog joystick.
- No persistence, stats, rematch flow, obstacles, or final art pass.

## Owner testing

1. Run the web app.
2. Create a room in one browser and copy the displayed six-character code.
3. Join from a second browser or phone.
4. Test all three modes, especially Laser visibility while changing aim.
5. Test what happens when the host closes the tab.
6. If a connection fails, use **Copy error report** and paste the result.
