const { deepStrictEqual, ok, strictEqual } = require('assert');
const { SocketCommands } = require('../build/index');

const ADMIN = 'system.user.admin';
const USER = 'system.user.user';

/** ACL of a user without any rights */
function noRights() {
    return {
        user: USER,
        object: { read: false, list: false, write: false, delete: false },
        state: { read: false, list: false, write: false, create: false, delete: false },
        file: { read: false, list: false, write: false, create: false, delete: false },
        users: { create: false, write: false, delete: false },
        other: { http: false, execute: false, sendto: false },
    };
}

/** ACL of a user with all rights, but who is not the admin */
function allRights() {
    return {
        user: USER,
        object: { read: true, list: true, write: true, delete: true },
        state: { read: true, list: true, write: true, create: true, delete: true },
        file: { read: true, list: true, write: true, create: true, delete: true },
        users: { create: true, write: true, delete: true },
        other: { http: true, execute: true, sendto: true },
    };
}

/**
 * Adapter mock that records every call. Each method can be overridden by `overrides`.
 */
function createAdapter(overrides) {
    const calls = [];
    const logs = { silly: [], debug: [], info: [], warn: [], error: [] };
    const record =
        name =>
        (...args) => {
            calls.push({ name, args });
            // the callback is not necessarily the last argument: `sendTo`/`sendToHost` take send
            // options after it, so take the last argument that is a function
            const cb = [...args].reverse().find(a => typeof a === 'function');
            if (typeof cb === 'function') {
                cb(null);
            }
        };
    const adapter = {
        name: 'test',
        version: '1.2.3',
        config: { auth: true },
        log: {
            level: 'info',
            silly: text => logs.silly.push(text),
            debug: text => logs.debug.push(text),
            info: text => logs.info.push(text),
            warn: text => logs.warn.push(text),
            error: text => logs.error.push(text),
        },
        readFile: record('readFile'),
        writeFile: record('writeFile'),
        unlink: record('unlink'),
        rename: record('rename'),
        mkdir: record('mkdir'),
        readDir: record('readDir'),
        chmodFile: record('chmodFile'),
        chownFile: record('chownFile'),
        fileExists: record('fileExists'),
        getHistory: record('getHistory'),
        getObjectView: record('getObjectView'),
        sendTo: record('sendTo'),
        sendToHost: record('sendToHost'),
        getSession: record('getSession'),
        destroySession: record('destroySession'),
        supportsFeature: feature => feature === 'ALIAS',
        readDirAsync: async (...args) => {
            calls.push({ name: 'readDirAsync', args });
            throw new Error('Not exists');
        },
        unlinkAsync: async (...args) => {
            calls.push({ name: 'unlinkAsync', args });
        },
        renameAsync: async (...args) => {
            calls.push({ name: 'renameAsync', args });
        },
        subscribeForeignStatesAsync: async (...args) => {
            calls.push({ name: 'subscribeForeignStatesAsync', args });
        },
        unsubscribeForeignStatesAsync: async (...args) => {
            calls.push({ name: 'unsubscribeForeignStatesAsync', args });
        },
        subscribeForeignFiles: async (...args) => {
            calls.push({ name: 'subscribeForeignFiles', args });
        },
        unsubscribeForeignFiles: async (...args) => {
            calls.push({ name: 'unsubscribeForeignFiles', args });
        },
    };
    Object.assign(adapter, overrides);
    return { adapter, calls, logs };
}

function createSocket(acl, id) {
    const emitted = [];
    const socket = {
        id: id || 'socket1',
        _acl: acl === undefined ? { user: ADMIN } : acl,
        conn: { request: { query: {}, headers: {} } },
        emit: (...args) => emitted.push(args),
    };
    return { socket, emitted };
}

/** Attach the commands to the socket the way the transport does and return the handlers */
function attach(commands, socket) {
    const handlers = {};
    socket.on = (name, cb) => (handlers[name] = cb);
    commands.applyCommands(socket);
    return handlers;
}

function setup(acl, overrides) {
    const { adapter, calls, logs } = createAdapter(overrides);
    const commands = new SocketCommands(adapter, () => true, { language: 'en', ratings: null, ratingTimeout: null });
    const { socket, emitted } = createSocket(acl);
    const handlers = attach(commands, socket);
    return { adapter, calls, logs, commands, socket, emitted, handlers };
}

/** Call a handler and wait for its callback */
function call(handlers, name, ...args) {
    return new Promise(resolve => handlers[name](...args, (...result) => resolve(result)));
}

function callsOf(calls, name) {
    return calls.filter(c => c.name === name);
}

