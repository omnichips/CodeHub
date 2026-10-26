import { Server } from 'colyseus';
import { LobbyRoom } from './rooms/LobbyRoom.js';

const port = Number(process.env.PORT || 2567);
const gameServer = new Server();
gameServer.define('lobby', LobbyRoom).filterBy(['roomCode']);

// listen() on the Colyseus server (not a bare http server) is what binds the /matchmake routes
gameServer.listen(port).then(() => console.log(`Friend.io server listening on ${port}`));
