const { ok, strictEqual, deepStrictEqual } = require('assert');
const { SocketCommands } = require('../build/index');

const ADMIN = 'system.user.admin';
const USER = 'system.user.user';

/** Wait until all pending setImmediate callbacks and promise jobs are done */
function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

/**
 * Adapter mock that records every call in `adapter.calls[methodName]`.
 * Behaviour of single methods can be replaced by passing overrides.
 */
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
    const lastCb = args => args.reverse().find(a => typeof a === 'function');

    const adapter = {
        name: 'test',
        version: '1.2.3',
        config: { auth: true },
        calls,
        logs,
        log: {
            level: 'info',
            silly: text => logs.silly.push(text),
            debug: text => logs.debug.push(text),
            info: text => logs.info.push(text),
            warn: text => logs.warn.push(text),
            error: text => logs.error.push(text),
        },
        subscribeForeignStatesAsync: record('subscribeForeignStatesAsync', () => Promise.resolve()),
        unsubscribeForeignStatesAsync: record('unsubscribeForeignStatesAsync', () => Promise.resolve()),
        subscribeForeignObjectsAsync: record('subscribeForeignObjectsAsync', () => Promise.resolve()),
        unsubscribeForeignObjectsAsync: record('unsubscribeForeignObjectsAsync', () => Promise.resolve()),
        subscribeForeignFiles: record('subscribeForeignFiles', () => Promise.resolve()),
        unsubscribeForeignFiles: record('unsubscribeForeignFiles', () => Promise.resolve()),
        requireLog: record('requireLog', () => Promise.resolve()),
        sendTo: record('sendTo', (...args) => {
            const cb = lastCb(args);
            cb?.({ accepted: true });
        }),
        supportsFeature: record('supportsFeature', feature => feature === 'ALIAS'),
        getSession: record('getSession', (_id, cb) => cb(null)),
        destroySession: record('destroySession', (_id, cb) => cb?.()),
        getHistory: record('getHistory', (_id, _options, cb) => cb(null, [{ val: 1, ts: 1 }], 'step')),
        getForeignStates: record('getForeignStates', (_pattern, _options, cb) => cb(null, { a: { val: 1 } })),
        getForeignStateAsync: record('getForeignStateAsync', id => Promise.resolve({ val: id, ack: true })),
        setForeignState: record('setForeignState', (_id, _state, _options, cb) => cb(null, 'id')),
        getForeignObject: record('getForeignObject', (id, _options, cb) =>
            cb(null, { _id: id, type: 'state', common: { name: id }, native: {} }),
        ),
        getForeignObjects: record('getForeignObjects', (...args) => {
            const cb = lastCb(args);
            cb(null, { 's.1': { _id: 's.1', type: 'state', common: {} } });
        }),
        getForeignObjectsAsync: record('getForeignObjectsAsync', (_pattern, type) =>
            Promise.resolve({ [`${type}.1`]: { _id: `${type}.1`, type, common: {} } }),
        ),
        getForeignObjectAsync: record('getForeignObjectAsync', id =>
            Promise.resolve({ _id: id, type: 'config', common: { language: 'de' }, native: {} }),
        ),
        setForeignObject: record('setForeignObject', (id, _obj, _options, cb) => cb(null, { id })),
        delForeignObject: record('delForeignObject', (_id, _options, cb) => cb(null)),
        getObjectView: record('getObjectView', (_design, _search, _params, _options, cb) => cb(null, { rows: [] })),
    };
    return Object.assign(adapter, overrides);
}

function createSocket(acl, extra) {
    const emitted = [];
    const handlers = {};
    const socket = {
        id: 'socket1',
        _acl: acl === undefined ? { user: ADMIN } : acl,
        conn: { request: { query: {}, headers: {} } },
        emit: (...args) => emitted.push(args),
        on: (name, cb) => (handlers[name] = cb),
        emitted,
        handlers,
    };
    return Object.assign(socket, extra);
}

/** ACL of a non admin user: everything forbidden unless enabled in `allowed` */
function createAcl(allowed) {
    const acl = {
        user: USER,
        object: { read: false, list: false, write: false, delete: false },
        state: { read: false, list: false, write: false, create: false, delete: false },
        users: { create: false, write: false, delete: false },
        other: { http: false, execute: false, sendto: false },
        file: { read: false, list: false, write: false, create: false, delete: false },
    };
    for (const [type, ops] of Object.entries(allowed || {})) {
        for (const op of ops) {
            acl[type][op] = true;
        }
    }
    return acl;
}

function createCommands(adapter, updateSession) {
    // context with language, so that the constructor does not ask for system.config
    return new SocketCommands(adapter || createAdapter(), updateSession, {
        language: 'en',
        ratings: null,
        ratingTimeout: null,
    });
}

/** Call a registered command and resolve with the arguments of its callback */
function call(commands, name, socket, ...args) {
    return new Promise(resolve => commands.getCommandHandler(name)(socket, ...args, (...res) => resolve(res)));
}

