const { deepStrictEqual, ok, strictEqual, throws } = require('assert');
const { SocketCommon, SocketCommands } = require('../build/index');

/** Transport like the iobroker ws server: unauthenticated clients are not disconnected */
class WsSocketCommon extends SocketCommon {
    __getIsNoDisconnect() {
        return true;
    }
    __getSessionID(socket) {
        return socket._testSessionId || null;
    }
}

/** Transport like socket.io: unauthenticated clients must be disconnected */
class DisconnectingSocketCommon extends WsSocketCommon {
    __getIsNoDisconnect() {
        return false;
    }
}

function createAdapter(overrides) {
    const logs = { silly: [], debug: [], info: [], warn: [], error: [] };
    const calls = { getSession: [], setSession: [], checkPassword: [], setState: [], calculatePermissions: [] };
    const adapter = Object.assign(
        {
            name: 'test',
            logs,
            calls,
            log: {
                level: 'info',
                silly: text => logs.silly.push(text),
                debug: text => logs.debug.push(text),
                info: text => logs.info.push(text),
                warn: text => logs.warn.push(text),
                error: text => logs.error.push(text),
            },
            sessions: {},
            getSession(id, cb) {
                calls.getSession.push(id);
                cb(adapter.sessions[id]);
            },
            setSession(id, ttl, obj) {
                calls.setSession.push({ id, ttl, obj });
            },
            checkPassword(user, pass, cb) {
                calls.checkPassword.push({ user, pass });
                cb(user === 'admin' && pass === 'pa:ss');
            },
            calculatePermissions(user, _permissions, cb) {
                calls.calculatePermissions.push(user);
                cb({
                    user,
                    object: { read: true, list: true, write: true, delete: true },
                    state: { read: true, list: true, write: true, create: true, delete: true },
                    file: { read: true, list: true, write: true, create: true, delete: true },
                });
            },
            setState(id, val, ack) {
                calls.setState.push({ id, val, ack });
            },
            sendTo() {},
        },
        overrides,
    );
    return adapter;
}

/** Fake socket with the properties the transports provide */
function createSocket(options) {
    options = options || {};
    const emitted = [];
    const handlers = {};
    const calls = { disconnect: [], close: 0 };
    const socket = {
        id: options.id || 'socket1',
        query: options.query || {},
        conn: {
            request: {
                query: options.requestQuery || {},
                headers: options.headers || {},
                sessionID: options.sessionID,
                pathname: options.pathname,
            },
        },
        connection: { remoteAddress: options.address === undefined ? '127.0.0.1' : options.address },
        emit: (name, ...args) => emitted.push({ name, args }),
        on: (name, cb) => (handlers[name] = cb),
        disconnect: close => calls.disconnect.push(close),
    };
    if (options.acl) {
        socket._acl = options.acl;
    }
    return { socket, emitted, handlers, calls };
}

function emittedNames(emitted) {
    return emitted.map(e => e.name);
}

function getUser(common, socket) {
    return new Promise(resolve => common.__getUserFromSocket(socket, (err, user, exp) => resolve({ err, user, exp })));
}

describe('SocketCommon constructor', () => {
    it('fills defaults for defaultUser and ttl', () => {
        const common = new WsSocketCommon(undefined, createAdapter());
        strictEqual(common.settings.defaultUser, 'system.user.admin');
        strictEqual(common.settings.ttl, 3600);
    });

    it('adds the system.user. prefix to the default user', () => {
        const common = new WsSocketCommon({ defaultUser: 'guest' }, createAdapter());
        strictEqual(common.settings.defaultUser, 'system.user.guest');
    });

    it('keeps a fully qualified default user', () => {
        const common = new WsSocketCommon({ defaultUser: 'system.user.guest' }, createAdapter());
        strictEqual(common.settings.defaultUser, 'system.user.guest');
    });

    it('parses ttl given as string and falls back on invalid values', () => {
        strictEqual(new WsSocketCommon({ ttl: '120' }, createAdapter()).settings.ttl, 120);
        strictEqual(new WsSocketCommon({ ttl: 'abc' }, createAdapter()).settings.ttl, 3600);
        strictEqual(new WsSocketCommon({ ttl: 0 }, createAdapter()).settings.ttl, 3600);
    });

    it('stores the language in the shared context', () => {
        const common = new WsSocketCommon({ language: 'de' }, createAdapter());
        strictEqual(common.context.language, 'de');
        strictEqual(common.context.ratings, null);
    });

    it('throws if abstract methods are not implemented', () => {
        throws(() => new SocketCommon({}, createAdapter()), /__getIsNoDisconnect/);
        const common = new WsSocketCommon({}, createAdapter());
        throws(() => SocketCommon.prototype.__getSessionID.call(common, {}), /__getSessionID/);
        throws(() => common.__initAuthentication({}), /__initAuthentication/);
    });
});