describe('SocketCommands file commands', () => {
    describe('readFile', () => {
        it('reads the file with the user of the socket and passes the result through', async () => {
            const { handlers, calls } = setup(undefined, {
                readFile: (adapter, name, options, cb) => {
                    calls.push({ name: 'readFile', args: [adapter, name, options] });
                    cb(null, 'content', 'text/plain');
                },
            });
            const [err, data, mime] = await call(handlers, 'readFile', 'vis.0', 'main/a.txt');
            strictEqual(err, null);
            strictEqual(data, 'content');
            strictEqual(mime, 'text/plain');
            deepStrictEqual(calls[0].args, ['vis.0', 'main/a.txt', { user: ADMIN }]);
        });

        it('converts an Error of the adapter into a string', async () => {
            const { handlers } = setup(undefined, {
                readFile: (_a, _n, _o, cb) => cb(new Error('Not exists')),
            });
            const [err] = await call(handlers, 'readFile', 'vis.0', 'x');
            strictEqual(err, 'Not exists');
        });

        it('answers with the message of an exception thrown by the adapter', async () => {
            const { handlers, logs } = setup(undefined, {
                readFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'readFile', 'vis.0', 'x');
            strictEqual(err, 'boom');
            ok(logs.error.some(t => t.includes('[readFile]')));
        });

        it('denies reading without file.read permission', async () => {
            const { handlers, calls, logs } = setup(noRights());
            const [err] = await call(handlers, 'readFile', 'vis.0', 'x');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'readFile').length, 0);
            ok(logs.warn.some(t => t.includes('"file"."read"')));
        });

        it('allows reading for a non-admin user with file.read permission', async () => {
            const acl = noRights();
            acl.file.read = true;
            const { handlers, calls } = setup(acl);
            const [err] = await call(handlers, 'readFile', 'vis.0', 'x');
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'readFile')[0].args[2], { user: USER });
        });

        it('emits a permissionError event if no callback was given', () => {
            const { handlers, emitted } = setup(noRights());
            handlers.readFile('vis.0', 'x', undefined);
            strictEqual(emitted.length, 1);
            strictEqual(emitted[0][0], SocketCommands.ERROR_PERMISSION);
            strictEqual(emitted[0][1].command, 'readFile');
            strictEqual(emitted[0][1].type, 'file');
            strictEqual(emitted[0][1].operation, 'read');
        });
    });

    describe('readFile64', () => {
        function withFile(data, type) {
            return setup(undefined, { readFile: (_a, _n, _o, cb) => cb(null, data, type) });
        }

        it('encodes a binary buffer as base64', async () => {
            const { handlers } = withFile(Buffer.from([0, 1, 2, 255]), 'application/octet-stream');
            const [err, data64, type] = await call(handlers, 'readFile64', 'vis.0', 'a.bin');
            strictEqual(err, null);
            strictEqual(data64, Buffer.from([0, 1, 2, 255]).toString('base64'));
            strictEqual(type, 'application/octet-stream');
        });

        it('encodes a string as base64', async () => {
            const { handlers } = withFile('hällo', 'text/plain');
            const [, data64] = await call(handlers, 'readFile64', 'vis.0', 'a.txt');
            strictEqual(Buffer.from(data64, 'base64').toString('utf8'), 'hällo');
        });

        it('URI-encodes JSON before base64 so that unicode survives atob() in the browser', async () => {
            const json = '{"a":"ü"}';
            const { handlers } = withFile(json, 'application/json');
            const [, data64] = await call(handlers, 'readFile64', 'vis.0', 'a.json');
            strictEqual(decodeURIComponent(Buffer.from(data64, 'base64').toString()), json);
        });

        it('URI-encodes a .json5 file even if the mime type is unknown', async () => {
            const { handlers } = withFile('{a: "ü"}', undefined);
            const [, data64] = await call(handlers, 'readFile64', 'vis.0', 'CONFIG.JSON5');
            strictEqual(decodeURIComponent(Buffer.from(data64, 'base64').toString()), '{a: "ü"}');
        });

        it('returns an empty string and the error if the file cannot be read', async () => {
            const { handlers } = setup(undefined, { readFile: (_a, _n, _o, cb) => cb('Not exists') });
            const [err, data64] = await call(handlers, 'readFile64', 'vis.0', 'a.txt');
            strictEqual(err, 'Not exists');
            strictEqual(data64, '');
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                readFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'readFile64', 'vis.0', 'a.txt');
            strictEqual(err, 'boom');
        });

        it('denies reading without file.read permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'readFile64', 'vis.0', 'a.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'readFile').length, 0);
        });
    });

    describe('writeFile64', () => {
        it('decodes base64 and writes a buffer with the user of the socket', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'writeFile64', 'vis.0', 'a.bin', Buffer.from('hello').toString('base64'));
            strictEqual(err, null);
            const [adapterName, name, data, options] = callsOf(calls, 'writeFile')[0].args;
            strictEqual(adapterName, 'vis.0');
            strictEqual(name, 'a.bin');
            ok(Buffer.isBuffer(data));
            strictEqual(data.toString(), 'hello');
            deepStrictEqual(options, { user: ADMIN });
        });

        it('passes the file mode if given', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'writeFile64', 'vis.0', 'a.bin', 'aGVsbG8=', { mode: 0x644 });
            deepStrictEqual(callsOf(calls, 'writeFile')[0].args[3], { user: ADMIN, mode: 0x644 });
        });

        it('ignores options without mode', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'writeFile64', 'vis.0', 'a.bin', 'aGVsbG8=', {});
            deepStrictEqual(callsOf(calls, 'writeFile')[0].args[3], { user: ADMIN });
        });

        it('rejects empty data without writing', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'writeFile64', 'vis.0', 'a.bin', '');
            strictEqual(err, 'No data provided');
            strictEqual(callsOf(calls, 'writeFile').length, 0);
        });

        it('converts an Error of the adapter into a string', async () => {
            const { handlers } = setup(undefined, { writeFile: (_a, _n, _d, _o, cb) => cb(new Error('disk full')) });
            const [err] = await call(handlers, 'writeFile64', 'vis.0', 'a.bin', 'aGVsbG8=');
            strictEqual(err, 'disk full');
        });

        it('reports an exception of the adapter as a conversion error', async () => {
            const { handlers } = setup(undefined, {
                writeFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'writeFile64', 'vis.0', 'a.bin', 'aGVsbG8=');
            ok(err.startsWith('Cannot convert data:'));
            ok(err.includes('boom'));
        });

        it('denies writing without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'writeFile64', 'vis.0', 'a.bin', 'aGVsbG8=');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'writeFile').length, 0);
        });
    });

    describe('writeFile (deprecated)', () => {
        it('writes the text as it is', async () => {
            const { handlers, calls, logs } = setup();
            const [err] = await call(handlers, 'writeFile', 'vis.0', 'a.txt', 'text');
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'writeFile')[0].args.slice(0, 4), ['vis.0', 'a.txt', 'text', { user: ADMIN }]);
            ok(logs.debug.some(t => t.includes('deprecated')));
        });

        it('passes the file mode if given', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'writeFile', 'vis.0', 'a.txt', 'text', { mode: 0x600 });
            deepStrictEqual(callsOf(calls, 'writeFile')[0].args[3], { user: ADMIN, mode: 0x600 });
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                writeFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'writeFile', 'vis.0', 'a.txt', 'text');
            strictEqual(err, 'boom');
        });

        it('denies writing without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'writeFile', 'vis.0', 'a.txt', 'text', {});
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'writeFile').length, 0);
        });

        // Regression, fixed: writeFile checks the permissions before it moves the callback from `options` to
        // `callback`, so a client that omits the options never gets an answer: the permission error
        // is emitted as an event and the callback is not called.
        it('denies writing without file.write permission if the options are omitted', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'writeFile', 'vis.0', 'a.txt', 'text');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'writeFile').length, 0);
        });
    });

    /** Tree of files for readDirAsync: a folder maps to its entries, anything else is a file */
    function createTree(tree) {
        return async (_adapter, name) => {
            if (tree[name]) {
                return tree[name].map(file => ({ file }));
            }
            throw new Error('Not exists');
        };
    }

    describe('unlink', () => {
        it('deletes a single file', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'unlink', 'vis.0', 'main/a.txt');
            strictEqual(err, undefined);
            const unlinks = callsOf(calls, 'unlinkAsync');
            strictEqual(unlinks.length, 1);
            deepStrictEqual(unlinks[0].args, ['vis.0', 'main/a.txt', { user: ADMIN }]);
        });

        it('deletes a folder recursively, children first, and strips a trailing slash', async () => {
            const { handlers, calls } = setup(undefined, {
                readDirAsync: createTree({ main: ['a.txt', 'sub'], 'main/sub': ['b.txt'] }),
            });
            const [err] = await call(handlers, 'unlink', 'vis.0', 'main/');
            strictEqual(err, undefined);
            deepStrictEqual(
                callsOf(calls, 'unlinkAsync').map(c => c.args[1]),
                ['main/a.txt', 'main/sub/b.txt', 'main/sub', 'main'],
            );
        });

        // Regression, fixed: #unlink() calls itself for the children without the options, so every file inside
        // the folder is deleted without the user of the socket, i.e. without the permission check
        // of js-controller.
        it('deletes the children of a folder with the user of the socket', async () => {
            const { handlers, calls } = setup(allRights(), {
                readDirAsync: createTree({ main: ['a.txt'] }),
            });
            await call(handlers, 'unlink', 'vis.0', 'main');
            for (const c of callsOf(calls, 'unlinkAsync')) {
                deepStrictEqual(c.args[2], { user: USER }, `${c.args[1]} must be deleted as ${USER}`);
            }
        });

        it('ignores "Not exists" of the adapter', async () => {
            const { handlers } = setup(undefined, {
                unlinkAsync: async () => {
                    throw new Error('Not exists');
                },
            });
            const [err] = await call(handlers, 'unlink', 'vis.0', 'a.txt');
            strictEqual(err, undefined);
        });

        it('reports any other error of unlink as string', async () => {
            const { handlers } = setup(undefined, {
                unlinkAsync: async () => {
                    throw new Error('permissionError');
                },
            });
            const [err] = await call(handlers, 'unlink', 'vis.0', 'a.txt');
            strictEqual(err, 'permissionError');
        });

        it('reports any other error of readDir as string and does not delete', async () => {
            const { handlers, calls } = setup(undefined, {
                readDirAsync: async () => {
                    throw new Error('DB closed');
                },
            });
            const [err] = await call(handlers, 'unlink', 'vis.0', 'a.txt');
            strictEqual(err, 'DB closed');
            strictEqual(callsOf(calls, 'unlinkAsync').length, 0);
        });

        it('denies deletion without file.delete permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'unlink', 'vis.0', 'a.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'readDirAsync').length, 0);
            strictEqual(callsOf(calls, 'unlinkAsync').length, 0);
        });
    });

    describe('deleteFile', () => {
        it('deletes only the given file with the callback API', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'deleteFile', 'vis.0', 'a.txt');
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'unlink')[0].args.slice(0, 3), ['vis.0', 'a.txt', { user: ADMIN }]);
            strictEqual(callsOf(calls, 'readDirAsync').length, 0, 'must not look for children');
        });

        it('converts an Error into a string', async () => {
            const { handlers } = setup(undefined, { unlink: (_a, _n, _o, cb) => cb(new Error('Not exists')) });
            const [err] = await call(handlers, 'deleteFile', 'vis.0', 'a.txt');
            strictEqual(err, 'Not exists');
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                unlink: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'deleteFile', 'vis.0', 'a.txt');
            strictEqual(err, 'boom');
        });

        it('denies deletion without file.delete permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'deleteFile', 'vis.0', 'a.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'unlink').length, 0);
        });
    });

    describe('deleteFolder', () => {
        it('deletes a folder recursively and answers with null', async () => {
            const { handlers, calls } = setup(undefined, { readDirAsync: createTree({ main: ['a.txt'] }) });
            const [err] = await call(handlers, 'deleteFolder', 'vis.0', 'main');
            strictEqual(err, null);
            deepStrictEqual(
                callsOf(calls, 'unlinkAsync').map(c => c.args[1]),
                ['main/a.txt', 'main'],
            );
        });

        it('reports an error as string', async () => {
            const { handlers } = setup(undefined, {
                unlinkAsync: async () => {
                    throw new Error('locked');
                },
            });
            const [err] = await call(handlers, 'deleteFolder', 'vis.0', 'main');
            strictEqual(err, 'locked');
        });

        it('denies deletion without file.delete permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'deleteFolder', 'vis.0', 'main');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'unlinkAsync').length, 0);
        });
    });

    describe('renameFile', () => {
        it('renames with the user of the socket', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'renameFile', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'rename')[0].args.slice(0, 4), ['vis.0', 'a.txt', 'b.txt', { user: ADMIN }]);
        });

        it('converts an Error into a string', async () => {
            const { handlers } = setup(undefined, { rename: (_a, _o, _n, _opt, cb) => cb(new Error('exists')) });
            const [err] = await call(handlers, 'renameFile', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, 'exists');
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                rename: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'renameFile', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, 'boom');
        });

        it('denies renaming without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'renameFile', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'rename').length, 0);
        });
    });

    describe('rename', () => {
        it('renames a single file', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'rename', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, undefined);
            const renames = callsOf(calls, 'renameAsync');
            strictEqual(renames.length, 1);
            deepStrictEqual(renames[0].args, ['vis.0', 'a.txt', 'b.txt', { user: ADMIN }]);
        });

        it('renames a folder recursively and strips trailing slashes of both names', async () => {
            const { handlers, calls } = setup(undefined, {
                readDirAsync: createTree({ old: ['a.txt', 'sub'], 'old/sub': ['b.txt'] }),
            });
            const [err] = await call(handlers, 'rename', 'vis.0', 'old/', 'new/');
            strictEqual(err, undefined);
            deepStrictEqual(
                callsOf(calls, 'renameAsync').map(c => [c.args[1], c.args[2]]),
                [
                    ['old/a.txt', 'new/a.txt'],
                    ['old/sub/b.txt', 'new/sub/b.txt'],
                    ['old/sub', 'new/sub'],
                    ['old', 'new'],
                ],
            );
        });

        // Regression, fixed: #rename() calls itself for the children without the options, so every file inside
        // the folder is renamed without the user of the socket, i.e. without the permission check
        // of js-controller.
        it('renames the children of a folder with the user of the socket', async () => {
            const { handlers, calls } = setup(allRights(), { readDirAsync: createTree({ old: ['a.txt'] }) });
            await call(handlers, 'rename', 'vis.0', 'old', 'new');
            for (const c of callsOf(calls, 'renameAsync')) {
                deepStrictEqual(c.args[3], { user: USER }, `${c.args[1]} must be renamed as ${USER}`);
            }
        });

        it('ignores "Not exists" of the adapter', async () => {
            const { handlers } = setup(undefined, {
                renameAsync: async () => {
                    throw new Error('Not exists');
                },
            });
            const [err] = await call(handlers, 'rename', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, undefined);
        });

        it('reports any other error as string', async () => {
            const { handlers } = setup(undefined, {
                renameAsync: async () => {
                    throw new Error('target exists');
                },
            });
            const [err] = await call(handlers, 'rename', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, 'target exists');
        });

        it('denies renaming without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'rename', 'vis.0', 'a.txt', 'b.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'renameAsync').length, 0);
        });
    });

    describe('mkdir', () => {
        it('creates the folder with the user of the socket', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'mkdir', 'vis.0', 'main');
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'mkdir')[0].args.slice(0, 3), ['vis.0', 'main', { user: ADMIN }]);
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                mkdir: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'mkdir', 'vis.0', 'main');
            strictEqual(err, 'boom');
        });

        it('denies creating without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'mkdir', 'vis.0', 'main');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'mkdir').length, 0);
        });
    });

    describe('readDir', () => {
        const files = [{ file: 'a.txt', isDir: false }];

        it('lists a folder, callback as fourth argument', async () => {
            const { handlers, calls } = setup(undefined, {
                readDir: (a, n, o, cb) => {
                    calls.push({ name: 'readDir', args: [a, n, o] });
                    cb(null, files);
                },
            });
            const [err, result] = await call(handlers, 'readDir', 'vis.0', 'main');
            strictEqual(err, null);
            deepStrictEqual(result, files);
            deepStrictEqual(calls[0].args, ['vis.0', 'main', { user: ADMIN }]);
        });

        it('lists a folder with options and callback', async () => {
            const { handlers } = setup(undefined, { readDir: (_a, _n, _o, cb) => cb(null, files) });
            const [err, result] = await call(handlers, 'readDir', 'vis.0', 'main', { filter: true });
            strictEqual(err, null);
            deepStrictEqual(result, files);
        });

        it('converts an Error into a string', async () => {
            const { handlers } = setup(undefined, { readDir: (_a, _n, _o, cb) => cb(new Error('Not exists')) });
            const [err] = await call(handlers, 'readDir', 'vis.0', 'main');
            strictEqual(err, 'Not exists');
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                readDir: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'readDir', 'vis.0', 'main');
            strictEqual(err, 'boom');
        });

        it('denies listing without file.list permission', async () => {
            const acl = noRights();
            acl.file.read = true;
            const { handlers, calls } = setup(acl);
            const [err] = await call(handlers, 'readDir', 'vis.0', 'main');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'readDir').length, 0);
        });
    });

    describe('chmodFile', () => {
        it('changes the mode with the user of the socket', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'chmodFile', 'vis.0', 'a.txt', { mode: 0x644 });
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'chmodFile')[0].args.slice(0, 3), [
                'vis.0',
                'a.txt',
                { user: ADMIN, mode: 0x644 },
            ]);
        });

        it('accepts mode 0', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'chmodFile', 'vis.0', 'a.txt', { mode: 0 });
            strictEqual(callsOf(calls, 'chmodFile')[0].args[2].mode, 0);
        });

        it('rejects missing options or a missing mode', async () => {
            for (const options of [undefined, null, {}]) {
                const { handlers, calls } = setup();
                const [err] = await call(handlers, 'chmodFile', 'vis.0', 'a.txt', options);
                strictEqual(err, 'no options');
                strictEqual(callsOf(calls, 'chmodFile').length, 0);
            }
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                chmodFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'chmodFile', 'vis.0', 'a.txt', { mode: 0x644 });
            strictEqual(err, 'boom');
        });

        it('denies changing without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'chmodFile', 'vis.0', 'a.txt', { mode: 0x644 });
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'chmodFile').length, 0);
        });
    });

    describe('chownFile', () => {
        it('changes the owner with the user of the socket', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'chownFile', 'vis.0', 'a.txt', {
                owner: 'system.user.user',
                ownerGroup: 'system.group.user',
            });
            strictEqual(err, null);
            deepStrictEqual(callsOf(calls, 'chownFile')[0].args[2], {
                user: ADMIN,
                owner: 'system.user.user',
                ownerGroup: 'system.group.user',
            });
        });

        it('rejects missing options', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'chownFile', 'vis.0', 'a.txt', undefined);
            strictEqual(err, 'no options');
            strictEqual(callsOf(calls, 'chownFile').length, 0);
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                chownFile: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'chownFile', 'vis.0', 'a.txt', { owner: 'system.user.user' });
            strictEqual(err, 'boom');
        });

        it('denies changing without file.write permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'chownFile', 'vis.0', 'a.txt', { owner: 'system.user.user' });
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'chownFile').length, 0);
        });
    });

    describe('fileExists', () => {
        it('answers whether the file exists', async () => {
            const { handlers, calls } = setup(undefined, {
                fileExists: (a, n, o, cb) => {
                    calls.push({ name: 'fileExists', args: [a, n, o] });
                    cb(null, true);
                },
            });
            const [err, exists] = await call(handlers, 'fileExists', 'vis.0', 'a.txt');
            strictEqual(err, null);
            strictEqual(exists, true);
            deepStrictEqual(calls[0].args, ['vis.0', 'a.txt', { user: ADMIN }]);
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                fileExists: () => {
                    throw new Error('boom');
                },
            });
            const [err] = await call(handlers, 'fileExists', 'vis.0', 'a.txt');
            strictEqual(err, 'boom');
        });

        it('denies checking without file.read permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'fileExists', 'vis.0', 'a.txt');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'fileExists').length, 0);
        });
    });

    describe('subscribeFiles / unsubscribeFiles', () => {
        it('subscribes a pattern once in the adapter and remembers it on the socket', async () => {
            const { handlers, calls, socket } = setup();
            const [err] = await call(handlers, 'subscribeFiles', 'vis.0', '*.json');
            strictEqual(err, null);
            strictEqual(socket.subscribe.fileChange.length, 1);
            strictEqual(socket.subscribe.fileChange[0].pattern, 'vis.0####*.json');
            deepStrictEqual(callsOf(calls, 'subscribeForeignFiles')[0].args, ['vis.0', '*.json', { user: ADMIN }]);

            // the same pattern again is ignored
            await call(handlers, 'subscribeFiles', 'vis.0', '*.json');
            strictEqual(socket.subscribe.fileChange.length, 1);
            strictEqual(callsOf(calls, 'subscribeForeignFiles').length, 1);
        });

        it('subscribes an array of patterns', async () => {
            const { handlers, calls, socket } = setup();
            await call(handlers, 'subscribeFiles', 'vis.0', ['a/*', 'b/*']);
            deepStrictEqual(
                socket.subscribe.fileChange.map(s => s.pattern),
                ['vis.0####a/*', 'vis.0####b/*'],
            );
            strictEqual(callsOf(calls, 'subscribeForeignFiles').length, 2);
        });

        it('subscribes the adapter only once for two sockets and unsubscribes after the last one', async () => {
            const { adapter, calls } = createAdapter();
            const commands = new SocketCommands(adapter, () => true, {
                language: 'en',
                ratings: null,
                ratingTimeout: null,
            });
            const s1 = createSocket(undefined, 's1').socket;
            const s2 = createSocket(undefined, 's2').socket;
            const h1 = attach(commands, s1);
            const h2 = attach(commands, s2);

            await call(h1, 'subscribeFiles', 'vis.0', '*');
            await call(h2, 'subscribeFiles', 'vis.0', '*');
            strictEqual(callsOf(calls, 'subscribeForeignFiles').length, 1);

            await call(h1, 'unsubscribeFiles', 'vis.0', '*');
            strictEqual(callsOf(calls, 'unsubscribeForeignFiles').length, 0, 'the second socket still needs it');
            strictEqual(s1.subscribe.fileChange.length, 0);

            await call(h2, 'unsubscribeFiles', 'vis.0', '*');
            deepStrictEqual(callsOf(calls, 'unsubscribeForeignFiles')[0].args, ['vis.0', '*', { user: ADMIN }]);
        });

        it('publishes a file change only to a matching subscription', async () => {
            const { handlers, commands, socket, emitted } = setup();
            await call(handlers, 'subscribeFiles', 'vis.0', 'main/*');

            strictEqual(commands.publishFile(socket, 'vis.0', 'main/a.json', 12), true);
            deepStrictEqual(emitted[emitted.length - 1], ['fileChange', 'vis.0', 'main/a.json', 12]);

            const count = emitted.length;
            strictEqual(commands.publishFile(socket, 'vis.1', 'main/a.json', 12), false);
            strictEqual(commands.publishFile(socket, 'vis.0', 'other/a.json', 12), false);
            strictEqual(emitted.length, count);
        });

        it('does not publish a file change if the session is expired', async () => {
            const { adapter } = createAdapter();
            let valid = true;
            const commands = new SocketCommands(adapter, () => valid, {
                language: 'en',
                ratings: null,
                ratingTimeout: null,
            });
            const { socket, emitted } = createSocket();
            const handlers = attach(commands, socket);
            await call(handlers, 'subscribeFiles', 'vis.0', '*');
            valid = false;
            strictEqual(commands.publishFile(socket, 'vis.0', 'a.txt', 1), false);
            strictEqual(emitted.length, 0);
        });

        it('denies subscribing and unsubscribing without file.read permission', async () => {
            const { handlers, calls, socket } = setup(noRights());
            const [err] = await call(handlers, 'subscribeFiles', 'vis.0', '*');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(socket.subscribe, undefined);
            strictEqual(callsOf(calls, 'subscribeForeignFiles').length, 0);

            const [err2] = await call(handlers, 'unsubscribeFiles', 'vis.0', '*');
            strictEqual(err2, SocketCommands.ERROR_PERMISSION);
        });

        it('ignores unsubscribing a pattern that was never subscribed', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'unsubscribeFiles', 'vis.0', '*');
            strictEqual(err, null);
            strictEqual(callsOf(calls, 'unsubscribeForeignFiles').length, 0);
        });
    });

    describe('getAdapterInstances', () => {
        function withInstances(rows) {
            return setup(undefined, {
                getObjectView: (design, search, params, options, cb) => {
                    cb(null, { rows: rows.map(value => ({ id: value._id, value })) });
                },
            });
        }

        it('queries the instances of the adapter and filters out other adapters with the same prefix', async () => {
            const rows = [
                { _id: 'system.adapter.history.0', common: { name: 'history', news: { a: 1 }, adminUI: {} } },
                { _id: 'system.adapter.history-ext.0', common: { name: 'history-ext', adminUI: {} } },
            ];
            let params;
            const { handlers } = setup(undefined, {
                getObjectView: (design, search, p, options, cb) => {
                    params = { design, search, p, options };
                    cb(null, { rows: rows.map(value => ({ id: value._id, value })) });
                },
            });
            const [err, list] = await call(handlers, 'getAdapterInstances', 'history');
            strictEqual(err, null);
            deepStrictEqual(params, {
                design: 'system',
                search: 'instance',
                p: { startkey: 'system.adapter.history.', endkey: 'system.adapter.history.香' },
                options: { user: ADMIN },
            });
            strictEqual(list.length, 1);
            strictEqual(list[0]._id, 'system.adapter.history.0');
            strictEqual(list[0].common.news, undefined, 'news must be removed to save bandwidth');
        });

        it('returns all instances for an empty adapter name', async () => {
            const { handlers } = withInstances([
                { _id: 'system.adapter.a.0', common: { name: 'a', adminUI: {} } },
                { _id: 'system.adapter.b.0', common: { name: 'b', adminUI: {} } },
            ]);
            const [, list] = await call(handlers, 'getAdapterInstances', '');
            strictEqual(list.length, 2);
        });

        it('creates common.adminUI for old instances', async () => {
            const { handlers } = withInstances([
                { _id: 'system.adapter.a.0', common: { name: 'a', jsonConfig: true, adminTab: {} } },
            ]);
            const [, list] = await call(handlers, 'getAdapterInstances', 'a');
            deepStrictEqual(list[0].common.adminUI, { config: 'json', tab: 'html' });
        });

        it('passes an error through', async () => {
            const { handlers } = setup(undefined, { getObjectView: (_d, _s, _p, _o, cb) => cb('DB error') });
            const [err] = await call(handlers, 'getAdapterInstances', 'a');
            strictEqual(err, 'DB error');
        });

        it('denies listing without object.read permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'getAdapterInstances', 'a');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'getObjectView').length, 0);
        });
    });
});

