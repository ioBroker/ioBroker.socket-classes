const { deepStrictEqual, ok, strictEqual, throws } = require('assert');
const { SocketAdmin, SocketCommon } = require('../build/index');

const ADMIN = 'system.user.admin';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Adapter that records every call */
function createAdapter(overrides) {
    const calls = {};
    const logs = { silly: [], debug: [], info: [], warn: [], error: [] };
    const record =
        (name, impl) =>
        (...args) => {
            calls[name] ||= [];
            calls[name].push(args);
            return impl ? impl(...args) : undefined;
        };
    const lastCb = args => [...args].reverse().find(arg => typeof arg === 'function');

    const adapter = {
        name: 'admin',
        namespace: 'admin.0',
        config: {},
        log: {
            level: 'info',
            silly: text => logs.silly.push(text),
            debug: text => logs.debug.push(text),
            info: text => logs.info.push(text),
            warn: text => logs.warn.push(text),
            error: text => logs.error.push(text),
        },
        calculatePermissions: record('calculatePermissions', (user, permissions, cb) =>
            cb({
                user,
                groups: user === ADMIN ? ['system.group.administrator'] : ['system.group.user'],
                object: { read: true, list: true, write: true, delete: true },
                state: { read: true, list: true, write: true, create: true, delete: true },
                users: { read: true, list: true, write: true, create: true, delete: true },
                other: { execute: true, http: true, sendto: true },
                file: { read: true, list: true, write: true, create: true, delete: true },
            }),
        ),
        getSession: record('getSession', (id, cb) => cb(null)),
        setSession: record('setSession'),
        setState: record('setState', () => Promise.resolve()),
        sendTo: record('sendTo', (...args) => lastCb(args)?.({ accepted: true })),
        sendToHost: record('sendToHost'),
        subscribeForeignStatesAsync: record('subscribeForeignStatesAsync', () => Promise.resolve()),
        unsubscribeForeignStatesAsync: record('unsubscribeForeignStatesAsync', () => Promise.resolve()),
        subscribeForeignObjectsAsync: record('subscribeForeignObjectsAsync', () => Promise.resolve()),
        unsubscribeForeignObjectsAsync: record('unsubscribeForeignObjectsAsync', () => Promise.resolve()),
        subscribeForeignFiles: record('subscribeForeignFiles', () => Promise.resolve()),
        unsubscribeForeignFiles: record('unsubscribeForeignFiles', () => Promise.resolve()),
        requireLog: record('requireLog', () => Promise.resolve()),
    };
    Object.assign(adapter, overrides);
    return { adapter, calls, logs };
}

/** Server the way @iobroker/ws-server looks from the point of view of SocketCommon */
class FakeServer {
    constructor(httpServer) {
        this.httpServer = httpServer;
        this.ioBroker = true;
        this.handlers = {};
        this.middlewares = [];
        this.closed = false;
        const emitted = [];
        this.sockets = { sockets: [], emitted, emit: (...args) => emitted.push(args) };
    }

    on(name, handler) {
        this.handlers[name] = handler;
    }

    use(middleware) {
        this.middlewares.push(middleware);
    }

    close() {
        this.closed = true;
    }

    /** Simulate a new client connection and resolve when it is initialized */
    connect(socket) {
        this.sockets.sockets.push(socket);
        return new Promise(resolve => this.handlers.connection(socket, resolve));
    }
}

let socketCounter = 0;

/** Client socket that records emitted events and the registered command handlers */
function createSocket(request) {
    const emitted = [];
    const handlers = {};
    const socket = {
        id: `socket${++socketCounter}`,
        conn: { request: Object.assign({ query: {}, headers: {} }, request) },
        connection: { remoteAddress: '192.168.1.5' },
        emit: (...args) => emitted.push(args),
        on: (name, handler) => (handlers[name] = handler),
    };
    return { socket, emitted, handlers };
}

/** Call a command of a connected socket and resolve with the arguments of its callback */
function call(handlers, name, ...args) {
    return new Promise(resolve => handlers[name](...args, (...result) => resolve(result)));
}