describe('SocketCommon __getUserFromSocket', () => {
    it('uses the access token from the query', async () => {
        const adapter = createAdapter();
        adapter.sessions['a:tok1'] = { user: 'admin', aExp: 12345 };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ requestQuery: { token: 'tok1' } });

        const result = await getUser(common, socket);
        deepStrictEqual(result, { err: null, user: 'system.user.admin', exp: 12345 });
        strictEqual(socket._secure, true);
        deepStrictEqual(adapter.calls.getSession, ['a:tok1']);
    });

    it('uses the Bearer token of the authorization header', async () => {
        const adapter = createAdapter();
        adapter.sessions['a:tok2'] = { user: 'user1', aExp: 1 };
        const common = new WsSocketCommon({ auth: false }, adapter);
        const { socket } = createSocket({ headers: { authorization: 'Bearer tok2' } });

        const result = await getUser(common, socket);
        strictEqual(result.user, 'system.user.user1');
        strictEqual(socket._secure, false, '_secure reflects settings.auth');
    });

    it('prefers the query token over the Bearer header', async () => {
        const adapter = createAdapter();
        adapter.sessions['a:query'] = { user: 'q', aExp: 1 };
        adapter.sessions['a:header'] = { user: 'h', aExp: 1 };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({
            requestQuery: { token: 'query' },
            headers: { authorization: 'Bearer header' },
        });

        strictEqual((await getUser(common, socket)).user, 'system.user.q');
    });

    it('uses the access_token cookie among other cookies', async () => {
        const adapter = createAdapter();
        adapter.sessions['a:tok3'] = { user: 'user2', aExp: 99 };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ headers: { cookie: 'foo=bar; access_token=tok3; x=y' } });

        const result = await getUser(common, socket);
        deepStrictEqual(result, { err: null, user: 'system.user.user2', exp: 99 });
    });

    it('does not mistake a cookie that only contains "access_token" in its name', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true, noBasicAuth: true }, adapter);
        const { socket } = createSocket({ headers: { cookie: 'my_access_token=tok' } });

        const result = await getUser(common, socket);
        strictEqual(result.err, 'Cannot detect user');
        strictEqual(adapter.calls.getSession.length, 0);
    });

    it('asks for re-authentication if the access token is unknown', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket, emitted } = createSocket({
            requestQuery: { token: 'unknown' },
            acl: { user: 'system.user.x' },
        });

        const result = await getUser(common, socket);
        strictEqual(result.err, 'Cannot detect user');
        strictEqual(socket._acl.user, '', 'the user of the socket must be reset');
        // The caller asks the client to re-authenticate, so that it happens exactly once
        deepStrictEqual(emittedNames(emitted), []);
    });

    it('resolves the user of a legacy session id', async () => {
        const adapter = createAdapter();
        const expires = new Date(Date.now() + 10_000).toISOString();
        adapter.sessions.sess1 = { passport: { user: 'admin' }, cookie: { expires } };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ sessionID: 'sess1' });

        const result = await getUser(common, socket);
        strictEqual(result.err, null);
        strictEqual(result.user, 'system.user.admin');
        strictEqual(result.exp, new Date(expires).getTime());
        strictEqual(socket._sessionID, 'sess1');
    });

    it('returns 0 as expiration for a legacy session without cookie expiration', async () => {
        const adapter = createAdapter();
        adapter.sessions.sess1 = { passport: { user: 'admin' }, cookie: {} };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ sessionID: 'sess1' });

        strictEqual((await getUser(common, socket)).exp, 0);
    });

    it('asks for re-authentication if the legacy session has no passport', async () => {
        const adapter = createAdapter();
        adapter.sessions.sess1 = { cookie: {} };
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket, emitted } = createSocket({ sessionID: 'sess1', acl: { user: 'system.user.admin' } });

        const result = await getUser(common, socket);
        strictEqual(result.err, 'Cannot detect user');
        strictEqual(socket._acl.user, '');
        deepStrictEqual(emittedNames(emitted), [], 'the caller tells the client, not this method');
    });

    it('authenticates with Basic auth, the password may contain ":"', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true }, adapter);
        const basic = Buffer.from('admin:pa:ss').toString('base64');
        const { socket } = createSocket({ headers: { authorization: `Basic ${basic}` } });

        const result = await getUser(common, socket);
        deepStrictEqual(result, { err: null, user: 'admin', exp: 0 });
        deepStrictEqual(adapter.calls.checkPassword, [{ user: 'admin', pass: 'pa:ss' }]);
    });

    it('authenticates with user and password in the socket query', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ query: { user: 'admin', pass: 'pa:ss' } });

        strictEqual((await getUser(common, socket)).user, 'admin');
    });

    it('rejects a wrong password without logging the whole password', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ query: { user: 'admin', pass: 'wrongPassword' } });

        const result = await getUser(common, socket);
        strictEqual(result.err, 'unknown user');
        strictEqual(adapter.logs.warn.length, 1);
        ok(!adapter.logs.warn[0].includes('wrongPassword'), 'password must not be logged');
    });

    it('does not check the password if user or password are missing', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true }, adapter);
        const { socket } = createSocket({ query: { user: 'admin' } });

        strictEqual((await getUser(common, socket)).err, 'Cannot detect user');
        strictEqual(adapter.calls.checkPassword.length, 0);
    });

    it('ignores Basic auth and query credentials when noBasicAuth is set', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ auth: true, noBasicAuth: true }, adapter);
        const basic = Buffer.from('admin:pa:ss').toString('base64');
        const { socket } = createSocket({ headers: { authorization: `Basic ${basic}` } });

        strictEqual((await getUser(common, socket)).err, 'Cannot detect user');
        strictEqual(adapter.calls.checkPassword.length, 0);
    });
});