describe('SocketCommands', () => {
    describe('constructor', () => {
        it('reads the language from system.config when no context language is given', async () => {
            const adapter = createAdapter();
            const commands = new SocketCommands(adapter);
            await tick();
            strictEqual(adapter.calls.getForeignObjectAsync[0][0], 'system.config');
            strictEqual(commands.context.language, 'de');
        });

        it('does not read system.config for the admin adapter', async () => {
            const adapter = createAdapter({ name: 'admin' });
            const commands = new SocketCommands(adapter);
            await tick();
            strictEqual(adapter.calls.getForeignObjectAsync, undefined);
            strictEqual(commands.context.language, 'en');
        });

        it('does not read system.config when the context already has a language', async () => {
            const adapter = createAdapter();
            createCommands(adapter);
            await tick();
            strictEqual(adapter.calls.getForeignObjectAsync, undefined);
        });

        it('registers the common, state and object commands', () => {
            const commands = createCommands();
            for (const name of [
                'authenticate',
                'updateTokenExpiration',
                'error',
                'log',
                'checkFeatureSupported',
                'getHistory',
                'authEnabled',
                'logout',
                'listPermissions',
                'getUserPermissions',
                'getVersion',
                'getAdapterName',
                'getStates',
                'getForeignStates',
                'getState',
                'setState',
                'getBinaryState',
                'setBinaryState',
                'subscribe',
                'subscribeStates',
                'unsubscribe',
                'unsubscribeStates',
                'getObject',
                'getObjects',
                'getAllObjects',
                'subscribeObjects',
                'unsubscribeObjects',
                'getObjectView',
                'setObject',
                'delObject',
                'clientSubscribe',
                'clientUnsubscribe',
                'getCompactSystemConfig',
            ]) {
                strictEqual(typeof commands.getCommandHandler(name), 'function', `command ${name} must exist`);
            }
        });
    });

    describe('_fixCallback', () => {
        it('converts an Error into its message', () => {
            let result;
            SocketCommands._fixCallback((...args) => (result = args), new Error('boom'), 1, 2);
            deepStrictEqual(result, ['boom', 1, 2]);
        });

        it('passes string errors and null unchanged', () => {
            let result;
            SocketCommands._fixCallback((...args) => (result = args), 'text', 'a');
            deepStrictEqual(result, ['text', 'a']);
            SocketCommands._fixCallback((...args) => (result = args), null, 'b');
            deepStrictEqual(result, [null, 'b']);
        });

        it('ignores a missing callback', () => {
            SocketCommands._fixCallback(null, new Error('x'));
            SocketCommands._fixCallback(undefined, null);
            SocketCommands._fixCallback('not a function', null);
        });
    });

    describe('_checkPermissions', () => {
        it('allows everything for the admin user', () => {
            const commands = createCommands();
            const socket = createSocket({ user: ADMIN });
            for (const command of Object.keys(SocketCommands.COMMANDS_PERMISSIONS)) {
                strictEqual(commands._checkPermissions(socket, command, () => {}), true, command);
            }
            strictEqual(commands._checkPermissions(socket, 'unknownCommand', () => {}), true);
        });

        const cases = [
            ['getObject', 'object', 'read'],
            ['getObjects', 'object', 'list'],
            ['setObject', 'object', 'write'],
            ['delObject', 'object', 'delete'],
            ['getStates', 'state', 'list'],
            ['getState', 'state', 'read'],
            ['setState', 'state', 'write'],
            ['delState', 'state', 'delete'],
            ['createState', 'state', 'create'],
            ['addUser', 'users', 'create'],
            ['changePassword', 'users', 'write'],
            ['delUser', 'users', 'delete'],
            ['httpGet', 'other', 'http'],
            ['cmdExec', 'other', 'execute'],
            ['sendTo', 'other', 'sendto'],
            ['readDir', 'file', 'list'],
            ['readFile', 'file', 'read'],
            ['writeFile', 'file', 'write'],
            ['createFile', 'file', 'create'],
            ['deleteFile', 'file', 'delete'],
        ];

        for (const [command, type, operation] of cases) {
            it(`checks ${type}.${operation} for ${command}`, () => {
                const commands = createCommands();

                const allowed = createSocket(createAcl({ [type]: [operation] }));
                strictEqual(commands._checkPermissions(allowed, command, () => {}), true);

                let error;
                const denied = createSocket(createAcl());
                strictEqual(
                    commands._checkPermissions(denied, command, err => (error = err)),
                    false,
                );
                strictEqual(error, SocketCommands.ERROR_PERMISSION);
            });
        }

        it('does not mix up permissions of different types', () => {
            const commands = createCommands();
            // may read states, but not objects
            const socket = createSocket(createAcl({ state: ['read'] }));
            strictEqual(commands._checkPermissions(socket, 'getState', () => {}), true);
            strictEqual(commands._checkPermissions(socket, 'getObject', () => {}), false);
            strictEqual(commands._checkPermissions(socket, 'setState', () => {}), false);
        });

        it('allows commands without a permission type for everybody', () => {
            const commands = createCommands();
            const socket = createSocket(createAcl());
            for (const command of ['getVersion', 'getAdapterName', 'authEnabled', 'disconnect', 'listPermissions']) {
                strictEqual(commands._checkPermissions(socket, command, () => {}), true, command);
            }
        });

        it('denies an unknown command for a non admin user and logs it', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            let error;
            strictEqual(
                commands._checkPermissions(createSocket(createAcl()), 'noSuchCommand', err => (error = err)),
                false,
            );
            strictEqual(error, SocketCommands.ERROR_PERMISSION);
            ok(adapter.logs.warn.some(text => text.includes('No rule for command: noSuchCommand')));
        });

        it('denies a socket without any ACL', () => {
            const commands = createCommands();
            strictEqual(commands._checkPermissions(createSocket(null), 'getState', () => {}), false);
        });

        it('logs which permission is missing', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands._checkPermissions(createSocket(createAcl()), 'setState', () => {});
            ok(adapter.logs.warn.some(text => text.includes('"state"."write"') && text.includes(USER)));
        });

        it('emits permissionError with type and operation when no callback is given', () => {
            const commands = createCommands();
            const socket = createSocket(createAcl());
            strictEqual(commands._checkPermissions(socket, 'setState', undefined, 'my.id', 5), false);
            deepStrictEqual(socket.emitted, [
                [
                    SocketCommands.ERROR_PERMISSION,
                    { command: 'setState', type: 'state', operation: 'write', args: ['my.id', 5] },
                ],
            ]);
        });

        it('emits permissionError without type for an unknown command when no callback is given', () => {
            const commands = createCommands();
            const socket = createSocket(createAcl());
            commands._checkPermissions(socket, 'noSuchCommand', undefined, 'x');
            deepStrictEqual(socket.emitted, [[SocketCommands.ERROR_PERMISSION, { command: 'noSuchCommand', args: ['x'] }]]);
        });

        it('does not emit anything when permission is granted', () => {
            const commands = createCommands();
            const socket = createSocket(createAcl({ state: ['read'] }));
            commands._checkPermissions(socket, 'getState', undefined);
            strictEqual(socket.emitted.length, 0);
        });
    });

    describe('addCommandHandler / getCommandHandler', () => {
        it('adds, replaces and removes a command handler', () => {
            const commands = createCommands();
            const handler1 = () => 1;
            const handler2 = () => 2;

            strictEqual(commands.getCommandHandler('custom'), undefined);
            commands.addCommandHandler('custom', handler1);
            strictEqual(commands.getCommandHandler('custom'), handler1);
            commands.addCommandHandler('custom', handler2);
            strictEqual(commands.getCommandHandler('custom'), handler2);
            commands.addCommandHandler('custom');
            strictEqual(commands.getCommandHandler('custom'), undefined);
        });

        it('can remove a built-in command', () => {
            const commands = createCommands();
            commands.addCommandHandler('getVersion');
            strictEqual(commands.getCommandHandler('getVersion'), undefined);
        });

        it('ignores removal of a command that does not exist', () => {
            const commands = createCommands();
            commands.addCommandHandler('doesNotExist');
            strictEqual(commands.getCommandHandler('doesNotExist'), undefined);
        });
    });

    describe('applyCommands', () => {
        it('registers a listener for every command on the socket', () => {
            const commands = createCommands();
            commands.addCommandHandler('custom', () => {});
            const socket = createSocket();
            commands.applyCommands(socket);
            for (const name of ['getVersion', 'getState', 'getObject', 'custom', 'updateTokenExpiration']) {
                strictEqual(typeof socket.handlers[name], 'function', name);
            }
        });

        it('passes the socket and all arguments to the handler', () => {
            const commands = createCommands();
            let received;
            commands.addCommandHandler('custom', (...args) => (received = args));
            const socket = createSocket();
            commands.applyCommands(socket);
            socket.handlers.custom(1, 'two', { three: 3 });
            deepStrictEqual(received, [socket, 1, 'two', { three: 3 }]);
        });

        it('checks the session before every command', () => {
            let checked = 0;
            const commands = createCommands(createAdapter(), () => {
                checked++;
                return true;
            });
            const socket = createSocket();
            commands.applyCommands(socket);
            let version;
            socket.handlers.getVersion((err, v) => (version = v));
            strictEqual(checked, 1);
            strictEqual(version, '1.2.3');
        });

        it('does not execute a command on an expired session and logs it', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter, () => false);
            let called = false;
            commands.addCommandHandler('custom', () => (called = true));
            const socket = createSocket();
            commands.applyCommands(socket);
            socket.handlers.custom();
            strictEqual(called, false);
            ok(adapter.logs.debug.some(text => text.includes('Command custom from socket1 was not executed')));
        });

        it('executes the commands of COMMANDS_WITHOUT_SESSION_CHECK without asking for the session', () => {
            let checked = 0;
            const commands = createCommands(createAdapter(), () => {
                checked++;
                return false;
            });
            ok(SocketCommands.COMMANDS_WITHOUT_SESSION_CHECK.includes('updateTokenExpiration'));
            let called = false;
            commands.addCommandHandler('updateTokenExpiration', () => (called = true));
            const socket = createSocket();
            commands.applyCommands(socket);
            socket.handlers.updateTokenExpiration('token', () => {});
            strictEqual(called, true);
            strictEqual(checked, 0);
        });

        it('uses the handler that is registered at call time', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.addCommandHandler('custom', () => 'old');
            commands.applyCommands(socket);
            let result;
            commands.addCommandHandler('custom', () => (result = 'new'));
            socket.handlers.custom();
            strictEqual(result, 'new');
        });
    });

    describe('publish', () => {
        function subscribedSocket(commands, type, pattern) {
            const socket = createSocket();
            commands.subscribe(socket, type, pattern);
            return socket;
        }

        it('emits a state change matching a wildcard pattern', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'stateChange', 'system.adapter.*');
            const state = { val: 1, ack: true };
            strictEqual(commands.publish(socket, 'stateChange', 'system.adapter.admin.0.alive', state), true);
            deepStrictEqual(socket.emitted, [['stateChange', 'system.adapter.admin.0.alive', state]]);
        });

        it('does not emit an ID that does not match', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'stateChange', 'system.adapter.*');
            strictEqual(commands.publish(socket, 'stateChange', 'javascript.0.test', { val: 1 }), false);
            strictEqual(socket.emitted.length, 0);
        });

        it('matches an exact pattern exactly', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'stateChange', 'a.b');
            strictEqual(commands.publish(socket, 'stateChange', 'a.b', { val: 1 }), true);
            strictEqual(commands.publish(socket, 'stateChange', 'a.bc', { val: 1 }), false);
            strictEqual(commands.publish(socket, 'stateChange', 'xa.b', { val: 1 }), false);
            strictEqual(socket.emitted.length, 1);
        });

        it('emits only once even if several patterns match', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 'a.*');
            commands.subscribe(socket, 'stateChange', 'a.b.*');
            strictEqual(commands.publish(socket, 'stateChange', 'a.b.c', { val: 1 }), true);
            strictEqual(socket.emitted.length, 1);
        });

        it('does not emit for another subscription type', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'stateChange', '*');
            strictEqual(commands.publish(socket, 'objectChange', 'a.b', {}), false);
            strictEqual(socket.emitted.length, 0);
        });

        it('returns false for a socket without subscriptions or no socket at all', () => {
            const commands = createCommands();
            strictEqual(commands.publish(createSocket(), 'stateChange', 'a', {}), false);
            strictEqual(commands.publish(null, 'stateChange', 'a', {}), false);
        });

        it('does not emit when the session has expired', () => {
            let valid = false;
            const commands = createCommands(createAdapter(), () => valid);
            const socket = subscribedSocket(commands, 'stateChange', '*');
            strictEqual(commands.publish(socket, 'stateChange', 'a', { val: 1 }), false);
            strictEqual(socket.emitted.length, 0);
            valid = true;
            strictEqual(commands.publish(socket, 'stateChange', 'a', { val: 1 }), true);
        });

        it('does not ask for the session of a socket without subscriptions', () => {
            let checked = 0;
            const commands = createCommands(createAdapter(), () => ++checked && true);
            commands.publish(createSocket(), 'stateChange', 'a', {});
            strictEqual(checked, 0);
        });

        it('replaces the language of system.config with the language of the instance', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'objectChange', 'system.config');
            const obj = { _id: 'system.config', type: 'config', common: { language: 'ru' }, native: {} };
            commands.publish(socket, 'objectChange', 'system.config', obj);
            strictEqual(obj.common.language, 'en');
            strictEqual(socket.emitted[0][2].common.language, 'en');
        });

        it('does not touch the language of other objects', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'objectChange', '*');
            const obj = { _id: 'other', common: { language: 'ru' } };
            commands.publish(socket, 'objectChange', 'other', obj);
            strictEqual(obj.common.language, 'ru');
        });

        // Regression, fixed: publish() reads `obj.common` without checking obj, so the objectChange event of a deleted
        // system.config (obj === null) throws "Cannot read properties of null (reading 'common')".
        it('publishes the deletion of system.config', () => {
            const commands = createCommands();
            const socket = subscribedSocket(commands, 'objectChange', '*');
            strictEqual(commands.publish(socket, 'objectChange', 'system.config', null), true);
            deepStrictEqual(socket.emitted, [['objectChange', 'system.config', null]]);
        });
    });

    describe('publishFile', () => {
        it('emits a file change that matches id and file pattern', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.subscribe(socket, 'fileChange', 'vis.0', 'main/*.json');
            strictEqual(commands.publishFile(socket, 'vis.0', 'main/views.json', 100), true);
            deepStrictEqual(socket.emitted, [['fileChange', 'vis.0', 'main/views.json', 100]]);
        });

        it('does not emit a file of another instance or another pattern', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.subscribe(socket, 'fileChange', 'vis.0', 'main/*.json');
            strictEqual(commands.publishFile(socket, 'vis.1', 'main/views.json', 1), false);
            strictEqual(commands.publishFile(socket, 'vis.0', 'main/views.css', 1), false);
            strictEqual(commands.publishFile(socket, 'vis.0', 'other/views.json', 1), false);
            strictEqual(socket.emitted.length, 0);
        });

        it('passes null size for a deleted file', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.subscribe(socket, 'fileChange', 'vis.0', '*');
            commands.publishFile(socket, 'vis.0', 'a.txt', null);
            deepStrictEqual(socket.emitted[0], ['fileChange', 'vis.0', 'a.txt', null]);
        });

        it('returns false without subscriptions or with an expired session', () => {
            const commands = createCommands(createAdapter(), () => false);
            const socket = createSocket();
            strictEqual(commands.publishFile(socket, 'vis.0', 'a', 1), false);
            commands.subscribe(socket, 'fileChange', 'vis.0', '*');
            strictEqual(commands.publishFile(socket, 'vis.0', 'a', 1), false);
            strictEqual(socket.emitted.length, 0);
        });
    });

    describe('clientSubscribe / clientUnsubscribe / publishInstanceMessage', () => {
        it('subscribes to instance messages and informs the instance', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            const [err, result] = await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', { w: 1 });
            strictEqual(err, null);
            deepStrictEqual(result, { accepted: true });
            deepStrictEqual(adapter.calls.sendTo[0].slice(0, 3), [
                'system.adapter.cameras.0',
                'clientSubscribe',
                { type: 'cam1', sid: 'socket1', data: { w: 1 } },
            ]);
        });

        it('accepts the callback in place of data', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const [err] = await call(commands, 'clientSubscribe', createSocket(), 'system.adapter.cameras.0', 'cam1');
            strictEqual(err, null);
            strictEqual(adapter.calls.sendTo[0][0], 'system.adapter.cameras.0');
            strictEqual(adapter.calls.sendTo[0][2].data, null);
        });

        it('delivers a message of a subscribed instance and type', async () => {
            const commands = createCommands();
            const socket = createSocket();
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'cam1', 'data'), true);
            deepStrictEqual(socket.emitted, [['im', 'cam1', 'system.adapter.cameras.0', 'data']]);
        });

        it('informs the instance if nobody is subscribed to the message', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'cam1', 1), false);
            deepStrictEqual(adapter.calls.sendTo[0], [
                'system.adapter.cameras.0',
                'clientSubscribeError',
                { type: 'cam1', sid: 'socket1', reason: 'no one subscribed' },
                // no callback, and the user the socket is authenticated as
                undefined,
                { user: 'system.user.admin' },
            ]);
            strictEqual(socket.emitted.length, 0);
        });

        it('does not deliver a message of another type', async () => {
            const commands = createCommands();
            const socket = createSocket();
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'cam2', 1), false);
        });

        it('unsubscribes and informs the instance', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            const [err, result] = await call(commands, 'clientUnsubscribe', socket, 'cameras.0', 'cam1');
            strictEqual(err, null);
            strictEqual(result, true);
            deepStrictEqual(adapter.calls.sendTo[1], [
                'system.adapter.cameras.0',
                'clientUnsubscribe',
                { type: ['cam1'], sid: 'socket1', reason: 'client' },
                // no callback, and the user the socket is authenticated as
                undefined,
                { user: 'system.user.admin' },
            ]);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'cam1', 1), false);
        });

        it('answers false when unsubscribing something not subscribed', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const [err, result] = await call(commands, 'clientUnsubscribe', createSocket(), 'cameras.0', 'cam1');
            strictEqual(err, null);
            strictEqual(result, false);
            strictEqual(adapter.calls.sendTo, undefined);
        });

        it('stores a message type only once', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            const [, result] = await call(commands, 'clientUnsubscribe', socket, 'cameras.0', 'cam1');
            strictEqual(result, true);
            const [, again] = await call(commands, 'clientUnsubscribe', socket, 'cameras.0', 'cam1');
            strictEqual(again, false);
        });

        it('informs all instances when the socket disconnects', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam2', null);
            await call(commands, 'clientSubscribe', socket, 'echarts.0', 'chart', null);
            socket.subscribe = {};
            commands.unsubscribeSocket(socket);
            const informs = adapter.calls.sendTo.filter(c => c[1] === 'clientUnsubscribe');
            // no callback, and the user the disconnected socket was authenticated as
            const user = { user: 'system.user.admin' };
            deepStrictEqual(informs, [
                [
                    'system.adapter.cameras.0',
                    'clientUnsubscribe',
                    { type: ['cam1', 'cam2'], sid: 'socket1', reason: 'disconnect' },
                    undefined,
                    user,
                ],
                [
                    'system.adapter.echarts.0',
                    'clientUnsubscribe',
                    { type: ['chart'], sid: 'socket1', reason: 'disconnect' },
                    undefined,
                    user,
                ],
            ]);
            // subscriptions are gone
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'cam1', 1), false);
        });

        it('requires the sendto permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(createAcl());
            const [err] = await call(commands, 'clientSubscribe', socket, 'cameras.0', 'cam1', null);
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            const [err2] = await call(commands, 'clientUnsubscribe', socket, 'cameras.0', 'cam1');
            strictEqual(err2, SocketCommands.ERROR_PERMISSION);
            strictEqual(adapter.calls.sendTo, undefined);
        });
    });

    describe('subscribe / unsubscribe', () => {
        it('subscribes the adapter once per pattern and counts the references', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket1 = createSocket({ user: USER });
            const socket2 = createSocket({ user: USER }, { id: 'socket2' });

            commands.subscribe(socket1, 'stateChange', 'a.*');
            commands.subscribe(socket2, 'stateChange', 'a.*');

            strictEqual(adapter.calls.subscribeForeignStatesAsync.length, 1);
            deepStrictEqual(adapter.calls.subscribeForeignStatesAsync[0], ['a.*', { user: USER }]);
            strictEqual(commands.subscribes.stateChange['a.*'], 2);

            commands.unsubscribe(socket1, 'stateChange', 'a.*');
            strictEqual(adapter.calls.unsubscribeForeignStatesAsync, undefined, 'still used by socket2');
            strictEqual(commands.subscribes.stateChange['a.*'], 1);

            commands.unsubscribe(socket2, 'stateChange', 'a.*');
            deepStrictEqual(adapter.calls.unsubscribeForeignStatesAsync, [['a.*', { user: USER }]]);
            strictEqual(commands.subscribes.stateChange['a.*'], undefined);
        });

        it('stores the pattern and its regex on the socket', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 'a.*');
            strictEqual(socket.subscribe.stateChange.length, 1);
            strictEqual(socket.subscribe.stateChange[0].pattern, 'a.*');
            ok(socket.subscribe.stateChange[0].regex.test('a.b'));
            ok(!socket.subscribe.stateChange[0].regex.test('b.a'));
        });

        it('ignores a duplicate subscription of the same socket', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 'a.*');
            commands.subscribe(socket, 'stateChange', 'a.*');
            strictEqual(socket.subscribe.stateChange.length, 1);
            strictEqual(commands.subscribes.stateChange['a.*'], 1);
            strictEqual(adapter.calls.subscribeForeignStatesAsync.length, 1);
        });

        it('warns about an empty pattern and does nothing', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', '');
            commands.unsubscribe(socket, 'stateChange', '');
            strictEqual(socket.subscribe, undefined);
            strictEqual(adapter.calls.subscribeForeignStatesAsync, undefined);
            strictEqual(adapter.logs.warn.filter(t => t === 'Empty pattern on subscribe!').length, 2);
        });

        it('converts a non string pattern into a string', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 123);
            strictEqual(socket.subscribe.stateChange[0].pattern, '123');
            strictEqual(adapter.calls.subscribeForeignStatesAsync[0][0], '123');
        });

        it('passes no options for a socket without user', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.subscribe(createSocket(null), 'stateChange', 'a');
            strictEqual(adapter.calls.subscribeForeignStatesAsync[0][1], undefined);
        });

        it('subscribes object changes', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'objectChange', 'system.*');
            deepStrictEqual(adapter.calls.subscribeForeignObjectsAsync, [['system.*', { user: ADMIN }]]);
            commands.unsubscribe(socket, 'objectChange', 'system.*');
            deepStrictEqual(adapter.calls.unsubscribeForeignObjectsAsync, [['system.*', { user: ADMIN }]]);
        });

        it('subscribes file changes with an "id####file" key', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'fileChange', 'vis.0', 'main/*');
            strictEqual(socket.subscribe.fileChange[0].pattern, 'vis.0####main/*');
            strictEqual(commands.subscribes.fileChange['vis.0####main/*'], 1);
            deepStrictEqual(adapter.calls.subscribeForeignFiles, [['vis.0', 'main/*', { user: ADMIN }]]);

            commands.unsubscribe(socket, 'fileChange', 'vis.0', 'main/*');
            deepStrictEqual(adapter.calls.unsubscribeForeignFiles, [['vis.0', 'main/*', { user: ADMIN }]]);
            strictEqual(socket.subscribe.fileChange.length, 0);
        });

        it('uses "*" as file pattern if none is given', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.subscribe(createSocket(), 'fileChange', 'vis.0');
            deepStrictEqual(adapter.calls.subscribeForeignFiles[0].slice(0, 2), ['vis.0', '*']);
        });

        it('does not fail if the adapter cannot subscribe files', () => {
            const adapter = createAdapter({ subscribeForeignFiles: undefined, unsubscribeForeignFiles: undefined });
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'fileChange', 'vis.0', '*');
            commands.unsubscribe(socket, 'fileChange', 'vis.0', '*');
            strictEqual(socket.subscribe.fileChange.length, 0);
        });

        it('enables the log once and disables it with the last subscriber', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket1 = createSocket();
            const socket2 = createSocket(undefined, { id: 'socket2' });

            strictEqual(commands.isLogEnabled(), false);
            commands.subscribe(socket1, 'log', 'dummy');
            commands.subscribe(socket2, 'log', 'dummy');
            strictEqual(commands.isLogEnabled(), true);
            deepStrictEqual(adapter.calls.requireLog, [[true, { user: ADMIN }]]);

            commands.unsubscribe(socket1, 'log', 'dummy');
            strictEqual(commands.isLogEnabled(), true);
            commands.unsubscribe(socket2, 'log', 'dummy');
            strictEqual(commands.isLogEnabled(), false);
            deepStrictEqual(adapter.calls.requireLog[1], [false, { user: ADMIN }]);
        });

        it('does not enable the log if the adapter has no requireLog', () => {
            const commands = createCommands(createAdapter({ requireLog: undefined }));
            commands.subscribe(createSocket(), 'log', 'dummy');
            strictEqual(commands.isLogEnabled(), false);
        });

        it('logs an error if the adapter cannot subscribe', async () => {
            const adapter = createAdapter({
                subscribeForeignStatesAsync: () => Promise.reject(new Error('db down')),
            });
            const commands = createCommands(adapter);
            commands.subscribe(createSocket(), 'stateChange', 'a');
            await tick();
            ok(adapter.logs.error.some(t => t.includes('Cannot subscribe "a": db down')));
        });

        it('subscribes globally without a socket', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.subscribe(null, 'stateChange', 'a.*');
            strictEqual(commands.subscribes.stateChange['a.*'], 1);
            deepStrictEqual(adapter.calls.subscribeForeignStatesAsync, [['a.*', undefined]]);
        });

        it('unsubscribes globally without a socket by key', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.subscribe(null, 'stateChange', 'a.*');
            commands.subscribe(null, 'stateChange', 'a.*');
            commands.unsubscribe(null, 'stateChange', 'a.*');
            strictEqual(commands.subscribes.stateChange['a.*'], 1);
            commands.unsubscribe(null, 'stateChange', 'a.*');
            strictEqual(commands.subscribes.stateChange['a.*'], undefined);
            deepStrictEqual(adapter.calls.unsubscribeForeignStatesAsync, [['a.*', undefined]]);
        });

        it('ignores unsubscribe of an unknown type or pattern', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.unsubscribe(socket, 'stateChange', 'a');
            commands.subscribe(socket, 'stateChange', 'a');
            commands.unsubscribe(socket, 'stateChange', 'b');
            commands.unsubscribe(createSocket(undefined, { id: 'other' }), 'stateChange', 'a');
            strictEqual(socket.subscribe.stateChange.length, 1);
            strictEqual(commands.subscribes.stateChange.a, 1);
            strictEqual(adapter.calls.unsubscribeForeignStatesAsync, undefined);
        });
    });

    describe('subscribeSocket / unsubscribeSocket', () => {
        it('re-subscribes the stored patterns of a socket after unsubscribeSocket', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 'a.*');
            commands.subscribe(socket, 'objectChange', 'b.*');
            commands.subscribe(socket, 'fileChange', 'vis.0', 'main/*');
            commands.subscribe(socket, 'log', 'dummy');

            commands.unsubscribeSocket(socket);
            deepStrictEqual(adapter.calls.unsubscribeForeignStatesAsync, [['a.*', { user: ADMIN }]]);
            deepStrictEqual(adapter.calls.unsubscribeForeignObjectsAsync, [['b.*', { user: ADMIN }]]);
            deepStrictEqual(adapter.calls.unsubscribeForeignFiles, [['vis.0', 'main/*', { user: ADMIN }]]);
            strictEqual(commands.isLogEnabled(), false);
            deepStrictEqual(commands.subscribes.stateChange, {});
            // the socket keeps its patterns, so that they can be restored
            strictEqual(socket.subscribe.stateChange.length, 1);

            commands.subscribeSocket(socket);
            strictEqual(adapter.calls.subscribeForeignStatesAsync.length, 2);
            strictEqual(adapter.calls.subscribeForeignObjectsAsync.length, 2);
            deepStrictEqual(adapter.calls.subscribeForeignFiles[1], ['vis.0', 'main/*', { user: ADMIN }]);
            strictEqual(commands.isLogEnabled(), true);
            strictEqual(commands.subscribes.stateChange['a.*'], 1);
        });

        it('only decrements the counter if other sockets still use the pattern', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket1 = createSocket();
            const socket2 = createSocket(undefined, { id: 'socket2' });
            commands.subscribe(socket1, 'stateChange', 'a.*');
            commands.subscribe(socket2, 'stateChange', 'a.*');
            commands.unsubscribeSocket(socket1);
            strictEqual(commands.subscribes.stateChange['a.*'], 1);
            strictEqual(adapter.calls.unsubscribeForeignStatesAsync, undefined);
        });

        it('increments the counter if the pattern is already subscribed', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket1 = createSocket();
            const socket2 = createSocket(undefined, { id: 'socket2' });
            commands.subscribe(socket1, 'stateChange', 'a.*');
            socket2.subscribe = { stateChange: [{ pattern: 'a.*', regex: /^a\..*/ }] };
            commands.subscribeSocket(socket2);
            strictEqual(commands.subscribes.stateChange['a.*'], 2);
            strictEqual(adapter.calls.subscribeForeignStatesAsync.length, 1);
        });

        it('handles a single type only', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            commands.subscribe(socket, 'stateChange', 'a.*');
            commands.subscribe(socket, 'objectChange', 'b.*');
            commands.unsubscribeSocket(socket, 'stateChange');
            strictEqual(adapter.calls.unsubscribeForeignStatesAsync.length, 1);
            strictEqual(adapter.calls.unsubscribeForeignObjectsAsync, undefined);
        });

        it('ignores sockets without subscriptions', () => {
            const commands = createCommands();
            commands.subscribeSocket(createSocket());
            commands.unsubscribeSocket(createSocket());
            commands.subscribeSocket(null);
            commands.unsubscribeSocket(null);
            const socket = createSocket(undefined, { subscribe: {} });
            commands.subscribeSocket(socket, 'stateChange');
            commands.unsubscribeSocket(socket, 'stateChange');
        });
    });

    describe('state subscription commands', () => {
        for (const name of ['subscribe', 'subscribeStates']) {
            it(`${name} subscribes a single pattern and an array of patterns`, async () => {
                const adapter = createAdapter();
                const commands = createCommands(adapter);
                const socket = createSocket();
                const [err] = await call(commands, name, socket, 'a.*');
                strictEqual(err, null);
                await call(commands, name, socket, ['b', 'c']);
                deepStrictEqual(
                    socket.subscribe.stateChange.map(s => s.pattern),
                    ['a.*', 'b', 'c'],
                );
                strictEqual(adapter.calls.subscribeForeignStatesAsync.length, 3);
            });
        }

        for (const name of ['unsubscribe', 'unsubscribeStates']) {
            it(`${name} unsubscribes a single pattern and an array of patterns`, async () => {
                const commands = createCommands();
                const socket = createSocket();
                await call(commands, 'subscribe', socket, ['a', 'b', 'c']);
                const [err] = await call(commands, name, socket, 'a');
                strictEqual(err, null);
                await call(commands, name, socket, ['b', 'c']);
                strictEqual(socket.subscribe.stateChange.length, 0);
            });
        }

        it('answers the callback asynchronously', () => {
            const commands = createCommands();
            let answered = false;
            commands.getCommandHandler('subscribe')(createSocket(), 'a', () => (answered = true));
            strictEqual(answered, false);
        });

        it('works without callback', () => {
            const commands = createCommands();
            const socket = createSocket();
            commands.getCommandHandler('subscribe')(socket, 'a');
            commands.getCommandHandler('unsubscribe')(socket, 'a');
            strictEqual(socket.subscribe.stateChange.length, 0);
        });

        it('shows the subscriptions in debug mode', async () => {
            const adapter = createAdapter();
            adapter.log.level = 'debug';
            const commands = createCommands(adapter);
            await call(commands, 'subscribe', createSocket(), ['a', 'b']);
            ok(adapter.logs.debug.includes('Subscribes: a, b'));
        });

        it('requires the state read permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(createAcl({ object: ['read'] }));
            const [err] = await call(commands, 'subscribe', socket, 'a');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(socket.subscribe, undefined);
            const [err2] = await call(commands, 'unsubscribe', socket, 'a');
            strictEqual(err2, SocketCommands.ERROR_PERMISSION);
        });
    });

    describe('object subscription commands', () => {
        it('subscribes and unsubscribes object changes', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket();
            const [err] = await call(commands, 'subscribeObjects', socket, ['a.*', 'b.*']);
            strictEqual(err, null);
            deepStrictEqual(
                socket.subscribe.objectChange.map(s => s.pattern),
                ['a.*', 'b.*'],
            );
            await call(commands, 'unsubscribeObjects', socket, 'a.*');
            await call(commands, 'unsubscribeObjects', socket, ['b.*']);
            strictEqual(socket.subscribe.objectChange.length, 0);
            strictEqual(adapter.calls.unsubscribeForeignObjectsAsync.length, 2);
        });

        it('requires the object read permission', async () => {
            const commands = createCommands();
            const socket = createSocket(createAcl({ state: ['read'] }));
            const [err] = await call(commands, 'subscribeObjects', socket, 'a');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            const [err2] = await call(commands, 'unsubscribeObjects', socket, 'a');
            strictEqual(err2, SocketCommands.ERROR_PERMISSION);
        });
    });

    describe('authenticate', () => {
        it('answers at once for an authenticated socket', async () => {
            const commands = createCommands();
            const socket = createSocket({ user: USER }, { _secure: true });
            deepStrictEqual(await call(commands, 'authenticate', socket), [true, true]);
        });

        it('reports that authentication is not used', async () => {
            const commands = createCommands();
            const socket = createSocket({ user: ADMIN }, { _secure: false });
            deepStrictEqual(await call(commands, 'authenticate', socket), [true, false]);
        });

        it('keeps the callback pending while the user is not known yet', () => {
            const commands = createCommands();
            const socket = createSocket({ user: null });
            let called = false;
            const cb = () => (called = true);
            commands.getCommandHandler('authenticate')(socket, cb);
            strictEqual(called, false);
            strictEqual(socket._authPending, cb);
        });
    });

    describe('updateTokenExpiration', () => {
        function tokenAdapter(tokens) {
            return createAdapter({ getSession: (id, cb) => cb(tokens[id] || null) });
        }

        it('rejects an empty token', async () => {
            const commands = createCommands();
            deepStrictEqual(await call(commands, 'updateTokenExpiration', createSocket(), ''), [
                'No access token found',
                false,
            ]);
        });

        it('rejects an unknown token', async () => {
            const commands = createCommands(tokenAdapter({}));
            deepStrictEqual(await call(commands, 'updateTokenExpiration', createSocket(), 'unknown'), [
                'No access token found',
                false,
            ]);
        });

        it('rejects a token without user', async () => {
            const commands = createCommands(tokenAdapter({ 'a:t': { aExp: 1 } }));
            const [err, success] = await call(commands, 'updateTokenExpiration', createSocket(), 't');
            strictEqual(err, 'No access token found');
            strictEqual(success, false);
        });

        it('rejects a token of another user and logs a warning', async () => {
            const adapter = tokenAdapter({ 'a:t': { user: 'guest', aExp: 5 } });
            const commands = createCommands(adapter);
            const socket = createSocket({ user: ADMIN }, { _sessionExpiresAt: 1 });
            const [err, success] = await call(commands, 'updateTokenExpiration', socket, 't');
            strictEqual(err, 'Access token belongs to another user');
            strictEqual(success, false);
            strictEqual(socket._sessionExpiresAt, 1);
            ok(adapter.logs.warn.some(t => t.includes('"guest"')));
        });

        it('replaces the token in cookie, authorization header and query and emits tokenInfo', async () => {
            const aExp = Date.now() + 3_600_000;
            const commands = createCommands(tokenAdapter({ 'a:new': { user: 'admin', aExp } }));
            const socket = createSocket(
                { user: ADMIN },
                {
                    conn: {
                        request: {
                            query: { token: 'old' },
                            headers: { cookie: 'a=1; access_token=old; b=2', authorization: 'Bearer old' },
                        },
                    },
                },
            );
            deepStrictEqual(await call(commands, 'updateTokenExpiration', socket, 'new'), [null, true]);
            strictEqual(socket.conn.request.headers.cookie, 'a=1; access_token=new; b=2');
            strictEqual(socket.conn.request.headers.authorization, 'Bearer new');
            strictEqual(socket.conn.request.query.token, 'new');
            strictEqual(socket._sessionExpiresAt, aExp);
            deepStrictEqual(socket.emitted, [['tokenInfo', { expiresAt: aExp }]]);
        });

        it('does not add token sources the socket did not use', async () => {
            const commands = createCommands(tokenAdapter({ 'a:new': { user: 'admin', aExp: 10 } }));
            const socket = createSocket(
                { user: ADMIN },
                { conn: { request: { query: {}, headers: { cookie: 'x=1', authorization: 'Basic abc' } } } },
            );
            await call(commands, 'updateTokenExpiration', socket, 'new');
            strictEqual(socket.conn.request.headers.cookie, 'x=1');
            strictEqual(socket.conn.request.headers.authorization, 'Basic abc');
            strictEqual(socket.conn.request.query.token, undefined);
        });

        it('accepts the token for a socket without a user yet', async () => {
            const commands = createCommands(tokenAdapter({ 'a:new': { user: 'guest', aExp: 10 } }));
            const socket = createSocket({ user: '' });
            deepStrictEqual(await call(commands, 'updateTokenExpiration', socket, 'new'), [null, true]);
        });
    });

    describe('error / log', () => {
        it('writes a socket error into the log', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.getCommandHandler('error')(createSocket(), new Error('oops'));
            commands.getCommandHandler('error')(createSocket(), 'text');
            deepStrictEqual(adapter.logs.error, ['Socket error: Error: oops', 'Socket error: text']);
        });

        it('writes a log entry with the given level, debug by default', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const log = commands.getCommandHandler('log');
            log(createSocket(), 'e', 'error');
            log(createSocket(), 'w', 'warn');
            log(createSocket(), 'i', 'info');
            log(createSocket(), 'd', 'debug');
            log(createSocket(), 's', 'silly');
            log(createSocket(), 'x');
            deepStrictEqual(adapter.logs.error, ['e']);
            deepStrictEqual(adapter.logs.warn, ['w']);
            deepStrictEqual(adapter.logs.info, ['i']);
            deepStrictEqual(adapter.logs.debug, ['d', 's', 'x']);
        });
    });

    describe('checkFeatureSupported', () => {
        it('always supports INSTANCE_MESSAGES and PARTIAL_OBJECT_TREE', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'checkFeatureSupported', createSocket(), 'INSTANCE_MESSAGES'), [
                null,
                true,
            ]);
            deepStrictEqual(await call(commands, 'checkFeatureSupported', createSocket(), 'PARTIAL_OBJECT_TREE'), [
                null,
                true,
            ]);
            strictEqual(adapter.calls.supportsFeature, undefined);
        });

        it('asks the controller for other features', async () => {
            const commands = createCommands();
            deepStrictEqual(await call(commands, 'checkFeatureSupported', createSocket(), 'ALIAS'), [null, true]);
            deepStrictEqual(await call(commands, 'checkFeatureSupported', createSocket(), 'PLUGINS'), [null, false]);
        });
    });

    describe('getHistory', () => {
        it('passes the user and a default aggregate', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const [err, result, step] = await call(commands, 'getHistory', createSocket(), 'a.b', { instance: 'sql.0' });
            strictEqual(err, null);
            deepStrictEqual(result, [{ val: 1, ts: 1 }]);
            strictEqual(step, 'step');
            deepStrictEqual(adapter.calls.getHistory[0][1], { instance: 'sql.0', user: ADMIN, aggregate: 'none' });
        });

        it('accepts the instance name as options', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await call(commands, 'getHistory', createSocket(), 'a.b', 'history.0');
            deepStrictEqual(adapter.calls.getHistory[0][1], { instance: 'history.0', user: ADMIN, aggregate: 'none' });
        });

        it('keeps a given aggregate and works without options', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await call(commands, 'getHistory', createSocket(), 'a.b', { aggregate: 'max' });
            strictEqual(adapter.calls.getHistory[0][1].aggregate, 'max');
            await call(commands, 'getHistory', createSocket(), 'a.b', null);
            deepStrictEqual(adapter.calls.getHistory[1][1], { user: ADMIN, aggregate: 'none' });
        });

        it('converts an error of the adapter into a string', async () => {
            const commands = createCommands(
                createAdapter({ getHistory: (_id, _o, cb) => cb(new Error('No history')) }),
            );
            deepStrictEqual(await call(commands, 'getHistory', createSocket(), 'a', {}), ['No history']);
        });

        it('catches an exception of the adapter', async () => {
            const adapter = createAdapter({
                getHistory: () => {
                    throw new Error('crash');
                },
            });
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getHistory', createSocket(), 'a', {}), ['crash']);
            ok(adapter.logs.error.some(t => t.includes('[getHistory]')));
        });

        it('requires the state read permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getHistory', createSocket(createAcl()), 'a', {}), [
                SocketCommands.ERROR_PERMISSION,
            ]);
            strictEqual(adapter.calls.getHistory, undefined);
        });
    });

    describe('authEnabled / listPermissions / getUserPermissions / getVersion / getAdapterName', () => {
        it('authEnabled answers the auth setting and the user name without prefix', async () => {
            const commands = createCommands();
            deepStrictEqual(await call(commands, 'authEnabled', createSocket({ user: USER })), [true, 'user']);
        });

        it('authEnabled answers an empty user for a socket without ACL', async () => {
            const commands = createCommands(createAdapter({ config: {} }));
            deepStrictEqual(await call(commands, 'authEnabled', createSocket(null)), [undefined, '']);
        });

        it('listPermissions returns the permission table', async () => {
            const commands = createCommands();
            const [permissions] = await call(commands, 'listPermissions', createSocket(createAcl()));
            strictEqual(permissions, SocketCommands.COMMANDS_PERMISSIONS);
            deepStrictEqual(permissions.setState, { type: 'state', operation: 'write' });
        });

        it('getUserPermissions returns the ACL of the socket', async () => {
            const commands = createCommands();
            const acl = createAcl({ object: ['read'] });
            deepStrictEqual(await call(commands, 'getUserPermissions', createSocket(acl)), [null, acl]);
        });

        it('getUserPermissions requires the object read permission', async () => {
            const commands = createCommands();
            deepStrictEqual(await call(commands, 'getUserPermissions', createSocket(createAcl())), [
                SocketCommands.ERROR_PERMISSION,
            ]);
        });

        it('getVersion returns the version and name of the adapter for any user', async () => {
            const commands = createCommands();
            deepStrictEqual(await call(commands, 'getVersion', createSocket(createAcl())), [null, '1.2.3', 'test']);
        });

        it('getAdapterName returns the name or "unknown"', async () => {
            deepStrictEqual(await call(createCommands(), 'getAdapterName', createSocket()), [null, 'test']);
            deepStrictEqual(
                await call(createCommands(createAdapter({ name: undefined })), 'getAdapterName', createSocket()),
                [null, 'unknown'],
            );
        });

        it('warns about a missing callback instead of throwing', () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            for (const name of ['authEnabled', 'listPermissions', 'getUserPermissions', 'getVersion', 'getAdapterName']) {
                commands.getCommandHandler(name)(createSocket());
            }
            strictEqual(adapter.logs.warn.filter(t => t.includes('Invalid callback')).length, 5);
        });
    });

    describe('logout', () => {
        it('destroys access token, refresh token and session', async () => {
            const adapter = createAdapter({
                getSession: (id, cb) => cb(id === 'a:tok' ? { aToken: 'tok', rToken: 'ref', user: 'admin' } : null),
            });
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                _sessionID: 'sess',
                conn: { request: { query: {}, headers: { authorization: 'Bearer tok' } } },
            });
            await call(commands, 'logout', socket);
            deepStrictEqual(
                adapter.calls.destroySession.map(c => c[0]),
                ['a:tok', 'r:ref', 'sess'],
            );
        });

        it('takes the token from the query', async () => {
            const sessions = [];
            const adapter = createAdapter({
                getSession: (id, cb) => {
                    sessions.push(id);
                    cb({ aToken: 'q', rToken: 'r' });
                },
            });
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, { conn: { request: { query: { token: 'q' }, headers: {} } } });
            await call(commands, 'logout', socket);
            deepStrictEqual(sessions, ['a:q']);
            deepStrictEqual(
                adapter.calls.destroySession.map(c => c[0]),
                ['a:q', 'r:r'],
            );
        });

        it('takes the token from the socket.io "_query"', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                conn: { request: { _query: { token: 'sio' }, headers: {} } },
            });
            await call(commands, 'logout', socket);
            strictEqual(adapter.calls.getSession[0][0], 'a:sio');
        });

        // Regression, fixed: logout reads `socket.conn.request._query.token` unguarded. A ws socket that is authenticated
        // only via the access_token cookie has `query` but no `_query`, so logout throws a TypeError
        // instead of destroying the token from the cookie.
        it('takes the token from the cookie (ws socket without "_query")', async () => {
            const sessions = [];
            const adapter = createAdapter({
                getSession: (id, cb) => {
                    sessions.push(id);
                    cb({ aToken: 'c', rToken: 'r' });
                },
            });
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                conn: { request: { query: {}, headers: { cookie: 'x=1; access_token=c' } } },
            });
            await call(commands, 'logout', socket);
            deepStrictEqual(sessions, ['a:c']);
        });

        it('takes the token from the cookie when "_query" exists', async () => {
            const sessions = [];
            const adapter = createAdapter({
                getSession: (id, cb) => {
                    sessions.push(id);
                    cb({ aToken: 'c', rToken: 'r' });
                },
            });
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                conn: { request: { _query: {}, headers: { cookie: 'x=1; access_token=c' } } },
            });
            await call(commands, 'logout', socket);
            deepStrictEqual(sessions, ['a:c']);
            deepStrictEqual(
                adapter.calls.destroySession.map(c => c[0]),
                ['a:c', 'r:r'],
            );
        });

        it('destroys only the session if the token is unknown', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                conn: { request: { sessionID: 'sid', query: {}, headers: { authorization: 'Bearer x' } } },
            });
            await call(commands, 'logout', socket);
            deepStrictEqual(
                adapter.calls.destroySession.map(c => c[0]),
                ['sid'],
            );
        });

        it('answers without error for an unknown token and no session', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                conn: { request: { query: {}, headers: { authorization: 'Bearer x' } } },
            });
            deepStrictEqual(await call(commands, 'logout', socket), []);
            strictEqual(adapter.calls.destroySession, undefined);
        });

        it('destroys the legacy session without token', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, {
                _sessionID: 'legacy',
                conn: { request: { _query: {}, headers: {} } },
            });
            await call(commands, 'logout', socket);
            deepStrictEqual(
                adapter.calls.destroySession.map(c => c[0]),
                ['legacy'],
            );
            strictEqual(adapter.calls.getSession, undefined);
        });

        it('never uses the socket id as a session id', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(undefined, { conn: { request: { _query: {}, headers: {} } } });
            const [err] = await call(commands, 'logout', socket);
            ok(err instanceof Error);
            strictEqual(err.message, 'No session');
            strictEqual(adapter.calls.destroySession, undefined);
        });
    });

    describe('getStates / getForeignStates', () => {
        it('reads the states of a pattern with the user of the socket', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getStates', createSocket({ user: USER, state: { list: true } }), 'a.*'), [
                null,
                { a: { val: 1 } },
            ]);
            deepStrictEqual(adapter.calls.getForeignStates[0].slice(0, 2), ['a.*', { user: USER }]);
        });

        it('reads all states without pattern', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await new Promise(resolve => commands.getCommandHandler('getStates')(createSocket(), resolve));
            strictEqual(adapter.calls.getForeignStates[0][0], '*');
        });

        it('passes an array of IDs', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await call(commands, 'getStates', createSocket(), ['a', 'b']);
            deepStrictEqual(adapter.calls.getForeignStates[0][0], ['a', 'b']);
        });

        it('getForeignStates is an alias of getStates', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await call(commands, 'getForeignStates', createSocket(), 'x.*');
            strictEqual(adapter.calls.getForeignStates[0][0], 'x.*');
        });

        it('converts errors and catches exceptions', async () => {
            let commands = createCommands(
                createAdapter({ getForeignStates: (_p, _o, cb) => cb(new Error('fail')) }),
            );
            deepStrictEqual(await call(commands, 'getStates', createSocket(), '*'), ['fail']);
            commands = createCommands(
                createAdapter({
                    getForeignStates: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'getStates', createSocket(), '*'), ['crash']);
        });

        it('requires the state list permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getStates', createSocket(createAcl({ state: ['read'] })), '*'), [
                SocketCommands.ERROR_PERMISSION,
            ]);
            strictEqual(adapter.calls.getForeignStates, undefined);
        });

        it('warns about a missing callback', () => {
            const adapter = createAdapter();
            createCommands(adapter).getCommandHandler('getStates')(createSocket(), '*');
            ok(adapter.logs.warn.includes('[getStates] Invalid callback'));
        });
    });

    describe('getState', () => {
        it('reads a state with the user of the socket', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getState', createSocket(), 'a.b'), [null, { val: 'a.b', ack: true }]);
            deepStrictEqual(adapter.calls.getForeignStateAsync[0], ['a.b', { user: ADMIN }]);
        });

        it('answers from the cache if the state is cached', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            commands.states = { 'a.b': { val: 'cached' } };
            deepStrictEqual(await call(commands, 'getState', createSocket(), 'a.b'), [null, { val: 'cached' }]);
            strictEqual(adapter.calls.getForeignStateAsync, undefined);
        });

        it('answers null for a non existing state', async () => {
            const commands = createCommands(createAdapter({ getForeignStateAsync: () => Promise.resolve(null) }));
            deepStrictEqual(await call(commands, 'getState', createSocket(), 'x'), [null, null]);
        });

        it('converts a rejection into a string and logs it', async () => {
            const adapter = createAdapter({ getForeignStateAsync: () => Promise.reject(new Error('denied')) });
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getState', createSocket(), 'x'), ['denied']);
            ok(adapter.logs.error.some(t => t.includes('[getState]')));
        });

        it('catches a synchronous exception', async () => {
            const adapter = createAdapter({
                getForeignStateAsync: () => {
                    throw new Error('sync');
                },
            });
            deepStrictEqual(await call(createCommands(adapter), 'getState', createSocket(), 'x'), ['sync']);
        });

        it('requires the state read permission', async () => {
            deepStrictEqual(await call(createCommands(), 'getState', createSocket(createAcl()), 'x'), [
                SocketCommands.ERROR_PERMISSION,
            ]);
        });

        it('warns about a missing callback', () => {
            const adapter = createAdapter();
            createCommands(adapter).getCommandHandler('getState')(createSocket(), 'x');
            ok(adapter.logs.warn.includes('[getState] Invalid callback'));
        });
    });

    describe('setState', () => {
        it('writes a state object with the user of the socket', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'setState', createSocket(), 'a.b', { val: 1, ack: false }), [
                null,
                'id',
            ]);
            deepStrictEqual(adapter.calls.setForeignState[0].slice(0, 3), ['a.b', { val: 1, ack: false }, { user: ADMIN }]);
        });

        it('wraps a plain value into a state object', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            await call(commands, 'setState', createSocket(), 'a', 5);
            await call(commands, 'setState', createSocket(), 'a', 'text');
            await call(commands, 'setState', createSocket(), 'a', false);
            deepStrictEqual(
                adapter.calls.setForeignState.map(c => c[1]),
                [{ val: 5 }, { val: 'text' }, { val: false }],
            );
        });

        it('removes the state from the cache', async () => {
            const commands = createCommands();
            commands.states = { a: { val: 1 }, b: { val: 2 } };
            await call(commands, 'setState', createSocket(), 'a', 3);
            deepStrictEqual(commands.states, { b: { val: 2 } });
        });

        it('converts errors and catches exceptions', async () => {
            let commands = createCommands(createAdapter({ setForeignState: (_i, _s, _o, cb) => cb(new Error('ro')) }));
            deepStrictEqual(await call(commands, 'setState', createSocket(), 'a', 1), ['ro']);
            commands = createCommands(
                createAdapter({
                    setForeignState: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'setState', createSocket(), 'a', 1), ['crash']);
        });

        it('requires the state write permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'setState', createSocket(createAcl({ state: ['read'] })), 'a', 1), [
                SocketCommands.ERROR_PERMISSION,
            ]);
            strictEqual(adapter.calls.setForeignState, undefined);
        });
    });

    describe('getBinaryState / setBinaryState', () => {
        it('answers that the functions are deprecated', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'getBinaryState', createSocket(), 'a'), ['This function is deprecated']);
            deepStrictEqual(await call(commands, 'setBinaryState', createSocket(), 'a', 'AAA='), [
                'This function is deprecated',
            ]);
            strictEqual(adapter.logs.warn.filter(t => t.includes('deprecated')).length, 2);
        });
    });

    describe('getObject', () => {
        it('reads an object with the user of the socket', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const [err, obj] = await call(commands, 'getObject', createSocket(), 'a.b');
            strictEqual(err, null);
            strictEqual(obj._id, 'a.b');
            deepStrictEqual(adapter.calls.getForeignObject[0].slice(0, 2), ['a.b', { user: ADMIN }]);
        });

        it('replaces the language of system.config', async () => {
            const commands = createCommands(
                createAdapter({
                    getForeignObject: (id, _o, cb) => cb(null, { _id: id, common: { language: 'de' } }),
                }),
            );
            const [, obj] = await call(commands, 'getObject', createSocket(), 'system.config');
            strictEqual(obj.common.language, 'en');
        });

        it('does not fail for a missing object', async () => {
            const commands = createCommands(createAdapter({ getForeignObject: (_id, _o, cb) => cb(null, null) }));
            deepStrictEqual(await call(commands, 'getObject', createSocket(), 'system.config'), [null, null]);
        });

        it('converts errors and catches exceptions', async () => {
            let commands = createCommands(createAdapter({ getForeignObject: (_id, _o, cb) => cb(new Error('no')) }));
            deepStrictEqual(await call(commands, 'getObject', createSocket(), 'a'), ['no', undefined]);
            commands = createCommands(
                createAdapter({
                    getForeignObject: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'getObject', createSocket(), 'a'), ['crash']);
        });

        it('requires the object read permission', async () => {
            deepStrictEqual(await call(createCommands(), 'getObject', createSocket(createAcl({ state: ['read'] })), 'a'), [
                SocketCommands.ERROR_PERMISSION,
            ]);
        });
    });

    describe('getObjects / getAllObjects', () => {
        it('reads a list of objects with the object read permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const socket = createSocket(createAcl({ object: ['read'] }));
            const [err, objs] = await call(commands, 'getObjects', socket, ['s.1']);
            strictEqual(err, null);
            ok(objs['s.1']);
            deepStrictEqual(adapter.calls.getForeignObjects[0].slice(0, 2), [['s.1'], { user: USER }]);
        });

        it('collects states with rooms, channels, devices, enums and system.config', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const [err, objs] = await call(commands, 'getObjects', createSocket(), null);
            strictEqual(err, null);
            deepStrictEqual(Object.keys(objs).sort(), ['channel.1', 'device.1', 'enum.1', 's.1', 'system.config']);
            deepStrictEqual(adapter.calls.getForeignObjects[0].slice(0, 4), ['*', 'state', 'rooms', { user: ADMIN }]);
            deepStrictEqual(
                adapter.calls.getForeignObjectsAsync.map(c => c[1]),
                ['channel', 'device', 'enum'],
            );
            strictEqual(objs['system.config'].common.language, 'en', 'language of the instance');
        });

        it('accepts the callback as the only argument', async () => {
            const commands = createCommands();
            const [err, objs] = await new Promise(resolve =>
                commands.getCommandHandler('getObjects')(createSocket(), (...args) => resolve(args)),
            );
            strictEqual(err, null);
            ok(objs['system.config']);
        });

        it('getAllObjects is an alias of getObjects without list', async () => {
            const commands = createCommands();
            const [, objs] = await call(commands, 'getAllObjects', createSocket());
            ok(objs['channel.1']);
        });

        it('still answers the states if reading the other objects fails', async () => {
            const adapter = createAdapter({ getForeignObjectsAsync: () => Promise.reject(new Error('fail')) });
            const commands = createCommands(adapter);
            const [err, objs] = await call(commands, 'getObjects', createSocket(), null);
            strictEqual(err, null);
            deepStrictEqual(objs, {});
            ok(adapter.logs.error.some(t => t.includes('[getObjects]')));
        });

        it('requires the object list permission for all objects and read for a list', async () => {
            const commands = createCommands();
            const reader = createSocket(createAcl({ object: ['read'] }));
            deepStrictEqual(await call(commands, 'getObjects', reader, null), [SocketCommands.ERROR_PERMISSION]);
            const lister = createSocket(createAcl({ object: ['list'] }));
            deepStrictEqual(await call(commands, 'getObjects', lister, ['a']), [SocketCommands.ERROR_PERMISSION]);
        });
    });

    describe('getObjectView', () => {
        it('passes the query to the adapter with the user of the socket', async () => {
            const adapter = createAdapter({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows: [{ id: 'x', value: {} }] }),
            });
            const commands = createCommands(adapter);
            const params = { startkey: 'a.', endkey: 'a.香' };
            let received;
            adapter.getObjectView = (...args) => {
                received = args;
                args[4](null, { rows: [{ id: 'x', value: {} }] });
            };
            const [err, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', params);
            strictEqual(err, null);
            deepStrictEqual(result, { rows: [{ id: 'x', value: {} }] });
            deepStrictEqual(received.slice(0, 4), ['system', 'state', params, { user: ADMIN }]);
        });

        function viewAdapter(ids) {
            return createAdapter({
                getObjectView: (_d, _s, _p, _o, cb) =>
                    cb(null, { rows: ids.map(id => ({ id, value: { _id: id, type: 'state', common: {} } })) }),
            });
        }

        it('limits the result to the requested depth and adds virtual folders', async () => {
            const commands = createCommands(
                viewAdapter(['hm-rpc.1.dev1', 'hm-rpc.1.dev1.ch1', 'hm-rpc.1.dev1.ch1.st1', 'hm-rpc.1.dev1.ch1.st2', 'other.0.x']),
            );
            const [err, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', {
                startkey: 'hm-rpc.1.',
                endkey: 'hm-rpc.1.香',
                depth: 1,
            });
            strictEqual(err, null);
            const ids = result.rows.map(r => r.id);
            ok(ids.includes('hm-rpc.1.dev1'));
            ok(ids.includes('hm-rpc.1.dev1.ch1'));
            ok(!ids.includes('hm-rpc.1.dev1.ch1.st1'), 'too deep');
            ok(!ids.includes('other.0.x'), 'outside of the root');
            const virtual = result.rows.filter(r => r.value.virtual);
            strictEqual(virtual.length, 1);
            deepStrictEqual(virtual[0].value, {
                _id: 'hm-rpc.1.dev1.ch1',
                common: {},
                native: {},
                type: 'folder',
                virtual: true,
                hasChildren: 2,
            });
        });

        it('returns the root object itself when the start key ends with a dot', async () => {
            const commands = createCommands(viewAdapter(['hm-rpc.1', 'hm-rpc.1.dev1']));
            const [, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', {
                startkey: 'hm-rpc.1.',
                depth: 1,
            });
            deepStrictEqual(
                result.rows.map(r => r.id),
                ['hm-rpc.1', 'hm-rpc.1.dev1'],
            );
        });

        // Regression, fixed: for a start key without trailing dot `rootWithoutDot` is set to the key WITH the added dot
        // (socketCommands.ts, getObjectView), so the root object itself is dropped from the result,
        // while it is returned for the same key with a trailing dot (see the test above).
        it('returns the root object itself when the start key has no trailing dot', async () => {
            const commands = createCommands(viewAdapter(['hm-rpc.1', 'hm-rpc.1.dev1']));
            const [, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', {
                startkey: 'hm-rpc.1',
                depth: 1,
            });
            deepStrictEqual(
                result.rows.map(r => r.id),
                ['hm-rpc.1', 'hm-rpc.1.dev1'],
            );
        });

        it('returns everything down to the depth without start key', async () => {
            const commands = createCommands(viewAdapter(['a', 'a.b', 'a.b.c']));
            const [, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', { depth: 1 });
            const ids = result.rows.map(r => r.id);
            ok(ids.includes('a'));
            ok(ids.includes('a.b'));
            ok(!result.rows.find(r => r.id === 'a.b.c'));
        });

        it('does not filter rows without _id', async () => {
            const rows = [{ id: 'x', value: { type: 'state' } }];
            const commands = createCommands(
                createAdapter({ getObjectView: (_d, _s, _p, _o, cb) => cb(null, { rows }) }),
            );
            const [, result] = await call(commands, 'getObjectView', createSocket(), 'system', 'state', {
                startkey: 'a.',
                depth: 1,
            });
            deepStrictEqual(result.rows, rows);
        });

        it('passes the error of a depth query', async () => {
            const commands = createCommands(createAdapter({ getObjectView: (_d, _s, _p, _o, cb) => cb('failed') }));
            deepStrictEqual(
                await call(commands, 'getObjectView', createSocket(), 'system', 'state', { depth: 1 }),
                ['failed', undefined],
            );
        });

        it('catches an exception of the adapter', async () => {
            const commands = createCommands(
                createAdapter({
                    getObjectView: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'getObjectView', createSocket(), 'system', 'state', {}), ['crash']);
        });

        it('requires the object list permission', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(
                await call(commands, 'getObjectView', createSocket(createAcl({ object: ['read'] })), 'system', 'state', {}),
                [SocketCommands.ERROR_PERMISSION],
            );
            strictEqual(adapter.calls.getObjectView, undefined);
        });

        it('logs an error without callback', () => {
            const adapter = createAdapter();
            createCommands(adapter).getCommandHandler('getObjectView')(createSocket(), 'system', 'state', {});
            ok(adapter.logs.error.includes('Callback is not a function'));
            strictEqual(adapter.calls.getObjectView, undefined);
        });
    });

    describe('setObject', () => {
        it('writes an object with the user of the socket', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            const obj = { _id: 'a', type: 'state', common: {}, native: {} };
            deepStrictEqual(await call(commands, 'setObject', createSocket(), 'a', obj), [null, { id: 'a' }]);
            deepStrictEqual(adapter.calls.setForeignObject[0].slice(0, 3), ['a', obj, { user: ADMIN }]);
        });

        it('converts errors and catches exceptions', async () => {
            let commands = createCommands(createAdapter({ setForeignObject: (_i, _o, _u, cb) => cb(new Error('no')) }));
            deepStrictEqual(await call(commands, 'setObject', createSocket(), 'a', {}), ['no']);
            commands = createCommands(
                createAdapter({
                    setForeignObject: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'setObject', createSocket(), 'a', {}), ['crash']);
        });

        it('requires the object write permission', async () => {
            deepStrictEqual(
                await call(createCommands(), 'setObject', createSocket(createAcl({ object: ['read'] })), 'a', {}),
                [SocketCommands.ERROR_PERMISSION],
            );
        });
    });

    describe('delObject', () => {
        it('deletes flot and fullcalendar objects', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'delObject', createSocket(), 'flot.0.chart', {}), [null]);
            deepStrictEqual(await call(commands, 'delObject', createSocket(), 'fullcalendar.0.x', {}), [null]);
            deepStrictEqual(
                adapter.calls.delForeignObject.map(c => c.slice(0, 2)),
                [
                    ['flot.0.chart', { user: ADMIN }],
                    ['fullcalendar.0.x', { user: ADMIN }],
                ],
            );
        });

        it('refuses to delete any other object even for admin', async () => {
            const adapter = createAdapter();
            const commands = createCommands(adapter);
            deepStrictEqual(await call(commands, 'delObject', createSocket(), 'system.adapter.admin.0', {}), [
                SocketCommands.ERROR_PERMISSION,
            ]);
            strictEqual(adapter.calls.delForeignObject, undefined);
        });

        it('requires the object delete permission', async () => {
            deepStrictEqual(
                await call(createCommands(), 'delObject', createSocket(createAcl({ object: ['write'] })), 'flot.0.a', {}),
                [SocketCommands.ERROR_PERMISSION],
            );
        });

        it('converts errors and catches exceptions', async () => {
            let commands = createCommands(createAdapter({ delForeignObject: (_i, _o, cb) => cb(new Error('no')) }));
            deepStrictEqual(await call(commands, 'delObject', createSocket(), 'flot.0.a', {}), ['no']);
            commands = createCommands(
                createAdapter({
                    delForeignObject: () => {
                        throw new Error('crash');
                    },
                }),
            );
            deepStrictEqual(await call(commands, 'delObject', createSocket(), 'flot.0.a', {}), ['crash']);
        });
    });

    describe('getCompactSystemConfig', () => {
        it('returns only common, secret and vendor', async () => {
            const commands = createCommands(
                createAdapter({
                    getForeignObject: (_id, _o, cb) =>
                        cb(null, {
                            _id: 'system.config',
                            common: { language: 'de' },
                            native: { secret: 's3cr3t', vendor: { name: 'v' }, other: 'x' },
                        }),
                }),
            );
            const [err, obj] = await call(commands, 'getCompactSystemConfig', createSocket());
            strictEqual(err, null);
            deepStrictEqual(obj.native, { secret: 's3cr3t', vendor: { name: 'v' } });
            deepStrictEqual(obj.common, { language: 'de' });
        });

        it('omits native completely if there is no secret and no vendor', async () => {
            const commands = createCommands(
                createAdapter({
                    getForeignObject: (_id, _o, cb) => cb(null, { _id: 'system.config', common: {}, native: { a: 1 } }),
                }),
            );
            const [, obj] = await call(commands, 'getCompactSystemConfig', createSocket());
            strictEqual('native' in obj, false);
        });

        it('keeps the vendor without a secret', async () => {
            const commands = createCommands(
                createAdapter({
                    getForeignObject: (_id, _o, cb) => cb(null, { common: {}, native: { vendor: { v: 1 } } }),
                }),
            );
            const [, obj] = await call(commands, 'getCompactSystemConfig', createSocket());
            deepStrictEqual(obj.native, { vendor: { v: 1 } });
        });

        it('answers an empty object if system.config does not exist', async () => {
            const commands = createCommands(createAdapter({ getForeignObject: (_id, _o, cb) => cb('not found', null) }));
            deepStrictEqual(await call(commands, 'getCompactSystemConfig', createSocket()), ['not found', {}]);
        });

        it('requires the object read permission', async () => {
            deepStrictEqual(await call(createCommands(), 'getCompactSystemConfig', createSocket(createAcl())), [
                SocketCommands.ERROR_PERMISSION,
            ]);
        });
    });

    describe('getAdapterInstances', () => {
        function instancesAdapter() {
            return createAdapter({
                getObjectView: (_d, _s, params, _o, cb) =>
                    cb(null, {
                        rows: [
                            {
                                value: {
                                    _id: 'system.adapter.history.0',
                                    common: { name: 'history', news: { a: 1 }, jsonConfig: true },
                                },
                            },
                            { value: { _id: 'system.adapter.history2.0', common: { name: 'history2' } } },
                        ],
                        params,
                    }),
            });
        }

        it('returns the instances of one adapter without news and with adminUI', async () => {
            const adapter = instancesAdapter();
            const commands = createCommands(adapter);
            let params;
            const original = adapter.getObjectView;
            adapter.getObjectView = (d, s, p, o, cb) => {
                params = p;
                original(d, s, p, o, cb);
            };
            const [err, list] = await call(commands, 'getAdapterInstances', createSocket(), 'history');
            strictEqual(err, null);
            strictEqual(list.length, 1, 'history2 must be filtered out');
            strictEqual(list[0].common.news, undefined);
            strictEqual(list[0].common.adminUI.config, 'json');
            deepStrictEqual(params, {
                startkey: 'system.adapter.history.',
                endkey: 'system.adapter.history.香',
            });
        });

        it('returns all instances for an empty adapter name', async () => {
            const commands = createCommands(instancesAdapter());
            const [, list] = await call(commands, 'getAdapterInstances', createSocket(), '');
            strictEqual(list.length, 2);
        });

        it('requires the object read permission', async () => {
            deepStrictEqual(await call(createCommands(), 'getAdapterInstances', createSocket(createAcl()), ''), [
                SocketCommands.ERROR_PERMISSION,
            ]);
        });
    });
});