/** Socket with a ready subscription, as a connected and subscribed client looks like */
function subscribedSocket(type, pattern, regex) {
    const { socket, emitted } = createSocket();
    socket._acl = { user: ADMIN, groups: [] };
    socket.subscribe = { [type]: [{ pattern, regex }] };
    return { socket, emitted };
}

describe('SocketAdmin', () => {
    let instances = [];

    function create(settings, adapterOverrides, objects) {
        const mock = createAdapter(adapterOverrides);
        const admin = new SocketAdmin({ noInfoConnected: true, ...settings }, mock.adapter, objects);
        instances.push(admin);
        return { admin, ...mock };
    }

    function createStarted(settings, adapterOverrides, authOptions) {
        const result = create(settings, adapterOverrides);
        const httpServer = { name: 'http' };
        result.admin.start(httpServer, FakeServer, authOptions);
        return { ...result, server: result.admin.server, httpServer };
    }

    afterEach(() => {
        instances.forEach(admin => {
            try {
                admin.close();
            } catch {
                // was not started
                admin.commands.destroy();
            }
        });
        instances = [];
    });

    describe('construction', () => {
        it('uses the admin commands', () => {
            const { admin } = create();
            strictEqual(typeof admin.commands.getCommandHandler('addUser'), 'function');
            strictEqual(typeof admin.commands.getCommandHandler('getCompactHosts'), 'function');
        });

        it('does not disconnect unauthenticated clients, as the ws transport does not need it', () => {
            const { admin } = create();
            strictEqual(admin.__getIsNoDisconnect(), true);
        });

        it('completes the default user and the ttl', () => {
            const { admin } = create({ defaultUser: 'guest', ttl: '100' });
            strictEqual(admin.settings.defaultUser, 'system.user.guest');
            strictEqual(admin.settings.ttl, 100);
        });

        it('uses admin as default user and one hour as default ttl', () => {
            const { admin } = create();
            strictEqual(admin.settings.defaultUser, ADMIN);
            strictEqual(admin.settings.ttl, 3600);
        });

        it('passes the object cache to the commands', async () => {
            const objects = { 'a.0.b': { _id: 'a.0.b', common: {} } };
            const { admin } = create({}, {}, objects);
            const result = await new Promise(resolve =>
                admin.commands.getCommandHandler('getAllObjects')({ _acl: { user: ADMIN, groups: [] } }, (e, r) =>
                    resolve(r),
                ),
            );
            strictEqual(result, objects);
        });
    });

    describe('__getSessionID', () => {
        it('delivers the session ID of the request only with authentication', () => {
            const { socket } = createSocket({ sessionID: 'sid1' });
            strictEqual(create({ auth: true }).admin.__getSessionID(socket), 'sid1');
            strictEqual(create({ auth: false }).admin.__getSessionID(socket), null);
        });
    });

    describe('start', () => {
        it('throws without server', () => {
            const { admin } = create();
            throws(() => admin.start(null, FakeServer), /Server cannot be empty/);
        });

        it('creates the socket server on the given web server', () => {
            const { server, httpServer, logs } = createStarted({ port: 8081, secure: true });

            ok(server instanceof FakeServer);
            strictEqual(server.httpServer, httpServer);
            strictEqual(typeof server.handlers.connection, 'function');
            strictEqual(typeof server.handlers.error, 'function');
            ok(logs.info.includes('Secure socket.io server listening on port 8081'));
        });

        it('installs the passport authorization only with authentication', () => {
            const store = { get: () => {} };
            strictEqual(createStarted({ auth: false }).server.middlewares.length, 0);

            const { admin, server } = createStarted({ auth: true }, {}, { store, secret: 'secret' });
            strictEqual(server.middlewares.length, 1);
            strictEqual(admin.store, store);
        });

        it('does not install the passport authorization for OAuth2 only', () => {
            const store = { get: () => {} };
            const { admin, server } = createStarted({ auth: true }, {}, { store, oauth2Only: true });

            strictEqual(server.middlewares.length, 0);
            strictEqual(admin.store, store);
        });

        it('starts the detection of event bursts', () => {
            const { admin } = createStarted();
            ok(admin.commands.thresholdInterval);
        });

        it('logs server errors, but authentication failures only as debug', () => {
            const { server, logs } = createStarted();

            server.handlers.error(new Error('something broken'));
            server.handlers.error(new Error('authentication failed'));
            server.handlers.error(new Error('failed connection'));

            deepStrictEqual(logs.error, ['Error: something broken']);
            ok(logs.debug.includes('Error: authentication failed'));
        });
    });

    describe('passport authorization', () => {
        it('rejects a request without session and asks the client to re-authenticate', async () => {
            const { server, logs } = createStarted({ auth: true }, {}, { store: { get: () => {} }, secret: 's' });
            const { socket, emitted } = createSocket();
            const request = { url: '/?sid=1', headers: {}, socket, connection: { remoteAddress: '10.0.0.1' } };

            const accepted = await new Promise(resolve => server.middlewares[0](request, resolve));

            ok(accepted instanceof Error, 'the connection must be refused');
            strictEqual(accepted.message, 'failed connection to socket.io: No session id');
            strictEqual(logs.info.filter(text => text.startsWith('failed connection')).length, 0);
            await wait(150);
            deepStrictEqual(emitted, [[SocketCommon.COMMAND_RE_AUTHENTICATE]]);
        });

        it('accepts a request with valid user and password in the query', async () => {
            const { server, logs } = createStarted(
                { auth: true },
                {},
                {
                    store: { get: () => {} },
                    secret: 's',
                    checkUser: (user, pass, cb) => cb(null, { logged_in: true, user }),
                },
            );
            const request = {
                url: '/?user=admin&pass=secret',
                headers: {},
                socket: { remoteAddress: '10.0.0.1' },
            };

            const accepted = await new Promise(resolve => server.middlewares[0](request, resolve));

            strictEqual(accepted, false, 'no error means accepted');
            ok(logs.debug.some(text => text.includes('successful connection to socket.io from 10.0.0.1')));
        });
    });

    describe('connection', () => {
        it('initializes a client without authentication with the rights of the default user', async () => {
            const connected = [];
            const { admin, server, calls } = createStarted({ defaultUser: 'guest' });
            admin.addEventHandler('connect', socket => connected.push(socket.id));
            const { socket, handlers } = createSocket();

            await server.connect(socket);

            strictEqual(calls.calculatePermissions[0][0], 'system.user.guest');
            strictEqual(socket._acl.user, 'system.user.guest');
            deepStrictEqual(connected, [socket.id]);
            for (const name of ['name', 'disconnect', 'getVersion', 'addUser', 'eventsThreshold']) {
                strictEqual(typeof handlers[name], 'function', `handler "${name}" must be registered`);
            }
        });

        it('restricts the rights by the white list of the client address', async () => {
            const whiteListSettings = {
                default: {
                    user: 'auth',
                    object: { read: true, list: true, write: false, delete: false },
                    state: { read: true, list: true, write: false, create: false, delete: false },
                    file: { read: true, list: true, write: false, create: false, delete: false },
                },
            };
            const { server } = createStarted({ whiteListSettings });
            const { socket } = createSocket();

            await server.connect(socket);

            strictEqual(socket._acl.user, ADMIN);
            strictEqual(socket._acl.object.read, true);
            strictEqual(socket._acl.object.write, false);
            strictEqual(socket._acl.state.write, false);
            strictEqual(socket._acl.file.delete, false);
        });

        it('keeps an already known ACL', async () => {
            const { server, calls } = createStarted();
            const { socket, handlers } = createSocket();
            socket._acl = { user: 'system.user.known', groups: [] };

            await server.connect(socket);

            strictEqual(calls.calculatePermissions, undefined);
            strictEqual(socket._acl.user, 'system.user.known');
            strictEqual(typeof handlers.getVersion, 'function');
        });

        it('authenticates a client by the access token of the query', async () => {
            const expiresAt = Date.now() + 3_600_000;
            const { server, calls } = createStarted(
                { auth: true },
                { getSession: (id, cb) => cb(id === 'a:token1' ? { user: 'benjamin', aExp: expiresAt } : null) },
                { store: { get: (id, cb) => cb(null, null) }, oauth2Only: true },
            );
            const { socket, emitted, handlers } = createSocket({ query: { token: 'token1' } });

            await server.connect(socket);

            strictEqual(calls.calculatePermissions[0][0], 'system.user.benjamin');
            strictEqual(socket._acl.user, 'system.user.benjamin');
            strictEqual(socket._sessionExpiresAt, expiresAt);
            strictEqual(socket._secure, true);
            deepStrictEqual(emitted, [['tokenInfo', { expiresAt }]]);
            strictEqual(typeof handlers.getVersion, 'function');
        });

        it('authenticates a client by the bearer token', async () => {
            const { server } = createStarted(
                { auth: true },
                { getSession: (id, cb) => cb(id === 'a:bearer1' ? { user: 'admin', aExp: Date.now() + 1000 } : null) },
                { store: { get: () => {} }, oauth2Only: true },
            );
            const { socket } = createSocket({ headers: { authorization: 'Bearer bearer1' } });

            await server.connect(socket);

            strictEqual(socket._acl.user, ADMIN);
        });

        it('asks a client with an unknown token to re-authenticate without disconnecting it', async () => {
            const { server, calls } = createStarted({ auth: true }, {}, { store: { get: () => {} }, oauth2Only: true });
            const { socket, emitted, handlers } = createSocket({ query: { token: 'unknown' } });
            let disconnected = false;
            socket.disconnect = () => (disconnected = true);

            await server.connect(socket);

            ok(emitted.some(args => args[0] === SocketCommon.COMMAND_RE_AUTHENTICATE));
            strictEqual(disconnected, false);
            strictEqual(calls.calculatePermissions, undefined);

            // The socket stays open, so it keeps its handlers: the client has to be able to announce
            // the token it is fetching right now. Everything else is refused by the empty ACL.
            strictEqual(typeof handlers.updateTokenExpiration, 'function');
            deepStrictEqual(socket._acl, { user: '', groups: [] });
            const [error] = await call(handlers, 'getObject', 'system.config');
            ok(error, `a command without permission must fail: ${error}`);
        });

        it('refreshes an expired access token of a connected client', async () => {
            const tokens = {
                'a:old': { user: 'admin', aExp: Date.now() + 1000 },
                'a:new': { user: 'admin', aExp: Date.now() + 3_600_000 },
            };
            const { server } = createStarted(
                { auth: true },
                { getSession: (id, cb) => cb(tokens[id] || null) },
                { store: { get: () => {} }, oauth2Only: true },
            );
            const { socket, handlers } = createSocket({ query: { token: 'old' } });
            await server.connect(socket);

            const [error, success] = await call(handlers, 'updateTokenExpiration', 'new');

            strictEqual(error, null);
            strictEqual(success, true);
            strictEqual(socket._sessionExpiresAt, tokens['a:new'].aExp);
            strictEqual(socket.conn.request.query.token, 'new');
        });

        it('delegates a web socket with a registered path to its own handler', async () => {
            const { admin, server, calls } = createStarted();
            const routed = [];
            admin.addWsRoute('/cameras.0/', (socket, cb) => {
                routed.push(socket.id);
                cb(true);
            });
            const { socket, handlers } = createSocket({ pathname: '/cameras.0/' });

            const customHandler = await server.connect(socket);

            strictEqual(customHandler, true);
            deepStrictEqual(routed, [socket.id]);
            strictEqual(calls.calculatePermissions, undefined);
            deepStrictEqual(handlers, {});
        });

        it('calls the extensions for every new socket', async () => {
            const extended = [];
            const { server } = createStarted({ extensions: socket => extended.push(socket.id) });
            const { socket } = createSocket();

            await server.connect(socket);

            deepStrictEqual(extended, [socket.id]);
        });

        it('publishes the names of the connected clients in info.connected', async () => {
            const { server, calls } = createStarted({ noInfoConnected: false });
            const first = createSocket();
            const second = createSocket();
            await server.connect(first.socket);
            await server.connect(second.socket);

            await call(first.handlers, 'name', 'browser');
            await wait(1100);

            const [id, value, ack] = calls.setState.slice(-1)[0];
            strictEqual(id, 'info.connected');
            strictEqual(value, '[2]browser, noname');
            strictEqual(ack, true);
        }).timeout(3000);

        it('warns when a socket changes its name', async () => {
            const { server, logs } = createStarted();
            const { socket, handlers } = createSocket();
            await server.connect(socket);

            await call(handlers, 'name', 'first');
            await call(handlers, 'name', 'second');

            strictEqual(socket._name, 'second');
            ok(logs.warn.some(text => text.includes('changed socket name from first to second')));
        });
    });

    describe('disconnect', () => {
        it('removes the subscriptions of the socket and informs the disconnect handler', async () => {
            const disconnected = [];
            const { admin, server, calls } = createStarted();
            admin.addEventHandler('disconnect', (socket, error) => disconnected.push([socket.id, error]));
            const first = createSocket();
            const second = createSocket();
            await server.connect(first.socket);
            await server.connect(second.socket);

            await call(first.handlers, 'subscribe', ['shared.*', 'own.*']);
            await call(second.handlers, 'subscribe', 'shared.*');
            deepStrictEqual(
                calls.subscribeForeignStatesAsync.map(args => args[0]),
                ['shared.*', 'own.*'],
            );

            first.handlers.disconnect('transport close');

            deepStrictEqual(
                calls.unsubscribeForeignStatesAsync.map(args => args[0]),
                ['own.*'],
                'a pattern still used by another socket must stay subscribed',
            );
            deepStrictEqual(disconnected, [[first.socket.id, 'transport close']]);
        });

        it('logs the disconnection without a disconnect handler', async () => {
            const { server, logs } = createStarted();
            const { socket, handlers } = createSocket();
            await server.connect(socket);

            handlers.disconnect();

            ok(logs.info.some(text => text.startsWith(`<== Disconnect ${ADMIN} from 192.168.1.5`)));
        });
    });

    describe('publishing', () => {
        it('stateChange sends the state only to sockets with a matching subscription', () => {
            const { admin, server } = createStarted();
            const matching = subscribedSocket('stateChange', 'a.*', /^a\./);
            const other = subscribedSocket('stateChange', 'b.*', /^b\./);
            const none = createSocket();
            server.sockets.sockets.push(matching.socket, other.socket, none.socket);

            admin.stateChange('a.0.value', { val: 1, ack: true });

            deepStrictEqual(matching.emitted, [['stateChange', 'a.0.value', { val: 1, ack: true }]]);
            deepStrictEqual(other.emitted, []);
            deepStrictEqual(none.emitted, []);
        });

        it('stateChange counts the events for the burst detection', () => {
            const { admin } = createStarted();

            admin.stateChange('a.0.value', { val: 1 });
            admin.stateChange('a.0.value', null);

            strictEqual(admin.commands.eventsThreshold.count, 2);
        });

        it('stateChange works with a socket.io socket list (object instead of array)', () => {
            const { admin, server } = createStarted();
            const matching = subscribedSocket('stateChange', 'a.*', /^a\./);
            server.sockets.sockets = undefined;
            server.sockets.connected = { [matching.socket.id]: matching.socket };

            admin.stateChange('a.0.value', { val: 2 });

            deepStrictEqual(matching.emitted, [['stateChange', 'a.0.value', { val: 2 }]]);
        });

        it('stateChange does not publish to a socket whose session is over', () => {
            const { admin, server } = createStarted();
            const expired = subscribedSocket('stateChange', 'a.*', /^a\./);
            expired.socket._sessionExpiresAt = Date.now() - SocketCommon.SESSION_GRACE_MS - 1000;
            server.sockets.sockets.push(expired.socket);

            admin.stateChange('a.0.value', { val: 1 });

            deepStrictEqual(expired.emitted, [[SocketCommon.COMMAND_RE_AUTHENTICATE]]);
        });

        it('objectChange sends the object to sockets with a matching subscription', () => {
            const { admin, server } = createStarted();
            const matching = subscribedSocket('objectChange', 'system.adapter.*', /^system\.adapter\./);
            const other = subscribedSocket('stateChange', 'system.adapter.*', /^system\.adapter\./);
            server.sockets.sockets.push(matching.socket, other.socket);
            const obj = { _id: 'system.adapter.admin.0', common: {} };

            admin.objectChange('system.adapter.admin.0', obj);
            admin.objectChange('system.adapter.web.0', null);

            deepStrictEqual(matching.emitted, [
                ['objectChange', 'system.adapter.admin.0', obj],
                ['objectChange', 'system.adapter.web.0', null],
            ]);
            deepStrictEqual(other.emitted, []);
        });

        it('objectChange replaces the language of system.config with the configured one', () => {
            const { admin, server } = createStarted({ language: 'de' });
            const matching = subscribedSocket('objectChange', 'system.config', /^system\.config$/);
            server.sockets.sockets.push(matching.socket);

            admin.objectChange('system.config', { _id: 'system.config', common: { language: 'en' } });

            strictEqual(matching.emitted[0][2].common.language, 'de');
        });

        it('fileChange sends the file change to sockets subscribed for this file', () => {
            const { admin, server } = createStarted();
            const matching = subscribedSocket('fileChange', 'vis.0####main/*', /^vis\.0####main\/.*$/);
            server.sockets.sockets.push(matching.socket);

            admin.fileChange('vis.0', 'main/vis-views.json', 1234);
            admin.fileChange('vis.0', 'other/vis-views.json', 1);
            admin.fileChange('web.0', 'main/vis-views.json', 1);

            deepStrictEqual(matching.emitted, [['fileChange', 'vis.0', 'main/vis-views.json', 1234]]);
        });

        it('does not fail without a server', () => {
            const { admin } = create();
            admin.stateChange('a.0.b', { val: 1 });
            admin.objectChange('a.0.b', null);
            admin.fileChange('a.0', 'b', 1);
            admin.repoUpdated();
        });

        it('repoUpdated informs all clients', () => {
            const { admin, server } = createStarted();

            admin.repoUpdated();

            deepStrictEqual(server.sockets.emitted, [['repoUpdated']]);
        });

        it('onThresholdChanged informs all clients', () => {
            const { admin, server } = createStarted();

            admin.onThresholdChanged(true);

            deepStrictEqual(server.sockets.emitted, [['eventsThreshold', true]]);
        });

        it('informs all clients when a client enables the event threshold', async () => {
            const { server } = createStarted();
            const { socket, handlers } = createSocket();
            await server.connect(socket);

            handlers.eventsThreshold(true);
            await wait(150);

            deepStrictEqual(server.sockets.emitted, [['eventsThreshold', true]]);
        });

        it('sendLog sends the log only to sockets that required it', () => {
            const { admin, server } = createStarted();
            const listening = subscribedSocket('log', 'dummy', /.*/);
            const other = createSocket();
            server.sockets.sockets.push(listening.socket, other.socket);
            const message = { from: 'admin.0', message: 'hello', severity: 'info', ts: 1 };

            admin.sendLog(message);

            deepStrictEqual(listening.emitted, [['log', message]]);
            deepStrictEqual(other.emitted, []);
        });
    });

    describe('sendCommand', () => {
        it('forwards the output of a shell command to the clients', async () => {
            const { admin, server, calls } = createStarted();
            const { socket, handlers } = createSocket();
            await server.connect(socket);

            const [error] = await call(handlers, 'cmdExec', 'system.host.first', 42, 'ls');
            strictEqual(error, null);
            strictEqual(calls.sendToHost[0][1], 'cmdExec');

            admin.sendCommand({ command: 'cmdStdout', message: { id: 42, data: 'file.txt' } });
            admin.sendCommand({ command: 'cmdExit', message: { id: 42, data: 0 } });
            admin.sendCommand({ command: 'cmdStdout', message: { id: 42, data: 'too late' } });

            deepStrictEqual(server.sockets.emitted, [
                ['cmdStdout', 42, 'file.txt'],
                ['cmdExit', 42, 0],
            ]);
        });

        it('ignores output of an unknown session', () => {
            const { admin, server } = createStarted();

            admin.sendCommand({ command: 'cmdStdout', message: { id: 1, data: 'x' } });

            deepStrictEqual(server.sockets.emitted, []);
        });
    });

    describe('server-side subscriptions', () => {
        it('subscribes states and objects without a socket', () => {
            const { admin, calls } = createStarted();

            admin.subscribe('stateChange', 'a.0.*');
            admin.subscribe('stateChange', 'a.0.*');
            admin.subscribe('objectChange', 'system.adapter.*');

            deepStrictEqual(
                calls.subscribeForeignStatesAsync.map(args => args[0]),
                ['a.0.*'],
                'the same pattern must be subscribed only once',
            );
            deepStrictEqual(calls.subscribeForeignObjectsAsync[0][0], 'system.adapter.*');
        });

        it('subscribes files without a socket', () => {
            const { admin, calls } = createStarted();

            admin.subscribeFile('vis.0', 'main/*');

            deepStrictEqual(calls.subscribeForeignFiles[0].slice(0, 2), ['vis.0', 'main/*']);
        });
    });

    describe('instance messages', () => {
        it('delivers a message of an instance only to the subscribed socket', async () => {
            const { admin, server, calls } = createStarted();
            const subscriber = createSocket();
            const other = createSocket();
            await server.connect(subscriber.socket);
            await server.connect(other.socket);

            const [error, result] = await call(subscriber.handlers, 'clientSubscribe', 'cameras.0', 'frame', null);
            strictEqual(error, null);
            deepStrictEqual(result, { accepted: true });
            strictEqual(calls.sendTo[0][0], 'system.adapter.cameras.0');
            strictEqual(calls.sendTo[0][1], 'clientSubscribe');

            admin.publishInstanceMessageAll('system.adapter.cameras.0', 'frame', subscriber.socket.id, 'data');

            deepStrictEqual(
                subscriber.emitted.filter(args => args[0] === 'im'),
                [['im', 'frame', 'system.adapter.cameras.0', 'data']],
            );
            deepStrictEqual(
                other.emitted.filter(args => args[0] === 'im'),
                [],
            );
        });

        it('informs the instance if nobody subscribed for the message', async () => {
            const { admin, server, calls } = createStarted();
            const { socket } = createSocket();
            await server.connect(socket);

            admin.publishInstanceMessageAll('system.adapter.cameras.0', 'frame', socket.id, 'data');

            const [target, command, message] = calls.sendTo.slice(-1)[0];
            strictEqual(target, 'system.adapter.cameras.0');
            strictEqual(command, 'clientSubscribeError');
            deepStrictEqual(message, { type: 'frame', sid: socket.id, reason: 'no one subscribed' });
        });
    });

    describe('close', () => {
        it('closes the server, stops the timers and removes all subscriptions', async () => {
            const { admin, server, calls } = createStarted();
            const { socket, handlers } = createSocket();
            await server.connect(socket);
            await call(handlers, 'subscribe', 'a.0.*');
            await call(handlers, 'subscribeObjects', 'system.*');

            admin.close();

            ok(server.closed);
            strictEqual(admin.server, null);
            strictEqual(admin.commands.thresholdInterval, null);
            deepStrictEqual(calls.unsubscribeForeignStatesAsync[0][0], 'a.0.*');
            deepStrictEqual(calls.unsubscribeForeignObjectsAsync[0][0], 'system.*');
        });
    });

    describe('updateRatings', () => {
        it('delegates to the admin commands', async () => {
            const { admin } = create();
            let asked;
            admin.commands.updateRatings = (uuid, auto) => {
                asked = [uuid, auto];
                return Promise.resolve({ uuid });
            };

            const ratings = await admin.updateRatings('u1', true);

            deepStrictEqual(asked, ['u1', true]);
            deepStrictEqual(ratings, { uuid: 'u1' });
        });
    });
});