describe('SocketCommon __getClientAddress', () => {
    const common = new WsSocketCommon({}, createAdapter());

    it('detects IPv4 from socket.connection', () => {
        const { socket } = createSocket({ address: '192.168.1.2' });
        deepStrictEqual(common.__getClientAddress(socket), { address: '192.168.1.2', family: 'IPv4', port: 0 });
    });

    it('detects IPv6', () => {
        const { socket } = createSocket({ address: '::1' });
        strictEqual(common.__getClientAddress(socket).family, 'IPv6');
    });

    it('falls back to the ws socket', () => {
        const { socket } = createSocket();
        delete socket.connection;
        socket.ws = { _socket: { remoteAddress: '10.0.0.1' } };
        strictEqual(common.__getClientAddress(socket).address, '10.0.0.1');
    });

    it('falls back to the socket.io handshake and then to the request connection', () => {
        const { socket } = createSocket({ address: '' });
        socket.handshake = { address: '10.0.0.2' };
        strictEqual(common.__getClientAddress(socket).address, '10.0.0.2');

        const { socket: socket2 } = createSocket({ address: '' });
        socket2.conn.request.connection = { remoteAddress: '10.0.0.3' };
        strictEqual(common.__getClientAddress(socket2).address, '10.0.0.3');
    });
});

describe('SocketCommon __updateSession', () => {
    it('does nothing for a socket without session', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({}, adapter);
        const { socket, emitted } = createSocket();

        strictEqual(common.__updateSession(socket), true);
        strictEqual(emitted.length, 0);
        strictEqual(socket._sessionTimer, undefined);
    });

    it('asks again for a refresh after the re-authenticate interval', () => {
        const common = new WsSocketCommon({ auth: true }, createAdapter());
        const { socket, emitted } = createSocket();
        socket._sessionExpiresAt = Date.now() - 1_000;

        const realNow = Date.now;
        try {
            const start = realNow();
            Date.now = () => start;
            common.__updateSession(socket);
            Date.now = () => start + SocketCommon.REAUTHENTICATE_INTERVAL_MS - 100;
            common.__updateSession(socket);
            strictEqual(emitted.length, 1);
            Date.now = () => start + SocketCommon.REAUTHENTICATE_INTERVAL_MS + 100;
            strictEqual(common.__updateSession(socket), true);
            strictEqual(emitted.length, 2);
        } finally {
            Date.now = realNow;
        }
    });

    it('remembers the reauthenticate request per socket', () => {
        const common = new WsSocketCommon({ auth: true }, createAdapter());
        const a = createSocket({ id: 'a' });
        const b = createSocket({ id: 'b' });
        a.socket._sessionExpiresAt = Date.now() - 1_000;
        b.socket._sessionExpiresAt = Date.now() - 1_000;

        common.__updateSession(a.socket);
        common.__updateSession(b.socket);
        strictEqual(a.emitted.length, 1);
        strictEqual(b.emitted.length, 1);
    });

    it('legacy session: updates the last activity and prolongs the session after 60 seconds', async () => {
        const adapter = createAdapter();
        adapter.sessions.sess1 = { passport: { user: 'admin' } };
        const common = new WsSocketCommon({ ttl: 100 }, adapter);
        const { socket } = createSocket();
        socket._sessionID = 'sess1';

        let timerCb;
        let timerDelay;
        const realSetTimeout = global.setTimeout;
        global.setTimeout = (cb, delay) => {
            timerCb = cb;
            timerDelay = delay;
            return 1;
        };
        try {
            strictEqual(common.__updateSession(socket), true);
        } finally {
            global.setTimeout = realSetTimeout;
        }
        ok(socket._lastActivity <= Date.now());
        strictEqual(timerDelay, 60_000);
        strictEqual(socket._sessionTimer, 1);

        timerCb();
        strictEqual(socket._sessionTimer, undefined);
        deepStrictEqual(adapter.calls.setSession, [{ id: 'sess1', ttl: 100, obj: { passport: { user: 'admin' } } }]);
    });

    it('legacy session: asks for re-authentication if the session vanished from the store', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({}, adapter);
        const { socket, emitted } = createSocket();
        socket._sessionID = 'gone';

        let timerCb;
        const realSetTimeout = global.setTimeout;
        global.setTimeout = cb => {
            timerCb = cb;
            return 1;
        };
        try {
            common.__updateSession(socket);
        } finally {
            global.setTimeout = realSetTimeout;
        }
        timerCb();
        deepStrictEqual(emittedNames(emitted), [SocketCommon.COMMAND_RE_AUTHENTICATE]);
        strictEqual(adapter.calls.setSession.length, 0);
    });

    it('legacy session: does not start a second timer while one is running', () => {
        const common = new WsSocketCommon({}, createAdapter());
        const { socket } = createSocket();
        socket._sessionID = 'sess1';
        socket._sessionTimer = 'existing';

        common.__updateSession(socket);
        strictEqual(socket._sessionTimer, 'existing');
    });

    it('legacy session: cuts the socket off after the ttl of inactivity', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ ttl: 10 }, adapter);
        const { socket, emitted } = createSocket();
        socket._sessionID = 'sess1';
        socket._lastActivity = Date.now() - 11_000;

        strictEqual(common.__updateSession(socket), false);
        deepStrictEqual(emittedNames(emitted), [SocketCommon.COMMAND_RE_AUTHENTICATE]);
    });

    it('token session wins over the legacy session', () => {
        const common = new WsSocketCommon({ ttl: 10 }, createAdapter());
        const { socket } = createSocket();
        socket._sessionID = 'sess1';
        socket._lastActivity = Date.now() - 11_000;
        socket._sessionExpiresAt = Date.now() + 10_000;

        strictEqual(common.__updateSession(socket), true);
        strictEqual(socket._sessionTimer, undefined);
    });
});

