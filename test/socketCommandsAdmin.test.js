const { deepStrictEqual, ok, strictEqual } = require('assert');
const { mkdirSync, rmSync, writeFileSync } = require('fs');
const { join, normalize } = require('path');
const axios = require('axios');
const { SocketCommands, SocketCommandsAdmin } = require('../build/index');

const ADMIN = 'system.user.admin';
const ERROR_PERMISSION = SocketCommands.ERROR_PERMISSION;

/** Adapter that records every call. Each method can be replaced through `overrides`. */
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
        common: { host: 'myHost' },
        log: {
            level: 'info',
            silly: text => logs.silly.push(text),
            debug: text => logs.debug.push(text),
            info: text => logs.info.push(text),
            warn: text => logs.warn.push(text),
            error: text => logs.error.push(text),
        },
        getForeignObjectAsync: record('getForeignObjectAsync', () => Promise.resolve(null)),
        setForeignObjectAsync: record('setForeignObjectAsync', () => Promise.resolve()),
        getForeignObject: record('getForeignObject', (...args) => lastCb(args)(null, null)),
        setForeignObject: record('setForeignObject', (...args) => {
            const cb = lastCb(args);
            cb ? cb(null) : undefined;
            return Promise.resolve();
        }),
        delForeignObject: record('delForeignObject', (...args) => lastCb(args)(null)),
        extendForeignObject: record('extendForeignObject', (...args) => lastCb(args)(null, { id: args[0] })),
        getForeignObjects: record('getForeignObjects', (...args) => lastCb(args)(null, {})),
        getObjectView: record('getObjectView', (...args) => lastCb(args)(null, { rows: [] })),
        getObjectList: record('getObjectList', (...args) => lastCb(args)(null, { rows: [] })),
        delForeignState: record('delForeignState', (...args) => lastCb(args)(null)),
        setPassword: record('setPassword', (...args) => lastCb(args)(null)),
        sendToHost: record('sendToHost', (...args) => {
            const cb = lastCb(args.slice(2));
            cb?.({ result: 'ok' });
        }),
        sendTo: record('sendTo'),
        subscribeForeignStatesAsync: record('subscribeForeignStatesAsync', () => Promise.resolve()),
        unsubscribeForeignStatesAsync: record('unsubscribeForeignStatesAsync', () => Promise.resolve()),
        subscribeForeignObjectsAsync: record('subscribeForeignObjectsAsync', () => Promise.resolve()),
        unsubscribeForeignObjectsAsync: record('unsubscribeForeignObjectsAsync', () => Promise.resolve()),
        requireLog: record('requireLog', () => Promise.resolve()),
        writeFile: record('writeFile', (...args) => lastCb(args)(null)),
        supportsFeature: record('supportsFeature', () => false),
        encrypt: record('encrypt', (secret, text) => `enc(${secret}:${text})`),
        decrypt: record('decrypt', (secret, text) => `dec(${secret}:${text})`),
    };
    Object.keys(overrides || {}).forEach(name => {
        adapter[name] = typeof overrides[name] === 'function' ? record(name, overrides[name]) : overrides[name];
    });
    return { adapter, calls, logs };
}

/** Socket with an ACL. Without `acl` it is the admin, otherwise a restricted user. */
function createSocket(acl) {
    const emitted = [];
    const socket = {
        id: 'socket1',
        _acl: acl || { user: ADMIN, groups: ['system.group.administrator'] },
        conn: { request: { query: {}, headers: {} } },
        emit: (...args) => emitted.push(args),
    };
    return { socket, emitted };
}

/** Restricted user: everything is forbidden unless it is explicitly allowed in `rights` */
function userAcl(rights, groups) {
    const acl = {
        user: 'system.user.guest',
        groups: groups || ['system.group.user'],
        object: { read: false, list: false, write: false, delete: false },
        state: { read: false, list: false, write: false, create: false, delete: false },
        users: { read: false, list: false, write: false, create: false, delete: false },
        other: { execute: false, http: false, sendto: false },
        file: { read: false, list: false, write: false, create: false, delete: false },
    };
    Object.keys(rights || {}).forEach(type => Object.assign(acl[type], rights[type]));
    return acl;
}

