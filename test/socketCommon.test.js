const { ok, strictEqual } = require('assert');
const { SocketCommon } = require('../build/index');

/** Transport that, like iobroker.socketio, requires a real disconnect of unauthenticated clients. */
class DisconnectingSocketCommon extends SocketCommon {
    __getIsNoDisconnect() {
        return false;
    }
}

function createAdapter() {
    return {
        log: { silly: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/**
 * Socket object the way the socket.io transport hands it to _initSocket: it exposes
 * only disconnect(), not close() (issue #84).
 */
function createSocketIoSocket() {
    const calls = { disconnect: [], emitted: [] };
    const socket = {
        id: 'socket1',
        query: {},
        conn: { request: { query: {}, headers: {} } },
        connection: { remoteAddress: '127.0.0.1' },
        emit: name => calls.emitted.push(name),
        disconnect: close => calls.disconnect.push(close),
    };
    return { socket, calls };
}

describe('socketCommon _initSocket', () => {
    it('kicks an unauthenticated socket.io client via disconnect() instead of crashing on close()', () => {
        const common = new DisconnectingSocketCommon({ auth: true }, createAdapter());
        // _initSocket is normally only reached after start() has created the commands object
        common.commands = { disableEventThreshold: () => {} };

        const { socket, calls } = createSocketIoSocket();
        let cbCalled = 0;

        // before the fix this threw "socket.close is not a function" and took the adapter down
        common._initSocket(socket, () => cbCalled++);

        strictEqual(calls.disconnect.length, 1, 'must disconnect the unauthenticated client');
        strictEqual(calls.disconnect[0], true, 'must close the underlying connection, not only the namespace');
        ok(calls.emitted.includes(SocketCommon.COMMAND_RE_AUTHENTICATE), 'must ask the client to re-authenticate');
        strictEqual(cbCalled, 1, 'must still answer the init callback');
    });
});