describe('SocketCommon white list', () => {
    const settings = perms => ({
        user: 'guest',
        object: { read: perms, list: perms, write: perms, delete: perms },
        state: { read: perms, list: perms, write: perms, create: perms, delete: perms },
        file: { read: perms, list: perms, write: perms, create: perms, delete: perms },
    });

    function fullAcl() {
        return {
            user: 'system.user.admin',
            object: { read: true, list: true, write: true, delete: true },
            state: { read: true, list: true, write: true, create: true, delete: true },
            file: { read: true, list: true, write: true, create: true, delete: true },
        };
    }

    it('finds a directly configured IPv4 or IPv6 address', () => {
        const whiteList = { '192.168.1.5': settings(true), '::1': settings(true) };
        strictEqual(SocketCommon.getWhiteListIpForAddress('192.168.1.5', whiteList), '192.168.1.5');
        strictEqual(SocketCommon.getWhiteListIpForAddress('::1', whiteList), '::1');
    });

    it('returns null for unknown addresses or without white list', () => {
        strictEqual(SocketCommon.getWhiteListIpForAddress('192.168.1.6', { '192.168.1.5': settings(true) }), null);
        strictEqual(SocketCommon.getWhiteListIpForAddress('fe80::1', { '192.168.1.5': settings(true) }), null);
        strictEqual(SocketCommon.getWhiteListIpForAddress('1.2.3.4', undefined), null);
    });

    // Regression, fixed: the wildcard match returns from inside the forEach callback, so getWhiteListIpForAddress
    // always returns null for wildcard entries and the "default" settings are used instead.
    it('matches a wild-carded IPv4 address', () => {
        const whiteList = { '192.168.1.*': settings(true) };
        strictEqual(SocketCommon.getWhiteListIpForAddress('192.168.1.77', whiteList), '192.168.1.*');
    });

    it('does not match a wildcard of another subnet', () => {
        const whiteList = { '192.168.2.*': settings(true) };
        strictEqual(SocketCommon.getWhiteListIpForAddress('192.168.1.77', whiteList), null);
    });

    it('uses the "default" entry for unknown addresses', () => {
        const whiteList = { default: settings(false) };
        strictEqual(SocketCommon._getPermissionsForIp('10.1.1.1', whiteList), whiteList.default);
    });

    it('restricts the ACL with the white list settings and replaces the user', () => {
        const acl = SocketCommon._mergeACLs('10.1.1.1', fullAcl(), { default: settings(false) });
        strictEqual(acl.user, 'system.user.guest');
        for (const type of ['object', 'state', 'file']) {
            for (const [op, value] of Object.entries(acl[type])) {
                strictEqual(value, false, `${type}.${op} must be restricted`);
            }
        }
    });

    it('never extends the ACL beyond the rights of the user', () => {
        const userAcl = fullAcl();
        userAcl.state.write = false;
        const acl = SocketCommon._mergeACLs('10.1.1.1', userAcl, { default: settings(true) });
        strictEqual(acl.state.write, false);
        strictEqual(acl.state.read, true);
    });

    it('keeps the authenticated user if the white list user is "auth"', () => {
        const list = settings(true);
        list.user = 'auth';
        const acl = SocketCommon._mergeACLs('10.1.1.1', fullAcl(), { default: list });
        strictEqual(acl.user, 'system.user.admin');
    });

    it('ignores undefined white list flags', () => {
        const list = { user: 'auth', object: {}, state: { write: false }, file: {} };
        const acl = SocketCommon._mergeACLs('10.1.1.1', fullAcl(), { default: list });
        strictEqual(acl.object.write, true);
        strictEqual(acl.state.write, false);
        strictEqual(acl.state.read, true);
    });

    it('does not touch the ACL without a white list or address', () => {
        deepStrictEqual(SocketCommon._mergeACLs('10.1.1.1', fullAcl(), undefined), fullAcl());
        deepStrictEqual(SocketCommon._mergeACLs('', fullAcl(), { default: settings(false) }), fullAcl());
        deepStrictEqual(SocketCommon._mergeACLs('10.1.1.1', fullAcl(), { '1.1.1.1': settings(false) }), fullAcl());
    });
});