describe('SocketCommands misc commands', () => {
    describe('getVersion / getAdapterName', () => {
        it('returns version and name of the adapter', async () => {
            const { handlers } = setup(noRights());
            deepStrictEqual(await call(handlers, 'getVersion'), [null, '1.2.3', 'test']);
            deepStrictEqual(await call(handlers, 'getAdapterName'), [null, 'test']);
        });

        it('returns "unknown" if the adapter has no name', async () => {
            const { handlers } = setup(undefined, { name: '' });
            deepStrictEqual(await call(handlers, 'getAdapterName'), [null, 'unknown']);
        });

        it('only warns if there is no callback', () => {
            const { handlers, logs } = setup();
            handlers.getVersion(undefined);
            handlers.getAdapterName(undefined);
            ok(logs.warn.some(t => t.includes('[getVersion]')));
            ok(logs.warn.some(t => t.includes('[getAdapterName]')));
        });
    });

    describe('authEnabled', () => {
        it('returns the auth setting and the user name without prefix', async () => {
            const { handlers } = setup(noRights());
            deepStrictEqual(await call(handlers, 'authEnabled'), [true, 'user']);
        });

        it('returns an empty user for a socket without ACL', async () => {
            const { handlers } = setup(null, { config: { auth: false } });
            deepStrictEqual(await call(handlers, 'authEnabled'), [false, '']);
        });
    });

    describe('getUserPermissions / listPermissions', () => {
        it('returns the ACL of the socket', async () => {
            const acl = noRights();
            acl.object.read = true;
            const { handlers } = setup(acl);
            const [err, result] = await call(handlers, 'getUserPermissions');
            strictEqual(err, null);
            strictEqual(result, acl);
        });

        it('denies the ACL without object.read permission', async () => {
            const { handlers } = setup(noRights());
            const [err, result] = await call(handlers, 'getUserPermissions');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(result, undefined);
        });

        it('lists the permissions of all commands for everybody', async () => {
            const { handlers } = setup(noRights());
            const [permissions] = await call(handlers, 'listPermissions');
            strictEqual(permissions, SocketCommands.COMMANDS_PERMISSIONS);
            deepStrictEqual(permissions.readFile, { type: 'file', operation: 'read' });
        });

        it('only warns if listPermissions has no callback', () => {
            const { handlers, logs } = setup();
            handlers.listPermissions(undefined);
            ok(logs.warn.some(t => t.includes('[listPermissions]')));
        });
    });

    describe('checkFeatureSupported', () => {
        it('always supports the features implemented by the socket classes', async () => {
            const { handlers } = setup();
            deepStrictEqual(await call(handlers, 'checkFeatureSupported', 'INSTANCE_MESSAGES'), [null, true]);
            deepStrictEqual(await call(handlers, 'checkFeatureSupported', 'PARTIAL_OBJECT_TREE'), [null, true]);
        });

        it('asks the controller for other features', async () => {
            const { handlers } = setup();
            deepStrictEqual(await call(handlers, 'checkFeatureSupported', 'ALIAS'), [null, true]);
            deepStrictEqual(await call(handlers, 'checkFeatureSupported', 'PLUGINS'), [null, false]);
        });
    });

    describe('log / error', () => {
        it('writes into the log with the requested level, debug by default', () => {
            const { handlers, logs } = setup();
            handlers.log('e', 'error');
            handlers.log('w', 'warn');
            handlers.log('i', 'info');
            handlers.log('d');
            handlers.log('s', 'silly');
            deepStrictEqual(logs.error, ['e']);
            deepStrictEqual(logs.warn, ['w']);
            deepStrictEqual(logs.info, ['i']);
            deepStrictEqual(logs.debug, ['d', 's']);
        });

        it('writes a socket error into the error log', () => {
            const { handlers, logs } = setup();
            handlers.error(new Error('client crashed'));
            ok(logs.error.some(t => t.includes('Socket error: Error: client crashed')));
        });
    });

    describe('getHistory', () => {
        it('accepts the instance as string and sets user and aggregate', async () => {
            const { handlers, calls } = setup(undefined, {
                getHistory: (id, options, cb) => {
                    calls.push({ name: 'getHistory', args: [id, options] });
                    cb(null, [{ val: 1, ts: 1 }], 1);
                },
            });
            const [err, result, step] = await call(handlers, 'getHistory', 'a.0.b', 'history.0');
            strictEqual(err, null);
            deepStrictEqual(result, [{ val: 1, ts: 1 }]);
            strictEqual(step, 1);
            deepStrictEqual(calls[0].args, ['a.0.b', { instance: 'history.0', user: ADMIN, aggregate: 'none' }]);
        });

        it('keeps a given aggregate', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'getHistory', 'a.0.b', { aggregate: 'minmax' });
            strictEqual(callsOf(calls, 'getHistory')[0].args[1].aggregate, 'minmax');
        });

        it('catches an exception of the adapter', async () => {
            const { handlers } = setup(undefined, {
                getHistory: () => {
                    throw new Error('no history instance');
                },
            });
            const [err] = await call(handlers, 'getHistory', 'a.0.b', {});
            strictEqual(err, 'no history instance');
        });

        it('denies history without state.read permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'getHistory', 'a.0.b', {});
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'getHistory').length, 0);
        });
    });

    describe('httpGet', () => {
        let axios;
        let originalGet;
        let stub = null;

        before(async () => {
            // socketCommands loads axios with a dynamic import and keeps a reference to `axios.get`,
            // so a delegating function is installed on the shared ESM instance
            axios = (await import('axios')).default;
            originalGet = axios.get;
            axios.get = (...args) => (stub ? stub(...args) : originalGet.apply(axios, args));
        });

        after(() => {
            axios.get = originalGet;
            stub = null;
        });

        afterEach(() => (stub = null));

        it('reads the page with a timeout and returns status and data', async () => {
            let request;
            stub = (url, options) => {
                request = { url, options };
                return Promise.resolve({ status: 200, statusText: 'OK', data: Buffer.from('page') });
            };
            const { handlers } = setup();
            const [err, result, data] = await call(handlers, 'httpGet', 'http://example.invalid/');
            strictEqual(err, null);
            deepStrictEqual(result, { status: 200, statusText: 'OK' });
            strictEqual(data.toString(), 'page');
            strictEqual(request.url, 'http://example.invalid/');
            strictEqual(request.options.responseType, 'arraybuffer');
            strictEqual(request.options.timeout, 15000);
            strictEqual(request.options.validateStatus(399), true);
            strictEqual(request.options.validateStatus(404), false);
        });

        it('passes a request error through', async () => {
            const error = new Error('ECONNREFUSED');
            stub = () => Promise.reject(error);
            const { handlers } = setup();
            const [err] = await call(handlers, 'httpGet', 'http://example.invalid/');
            strictEqual(err, error);
        });

        it('passes a synchronous exception through', async () => {
            const error = new Error('Invalid URL');
            stub = () => {
                throw error;
            };
            const { handlers } = setup();
            const [err] = await call(handlers, 'httpGet', 'bad');
            strictEqual(err, error);
        });

        it('denies the request without other.http permission', async () => {
            let requested = false;
            stub = () => {
                requested = true;
                return Promise.resolve({});
            };
            const { handlers } = setup(noRights());
            const [err] = await call(handlers, 'httpGet', 'http://example.invalid/');
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(requested, false);
        });
    });

    describe('sendTo', () => {
        it('sends the message and answers asynchronously with the result', async () => {
            const { handlers, calls } = setup(undefined, {
                sendTo: (instance, command, message, cb) => {
                    calls.push({ name: 'sendTo', args: [instance, command, message] });
                    cb({ result: 'ok' });
                },
            });
            const [result] = await call(handlers, 'sendTo', 'history.0', 'getHistory', { id: 'x' });
            deepStrictEqual(result, { result: 'ok' });
            deepStrictEqual(calls[0].args, ['history.0', 'getHistory', { id: 'x' }]);
        });

        it('answers with the exception of the adapter', async () => {
            const error = new Error('instance not found');
            const { handlers } = setup(undefined, {
                sendTo: () => {
                    throw error;
                },
            });
            const [result] = await call(handlers, 'sendTo', 'history.0', 'cmd', {});
            deepStrictEqual(result, { error });
        });

        it('does not crash without callback', () => {
            const { handlers, calls } = setup();
            handlers.sendTo('history.0', 'cmd', {}, undefined);
            strictEqual(callsOf(calls, 'sendTo').length, 1);
        });

        it('denies sending without other.sendto permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [err] = await call(handlers, 'sendTo', 'history.0', 'cmd', {});
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'sendTo').length, 0);
        });
    });

    describe('sendToHost', () => {
        it('sends an ordinary command to the host', async () => {
            const { handlers, calls } = setup(undefined, {
                sendToHost: (host, command, message, cb) => {
                    calls.push({ name: 'sendToHost', args: [host, command, message] });
                    cb({ result: 'info' });
                },
            });
            const [result] = await call(handlers, 'sendToHost', 'system.host.h1', 'getHostInfo', null);
            deepStrictEqual(result, { result: 'info' });
            deepStrictEqual(calls[0].args, ['system.host.h1', 'getHostInfo', null]);
        });

        it('uses the overloaded _sendToHost if set', async () => {
            const { handlers, commands, calls } = setup();
            commands._sendToHost = (host, command, message, cb) => cb({ result: `${host}:${command}` });
            const [result] = await call(handlers, 'sendToHost', 'h1', 'getVersion', null);
            deepStrictEqual(result, { result: 'h1:getVersion' });
            strictEqual(callsOf(calls, 'sendToHost').length, 0);
        });

        it('answers with the exception of the adapter', async () => {
            const error = new Error('no host');
            const { handlers } = setup(undefined, {
                sendToHost: () => {
                    throw error;
                },
            });
            const [result] = await call(handlers, 'sendToHost', 'h1', 'getVersion', null);
            deepStrictEqual(result, { error });
        });

        it('allows an ordinary command with other.sendto only', async () => {
            const acl = noRights();
            acl.other.sendto = true;
            const { handlers, calls } = setup(acl);
            await call(handlers, 'sendToHost', 'h1', 'getHostInfo', null);
            strictEqual(callsOf(calls, 'sendToHost').length, 1);
        });

        it('denies an ordinary command without other.sendto permission', async () => {
            const { handlers, calls } = setup(noRights());
            const [result] = await call(handlers, 'sendToHost', 'h1', 'getHostInfo', null);
            deepStrictEqual(result, { error: SocketCommands.ERROR_PERMISSION });
            strictEqual(callsOf(calls, 'sendToHost').length, 0);
        });

        for (const command of [
            'cmdExec',
            'getLocationOnDisk',
            'getDiagData',
            'getDevList',
            'delLogs',
            'writeDirAsZip',
            'writeObjectsAsZip',
            'readObjectsAsZip',
            'checkLogging',
            'updateMultihost',
            'rebuildAdapter',
        ]) {
            it(`requires other.execute for the protected command "${command}"`, async () => {
                const acl = noRights();
                acl.other.sendto = true;
                const { handlers, calls, logs } = setup(acl);
                const [result] = await call(handlers, 'sendToHost', 'h1', command, { data: '' });
                deepStrictEqual(result, { error: SocketCommands.ERROR_PERMISSION });
                strictEqual(callsOf(calls, 'sendToHost').length, 0);
                ok(logs.warn.some(t => t.includes('cmdExec') && t.includes('"other"."execute"')));

                acl.other.execute = true;
                await call(handlers, 'sendToHost', 'h1', command, { data: '' });
                strictEqual(callsOf(calls, 'sendToHost').length, 1);
            });
        }

        it('sends a small writeDirAsZip to the host', async () => {
            const { handlers, calls } = setup();
            await call(handlers, 'sendToHost', 'h1', 'writeDirAsZip', { id: 'vis.0', name: 'main', data: 'UEsDBA==' });
            strictEqual(callsOf(calls, 'sendToHost').length, 1);
        });
    });

    describe('clientSubscribe / clientUnsubscribe / publishInstanceMessage', () => {
        function setupInstances(acl) {
            const ctx = setup(acl, {
                sendTo: (instance, command, message, cb) => {
                    ctx.calls.push({ name: 'sendTo', args: [instance, command, message] });
                    if (typeof cb === 'function') {
                        cb({ accepted: true, heartbeat: 1000 });
                    }
                },
            });
            return ctx;
        }

        it('informs the instance about the subscription and returns its answer', async () => {
            const { handlers, calls } = setupInstances();
            const [err, result] = await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1', { w: 640 });
            strictEqual(err, null);
            deepStrictEqual(result, { accepted: true, heartbeat: 1000 });
            deepStrictEqual(calls[0].args, [
                'system.adapter.cameras.0',
                'clientSubscribe',
                { type: 'image/cam1', sid: 'socket1', data: { w: 640 } },
            ]);
        });

        it('accepts the callback in place of data', async () => {
            const { handlers, calls } = setupInstances();
            const [err] = await call(handlers, 'clientSubscribe', 'system.adapter.cameras.0', 'image/cam1');
            strictEqual(err, null);
            strictEqual(calls[0].args[0], 'system.adapter.cameras.0');
            strictEqual(calls[0].args[2].data, null);
        });

        it('delivers instance messages only to a subscribed socket and for the subscribed type', async () => {
            const { handlers, commands, socket, emitted, calls } = setupInstances();
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');

            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'image/cam1', 'data'), true);
            deepStrictEqual(emitted[emitted.length - 1], ['im', 'image/cam1', 'system.adapter.cameras.0', 'data']);

            // another type: the instance is told that nobody listens
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'image/cam2', 'x'), false);
            deepStrictEqual(calls[calls.length - 1].args, [
                'system.adapter.cameras.0',
                'clientSubscribeError',
                { type: 'image/cam2', sid: 'socket1', reason: 'no one subscribed' },
            ]);

            // another socket
            const other = createSocket(undefined, 'socket2').socket;
            strictEqual(commands.publishInstanceMessage(other, 'system.adapter.cameras.0', 'image/cam1', 'x'), false);
        });

        it('subscribes a type only once', async () => {
            const { handlers, commands, socket } = setupInstances();
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');
            // one unsubscribe must be enough
            const [, removed] = await call(handlers, 'clientUnsubscribe', 'cameras.0', 'image/cam1');
            strictEqual(removed, true);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'image/cam1', 'x'), false);
        });

        it('unsubscribes and informs the instance', async () => {
            const { handlers, commands, socket, calls } = setupInstances();
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');
            const [err, removed] = await call(handlers, 'clientUnsubscribe', 'cameras.0', 'image/cam1');
            strictEqual(err, null);
            strictEqual(removed, true);
            deepStrictEqual(calls.find(c => c.args[1] === 'clientUnsubscribe').args, [
                'system.adapter.cameras.0',
                'clientUnsubscribe',
                { type: ['image/cam1'], sid: 'socket1', reason: 'client' },
            ]);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'image/cam1', 'x'), false);
        });

        it('answers false for an unknown subscription without informing the instance', async () => {
            const { handlers, calls } = setupInstances();
            const [err, removed] = await call(handlers, 'clientUnsubscribe', 'cameras.0', 'image/cam1');
            strictEqual(err, null);
            strictEqual(removed, false);
            strictEqual(callsOf(calls, 'sendTo').length, 0);
        });

        it('informs the instance about a disconnected socket', async () => {
            const { handlers, commands, socket, calls } = setupInstances();
            await call(handlers, 'subscribe', 'a.0.*');
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam2');

            commands.unsubscribeSocket(socket);
            deepStrictEqual(calls.find(c => c.args[1] === 'clientUnsubscribe').args, [
                'system.adapter.cameras.0',
                'clientUnsubscribe',
                { type: ['image/cam1', 'image/cam2'], sid: 'socket1', reason: 'disconnect' },
            ]);
            strictEqual(commands.publishInstanceMessage(socket, 'system.adapter.cameras.0', 'image/cam1', 'x'), false);
        });

        // Regression, fixed: unsubscribeSocket() returns before #informAboutDisconnect() if the socket has no
        // `subscribe` structure, i.e. it never subscribed to states, objects, files or logs. The
        // instance keeps sending messages for a socket that does not exist anymore and the entry
        // in #clientSubscribes leaks.
        it('informs the instance about a disconnected socket without other subscriptions', async () => {
            const { handlers, commands, socket, calls } = setupInstances();
            await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1');
            commands.unsubscribeSocket(socket);
            ok(calls.some(c => c.args[1] === 'clientUnsubscribe'), 'the instance must be informed');
        });

        it('denies subscribing and unsubscribing without other.sendto permission', async () => {
            const { handlers, calls } = setupInstances(noRights());
            const [err] = await call(handlers, 'clientSubscribe', 'cameras.0', 'image/cam1', null);
            strictEqual(err, SocketCommands.ERROR_PERMISSION);
            const [err2] = await call(handlers, 'clientUnsubscribe', 'cameras.0', 'image/cam1');
            strictEqual(err2, SocketCommands.ERROR_PERMISSION);
            strictEqual(callsOf(calls, 'sendTo').length, 0);
        });
    });

    describe('logout', () => {
        it('destroys access token, refresh token and the session', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                getSession: (id, cb) => cb(id === 'a:tok' ? { aToken: 'tok', rToken: 'ref', user: 'admin' } : null),
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request.headers.authorization = 'Bearer tok';
            socket._sessionID = 'sess';
            await call(handlers, 'logout');
            deepStrictEqual(destroyed, ['a:tok', 'r:ref', 'sess']);
        });

        // Regression, fixed: logout falls back to `socket.conn.request._query.token`, which exists only for socket.io.
        // A ws socket without a token in the query or the Authorization header (cookie authentication
        // or a legacy session) makes the command throw "Cannot read properties of undefined".
        it('takes the access token from the cookie  (ws socket without _query)', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                getSession: (id, cb) => cb(id === 'a:tok' ? { aToken: 'tok', rToken: 'ref' } : null),
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request.headers.cookie = 'foo=bar; access_token=tok';
            const [err] = await call(handlers, 'logout');
            strictEqual(err, undefined);
            deepStrictEqual(destroyed, ['a:tok', 'r:ref']);
        });

        it('takes the access token from the query', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                getSession: (id, cb) => cb(id === 'a:tok' ? { aToken: 'tok', rToken: 'ref' } : null),
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request.query.token = 'tok';
            await call(handlers, 'logout');
            deepStrictEqual(destroyed, ['a:tok', 'r:ref']);
        });

        it('takes the access token from the cookie of a socket.io socket', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                getSession: (id, cb) => cb(id === 'a:tok' ? { aToken: 'tok', rToken: 'ref' } : null),
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request._query = {};
            socket.conn.request.headers.cookie = 'foo=bar; access_token=tok';
            const [err] = await call(handlers, 'logout');
            strictEqual(err, undefined);
            deepStrictEqual(destroyed, ['a:tok', 'r:ref']);
        });

        it('destroys the legacy session of a socket.io socket and never the socket id', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request._query = {};
            socket.conn.request.sessionID = 'sess';
            await call(handlers, 'logout');
            deepStrictEqual(destroyed, ['sess']);
        });

        it('answers a socket.io socket without any session with an error', async () => {
            const { handlers, socket, calls } = setup();
            socket.conn.request._query = {};
            const [err] = await call(handlers, 'logout');
            ok(err instanceof Error);
            strictEqual(err.message, 'No session');
            strictEqual(callsOf(calls, 'destroySession').length, 0);
        });

        it('destroys only the session if the token is unknown', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                getSession: (_id, cb) => cb(null),
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request.query.token = 'unknown';
            socket.conn.request.sessionID = 'sess';
            await call(handlers, 'logout');
            deepStrictEqual(destroyed, ['sess']);
        });

        // Regression, fixed: logout falls back to `socket.conn.request._query.token`, which exists only for socket.io.
        // A ws socket without a token in the query or the Authorization header (cookie authentication
        // or a legacy session) makes the command throw "Cannot read properties of undefined".
        it('destroys the legacy session and never the socket id  (ws socket without _query)', async () => {
            const destroyed = [];
            const { handlers, socket } = setup(undefined, {
                destroySession: (id, cb) => {
                    destroyed.push(id);
                    cb && cb();
                },
            });
            socket.conn.request.sessionID = 'sess';
            await call(handlers, 'logout');
            deepStrictEqual(destroyed, ['sess']);
        });

        // Regression, fixed: logout falls back to `socket.conn.request._query.token`, which exists only for socket.io.
        // A ws socket without a token in the query or the Authorization header (cookie authentication
        // or a legacy session) makes the command throw "Cannot read properties of undefined".
        it('answers with an error if there is no session at all  (ws socket without _query)', async () => {
            const { handlers, calls } = setup();
            const [err] = await call(handlers, 'logout');
            ok(err instanceof Error);
            strictEqual(err.message, 'No session');
            strictEqual(callsOf(calls, 'destroySession').length, 0);
        });
    });
});