describe('SocketCommands user context', () => {
    /** Capture the arguments of one adapter method without the recording mock reversing them */
    function captureAdapter(method) {
        const seen = [];
        const adapter = createAdapter({
            [method]: (...args) => {
                seen.push(args);
                const cb = args.find(a => typeof a === 'function');
                cb?.({ accepted: true });
            },
        });
        return { adapter, seen };
    }

    it('sendTo names the user of the socket', async () => {
        const { adapter, seen } = captureAdapter('sendTo');
        const commands = createCommands(adapter);

        await call(commands, 'sendTo', createSocket(createAcl({ other: ['sendto'] })), 'history.0', 'cmd', { a: 1 });

        deepStrictEqual(seen[0][0], 'history.0');
        deepStrictEqual(seen[0][4], { user: USER });
    });

    it('sendTo sends no options when the socket has no user', async () => {
        const { adapter, seen } = captureAdapter('sendTo');
        const commands = createCommands(adapter);
        const acl = createAcl({ other: ['sendto'] });
        acl.user = '';

        await call(commands, 'sendTo', createSocket(acl), 'history.0', 'cmd', { a: 1 });

        strictEqual(seen[0][4], undefined);
    });

    it('clientSubscribe names the user of the socket', async () => {
        const { adapter, seen } = captureAdapter('sendTo');
        const commands = createCommands(adapter);

        await call(
            commands,
            'clientSubscribe',
            createSocket(createAcl({ other: ['sendto'] })),
            'cameras.0',
            'startRecording',
            { width: 640 },
        );

        strictEqual(seen[0][1], 'clientSubscribe');
        deepStrictEqual(seen[0][4], { user: USER });
    });

    it('sendToHost names the user of the socket', async () => {
        const { adapter, seen } = captureAdapter('sendToHost');
        const commands = createCommands(adapter);

        await call(
            commands,
            'sendToHost',
            createSocket(createAcl({ other: ['sendto'] })),
            'system.host.test',
            'getRepository',
            {},
        );

        strictEqual(seen[0][1], 'getRepository');
        deepStrictEqual(seen[0][4], { user: USER });
    });
});