describe('SocketCommon _initSocket', () => {
    function createCommon(settings, adapter, Class) {
        const common = new (Class || WsSocketCommon)(settings, adapter || createAdapter());
        common.commands = new SocketCommands(common.adapter, socket => common.__updateSession(socket), common.context);
        return common;
    }

    it('without authentication uses the default user and installs the command handlers', () => {
        const adapter = createAdapter();
        const common = createCommon({ auth: false, defaultUser: 'guest' }, adapter);
        const { socket, handlers } = createSocket();

        let cbCalled = 0;
        common._initSocket(socket, () => cbCalled++);

        deepStrictEqual(adapter.calls.calculatePermissions, ['system.user.guest']);
        strictEqual(socket._acl.user, 'system.user.guest');
        strictEqual(cbCalled, 1);
        strictEqual(typeof handlers.getState, 'function');
        strictEqual(typeof handlers.disconnect, 'function');
        strictEqual(typeof handlers.name, 'function', 'the name handler must be registered');
    });

    it('with authentication resolves the user, stores the expiration and sends tokenInfo', () => {
        const adapter = createAdapter();
        const aExp = Date.now() + 60_000;
        adapter.sessions['a:tok'] = { user: 'user1', aExp };
        const common = createCommon({ auth: true }, adapter);
        const { socket, emitted } = createSocket({ requestQuery: { token: 'tok' } });

        let cbCalled = 0;
        common._initSocket(socket, () => cbCalled++);

        strictEqual(cbCalled, 1);
        strictEqual(socket._secure, true);
        strictEqual(socket._sessionExpiresAt, aExp);
        strictEqual(socket._acl.user, 'system.user.user1');
        const tokenInfo = emitted.find(e => e.name === 'tokenInfo');
        deepStrictEqual(tokenInfo.args, [{ expiresAt: aExp }]);
    });

    it('adds the system.user. prefix to a user from Basic auth', () => {
        const adapter = createAdapter();
        const common = createCommon({ auth: true }, adapter);
        const { socket, emitted } = createSocket({ query: { user: 'admin', pass: 'pa:ss' } });

        common._initSocket(socket);

        deepStrictEqual(adapter.calls.calculatePermissions, ['system.user.admin']);
        ok(!emittedNames(emitted).includes('tokenInfo'), 'no tokenInfo without expiration');
    });

    it('applies the white list to the ACL of the authenticated user', () => {
        const adapter = createAdapter();
        adapter.sessions['a:tok'] = { user: 'admin', aExp: Date.now() + 60_000 };
        const common = createCommon(
            {
                auth: true,
                whiteListSettings: {
                    '127.0.0.1': {
                        user: 'auth',
                        object: { write: false },
                        state: {},
                        file: {},
                    },
                },
            },
            adapter,
        );
        const { socket } = createSocket({ requestQuery: { token: 'tok' } });
        common._initSocket(socket);

        strictEqual(socket._acl.user, 'system.user.admin');
        strictEqual(socket._acl.object.write, false);
        strictEqual(socket._acl.object.read, true);
    });

    it('does not disconnect an unauthenticated ws client but asks it to re-authenticate', () => {
        const common = createCommon({ auth: true, noBasicAuth: true });
        const { socket, emitted, calls } = createSocket();

        let cbCalled = 0;
        common._initSocket(socket, () => cbCalled++);

        strictEqual(calls.disconnect.length, 0);
        strictEqual(cbCalled, 1);
        // Exactly once: the lookup leaves it to the caller
        deepStrictEqual(emittedNames(emitted).filter(name => name === SocketCommon.COMMAND_RE_AUTHENTICATE).length, 1);
        // An empty ACL, so every command that needs a permission is refused
        deepStrictEqual(socket._acl, { user: '', groups: [] });
    });

    it('keeps an unauthenticated ws client able to announce a new access token', () => {
        // The socket stays open, so it has to stay reachable: without the handlers the client waits
        // for an answer that cannot come and runs into its own timeout (ioBroker.admin#3641 follow-up)
        const common = createCommon({ auth: true, noBasicAuth: true });
        const { socket, handlers } = createSocket();

        common._initSocket(socket, () => {});

        strictEqual(typeof handlers.updateTokenExpiration, 'function', 'the rescue command must arrive');
        strictEqual(typeof handlers.authenticate, 'function');
        ok(SocketCommon.isAuthenticationPending(socket), 'the socket waits for a token');
    });

    it('authenticateSocket gives the socket the user of an announced token', async () => {
        const adapter = createAdapter();
        const common = createCommon({ auth: true, noBasicAuth: true }, adapter);
        const { socket, emitted } = createSocket();
        common._initSocket(socket, () => {});

        // the client asks and has to wait, as its token is on the way
        let authAnswer = null;
        common.commands.getCommandHandler('authenticate')(socket, (isOk, isUsed) => (authAnswer = [isOk, isUsed]));
        strictEqual(authAnswer, null, 'the answer waits for the token');

        const expiresAt = Date.now() + 3_600_000;
        const success = await new Promise(resolve => common.authenticateSocket(socket, 'admin', expiresAt, resolve));

        strictEqual(success, true);
        strictEqual(socket._acl.user, 'system.user.admin');
        strictEqual(socket._sessionExpiresAt, expiresAt);
        deepStrictEqual(authAnswer, [true, true], 'the waiting authenticate is answered');
        ok(
            emitted.some(e => e.name === 'tokenInfo'),
            'the client learns when the token expires',
        );
        ok(!SocketCommon.isAuthenticationPending(socket));
    });

    it('closes an unauthenticated client via close() if the transport has no disconnect()', () => {
        const common = createCommon({ auth: true, noBasicAuth: true }, undefined, DisconnectingSocketCommon);
        const { socket } = createSocket();
        delete socket.disconnect;
        let closed = 0;
        socket.close = () => closed++;

        common._initSocket(socket);
        strictEqual(closed, 1);
    });

    it('skips the authentication for a socket that already has an ACL', () => {
        const adapter = createAdapter();
        const common = createCommon({ auth: true }, adapter);
        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });

        let cbCalled = 0;
        common._initSocket(socket, () => cbCalled++);

        strictEqual(adapter.calls.getSession.length, 0);
        strictEqual(adapter.calls.calculatePermissions.length, 0);
        strictEqual(cbCalled, 1);
        strictEqual(typeof handlers.getObject, 'function');
    });

    it('calls the extensions hook with the socket', () => {
        let extended;
        const common = createCommon({ extensions: socket => (extended = socket) });
        const { socket } = createSocket({ acl: { user: 'system.user.admin' } });

        common._initSocket(socket);
        strictEqual(extended, socket);
    });

    it('the name command stores the name and warns when it changes', () => {
        const adapter = createAdapter();
        const common = createCommon({}, adapter);
        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });
        common._initSocket(socket);

        let answered = 0;
        handlers.name('first', () => answered++);
        strictEqual(socket._name, 'first');
        handlers.name('first', () => answered++);
        strictEqual(adapter.logs.warn.length, 0);
        handlers.name('second');
        strictEqual(socket._name, 'second');
        strictEqual(adapter.logs.warn.length, 1);
        strictEqual(answered, 2);
    });

    it('on disconnect unsubscribes the socket, clears the session timer and calls the disconnect handler', () => {
        const adapter = createAdapter();
        const unsubscribed = [];
        adapter.unsubscribeForeignStatesAsync = pattern => {
            unsubscribed.push(pattern);
            return Promise.resolve();
        };
        adapter.subscribeForeignStatesAsync = () => Promise.resolve();
        const common = createCommon({}, adapter);
        let disconnected;
        common.addEventHandler('disconnect', (socket, error) => (disconnected = { socket, error }));

        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });
        common._initSocket(socket);
        common.commands.subscribe(socket, 'stateChange', 'test.0.*');
        socket._sessionTimer = setTimeout(() => {}, 100_000);

        handlers.disconnect('transport close');

        deepStrictEqual(unsubscribed, ['test.0.*']);
        strictEqual(socket._sessionTimer, undefined);
        strictEqual(disconnected.socket, socket);
        strictEqual(disconnected.error, 'transport close');
    });

    it('on disconnect without handler logs the disconnection', () => {
        const adapter = createAdapter();
        const common = createCommon({}, adapter);
        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });
        common._initSocket(socket);

        handlers.disconnect();
        ok(adapter.logs.info.some(text => text.includes('<== Disconnect system.user.admin')));
    });

    it('re-subscribes the patterns a socket already has', () => {
        const adapter = createAdapter();
        const subscribed = [];
        adapter.subscribeForeignStatesAsync = pattern => {
            subscribed.push(pattern);
            return Promise.resolve();
        };
        const common = createCommon({}, adapter);
        common.commands.subscribes.stateChange = {};
        const { socket } = createSocket({ acl: { user: 'system.user.admin' } });
        socket.subscribe = { stateChange: [{ pattern: 'a.0.*', regex: /^a\.0\./ }] };

        common._initSocket(socket);
        deepStrictEqual(subscribed, ['a.0.*']);
    });

    // Regression, fixed: subscribeSocket() reads this.subscribes[type][pattern] without creating this.subscribes[type],
    // so a socket that brings its subscriptions to a fresh commands instance throws a TypeError.
    it('re-subscribes the patterns of a socket on a fresh commands instance', () => {
        const adapter = createAdapter();
        adapter.subscribeForeignStatesAsync = () => Promise.resolve();
        const common = createCommon({}, adapter);
        const { socket } = createSocket({ acl: { user: 'system.user.admin' } });
        socket.subscribe = { stateChange: [{ pattern: 'a.0.*', regex: /^a\.0\./ }] };

        common._initSocket(socket);
        strictEqual(common.commands.subscribes.stateChange['a.0.*'], 1);
    });
});