/** Call a command and resolve with all arguments given to its callback */
function call(commands, name, socket, ...args) {
    return new Promise(resolve => commands.getCommandHandler(name)(socket, ...args, (...result) => resolve(result)));
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('SocketCommandsAdmin', () => {
    let instances = [];

    function create(adapterOverrides, objects, states) {
        const mock = createAdapter(adapterOverrides);
        const commands = new SocketCommandsAdmin(mock.adapter, undefined, undefined, objects, states);
        instances.push(commands);
        return { commands, ...mock };
    }

    afterEach(() => {
        instances.forEach(commands => commands.destroy());
        instances = [];
    });

    describe('construction', () => {
        it('registers the admin commands in addition to the common ones', () => {
            const { commands } = create();
            for (const name of [
                'addUser',
                'delUser',
                'addGroup',
                'delGroup',
                'changePassword',
                'getHostByIp',
                'requireLog',
                'readLogs',
                'delState',
                'cmdExec',
                'eventsThreshold',
                'getRatings',
                'getCurrentInstance',
                'decrypt',
                'encrypt',
                'getIsEasyModeStrict',
                'getEasyMode',
                'getAdapters',
                'updateLicenses',
                'getCompactInstances',
                'getCompactAdapters',
                'getCompactInstalled',
                'getCompactSystemRepositories',
                'getCompactRepository',
                'getCompactHosts',
                'getAllObjects',
                'getObjects',
                'extendObject',
                'getForeignObjects',
                'delObject',
                'delObjects',
                'writeFile',
                // inherited
                'getVersion',
                'updateTokenExpiration',
                'sendToHost',
            ]) {
                strictEqual(typeof commands.getCommandHandler(name), 'function', `command "${name}" must exist`);
            }
        });

        it('takes the event threshold from the adapter configuration', () => {
            const { commands } = create({ config: { thresholdValue: '15' } });
            strictEqual(commands.eventsThreshold.value, 15);
        });

        it('falls back to 200 events per second as threshold', () => {
            const { commands } = create({ config: { thresholdValue: 'abc' } });
            strictEqual(commands.eventsThreshold.value, 200);
        });

        it('does not read the language from system.config when running as admin', () => {
            const { calls } = create();
            strictEqual(calls.getForeignObjectAsync, undefined);
        });
    });

    describe('addUser', () => {
        it('creates the user object and sets the password', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'secret');

            strictEqual(error, null);
            strictEqual(calls.getForeignObjectAsync[0][0], 'system.user.benjamin');
            const [id, obj, options] = calls.setForeignObject[0];
            strictEqual(id, 'system.user.benjamin');
            deepStrictEqual(obj, {
                type: 'user',
                common: { name: 'benjamin', enabled: true, password: '' },
                native: {},
            });
            deepStrictEqual(options, { user: ADMIN });
            strictEqual(calls.setPassword[0][0], 'benjamin');
            strictEqual(calls.setPassword[0][1], 'secret');
            deepStrictEqual(calls.setPassword[0][2], { user: ADMIN });
        });

        it('accepts umlauts, cyrillic letters and the allowed special characters', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'Jürgen Иван-1@home.de', 'pass');

            strictEqual(error, null);
            strictEqual(calls.setForeignObject[0][0], 'system.user.Jürgen Иван-1@home.de');
        });

        it('rejects a name with forbidden characters without touching the database', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'bad/name', 'pass');

            ok(error.startsWith('Invalid characters in the name'), error);
            strictEqual(calls.getForeignObjectAsync, undefined);
            strictEqual(calls.setForeignObject, undefined);
        });

        it('does not overwrite an existing user', async () => {
            const { commands, calls } = create({
                getForeignObjectAsync: () => Promise.resolve({ _id: 'system.user.benjamin', common: {} }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'pass');

            strictEqual(error, 'User yet exists');
            strictEqual(calls.setForeignObject, undefined);
            strictEqual(calls.setPassword, undefined);
        });

        it('reports an error of the database as string', async () => {
            const { commands, calls } = create({ setForeignObject: () => Promise.reject(new Error('DB down')) });
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'pass');

            strictEqual(error, 'DB down');
            strictEqual(calls.setPassword, undefined);
        });

        it('reports an exception of setPassword as string', async () => {
            const { commands } = create({ setPassword: () => Promise.reject(new Error('weak password')) });
            const { socket } = createSocket();

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'x');

            strictEqual(error, 'weak password');
        });

        it('is denied for a user without "users.create" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl());

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'pass');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getForeignObjectAsync, undefined);
            strictEqual(calls.setForeignObject, undefined);
        });

        it('is allowed for a user with "users.create" right and runs with his rights', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ users: { create: true } }));

            const [error] = await call(commands, 'addUser', socket, 'benjamin', 'pass');

            strictEqual(error, null);
            deepStrictEqual(calls.setForeignObject[0][2], { user: 'system.user.guest' });
        });
    });

    describe('delUser', () => {
        it('deletes an existing user', async () => {
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: {} }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delUser', socket, 'benjamin');

            strictEqual(error, null);
            strictEqual(calls.delForeignObject[0][0], 'system.user.benjamin');
            deepStrictEqual(calls.delForeignObject[0][1], { user: ADMIN });
        });

        it('reports a missing user', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'delUser', socket, 'nobody');

            strictEqual(error, 'User does not exist');
            strictEqual(calls.delForeignObject, undefined);
        });

        it('reports a read error as missing user', async () => {
            const { commands } = create({ getForeignObject: (id, options, cb) => cb(new Error('boom')) });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delUser', socket, 'benjamin');

            strictEqual(error, 'User does not exist');
        });

        it('refuses to delete a system user', async () => {
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: { dontDelete: true } }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delUser', socket, 'admin');

            strictEqual(error, 'Cannot delete user, while is system user');
            strictEqual(calls.delForeignObject, undefined);
        });

        it('converts an error of the deletion to string', async () => {
            const { commands } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: {} }),
                delForeignObject: (id, options, cb) => cb(new Error('permissionError')),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delUser', socket, 'benjamin');

            strictEqual(error, 'permissionError');
        });

        it('is denied for a user without "users.delete" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ users: { create: true } }));

            const [error] = await call(commands, 'delUser', socket, 'benjamin');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getForeignObject, undefined);
        });
    });

    describe('addGroup', () => {
        it('creates a group with the first letter of the name upper case and of the ID lower case', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error, obj] = await call(commands, 'addGroup', socket, 'Users', 'my description', null);

            strictEqual(error, null);
            strictEqual(calls.getForeignObject[0][0], 'system.group.users');
            strictEqual(calls.setForeignObject[0][0], 'system.group.users');
            strictEqual(obj._id, 'system.group.users');
            strictEqual(obj.type, 'group');
            strictEqual(obj.common.name, 'Users');
            strictEqual(obj.common.desc, 'my description');
            deepStrictEqual(obj.common.members, []);
        });

        it('capitalizes a lower case name', async () => {
            const { commands } = create();
            const { socket } = createSocket();

            const [, obj] = await call(commands, 'addGroup', socket, 'guests', null, null);

            strictEqual(obj.common.name, 'Guests');
            strictEqual(obj._id, 'system.group.guests');
            strictEqual(obj.common.desc, undefined);
        });

        it('creates a group without any rights if no ACL is given', async () => {
            const { commands } = create();
            const { socket } = createSocket();

            const [, obj] = await call(commands, 'addGroup', socket, 'nobody', null, null);

            for (const type of Object.keys(obj.common.acl)) {
                for (const operation of Object.keys(obj.common.acl[type])) {
                    strictEqual(obj.common.acl[type][operation], false, `${type}.${operation} must be false`);
                }
            }
            deepStrictEqual(Object.keys(obj.common.acl).sort(), ['file', 'object', 'other', 'state', 'users']);
        });

        it('takes over the given ACL', async () => {
            const { commands } = create();
            const { socket } = createSocket();
            const acl = { object: { list: true, read: true, write: false, delete: false } };

            const [, obj] = await call(commands, 'addGroup', socket, 'readers', null, acl);

            deepStrictEqual(obj.common.acl, acl);
        });

        it('does not overwrite an existing group', async () => {
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: {} }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'addGroup', socket, 'users', null, null);

            strictEqual(error, 'Group yet exists');
            strictEqual(calls.setForeignObject, undefined);
        });

        it('rejects a group name with forbidden characters', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'addGroup', socket, 'bad/group', null, null);

            ok(error.startsWith('Invalid characters in the group name'), error);
            strictEqual(calls.getForeignObject, undefined);
        });

        it('allows an underscore in the group name', async () => {
            const { commands } = create();
            const { socket } = createSocket();

            const [error, obj] = await call(commands, 'addGroup', socket, 'my_group', null, null);

            strictEqual(error, null);
            strictEqual(obj._id, 'system.group.my_group');
        });

        it('is denied for a user without "users.create" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ users: { delete: true } }));

            const [error] = await call(commands, 'addGroup', socket, 'users', null, null);

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getForeignObject, undefined);
        });
    });

    describe('delGroup', () => {
        it('deletes an existing group', async () => {
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: {} }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delGroup', socket, 'users');

            strictEqual(error, null);
            strictEqual(calls.delForeignObject[0][0], 'system.group.users');
            deepStrictEqual(calls.delForeignObject[0][1], { user: ADMIN });
        });

        it('reports a missing group', async () => {
            const { commands } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'delGroup', socket, 'users');

            strictEqual(error, 'Group does not exist');
        });

        it('refuses to delete a system group', async () => {
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, { _id: id, common: { dontDelete: true } }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delGroup', socket, 'administrator');

            strictEqual(error, 'Cannot delete group, while is system group');
            strictEqual(calls.delForeignObject, undefined);
        });

        it('is denied for a user without "users.delete" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ users: { create: true } }));

            const [error] = await call(commands, 'delGroup', socket, 'users');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getForeignObject, undefined);
        });
    });

    describe('changePassword', () => {
        it('lets an administrator change the password of another user', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'changePassword', socket, 'benjamin', 'newPass');

            strictEqual(error, null);
            strictEqual(calls.setPassword[0][0], 'benjamin');
            strictEqual(calls.setPassword[0][1], 'newPass');
            deepStrictEqual(calls.setPassword[0][2], { user: ADMIN });
        });

        it('lets a user change his own password without "users.write" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl());

            const [error] = await call(commands, 'changePassword', socket, 'system.user.guest', 'newPass');

            strictEqual(error, null);
            deepStrictEqual(calls.setPassword[0][2], { user: 'system.user.guest' });
        });

        it('does not let a user change the password of somebody else', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl());

            const [error] = await call(commands, 'changePassword', socket, 'admin', 'hacked');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.setPassword, undefined);
        });

        it('converts an error of setPassword to string', async () => {
            const { commands } = create({ setPassword: (user, pass, options, cb) => cb(new Error('too short')) });
            const { socket } = createSocket();

            const [error] = await call(commands, 'changePassword', socket, 'benjamin', 'x');

            strictEqual(error, 'too short');
        });

        it('catches an exception of setPassword', async () => {
            const { commands, logs } = create({
                setPassword: () => {
                    throw new Error('crash');
                },
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'changePassword', socket, 'benjamin', 'x');

            strictEqual(error, 'crash');
            ok(logs.error.some(text => text.includes('crash')));
        });
    });

    describe('getHostByIp', () => {
        const hosts = [
            {
                value: {
                    _id: 'system.host.first',
                    common: { hostname: 'first' },
                    native: { hardware: { networkInterfaces: { eth0: [{ address: '192.168.1.10' }], lo: null } } },
                },
            },
            {
                value: {
                    _id: 'system.host.second',
                    common: { hostname: 'second' },
                    native: {
                        hardware: {
                            networkInterfaces: { eth0: [{ address: '10.0.0.1' }, { address: 'fe80::1' }] },
                        },
                    },
                },
            },
        ];

        function createWithHosts() {
            return create({ getObjectView: (design, search, params, options, cb) => cb(null, { rows: hosts }) });
        }

        it('finds a host by its host name', async () => {
            const { commands, calls } = createWithHosts();
            const { socket } = createSocket();

            const [ip, obj] = await call(commands, 'getHostByIp', socket, 'second');

            strictEqual(ip, 'second');
            strictEqual(obj._id, 'system.host.second');
            strictEqual(calls.getObjectView[0][0], 'system');
            strictEqual(calls.getObjectView[0][1], 'host');
            deepStrictEqual(calls.getObjectView[0][3], { user: ADMIN });
        });

        it('finds a host by the IPv4 address of one of its interfaces', async () => {
            const { commands } = createWithHosts();
            const { socket } = createSocket();

            const [ip, obj] = await call(commands, 'getHostByIp', socket, '192.168.1.10');

            strictEqual(ip, '192.168.1.10');
            strictEqual(obj._id, 'system.host.first');
        });

        it('finds a host by an IPv6 address that is not the first of the interface', async () => {
            const { commands } = createWithHosts();
            const { socket } = createSocket();

            const [, obj] = await call(commands, 'getHostByIp', socket, 'fe80::1');

            strictEqual(obj._id, 'system.host.second');
        });

        it('answers null for an unknown address', async () => {
            const { commands } = createWithHosts();
            const { socket } = createSocket();

            const [ip, obj] = await call(commands, 'getHostByIp', socket, '1.2.3.4');

            strictEqual(ip, '1.2.3.4');
            strictEqual(obj, null);
        });

        it('answers null if there are no hosts', async () => {
            const { commands } = create();
            const { socket } = createSocket();

            const [, obj] = await call(commands, 'getHostByIp', socket, '1.2.3.4');

            strictEqual(obj, null);
        });

        it('ignores a call without a callback', () => {
            const { commands, calls, logs } = create();
            const { socket } = createSocket();

            commands.getCommandHandler('getHostByIp')(socket, '1.2.3.4');

            strictEqual(calls.getObjectView, undefined);
            ok(logs.warn.some(text => text.includes('Invalid callback')));
        });

        it('is denied for a user without "object.list" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { read: true } }));

            const [error] = await call(commands, 'getHostByIp', socket, '1.2.3.4');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getObjectView, undefined);
        });
    });

    describe('requireLog', () => {
        it('enables the log transport for the first socket and disables it with the last one', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'requireLog', socket, true);
            strictEqual(error, null);
            strictEqual(calls.requireLog.length, 1);
            strictEqual(calls.requireLog[0][0], true);
            ok(commands.isLogEnabled());
            strictEqual(socket.subscribe.log.length, 1);

            await call(commands, 'requireLog', socket, false);
            strictEqual(calls.requireLog.length, 2);
            strictEqual(calls.requireLog[1][0], false);
            strictEqual(commands.isLogEnabled(), false);
            strictEqual(socket.subscribe.log.length, 0);
        });

        it('keeps the log transport enabled while another socket still needs it', async () => {
            const { commands, calls } = create();
            const first = createSocket().socket;
            const second = createSocket().socket;
            second.id = 'socket2';

            await call(commands, 'requireLog', first, true);
            await call(commands, 'requireLog', second, true);
            strictEqual(calls.requireLog.length, 1, 'must enable the log only once');

            await call(commands, 'requireLog', first, false);
            strictEqual(calls.requireLog.length, 1, 'must not disable the log while the second socket needs it');
            ok(commands.isLogEnabled());

            await call(commands, 'requireLog', second, false);
            strictEqual(calls.requireLog.length, 2);
            strictEqual(commands.isLogEnabled(), false);
        });

        it('requires the right to write objects', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { read: true } }));

            const [error] = await call(commands, 'requireLog', socket, true);

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.requireLog, undefined);
        });
    });

    describe('readLogs', () => {
        it('delivers the list of log files of the host', async () => {
            const list = [{ fileName: 'log/file1/iobroker.log', size: 100 }];
            const { commands, calls } = create({ sendToHost: (host, command, message, cb) => cb({ list }) });
            const { socket } = createSocket();

            const [error, result] = await call(commands, 'readLogs', socket, 'system.host.first');

            strictEqual(error, undefined);
            deepStrictEqual(result, list);
            strictEqual(calls.sendToHost[0][0], 'system.host.first');
            strictEqual(calls.sendToHost[0][1], 'getLogFiles');
        });

        it('delivers an error of the host', async () => {
            const { commands } = create({
                sendToHost: (host, command, message, cb) => cb({ error: 'permission denied' }),
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'readLogs', socket, 'system.host.first');

            strictEqual(error, 'permission denied');
        });

        it('answers "no file loggers" if the host does not answer and no file transport is configured', async () => {
            const { commands } = create({ sendToHost: () => {}, systemConfig: { log: {} } });
            const { socket } = createSocket();

            const start = Date.now();
            const [error, list] = await call(commands, 'readLogs', socket, 'system.host.first');

            ok(Date.now() - start >= 450, 'must wait for the host first');
            strictEqual(error, 'no file loggers');
            strictEqual(list, undefined);
        });

        describe('reading the log folder itself when the host does not answer', () => {
            // A relative log path is resolved against the folder two levels above build/lib, i.e. the package root
            const relative = 'test/tmp-readLogs';
            const folder = join(normalize(`${__dirname}/..`), relative);

            before(() => {
                mkdirSync(join(folder, 'subfolder'), { recursive: true });
                writeFileSync(join(folder, 'iobroker.2026-09-23.log'), 'line1\nline2\n');
                writeFileSync(join(folder, 'iobroker.2026-09-22.log'), '');
                writeFileSync(join(folder, 'abc-audit.json'), '{}');
            });

            after(() => rmSync(folder, { recursive: true, force: true }));

            it('lists the log files of a file transport without audit files and sub-folders', async () => {
                const { commands } = create({
                    sendToHost: () => {},
                    systemConfig: {
                        log: {
                            transport: {
                                file1: { type: 'file', filename: `${relative}/iobroker` },
                                syslog1: { type: 'syslog' },
                            },
                        },
                    },
                });
                const { socket } = createSocket();

                const [error, list] = await call(commands, 'readLogs', socket, 'system.host.first');

                strictEqual(error, undefined);
                deepStrictEqual(
                    list.sort((a, b) => a.fileName.localeCompare(b.fileName)),
                    [
                        { fileName: 'log/file1/iobroker.2026-09-22.log', size: 0 },
                        { fileName: 'log/file1/iobroker.2026-09-23.log', size: 12 },
                    ],
                );
            });

            // Regression, fixed: the check for an absolute Windows path uses /^\W:/ instead of /^\w:/, so a path like
            // "C:\iobroker\log\iobroker" is treated as relative and prefixed with the package folder.
            it(
                'lists the log files of a file transport with an absolute path',
                async () => {
                    const { commands } = create({
                        sendToHost: () => {},
                        systemConfig: {
                            log: { transport: { file1: { type: 'file', filename: `${folder}/iobroker` } } },
                        },
                    });
                    const { socket } = createSocket();

                    const [error, list] = await call(commands, 'readLogs', socket, 'system.host.first');

                    strictEqual(error, undefined);
                    strictEqual(list.length, 2);
                },
            );
        });

        it('delivers an empty list if the log folder does not exist', async () => {
            const { commands } = create({
                sendToHost: () => {},
                systemConfig: { log: { transport: { file1: { type: 'file', filename: 'not/existing/iobroker' } } } },
            });
            const { socket } = createSocket();

            const [error, list] = await call(commands, 'readLogs', socket, 'system.host.first');

            strictEqual(error, undefined);
            deepStrictEqual(list, []);
        });

        it('requires the "other.execute" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ other: { sendto: true } }));

            const [error] = await call(commands, 'readLogs', socket, 'system.host.first');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.sendToHost, undefined);
        });
    });

    describe('delState', () => {
        it('deletes the state and removes it from the cache', async () => {
            const states = { 'a.0.b': { val: 1 }, 'a.0.c': { val: 2 } };
            const { commands, calls } = create({}, undefined, states);
            const { socket } = createSocket();

            const [error] = await call(commands, 'delState', socket, 'a.0.b');

            strictEqual(error, null);
            strictEqual(calls.delForeignState[0][0], 'a.0.b');
            deepStrictEqual(calls.delForeignState[0][1], { user: ADMIN });
            deepStrictEqual(Object.keys(states), ['a.0.c']);
        });

        it('converts an error to string', async () => {
            const { commands } = create({ delForeignState: (id, options, cb) => cb(new Error('not found')) });
            const { socket } = createSocket();

            const [error] = await call(commands, 'delState', socket, 'a.0.b');

            strictEqual(error, 'not found');
        });

        it('requires the "state.delete" right', async () => {
            const states = { 'a.0.b': { val: 1 } };
            const { commands, calls } = create({}, undefined, states);
            const { socket } = createSocket(userAcl({ state: { write: true } }));

            const [error] = await call(commands, 'delState', socket, 'a.0.b');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.delForeignState, undefined);
            ok(states['a.0.b'], 'the cache must stay untouched');
        });
    });

    describe('cmdExec', () => {
        it('sends the command to the host and remembers the session', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'cmdExec', socket, 'system.host.first', 123, 'ls -la');

            strictEqual(error, null);
            strictEqual(calls.sendToHost[0][0], 'system.host.first');
            strictEqual(calls.sendToHost[0][1], 'cmdExec');
            deepStrictEqual(calls.sendToHost[0][2], { data: 'ls -la', id: 123, files: undefined });
            strictEqual(commands.sendCommand({ command: 'cmdStdout', message: { id: 123, data: 'x' } }), true);
        });

        it('sends files along with the command', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();
            const files = [{ name: 'script.sh', file: Buffer.from('echo 1').toString('base64') }];

            const [error] = await call(commands, 'cmdExec', socket, 'system.host.first', 5, 'sh script.sh', files);

            strictEqual(error, null);
            deepStrictEqual(calls.sendToHost[0][2].files, files);
        });

        it('refuses a command without a session ID', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            const [error] = await call(commands, 'cmdExec', socket, 'system.host.first', undefined, 'ls');

            strictEqual(error, 'no session ID');
            strictEqual(calls.sendToHost, undefined);
        });

        it('requires the "other.execute" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ other: { sendto: true, http: true } }));

            const [error] = await call(commands, 'cmdExec', socket, 'system.host.first', 1, 'rm -rf /');

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.sendToHost, undefined);
        });

        it('reports an exception of sendToHost', async () => {
            const { commands } = create({
                sendToHost: () => {
                    throw new Error('no host');
                },
            });
            const { socket } = createSocket();

            const [error] = await call(commands, 'cmdExec', socket, 'system.host.first', 1, 'ls');

            strictEqual(error, 'no host');
        });
    });

    describe('sendCommand', () => {
        it('routes only answers of known sessions and forgets the session on exit', async () => {
            const { commands } = create();
            const { socket } = createSocket();
            await call(commands, 'cmdExec', socket, 'system.host.first', 7, 'ls');

            strictEqual(commands.sendCommand({ command: 'cmdStdout', message: { id: 8 } }), undefined);
            strictEqual(commands.sendCommand({ command: 'cmdStderr', message: { id: 7 } }), true);
            strictEqual(commands.sendCommand({ command: 'cmdExit', message: { id: 7, data: 0 } }), true);
            strictEqual(commands.sendCommand({ command: 'cmdStdout', message: { id: 7 } }), undefined);
        });

        it('ignores a message without payload', () => {
            const { commands } = create();
            strictEqual(commands.sendCommand({ command: 'cmdStdout' }), undefined);
        });
    });

    describe('sendToHost with cache', () => {
        it('caches the answer of a cacheable command without message for a short time', async () => {
            const { commands, calls } = create({
                sendToHost: (host, command, message, cb) => cb({ result: calls.sendToHost.length }),
            });
            const { socket } = createSocket();

            const [first] = await call(commands, 'sendToHost', socket, 'system.host.first', 'getInstalled', null);
            const [second] = await call(commands, 'sendToHost', socket, 'system.host.first', 'getInstalled', null);

            strictEqual(calls.sendToHost.length, 1, 'the second request must be answered from cache');
            deepStrictEqual(first, { result: 1 });
            deepStrictEqual(second, { result: 1 });
        });

        it('asks the host again after the cache expired', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'sendToHost', socket, 'system.host.first', 'getVersion', null);
            await wait(550);
            await call(commands, 'sendToHost', socket, 'system.host.first', 'getVersion', null);

            strictEqual(calls.sendToHost.length, 2);
        });

        it('does not cache a command with a message', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'sendToHost', socket, 'system.host.first', 'getInstalled', { a: 1 });
            await call(commands, 'sendToHost', socket, 'system.host.first', 'getInstalled', { a: 1 });

            strictEqual(calls.sendToHost.length, 2);
        });

        it('does not cache a command that is not in the allow list', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'sendToHost', socket, 'system.host.first', 'getNotifications', null);
            await call(commands, 'sendToHost', socket, 'system.host.first', 'getNotifications', null);

            strictEqual(calls.sendToHost.length, 2);
        });

        it('caches per host', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'sendToHost', socket, 'system.host.first', 'getHostInfo', null);
            await call(commands, 'sendToHost', socket, 'system.host.second', 'getHostInfo', null);

            strictEqual(calls.sendToHost.length, 2);
        });

        it('answers an exception of the adapter as error', async () => {
            const { commands } = create({
                sendToHost: () => {
                    throw new Error('host not reachable');
                },
            });
            const { socket } = createSocket();

            const [result] = await call(commands, 'sendToHost', socket, 'system.host.first', 'getVersion', null);

            strictEqual(result.error.message, 'host not reachable');
        });
    });

    describe('events threshold', () => {
        /**
         * Start the burst detection. The check interval is one second by default: the automatic tests
         * use a short one, the tests of the command a very long one, so that no check runs in between.
         */
        function createStarted(config, checkInterval) {
            const result = create({ config: config || {} });
            const changes = [];
            result.commands.eventsThreshold.checkInterval = checkInterval || 600_000;
            result.commands.start(enabled => changes.push(enabled));
            return { ...result, changes };
        }

        function restartChecks(commands, changes, checkInterval) {
            clearInterval(commands.thresholdInterval);
            commands.eventsThreshold.checkInterval = checkInterval;
            commands.start(enabled => changes.push(enabled));
        }

        it('counts state changes only while the threshold is inactive', () => {
            const { commands } = create();
            commands.stateChange('a.0.b', { val: 1 });
            commands.stateChange('a.0.b', { val: 2 });
            strictEqual(commands.eventsThreshold.count, 2);

            commands.eventsThreshold.active = true;
            commands.stateChange('a.0.b', { val: 3 });
            strictEqual(commands.eventsThreshold.count, 2);
        });

        it('updates the state cache on state changes', () => {
            const states = {};
            const { commands } = create({}, undefined, states);

            commands.stateChange('a.0.b', { val: 1 });
            deepStrictEqual(states, { 'a.0.b': { val: 1 } });

            commands.stateChange('a.0.b', null);
            deepStrictEqual(states, {});
        });

        it('is enabled by the command: unsubscribes all states and subscribes only system.adapter.*', async () => {
            const { commands, calls, changes } = createStarted();
            const { socket } = createSocket();
            commands.subscribe(socket, 'stateChange', 'hm-rpc.0.*');
            commands.subscribe(socket, 'stateChange', 'javascript.0.*');

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);

            deepStrictEqual(changes, [true]);
            ok(commands.eventsThreshold.active);
            ok(commands.eventsThreshold.timeActivated > 0);
            deepStrictEqual(
                calls.unsubscribeForeignStatesAsync.map(args => args[0]),
                ['hm-rpc.0.*', 'javascript.0.*'],
            );
            deepStrictEqual(calls.subscribeForeignStatesAsync.slice(-1)[0][0], 'system.adapter.*');
        });

        it('is disabled by the command: subscribes all states again', async () => {
            const { commands, calls, changes } = createStarted();
            const { socket } = createSocket();
            commands.subscribe(socket, 'stateChange', 'hm-rpc.0.*');

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);
            const subscribed = calls.subscribeForeignStatesAsync.length;

            commands.getCommandHandler('eventsThreshold')(socket, false);
            strictEqual(commands.eventsThreshold.active, false);
            await wait(100);

            deepStrictEqual(changes, [true, false]);
            deepStrictEqual(calls.unsubscribeForeignStatesAsync.slice(-1)[0][0], 'system.adapter.*');
            deepStrictEqual(
                calls.subscribeForeignStatesAsync.slice(subscribed).map(args => args[0]),
                ['hm-rpc.0.*'],
            );
        });

        it('does nothing when disabling an inactive threshold', async () => {
            const { commands, changes, calls } = createStarted();
            const { socket } = createSocket();

            commands.getCommandHandler('eventsThreshold')(socket, false);
            await wait(80);

            deepStrictEqual(changes, []);
            strictEqual(calls.unsubscribeForeignStatesAsync, undefined);
        });

        it('does not enable it twice', async () => {
            const { commands, changes } = createStarted();
            const { socket } = createSocket();

            commands.getCommandHandler('eventsThreshold')(socket, true);
            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);

            deepStrictEqual(changes, [true]);
        });

        it('requires the "other.execute" right and reports the denial as event', async () => {
            const { commands, changes } = createStarted();
            const { socket, emitted } = createSocket(userAcl());

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);

            deepStrictEqual(changes, []);
            strictEqual(commands.eventsThreshold.active, false);
            strictEqual(emitted[0][0], ERROR_PERMISSION);
            deepStrictEqual(emitted[0][1], {
                command: 'eventsThreshold',
                type: 'other',
                operation: 'execute',
                args: [true],
            });
        });

        it('is enabled automatically after the number of events stayed too high for 3 intervals', async () => {
            const { commands, changes } = createStarted({ thresholdValue: 5 }, 50);

            // keep the rate over the limit for more than three check intervals
            const burst = setInterval(() => {
                for (let e = 0; e < 10; e++) {
                    commands.stateChange('a.0.b', { val: e });
                }
            }, 2);
            const started = Date.now();
            while (!commands.eventsThreshold.active && Date.now() - started < 2000) {
                await wait(2);
            }
            clearInterval(burst);
            // stop the checks: see the skipped test below why a check must not run during the activation
            clearInterval(commands.thresholdInterval);
            ok(commands.eventsThreshold.active, 'the threshold must be active');
            await wait(150);
            deepStrictEqual(changes, [true]);
        });

        it('is not enabled by a single burst', async () => {
            const { commands, changes } = createStarted({ thresholdValue: 5 }, 20);

            for (let e = 0; e < 50; e++) {
                commands.stateChange('a.0.b', { val: e });
            }
            await wait(100);

            strictEqual(commands.eventsThreshold.active, false);
            strictEqual(commands.eventsThreshold.accidents, 0, 'the counter must be reset after a quiet interval');
            deepStrictEqual(changes, []);
        });

        it('is disabled automatically one minute after it was enabled', async () => {
            const { commands, changes } = createStarted();
            const { socket } = createSocket();

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);
            // pretend the threshold was enabled more than a minute ago
            commands.eventsThreshold.timeActivated = Date.now() - 61_000;
            restartChecks(commands, changes, 20);
            await wait(120);

            strictEqual(commands.eventsThreshold.active, false);
            deepStrictEqual(changes, [true, false]);
        });

        it('stays enabled if it was enabled less than a minute ago', async () => {
            const { commands, changes } = createStarted();
            const { socket } = createSocket();

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);
            restartChecks(commands, changes, 20);
            await wait(80);

            ok(commands.eventsThreshold.active);
            deepStrictEqual(changes, [true]);
        });

        // Regression, fixed: `active` is set at once, but `timeActivated` only 100 ms later in the timer. A check that runs
        // in between sees `Date.now() - 0 > 60000` and disables the threshold again, then the timer reports
        // "enabled" to the clients and unsubscribes all states although the threshold is inactive.
        it('is not disabled by a check that runs while it is being activated', async () => {
            const { commands, changes } = createStarted({}, 20);
            const { socket } = createSocket();

            commands.getCommandHandler('eventsThreshold')(socket, true);
            await wait(150);

            ok(commands.eventsThreshold.active);
            deepStrictEqual(changes, [true]);
        });

        it('stops the check interval on destroy', () => {
            const { commands } = createStarted();
            ok(commands.thresholdInterval);
            commands.destroy();
            strictEqual(commands.thresholdInterval, null);
        });
    });

    describe('ratings', () => {
        let originalGet;
        let requests;

        beforeEach(() => {
            originalGet = axios.get;
            requests = [];
        });

        afterEach(() => {
            axios.get = originalGet;
        });

        function stubAxios(answer) {
            axios.get = (url, options) => {
                requests.push({ url, options });
                return typeof answer === 'function' ? answer() : Promise.resolve({ data: answer });
            };
        }

        it('answers the cached ratings without asking the server', async () => {
            const { commands } = create();
            stubAxios({});
            commands.context.ratings = { uuid: 'u1', 'hm-rpc': { rating: { r: 4, c: 10 } } };

            const [error, ratings] = await call(commands, 'getRatings', createSocket().socket);

            strictEqual(error, null);
            deepStrictEqual(ratings, { uuid: 'u1', 'hm-rpc': { rating: { r: 4, c: 10 } } });
            strictEqual(requests.length, 0);
        });

        it('reads the ratings from the server if requested', async () => {
            const { commands } = create({ name: 'web' });
            stubAxios({ 'hm-rpc': { rating: { r: 5, c: 1 } } });
            commands.context.ratings = { uuid: 'old' };
            commands.adapter.getForeignObjectAsync = () => Promise.resolve({ native: { uuid: 'system-uuid' } });

            const [error, ratings] = await call(commands, 'getRatings', createSocket().socket, true);

            strictEqual(error, null);
            deepStrictEqual(ratings, { 'hm-rpc': { rating: { r: 5, c: 1 } }, uuid: 'system-uuid' });
            strictEqual(requests.length, 1);
        });

        it('stores the given uuid in the ratings', async () => {
            const { commands } = create({ name: 'web' });
            stubAxios({ vis: { rating: { r: 3, c: 2 } } });

            const ratings = await commands.updateRatings('given-uuid');

            strictEqual(ratings.uuid, 'given-uuid');
            strictEqual(requests[0].url, 'https://rating.iobroker.net/rating?uuid=given-uuid');
            strictEqual(commands.context.ratingTimeout, null, 'only admin updates the ratings periodically');
        });

        // Regression, fixed: updateRatings() puts the parameter `uuid` into the URL instead of the uuid read from
        // system.meta.uuid, so the request goes to ".../rating?uuid=undefined".
        it('asks the server with the uuid of the system if none is given', async () => {
            const { commands } = create({
                name: 'web',
                getForeignObjectAsync: () => Promise.resolve({ native: { uuid: 'system-uuid' } }),
            });
            stubAxios({});

            await commands.updateRatings();

            strictEqual(requests[0].url, 'https://rating.iobroker.net/rating?uuid=system-uuid');
        });

        it('replaces an invalid answer of the server by an empty rating', async () => {
            const { commands } = create({ name: 'web' });
            stubAxios(['not', 'an', 'object']);

            const ratings = await commands.updateRatings('u1');

            deepStrictEqual(ratings, { uuid: 'u1' });
        });

        it('returns null and warns if the server cannot be reached', async () => {
            const { commands, logs } = create({ name: 'web' });
            stubAxios(() => Promise.reject(new Error('ETIMEDOUT')));

            const ratings = await commands.updateRatings('u1');

            strictEqual(ratings, null);
            ok(logs.warn.some(text => text.includes('ETIMEDOUT')));
        });

        it('schedules the next update when running in admin', async () => {
            const { commands } = create();
            stubAxios({});

            await commands.updateRatings('u1');

            ok(commands.context.ratingTimeout, 'a timer must be set');
            clearTimeout(commands.context.ratingTimeout);
            commands.context.ratingTimeout = null;
        });
    });

    describe('simple admin commands', () => {
        it('getCurrentInstance answers the namespace', async () => {
            const { commands } = create();
            const [error, namespace] = await call(commands, 'getCurrentInstance', createSocket().socket);
            strictEqual(error, null);
            strictEqual(namespace, 'admin.0');
        });

        it('getIsEasyModeStrict answers the access limit of the configuration', async () => {
            const { commands } = create({ config: { accessLimit: true } });
            const [error, strict] = await call(commands, 'getIsEasyModeStrict', createSocket().socket);
            strictEqual(error, null);
            strictEqual(strict, true);
        });
    });

    describe('encrypt / decrypt', () => {
        const withSecret = () => ({
            getForeignObject: (id, options, cb) => cb(null, { native: { secret: 'S3cr3t' } }),
        });

        it('decrypts with the secret of system.config', async () => {
            const { commands, calls } = create(withSecret());
            const { socket } = createSocket();

            const [error, text] = await call(commands, 'decrypt', socket, 'abc');

            strictEqual(error, null);
            strictEqual(text, 'dec(S3cr3t:abc)');
            strictEqual(calls.getForeignObject[0][0], 'system.config');
            deepStrictEqual(calls.getForeignObject[0][1], { user: ADMIN });
        });

        it('encrypts with the secret of system.config', async () => {
            const { commands } = create(withSecret());

            const [error, text] = await call(commands, 'encrypt', createSocket().socket, 'plain');

            strictEqual(error, null);
            strictEqual(text, 'enc(S3cr3t:plain)');
        });

        it('serves an administrator from the cached secret', async () => {
            const { commands, calls } = create(withSecret());
            const { socket } = createSocket();

            await call(commands, 'decrypt', socket, 'a');
            await call(commands, 'encrypt', socket, 'b');
            const [, text] = await call(commands, 'decrypt', socket, 'c');

            strictEqual(calls.getForeignObject.length, 1);
            strictEqual(text, 'dec(S3cr3t:c)');
        });

        it('treats a member of the administrator group as administrator', async () => {
            const { commands, calls } = create(withSecret());
            await call(commands, 'decrypt', createSocket().socket, 'a');

            const { socket } = createSocket(userAcl({}, ['system.group.administrator']));
            await call(commands, 'decrypt', socket, 'b');

            strictEqual(calls.getForeignObject.length, 1);
        });

        it('treats a socket without ACL (no authentication) as administrator', async () => {
            const { commands, calls } = create(withSecret());
            await call(commands, 'decrypt', createSocket().socket, 'a');

            const { socket } = createSocket();
            socket._acl = undefined;
            await call(commands, 'encrypt', socket, 'b');

            strictEqual(calls.getForeignObject.length, 1);
        });

        it('does not serve the cached secret to a user who may not read system.config', async () => {
            let allowed = true;
            const { commands } = create({
                getForeignObject: (id, options, cb) =>
                    allowed ? cb(null, { native: { secret: 'S3cr3t' } }) : cb(new Error(ERROR_PERMISSION)),
            });
            // an administrator warms up the cache
            await call(commands, 'decrypt', createSocket().socket, 'a');

            allowed = false;
            const { socket } = createSocket(userAcl());
            const [decryptError, decrypted] = await call(commands, 'decrypt', socket, 'b');
            const [encryptError, encrypted] = await call(commands, 'encrypt', socket, 'c');

            strictEqual(decryptError, ERROR_PERMISSION);
            strictEqual(decrypted, undefined);
            strictEqual(encryptError, ERROR_PERMISSION);
            strictEqual(encrypted, undefined);
        });

        it('reports an error if system.config has no secret', async () => {
            const { commands, logs } = create({ getForeignObject: (id, options, cb) => cb(null, { native: {} }) });

            const [error, text] = await call(commands, 'decrypt', createSocket().socket, 'x');

            strictEqual(error, null);
            strictEqual(text, undefined);
            ok(logs.error.some(t => t.includes('No system.config found')));
        });

        it('reports an exception of encrypt', async () => {
            const { commands } = create({
                ...withSecret(),
                encrypt: () => {
                    throw new Error('invalid key');
                },
            });

            const [error] = await call(commands, 'encrypt', createSocket().socket, 'x');

            strictEqual(error, 'invalid key');
        });
    });

    describe('getEasyMode', () => {
        const adapterObjects = {
            'system.adapter.hm-rpc.0': {
                common: { name: 'hm-rpc', title: 'HM', version: '1.0.0', icon: 'hm.png', materialize: true },
            },
            'system.adapter.javascript.0': {
                common: { name: 'javascript', titleLang: { en: 'JS' }, version: '8.0.0', adminUI: { config: 'json' } },
            },
            'system.adapter.backitup.0': {
                common: { name: 'backitup', title: 'Backup', version: '3.0.0' },
            },
        };

        it('delivers only the allowed configs and tabs in strict mode', async () => {
            const { commands, calls } = create({
                config: {
                    accessLimit: true,
                    auth: true,
                    accessAllowedConfigs: ['hm-rpc.0', 'unknown.0'],
                    accessAllowedTabs: ['javascript.0'],
                },
                getForeignObjectAsync: id => Promise.resolve(adapterObjects[id]),
            });
            const { socket } = createSocket(userAcl({ object: { read: true } }));

            const [error, result] = await call(commands, 'getEasyMode', socket);

            strictEqual(error, null);
            strictEqual(result.strict, true);
            const byId = Object.fromEntries(result.configs.map(config => [config.id, config]));
            deepStrictEqual(Object.keys(byId).sort(), ['hm-rpc.0', 'javascript.0']);
            strictEqual(byId['hm-rpc.0'].url, '/adapter/hm-rpc/index_m.html?0');
            strictEqual(byId['hm-rpc.0'].config, true);
            strictEqual(byId['hm-rpc.0'].title, 'HM');
            strictEqual(byId['javascript.0'].url, '/adapter/javascript/tab.html?0');
            strictEqual(byId['javascript.0'].tab, true);
            strictEqual(byId['javascript.0'].jsonConfig, true);
            deepStrictEqual(byId['javascript.0'].title, { en: 'JS' });
            // read with the rights of the socket user
            deepStrictEqual(calls.getForeignObjectAsync[0][1], { user: 'system.user.guest' });
        });

        it('uses the default user if authentication is disabled', async () => {
            const { commands, calls } = create({
                config: { accessLimit: true, auth: false, defaultUser: 'viewer', accessAllowedConfigs: ['hm-rpc.0'] },
                getForeignObjectAsync: id => Promise.resolve(adapterObjects[id]),
            });

            await call(commands, 'getEasyMode', createSocket().socket);

            deepStrictEqual(calls.getForeignObjectAsync[0][1], { user: 'system.user.viewer' });
        });

        it('delivers all enabled instances with configuration in non-strict mode', async () => {
            const rows = [
                { value: { _id: 'system.adapter.hm-rpc.0', common: { enabled: true } } },
                { value: { _id: 'system.adapter.javascript.0', common: { enabled: false } } },
                { value: { _id: 'system.adapter.backitup.0', common: { enabled: true, noConfig: true } } },
                {
                    value: {
                        _id: 'system.adapter.backitup.1',
                        common: { enabled: true, noConfig: true, adminTab: {} },
                    },
                },
            ];
            const { commands, calls } = create({
                config: {},
                getObjectView: (design, search, params, options, cb) => cb(null, { rows }),
                getForeignObjectAsync: id => Promise.resolve(adapterObjects[id]),
            });

            const [error, result] = await call(commands, 'getEasyMode', createSocket().socket);

            strictEqual(error, null);
            strictEqual(result.strict, false);
            deepStrictEqual(
                result.configs.map(config => config.id),
                ['hm-rpc.0'],
            );
            strictEqual(calls.getObjectView[0][1], 'instance');
        });

        it('requires the right to read objects', async () => {
            const { commands } = create({ config: { accessLimit: true } });
            const [error] = await call(commands, 'getEasyMode', createSocket(userAcl()).socket);
            strictEqual(error, ERROR_PERMISSION);
        });
    });

    describe('getAdapters', () => {
        const rows = [
            {
                value: {
                    _id: 'system.adapter.hm-rpc',
                    common: { name: 'hm-rpc', news: { '1.0.0': 'x' }, jsonConfig: true },
                    native: { big: 'data' },
                },
            },
            {
                value: {
                    _id: 'system.adapter.javascript',
                    common: { name: 'javascript', adminUI: { config: 'json' } },
                    native: {},
                },
            },
        ];

        it('delivers all adapters without news and native part', async () => {
            const { commands, calls } = create({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows: structuredClone(rows) }),
            });

            const [error, adapters] = await call(commands, 'getAdapters', createSocket().socket, '');

            strictEqual(error, null);
            strictEqual(adapters.length, 2);
            strictEqual(adapters[0].common.news, undefined);
            strictEqual(adapters[0].native, undefined);
            // old style configuration is converted to adminUI
            deepStrictEqual(adapters[0].common.adminUI, { config: 'json' });
            deepStrictEqual(calls.getObjectView[0][2], {
                startkey: 'system.adapter.',
                endkey: 'system.adapter.\u9999',
            });
        });

        // Regression, fixed: the filter compares the adapter name with `this.adapterName` instead of the requested
        // `adapterName`, so asking for a specific adapter delivers an empty list.
        it('delivers only the requested adapter', async () => {
            const { commands } = create({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows: structuredClone(rows) }),
            });

            const [, adapters] = await call(commands, 'getAdapters', createSocket().socket, 'javascript');

            deepStrictEqual(
                adapters.map(obj => obj.common.name),
                ['javascript'],
            );
        });

        it('delivers the error of the view', async () => {
            const { commands } = create({
                getObjectView: (design, search, params, options, cb) => cb('view error'),
            });

            const [error] = await call(commands, 'getAdapters', createSocket().socket, '');

            strictEqual(error, 'view error');
        });

        it('requires the right to read objects', async () => {
            const { commands, calls } = create();
            const [error] = await call(commands, 'getAdapters', createSocket(userAcl()).socket, '');
            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getObjectView, undefined);
        });
    });

    describe('updateLicenses', () => {
        it('asks the host if the controller has a license manager', async () => {
            const licenses = [{ id: '1', product: 'iobroker.vis' }];
            const { commands, calls } = create({
                supportsFeature: feature => feature === 'CONTROLLER_LICENSE_MANAGER',
                sendToHost: (host, command, message, cb) => cb({ result: licenses }),
            });

            const [error, result] = await call(commands, 'updateLicenses', createSocket().socket, 'login', 'pass');

            strictEqual(error, undefined);
            deepStrictEqual(result, licenses);
            strictEqual(calls.sendToHost[0][0], 'myHost');
            strictEqual(calls.sendToHost[0][1], 'updateLicenses');
            deepStrictEqual(calls.sendToHost[0][2], { login: 'login', password: 'pass' });
        });

        it('delivers the error of the host', async () => {
            const { commands } = create({
                supportsFeature: () => true,
                sendToHost: (host, command, message, cb) => cb({ error: 'Authentication required' }),
            });

            const [error] = await call(commands, 'updateLicenses', createSocket().socket, 'login', 'wrong');

            strictEqual(error, 'Authentication required');
        });

        it('reports missing credentials with an old controller', async () => {
            const { commands, calls } = create({
                getForeignObjectAsync: () => Promise.resolve({ native: {} }),
            });

            const [error] = await call(commands, 'updateLicenses', createSocket().socket, '', '');

            strictEqual(error, 'No password or login');
            strictEqual(calls.setForeignObjectAsync, undefined);
        });

        it('clears the stored licenses if there are no credentials with an old controller', async () => {
            const systemLicenses = { native: { licenses: [{ id: '1' }] } };
            const { commands, calls } = create({
                getForeignObjectAsync: () => Promise.resolve(systemLicenses),
            });

            const [error] = await call(commands, 'updateLicenses', createSocket().socket, '', '');

            strictEqual(error, 'No password or login');
            strictEqual(calls.setForeignObjectAsync[0][0], 'system.licenses');
            deepStrictEqual(calls.setForeignObjectAsync[0][1].native.licenses, []);
            ok(calls.setForeignObjectAsync[0][1].native.readTime);
        });

        it('requires the right to write objects', async () => {
            const { commands, calls } = create({ supportsFeature: () => true });

            const [error] = await call(
                commands,
                'updateLicenses',
                createSocket(userAcl({ object: { read: true } })).socket,
                'l',
                'p',
            );

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.sendToHost, undefined);
        });
    });

    describe('compact commands', () => {
        it('getCompactInstances delivers only the main attributes of instances', async () => {
            const rows = [
                {
                    id: 'system.adapter.hm-rpc.0',
                    value: {
                        common: {
                            name: 'hm-rpc',
                            icon: 'hm.png',
                            enabled: true,
                            version: '1.0.0',
                            adminTab: undefined,
                            news: { big: 'x' },
                        },
                        native: { secret: 'x' },
                    },
                },
            ];
            const { commands } = create({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows }),
            });

            const [error, result] = await call(commands, 'getCompactInstances', createSocket().socket);

            strictEqual(error, null);
            deepStrictEqual(result, {
                'system.adapter.hm-rpc.0': {
                    adminTab: undefined,
                    name: 'hm-rpc',
                    icon: 'hm.png',
                    enabled: true,
                    version: '1.0.0',
                },
            });
        });

        it('getCompactInstances delivers the error of the view', async () => {
            const { commands } = create({ getObjectView: (design, search, params, options, cb) => cb('err') });
            const [error] = await call(commands, 'getCompactInstances', createSocket().socket);
            strictEqual(error, 'err');
        });

        it('getCompactAdapters delivers icon, version and ignored version by adapter name', async () => {
            const rows = [
                { value: { common: { name: 'hm-rpc', icon: 'hm.png', version: '1.0.0' } } },
                { value: { common: { name: 'vis', icon: 'vis.png', version: '2.0.0', ignoreVersion: '2.1.0' } } },
                { value: { common: {} } },
                { value: null },
            ];
            const { commands } = create({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows }),
            });

            const [error, result] = await call(commands, 'getCompactAdapters', createSocket().socket);

            strictEqual(error, null);
            deepStrictEqual(result, {
                'hm-rpc': { icon: 'hm.png', v: '1.0.0' },
                vis: { icon: 'vis.png', v: '2.0.0', iv: '2.1.0' },
            });
        });

        it('getCompactInstalled delivers only the versions and skips "hosts"', async () => {
            const { commands, calls } = create({
                sendToHost: (host, command, message, cb) =>
                    cb({ 'hm-rpc': { version: '1.0.0', desc: 'x' }, hosts: { a: 1 }, vis: { version: '2.0.0' } }),
            });

            const [result] = await call(commands, 'getCompactInstalled', createSocket().socket, 'system.host.first');

            deepStrictEqual(result, { 'hm-rpc': { version: '1.0.0' }, vis: { version: '2.0.0' } });
            strictEqual(calls.sendToHost[0][1], 'getInstalled');
        });

        it('getCompactInstalled requires the "other.sendto" right', async () => {
            const { commands, calls } = create();
            const [error] = await call(commands, 'getCompactInstalled', createSocket(userAcl()).socket, 'h');
            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.sendToHost, undefined);
        });

        it('getCompactRepository delivers version and icon', async () => {
            const { commands, calls } = create({
                sendToHost: (host, command, message, cb) =>
                    cb({ 'hm-rpc': { version: '1.0.0', extIcon: 'https://x/hm.png', news: {} } }),
            });

            const [result] = await call(commands, 'getCompactRepository', createSocket().socket, 'system.host.first');

            deepStrictEqual(result, { 'hm-rpc': { version: '1.0.0', icon: 'https://x/hm.png' } });
            strictEqual(calls.sendToHost[0][1], 'getRepository');
        });

        it('getCompactRepository delivers an empty object if the host has no repository', async () => {
            const { commands } = create({ sendToHost: (host, command, message, cb) => cb(null) });
            const [result] = await call(commands, 'getCompactRepository', createSocket().socket, 'h');
            deepStrictEqual(result, {});
        });

        it('getCompactSystemRepositories reduces the repository content to _repoInfo', async () => {
            const repositories = {
                common: { name: 'System repositories' },
                native: {
                    repositories: {
                        stable: {
                            link: 'http://download.iobroker.net/sources-dist.json',
                            json: { _repoInfo: { stable: true }, 'hm-rpc': { version: '1.0.0' } },
                        },
                        beta: { link: 'http://x', json: null },
                    },
                },
            };
            const { commands, calls } = create({
                getForeignObject: (id, options, cb) => cb(null, repositories),
            });

            const [error, result] = await call(commands, 'getCompactSystemRepositories', createSocket().socket);

            strictEqual(error, null);
            deepStrictEqual(result.native.repositories.stable.json, { _repoInfo: { stable: true } });
            strictEqual(result.native.repositories.beta.json, null);
            strictEqual(calls.getForeignObject[0][0], 'system.repositories');
        });

        it('getCompactHosts delivers only the main attributes of hosts', async () => {
            const rows = [
                {
                    value: {
                        _id: 'system.host.first',
                        common: { name: 'first', icon: 'i', color: 'red', installedVersion: '7.0.0', cmd: 'x' },
                        native: { hardware: { networkInterfaces: { eth0: [] }, cpus: [] }, os: {} },
                    },
                },
                { value: { _id: 'system.host.second' } },
            ];
            const { commands } = create({
                getObjectView: (design, search, params, options, cb) => cb(null, { rows }),
            });

            const [error, result] = await call(commands, 'getCompactHosts', createSocket().socket);

            strictEqual(error, null);
            deepStrictEqual(result, [
                {
                    _id: 'system.host.first',
                    common: { name: 'first', icon: 'i', color: 'red', installedVersion: '7.0.0' },
                    native: { hardware: { networkInterfaces: { eth0: [] } } },
                },
                {
                    _id: 'system.host.second',
                    common: { name: undefined, icon: undefined, color: undefined, installedVersion: undefined },
                    native: { hardware: { networkInterfaces: undefined } },
                },
            ]);
        });

        it('compact commands require the right to read objects', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl());

            for (const name of [
                'getCompactInstances',
                'getCompactAdapters',
                'getCompactSystemRepositories',
                'getCompactHosts',
            ]) {
                const [error] = await call(commands, name, socket);
                strictEqual(error, ERROR_PERMISSION, name);
            }
            strictEqual(calls.getObjectView, undefined);
            strictEqual(calls.getForeignObject, undefined);
        });
    });

    describe('objects', () => {
        const objects = {
            'a.0.noAcl': { _id: 'a.0.noAcl', common: {} },
            'a.0.own': {
                _id: 'a.0.own',
                common: {},
                acl: { owner: 'system.user.guest', ownerGroup: 'system.group.x', object: 0x400 },
            },
            'a.0.ownNoRead': {
                _id: 'a.0.ownNoRead',
                common: {},
                acl: { owner: 'system.user.guest', ownerGroup: 'system.group.x', object: 0x044 },
            },
            'a.0.group': {
                _id: 'a.0.group',
                common: {},
                acl: { owner: 'system.user.admin', ownerGroup: 'system.group.user', object: 0x040 },
            },
            'a.0.groupNoRead': {
                _id: 'a.0.groupNoRead',
                common: {},
                acl: { owner: 'system.user.admin', ownerGroup: 'system.group.user', object: 0x604 },
            },
            'a.0.everybody': {
                _id: 'a.0.everybody',
                common: {},
                acl: { owner: 'system.user.admin', ownerGroup: 'system.group.administrator', object: 0x004 },
            },
            'a.0.private': {
                _id: 'a.0.private',
                common: {},
                acl: { owner: 'system.user.admin', ownerGroup: 'system.group.administrator', object: 0x600 },
            },
        };
        const visibleForGuest = ['a.0.everybody', 'a.0.group', 'a.0.noAcl', 'a.0.own'];

        it('getAllObjects delivers the whole cache to an administrator', async () => {
            const { commands, calls } = create({}, objects);

            const [error, result] = await call(commands, 'getAllObjects', createSocket().socket);

            strictEqual(error, null);
            strictEqual(result, objects);
            strictEqual(calls.getObjectList, undefined);
        });

        it('getAllObjects filters the cache by the object ACL for a normal user', async () => {
            const { commands } = create({}, objects);
            const { socket } = createSocket(userAcl({ object: { list: true } }));

            const [error, result] = await call(commands, 'getAllObjects', socket);

            strictEqual(error, null);
            deepStrictEqual(Object.keys(result).sort(), visibleForGuest);
        });

        it('getAllObjects delivers the whole cache to a member of the administrator group', async () => {
            const { commands } = create({}, objects);
            const { socket } = createSocket(userAcl({ object: { list: true } }, ['system.group.administrator']));

            const [, result] = await call(commands, 'getAllObjects', socket);

            deepStrictEqual(Object.keys(result).length, Object.keys(objects).length);
        });

        it('getAllObjects reads the object list from the database without cache', async () => {
            const rows = Object.values(objects).map(doc => ({ id: doc._id, doc }));
            const { commands, calls } = create({
                getObjectList: (params, options, cb) => cb(null, { rows }),
            });

            const [, all] = await call(commands, 'getAllObjects', createSocket().socket);
            deepStrictEqual(Object.keys(all).length, rows.length);
            deepStrictEqual(calls.getObjectList[0][0], { include_docs: true });

            const [, filtered] = await call(
                commands,
                'getAllObjects',
                createSocket(userAcl({ object: { list: true } })).socket,
            );
            deepStrictEqual(Object.keys(filtered).sort(), visibleForGuest);
            deepStrictEqual(calls.getObjectList[1][1], { user: 'system.user.guest' });
        });

        it('getAllObjects requires the "object.list" right', async () => {
            const { commands } = create({}, objects);
            const [error] = await call(commands, 'getAllObjects', createSocket(userAcl()).socket);
            strictEqual(error, ERROR_PERMISSION);
        });

        it('getObjects without a list delivers all objects', async () => {
            const { commands } = create({}, objects);
            const [, result] = await call(commands, 'getObjects', createSocket().socket);
            strictEqual(result, objects);
        });

        it('getObjects with an empty list delivers an empty object', async () => {
            const { commands, calls } = create({}, objects);
            const [error, result] = await call(commands, 'getObjects', createSocket().socket, []);
            strictEqual(error, null);
            deepStrictEqual(result, {});
            strictEqual(calls.getForeignObjects, undefined);
        });

        it('getObjects with a list reads the objects with the rights of the user', async () => {
            const { commands, calls } = create({
                getForeignObjects: (list, options, cb) => cb(null, { 'a.0.b': { _id: 'a.0.b' } }),
            });
            const { socket } = createSocket(userAcl({ object: { read: true } }));

            const [error, result] = await call(commands, 'getObjects', socket, ['a.0.b']);

            strictEqual(error, null);
            deepStrictEqual(result, { 'a.0.b': { _id: 'a.0.b' } });
            deepStrictEqual(calls.getForeignObjects[0][0], ['a.0.b']);
            deepStrictEqual(calls.getForeignObjects[0][1], { user: 'system.user.guest' });
        });

        it('getObjects with a list requires the "object.read" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { list: true } }));

            const [error] = await call(commands, 'getObjects', socket, ['a.0.b']);

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.getForeignObjects, undefined);
        });

        it('getObjects without callback only warns', () => {
            const { commands, logs } = create();
            commands.getCommandHandler('getObjects')(createSocket().socket, ['a']);
            ok(logs.warn.some(text => text.includes('Invalid callback')));
        });

        it('extendObject extends the object with the rights of the user', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { write: true } }));

            const [error, result] = await call(commands, 'extendObject', socket, 'a.0.b', { common: { name: 'x' } });

            strictEqual(error, null);
            deepStrictEqual(result, { id: 'a.0.b' });
            deepStrictEqual(calls.extendForeignObject[0].slice(0, 3), [
                'a.0.b',
                { common: { name: 'x' } },
                { user: 'system.user.guest' },
            ]);
        });

        it('extendObject requires the "object.write" right', async () => {
            const { commands, calls } = create();
            const [error] = await call(commands, 'extendObject', createSocket(userAcl()).socket, 'a.0.b', {});
            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.extendForeignObject, undefined);
        });

        it('extendObject converts an error to string', async () => {
            const { commands } = create({
                extendForeignObject: (id, obj, options, cb) => cb(new Error('Object not found')),
            });
            const [error] = await call(commands, 'extendObject', createSocket().socket, 'a.0.b', {});
            strictEqual(error, 'Object not found');
        });

        it('getForeignObjects reads by pattern with and without type', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'getForeignObjects', socket, 'a.0.*', 'state');
            await call(commands, 'getForeignObjects', socket, 'a.0.*');

            deepStrictEqual(calls.getForeignObjects[0].slice(0, 3), ['a.0.*', 'state', { user: ADMIN }]);
            deepStrictEqual(calls.getForeignObjects[1].slice(0, 2), ['a.0.*', { user: ADMIN }]);
        });

        it('getForeignObjects requires the "object.list" right', async () => {
            const { commands } = create();
            const [error] = await call(commands, 'getForeignObjects', createSocket(userAcl()).socket, '*', 'state');
            strictEqual(error, ERROR_PERMISSION);
        });

        it('delObject deletes recursively only on request', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'delObject', socket, 'a.0.b');
            await call(commands, 'delObject', socket, 'a.0.c', { recursive: true });
            await call(commands, 'delObject', socket, 'a.0.d', { recursive: false });

            deepStrictEqual(calls.delForeignObject[0].slice(0, 2), ['a.0.b', { user: ADMIN }]);
            deepStrictEqual(calls.delForeignObject[1].slice(0, 2), ['a.0.c', { user: ADMIN, recursive: true }]);
            deepStrictEqual(calls.delForeignObject[2].slice(0, 2), ['a.0.d', { user: ADMIN }]);
        });

        it('delObjects always deletes recursively', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket();

            await call(commands, 'delObjects', socket, 'a.0.b');
            await call(commands, 'delObjects', socket, 'a.0.c', null);
            await call(commands, 'delObjects', socket, 'a.0.d', { recursive: false });

            for (const args of calls.delForeignObject) {
                deepStrictEqual(args[1], { user: ADMIN, recursive: true });
            }
        });

        it('delObject and delObjects require the "object.delete" right', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { write: true } }));

            const [error1] = await call(commands, 'delObject', socket, 'a.0.b', null);
            const [error2] = await call(commands, 'delObjects', socket, 'a.0.b', null);

            strictEqual(error1, ERROR_PERMISSION);
            strictEqual(error2, ERROR_PERMISSION);
            strictEqual(calls.delForeignObject, undefined);
        });

        // Regression, fixed: the permission is checked before the optional `options` argument is shifted into `callback`,
        // so a client that omits the options never gets an answer, only a "permissionError" event.
        it('delObject and delObjects answer the permission error also without options', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ object: { write: true } }));

            const [error1] = await call(commands, 'delObject', socket, 'a.0.b');
            const [error2] = await call(commands, 'delObjects', socket, 'a.0.b');

            strictEqual(error1, ERROR_PERMISSION);
            strictEqual(error2, ERROR_PERMISSION);
            strictEqual(calls.delForeignObject, undefined);
        });
    });

    describe('writeFile', () => {
        it('decodes base64 data and writes it with the rights of the user', async () => {
            const { commands, calls } = create();
            const { socket } = createSocket(userAcl({ file: { write: true } }));
            const data = Buffer.from('hello world').toString('base64');

            const [error] = await call(commands, 'writeFile', socket, 'vis.0', 'main/file.txt', data);

            strictEqual(error, null);
            const [adapter, fileName, buffer, options] = calls.writeFile[0];
            strictEqual(adapter, 'vis.0');
            strictEqual(fileName, 'main/file.txt');
            ok(Buffer.isBuffer(buffer));
            strictEqual(buffer.toString(), 'hello world');
            deepStrictEqual(options, { user: 'system.user.guest' });
        });

        it('passes the file mode', async () => {
            const { commands, calls } = create();

            await call(commands, 'writeFile', createSocket().socket, 'vis.0', 'f.txt', '', { mode: 0x644 });

            deepStrictEqual(calls.writeFile[0][3], { user: ADMIN, mode: 0x644 });
        });

        it('ignores options without mode', async () => {
            const { commands, calls } = create();

            await call(commands, 'writeFile', createSocket().socket, 'vis.0', 'f.txt', '', {});

            deepStrictEqual(calls.writeFile[0][3], { user: ADMIN });
        });

        it('requires the "file.write" right', async () => {
            const { commands, calls } = create();

            const [error] = await call(
                commands,
                'writeFile',
                createSocket(userAcl({ file: { read: true } })).socket,
                'vis.0',
                'f.txt',
                '',
                {},
            );

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(calls.writeFile, undefined);
        });

        it('answers the missing right via the callback if the options are omitted', () => {
            const { commands, calls } = create();
            const { socket, emitted } = createSocket(userAcl({ file: { read: true } }));
            let error;

            commands.getCommandHandler('writeFile')(socket, 'vis.0', 'f.txt', '', err => (error = err));

            strictEqual(error, ERROR_PERMISSION);
            strictEqual(emitted.length, 0);
            strictEqual(calls.writeFile, undefined);
        });
    });

    describe('applyCommands', () => {
        it('does not execute admin commands on an expired session', () => {
            const mock = createAdapter();
            const commands = new SocketCommandsAdmin(mock.adapter, () => false);
            instances.push(commands);
            const { socket } = createSocket();
            const handlers = {};
            socket.on = (name, cb) => (handlers[name] = cb);

            commands.applyCommands(socket);
            let answered = false;
            handlers.addUser('benjamin', 'pass', () => (answered = true));

            strictEqual(answered, false);
            strictEqual(mock.calls.getForeignObjectAsync, undefined);
        });
    });
});