describe('SocketCommands publish ACL filter', () => {
    /** A socket that is subscribed to `a.*` state changes */
    function subscribedSocket(acl) {
        const { socket, emitted } = (() => {
            const s = createSocket(acl);
            return { socket: s, emitted: s.emitted };
        })();
        socket.subscribe = { stateChange: [{ pattern: 'a.*', regex: /^a\./ }] };
        return { socket, emitted };
    }

    /**
     * An adapter whose answer to "may this user read it" is under the control of the test.
     *
     * With `mayRead` it answers the way a js-controller 8 does, without it the filter has to fall
     * back to reading the object - which is what an older controller leaves it with.
     */
    function createAclAdapter(answer, withMayRead) {
        const asked = [];
        const watched = [];
        const questions = [];
        return {
            asked,
            watched,
            questions,
            adapter: createAdapter({
                ...(withMayRead
                    ? {
                          mayRead: question => {
                              questions.push(question);
                              return Promise.resolve(answer === true);
                          },
                      }
                    : {}),
                getForeignObject: (id, options, cb) => {
                    asked.push({ id, user: options?.user, cb });
                    if (answer !== 'later') {
                        cb(answer ? null : 'permissionError', answer ? { _id: id, type: 'state' } : undefined);
                    }
                },
                subscribeForeignObjectsAsync: pattern => {
                    watched.push(pattern);
                    return Promise.resolve();
                },
            }),
        };
    }

    it('asks nothing for an administrator and sends at once', async () => {
        const { adapter, asked } = createAclAdapter(true);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket();

        strictEqual(commands.publish(socket, 'stateChange', 'a.b', { val: 1 }), true);

        deepStrictEqual(emitted.map(args => args[0]), ['stateChange']);
        strictEqual(asked.length, 0);
    });

    it('keeps an event away from a user who may not read the object', async () => {
        const { adapter, asked } = createAclAdapter(false);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ state: ['read'] }));

        commands.publish(socket, 'stateChange', 'a.b', { val: 1 });
        await tick();

        strictEqual(emitted.length, 0, 'nothing was sent');
        strictEqual(asked.length, 1);
        strictEqual(asked[0].user, USER);

        // and it is not asked a second time
        strictEqual(commands.publish(socket, 'stateChange', 'a.b', { val: 2 }), false);
        strictEqual(asked.length, 1);
    });

    it('sends the newest value of an id that waited for the answer', async () => {
        const { adapter, asked } = createAclAdapter('later');
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ state: ['read'] }));

        strictEqual(commands.publish(socket, 'stateChange', 'a.b', { val: 1 }), true);
        strictEqual(commands.publish(socket, 'stateChange', 'a.b', { val: 2 }), true);
        strictEqual(asked.length, 1, 'the same id is asked once, however many events arrive');

        // the database answers now
        asked[0].cb(null, { _id: 'a.b', type: 'state' });
        await tick();

        deepStrictEqual(emitted.map(args => args[0]), ['stateChange']);
        deepStrictEqual(emitted[0][2], { val: 2 }, 'the older value did not overtake the newer one');
    });

    it('keeps a file event away from a user who may not read the adapter it belongs to', async () => {
        const { adapter, asked } = createAclAdapter(false);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ file: ['read'] }));
        socket.subscribe.fileChange = [{ pattern: 'vis.0####*', regex: /^vis\.0####/ }];

        commands.publishFile(socket, 'vis.0', 'main/vis-views.json', 120);
        await tick();

        strictEqual(emitted.length, 0, 'nothing was sent');
        deepStrictEqual(
            asked.map(entry => entry.id),
            ['vis.0'],
            'the question is about the adapter, not about the single file',
        );
    });

    it('asks for every file, because the answer is about that file', async () => {
        const { adapter, asked } = createAclAdapter(true);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ file: ['read'] }));
        socket.subscribe.fileChange = [{ pattern: 'vis.0####*', regex: /^vis\.0####/ }];

        commands.publishFile(socket, 'vis.0', 'main/a.json', 1);
        await tick();
        // a file that is gone is still an event, and it is decided the same way
        commands.publishFile(socket, 'vis.0', 'main/b.json', null);
        await tick();

        deepStrictEqual(
            emitted.map(args => [args[0], args[2]]),
            [
                ['fileChange', 'main/a.json'],
                ['fileChange', 'main/b.json'],
            ],
        );
        strictEqual(asked.length, 2, 'one question per file');
    });

    it('asks the controller where it can answer, and about the right thing', async () => {
        const { adapter, asked, questions } = createAclAdapter(true, true);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ state: ['read'], file: ['read'] }));
        socket.subscribe.fileChange = [{ pattern: 'vis.0####*', regex: /^vis\.0####/ }];

        commands.publish(socket, 'stateChange', 'a.b', { val: 1 });
        await tick();
        commands.publishFile(socket, 'vis.0', 'main/a.json', 1);
        await tick();

        deepStrictEqual(questions, [
            { type: 'state', id: 'a.b', user: USER },
            { type: 'file', id: 'vis.0', fileName: 'main/a.json', user: USER },
        ]);
        strictEqual(asked.length, 0, 'the object was not read as a stand-in for the question');
        strictEqual(emitted.length, 2);
    });

    it('reads the object instead where the controller is too old for the question', async () => {
        const { adapter, asked, questions } = createAclAdapter(true, false);
        const commands = createCommands(adapter, () => true);
        const { socket, emitted } = subscribedSocket(createAcl({ state: ['read'] }));

        commands.publish(socket, 'stateChange', 'a.b', { val: 1 });
        await tick();

        strictEqual(questions.length, 0);
        deepStrictEqual(
            asked.map(entry => entry.id),
            ['a.b'],
        );
        strictEqual(emitted.length, 1);
    });

    it('watches the objects and forgets a decision when one changes', async () => {
        const { adapter, asked, watched } = createAclAdapter(true);
        const commands = createCommands(adapter, () => true);
        const { socket } = subscribedSocket(createAcl({ state: ['read'] }));

        commands.publish(socket, 'stateChange', 'a.b', { val: 1 });
        await tick();
        strictEqual(asked.length, 1);
        deepStrictEqual(watched, ['*'], 'the objects are watched from the first decision on');

        // the object - and with it its ACL - changed, so the decision is worth nothing
        commands.publish(socket, 'objectChange', 'a.b', { _id: 'a.b', type: 'state', common: {}, acl: {} });
        commands.publish(socket, 'stateChange', 'a.b', { val: 2 });
        await tick();

        strictEqual(asked.length, 2, 'it was asked again');
    });
});