describe('SocketCommon sockets list helpers', () => {
    function createWithSockets(sockets) {
        const common = new WsSocketCommon({}, createAdapter());
        common.server = { sockets: { sockets } };
        const published = [];
        common.commands = {
            publishInstanceMessage: (socket, source, type, data) =>
                published.push({ id: socket.id, source, type, data }),
            unsubscribeSocket: socket => published.push({ unsubscribed: socket.id }),
            destroy: () => published.push({ destroyed: true }),
        };
        return { common, published };
    }

    it('getSocketsList returns null without server and the list of the server otherwise', () => {
        const common = new WsSocketCommon({}, createAdapter());
        strictEqual(common.getSocketsList(), null);
        common.server = { sockets: { connected: { a: 1 } } };
        deepStrictEqual(common.getSocketsList(), { a: 1 });
    });

    it('sendLog sends the log only to sockets that subscribed to it (array)', () => {
        const a = createSocket({ id: 'a' });
        const b = createSocket({ id: 'b' });
        a.socket.subscribe = { log: [{ pattern: '*' }] };
        b.socket.subscribe = { log: [] };
        const { common } = createWithSockets([a.socket, b.socket]);

        const message = { message: 'hello', severity: 'info' };
        common.sendLog(message);
        deepStrictEqual(a.emitted, [{ name: 'log', args: [message] }]);
        strictEqual(b.emitted.length, 0);
    });

    it('sendLog works with the socket.io object structure and without server', () => {
        const a = createSocket({ id: 'a' });
        a.socket.subscribe = { log: [{ pattern: '*' }] };
        const { common } = createWithSockets({ a: a.socket });
        common.sendLog({ message: 'x' });
        strictEqual(a.emitted.length, 1);

        const empty = new WsSocketCommon({}, createAdapter());
        empty.sendLog({ message: 'x' }); // must not throw
    });

    it('publishInstanceMessageAll delivers only to the socket with the given id', () => {
        const { common, published } = createWithSockets([
            createSocket({ id: 'a' }).socket,
            createSocket({ id: 'b' }).socket,
        ]);
        common.publishInstanceMessageAll('cameras.0', 'image', 'b', { x: 1 });
        deepStrictEqual(published, [{ id: 'b', source: 'cameras.0', type: 'image', data: { x: 1 } }]);

        const { common: common2, published: published2 } = createWithSockets({ a: createSocket({ id: 'a' }).socket });
        common2.publishInstanceMessageAll('cameras.0', 'image', 'a', 1);
        strictEqual(published2.length, 1);
    });

    it('close unsubscribes all sockets, destroys the commands, clears timers and closes the server', () => {
        const a = createSocket({ id: 'a' });
        a.socket._sessionTimer = setTimeout(() => {}, 100_000);
        const { common, published } = createWithSockets([a.socket]);
        let closed = 0;
        common.server.ioBroker = true;
        common.server.close = () => closed++;

        common.close();

        deepStrictEqual(published, [{ unsubscribed: 'a' }, { destroyed: true }]);
        strictEqual(a.socket._sessionTimer, undefined);
        strictEqual(closed, 1);
        strictEqual(common.server, null);
    });

    it('close handles a server that throws on close', () => {
        const { common } = createWithSockets({});
        common.server.close = () => {
            throw new Error('already closed');
        };
        common.close();
    });

    it('delegates checkPermissions, publish, publishFile, unsubscribeSocket and addCommandHandler to the commands', () => {
        const common = new WsSocketCommon({}, createAdapter());
        common.commands = new SocketCommands(common.adapter);
        const { socket, emitted } = createSocket({ acl: { user: 'system.user.guest', state: { read: false } } });

        let error;
        strictEqual(
            common.checkPermissions(socket, 'getState', err => (error = err)),
            false,
        );
        strictEqual(error, SocketCommands.ERROR_PERMISSION);

        socket.subscribe = {
            stateChange: [{ pattern: 'a.*', regex: /^a\./ }],
            fileChange: [{ pattern: 'x', regex: /^vis\.0####/ }],
        };
        strictEqual(common.publish(socket, 'stateChange', 'a.b', { val: 1 }), true);
        strictEqual(common.publishFile(socket, 'vis.0', 'main/a.json', 10), true);
        deepStrictEqual(emittedNames(emitted), ['stateChange', 'fileChange']);

        const handler = () => {};
        common.addCommandHandler('custom', handler);
        strictEqual(common.commands.getCommandHandler('custom'), handler);
        common.addCommandHandler('custom');
        strictEqual(common.commands.getCommandHandler('custom'), undefined);
    });
});

describe('SocketCommon start', () => {
    /** Fake ioBroker ws server: constructed with `new`, emits "connection" */
    function createServerClass() {
        const instances = [];
        class FakeServer {
            constructor(server) {
                this.httpServer = server;
                this.handlers = {};
                this.sockets = { sockets: [] };
                instances.push(this);
            }
            on(name, cb) {
                this.handlers[name] = cb;
            }
            close() {
                this.closed = true;
            }
        }
        return { FakeServer, instances };
    }

    it('throws without server', () => {
        const common = new WsSocketCommon({}, createAdapter());
        throws(() => common.start(null), /Server cannot be empty/);
    });

    it('creates the server once, handles connections and custom ws routes', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ noInfoConnected: true, port: 8081 }, adapter);
        const { FakeServer, instances } = createServerClass();

        common.start({}, FakeServer);
        common.start({}, FakeServer);
        strictEqual(instances.length, 1, 'the server must be created only once');
        ok(adapter.logs.info.some(text => text.includes('listening on port 8081')));

        let connected;
        common.addEventHandler('connect', socket => (connected = socket));
        let routed;
        common.addWsRoute('/cameras.0/', (socket, cb) => {
            routed = socket;
            cb(true);
        });

        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });
        let cbCalled = 0;
        instances[0].handlers.connection(socket, () => cbCalled++);
        strictEqual(connected, socket);
        strictEqual(typeof handlers.getState, 'function');
        strictEqual(cbCalled, 1);

        const { socket: routeSocket, handlers: routeHandlers } = createSocket({ pathname: '/cameras.0/' });
        let customHandled;
        instances[0].handlers.connection(routeSocket, custom => (customHandled = custom));
        strictEqual(routed, routeSocket);
        strictEqual(customHandled, true);
        strictEqual(Object.keys(routeHandlers).length, 0, 'a routed socket must not get the commands');

        common.close();
        ok(instances[0].closed);
    });

    it('logs server errors, authentication errors only as debug and ignores failed connections', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ noInfoConnected: true }, adapter);
        const { FakeServer, instances } = createServerClass();
        common.start({}, FakeServer);

        const onError = instances[0].handlers.error;
        onError(new Error('failed connection'));
        strictEqual(adapter.logs.error.length + adapter.logs.debug.length, 0);
        onError(new Error('authentication failed'));
        strictEqual(adapter.logs.debug.length, 1);
        onError(new Error('boom'), { code: 1 });
        strictEqual(adapter.logs.error.length, 1);
        ok(adapter.logs.error[0].includes('boom') && adapter.logs.error[0].includes('{"code":1}'));
        onError(new Error('other'), 'authentication failed');
        strictEqual(adapter.logs.debug.length, 2);

        common.close();
    });

    it('calls __initAuthentication only with auth enabled', () => {
        let authOptions;
        class AuthCommon extends WsSocketCommon {
            __initAuthentication(options) {
                authOptions = options;
            }
        }
        const { FakeServer } = createServerClass();
        const withAuth = new AuthCommon({ auth: true, noInfoConnected: true }, createAdapter());
        const options = { store: {} };
        withAuth.start({}, FakeServer, options);
        strictEqual(authOptions, options);
        withAuth.close();

        authOptions = undefined;
        const withoutAuth = new AuthCommon({ auth: false, noInfoConnected: true }, createAdapter());
        withoutAuth.start({}, FakeServer, options);
        strictEqual(authOptions, undefined);
        withoutAuth.close();
    });

    it('uses listen() of socket.io v2 and sets the cross domain origins', () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({ crossDomain: true, noInfoConnected: true }, adapter);
        const set = [];
        let listenArgs;
        const io = {
            listen: (server, options) => {
                listenArgs = { server, options };
                return { on: () => {}, set: (key, value) => set.push([key, value]), close: () => {} };
            },
        };
        const httpServer = {};
        const socketOptions = { pingInterval: 1, pingTimeout: 2 };
        common.start(httpServer, io, undefined, socketOptions);

        strictEqual(listenArgs.server, httpServer);
        strictEqual(listenArgs.options, socketOptions);
        deepStrictEqual(set, [['origins', '*:*']]);
        common.close();
    });

    it('writes the connected clients into info.connected', async () => {
        const adapter = createAdapter();
        const common = new WsSocketCommon({}, adapter);
        const { FakeServer, instances } = createServerClass();
        common.start({}, FakeServer);

        const { socket, handlers } = createSocket({ acl: { user: 'system.user.admin' } });
        instances[0].sockets.sockets.push(socket);
        instances[0].handlers.connection(socket);
        handlers.name('browser');
        const { socket: socket2 } = createSocket({ id: 's2', acl: { user: 'system.user.admin' } });
        instances[0].sockets.sockets.push(socket2);

        await new Promise(resolve => setTimeout(resolve, 1100));
        deepStrictEqual(adapter.calls.setState[adapter.calls.setState.length - 1], {
            id: 'info.connected',
            val: '[2]browser, noname',
            ack: true,
        });
        common.close();
    }).timeout(3000);

    it('in server mode with auth, re-checks the access token in the store and resolves pending authentication', () => {
        const adapter = createAdapter();
        class StoreCommon extends WsSocketCommon {
            __initAuthentication() {
                this.store = { get: (id, cb) => cb(null, id === 'a:good' ? { user: 'admin' } : undefined) };
            }
        }
        const common = new StoreCommon({ auth: true, noInfoConnected: true }, adapter);
        const { FakeServer, instances } = createServerClass();
        common.start({}, FakeServer, { store: {} });

        adapter.sessions['a:good'] = { user: 'admin', aExp: Date.now() + 60_000 };
        const { socket, emitted } = createSocket({ headers: { cookie: 'access_token=good' } });
        let pending;
        socket._authPending = (authenticated, used) => (pending = { authenticated, used });
        instances[0].handlers.connection(socket);
        deepStrictEqual(pending, { authenticated: true, used: true });
        strictEqual(socket._authPending, undefined);
        ok(!emittedNames(emitted).includes(SocketCommon.COMMAND_RE_AUTHENTICATE));

        common.close();
    });

    it('in server mode with auth, asks for re-authentication if the store does not know the token', () => {
        const adapter = createAdapter();
        class StoreCommon extends DisconnectingSocketCommon {
            __initAuthentication() {
                this.store = { get: (_id, cb) => cb(null, undefined) };
            }
        }
        const common = new StoreCommon({ auth: true, noInfoConnected: true }, adapter);
        const { FakeServer, instances } = createServerClass();
        common.start({}, FakeServer, { store: {} });

        // the user is known to getSession, but the token was revoked in the store meanwhile
        adapter.sessions['a:revoked'] = { user: 'admin', aExp: Date.now() + 60_000 };
        const { socket, emitted, calls } = createSocket({ headers: { cookie: 'access_token=revoked' } });
        instances[0].handlers.connection(socket);

        strictEqual(socket._acl.user, '');
        ok(emittedNames(emitted).includes(SocketCommon.COMMAND_RE_AUTHENTICATE));
        deepStrictEqual(calls.disconnect, [true]);

        common.close();
    });

    it('in server mode with auth, validates a legacy session id', () => {
        const adapter = createAdapter();
        class StoreCommon extends WsSocketCommon {
            __initAuthentication() {
                this.store = {
                    get: (id, cb) => cb(null, id === 'sess1' ? { passport: { user: 'admin' } } : undefined),
                };
            }
        }
        const common = new StoreCommon({ auth: true, noInfoConnected: true }, adapter);
        const { FakeServer, instances } = createServerClass();
        common.start({}, FakeServer, { store: {} });

        adapter.sessions.sess1 = { passport: { user: 'admin' }, cookie: {} };
        const { socket, emitted } = createSocket({ sessionID: 'sess1', headers: { cookie: 'connect.sid=x' } });
        socket._testSessionId = 'sess1';
        instances[0].handlers.connection(socket);

        strictEqual(socket._sessionID, 'sess1');
        strictEqual(socket._acl.user, 'system.user.admin');
        ok(!emittedNames(emitted).includes(SocketCommon.COMMAND_RE_AUTHENTICATE));

        common.close();
    });
});
