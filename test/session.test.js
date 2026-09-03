const { ok, strictEqual } = require('assert');
const { SocketCommon, SocketCommands } = require('../build/index');

/** Transport like the iobroker ws server: unauthenticated clients are not disconnected */
class WsSocketCommon extends SocketCommon {
    __getIsNoDisconnect() {
        return true;
    }
}

function createAdapter() {
    return {
        name: 'test',
        log: { silly: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    };
}

/** Socket the way the ws transport hands it over, authenticated with an OAuth2 access token */
function createTokenSocket(sessionExpiresAt) {
    const emitted = [];
    const socket = {
        id: 'socket1',
        _acl: { user: 'system.user.admin' },
        _sessionExpiresAt: sessionExpiresAt,
        conn: { request: { query: {}, headers: { cookie: 'access_token=old' } } },
        emit: name => emitted.push(name),
    };
    return { socket, emitted };
}

describe('socketCommon __updateSession', () => {
    it('serves a socket with a valid token without asking for anything', () => {
        const common = new WsSocketCommon({ auth: true }, createAdapter());
        const { socket, emitted } = createTokenSocket(Date.now() + 60_000);

        strictEqual(common.__updateSession(socket), true);
        strictEqual(emitted.length, 0);
    });

    it('keeps serving a socket during the grace period after the token expired and asks once for a refresh', () => {
        const common = new WsSocketCommon({ auth: true }, createAdapter());
        const { socket, emitted } = createTokenSocket(Date.now() - 1_000);

        // before the fix the first event after the expiration cut the socket off
        strictEqual(common.__updateSession(socket), true, 'must still execute the command');
        strictEqual(
            emitted.filter(name => name === SocketCommon.COMMAND_RE_AUTHENTICATE).length,
            1,
            'must ask the client to refresh the token',
        );

        strictEqual(common.__updateSession(socket), true);
        strictEqual(emitted.length, 1, 'must not ask again within the interval');
    });

    it('cuts a socket off when the grace period is over', () => {
        const common = new WsSocketCommon({ auth: true }, createAdapter());
        const { socket, emitted } = createTokenSocket(Date.now() - SocketCommon.SESSION_GRACE_MS - 1_000);

        strictEqual(common.__updateSession(socket), false);
        ok(emitted.includes(SocketCommon.COMMAND_RE_AUTHENTICATE));
    });
});

describe('socketCommands applyCommands', () => {
    function createCommands(tokens, sessionValid) {
        const adapter = createAdapter();
        adapter.getSession = (id, cb) => cb(tokens[id] || null);
        return new SocketCommands(adapter, () => sessionValid);
    }

    function attach(commands, socket) {
        const handlers = {};
        socket.on = (name, cb) => (handlers[name] = cb);
        commands.applyCommands(socket);
        return handlers;
    }

    it('accepts a new access token although the session has expired, and blocks other commands', () => {
        const commands = createCommands({ 'a:new': { user: 'admin', aExp: Date.now() + 3_600_000 } }, false);
        const { socket } = createTokenSocket(Date.now() - 1_000);
        const handlers = attach(commands, socket);

        let versionCalled = false;
        handlers.getVersion(() => (versionCalled = true));
        strictEqual(versionCalled, false, 'an ordinary command must not run on an expired session');

        let answer;
        handlers.updateTokenExpiration('new', (err, success) => (answer = { err, success }));
        strictEqual(answer.success, true, 'the new token must be accepted');
        ok(socket._sessionExpiresAt > Date.now(), 'the session must be valid again');
        strictEqual(socket.conn.request.headers.cookie, 'access_token=new');
    });

    it('rejects an access token of another user', () => {
        const commands = createCommands({ 'a:other': { user: 'guest', aExp: Date.now() + 3_600_000 } }, true);
        const { socket } = createTokenSocket(Date.now() + 1_000);
        const before = socket._sessionExpiresAt;
        const handlers = attach(commands, socket);

        let answer;
        handlers.updateTokenExpiration('other', (err, success) => (answer = { err, success }));
        strictEqual(answer.success, false);
        strictEqual(socket._sessionExpiresAt, before, 'the session must not be prolonged');
    });
});
