const { ok, strictEqual } = require('assert');
const { createHmac } = require('crypto');
const cookieParser = require('cookie-parser');
const passport = require('passport');
const { passportSocket } = require('../build/index');

/** Sign a value the way cookie-parser expects a signed cookie to look. */
function signCookie(value, secret) {
    const signature = createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
    return `s:${value}.${signature}`;
}

/**
 * Minimal auth object for authorize(). The session store throws on a non string
 * id, exactly like AdapterStore does when it reaches adapter.getSession().
 */
function createAuth(overrides) {
    const calls = { failed: [], succeeded: [], storeGet: [] };
    const auth = Object.assign(
        {
            passport,
            cookieParser,
            secret: 'secret',
            store: {
                get: (id, callback) => {
                    calls.storeGet.push(id);
                    if (typeof id !== 'string') {
                        // js-controller validates the id and throws synchronously
                        throw new Error(`Parameter "id" needs to be of type "string" but type "${typeof id}" has been passed`);
                    }
                    callback(null, undefined);
                },
            },
            fail: (_req, message, _critical, accept) => {
                calls.failed.push(message);
                accept(false);
            },
            success: (_req, accept) => {
                calls.succeeded.push(true);
                accept(true);
            },
        },
        overrides,
    );
    return { auth, calls };
}

describe('passportSocket authorize', () => {
    it('rejects a request without any cookie header instead of throwing', () => {
        const { auth, calls } = createAuth();
        const request = { url: '/?sid=1', headers: {} };

        // must not throw, the upgrade handler of the adapter runs synchronously
        passportSocket(auth)(request, () => {});

        strictEqual(calls.succeeded.length, 0, 'must not authorize');
        strictEqual(calls.failed.length, 1, 'must report the failure through fail()');
        strictEqual(
            calls.storeGet.filter(id => typeof id !== 'string').length,
            0,
            'must not ask the session store for a non string id',
        );
    });

    it('still looks up the session of a signed connect.sid cookie', () => {
        const { auth, calls } = createAuth();
        const cookie = `connect.sid=${encodeURIComponent(signCookie('abc123', 'secret'))}`;
        const request = { url: '/?sid=1', headers: { cookie } };

        passportSocket(auth)(request, () => {});

        strictEqual(calls.storeGet.length, 1, 'must consult the session store');
        strictEqual(calls.storeGet[0], 'abc123', 'must pass the session id of the cookie');
    });

    it('authorizes with user and password in the query without touching the store', () => {
        const { auth, calls } = createAuth({
            checkUser: (_user, _pass, callback) => callback(null, { logged_in: true }),
        });
        const request = { url: '/?sid=1&user=tester&pass=secret', headers: {} };

        passportSocket(auth)(request, () => {});

        strictEqual(calls.succeeded.length, 1, 'must authorize');
        strictEqual(calls.storeGet.length, 0, 'must not consult the session store');
    });

    it('rejects a cookie header without connect.sid without asking the store', () => {
        const { auth, calls } = createAuth();
        const request = { url: '/?sid=1', headers: { cookie: 'other=1' } };

        passportSocket(auth)(request, () => {});

        strictEqual(calls.succeeded.length, 0, 'must not authorize');
        strictEqual(calls.storeGet.length, 0, 'must not consult the session store for an empty session id');
        strictEqual(calls.failed[0], 'No session id', 'must name the missing session id');
    });

    it('does not let an exception of the session store escape', () => {
        const { auth, calls } = createAuth({
            store: {
                get: () => {
                    throw new Error('store is broken');
                },
            },
        });
        const cookie = `connect.sid=${encodeURIComponent(signCookie('abc123', 'secret'))}`;
        const request = { url: '/?sid=1', headers: { cookie } };

        // must not throw, the upgrade handler of the adapter runs synchronously
        passportSocket(auth)(request, () => {});

        strictEqual(calls.succeeded.length, 0, 'must not authorize');
        strictEqual(calls.failed.length, 1, 'must reject the connection instead of throwing');
        ok(
            calls.failed[0].startsWith('Error in authorization'),
            `must report the error, got "${calls.failed[0]}"`,
        );
    });

    it('answers an upgrade request only once, even if the success handler throws', () => {
        const succeeded = [];
        const { auth } = createAuth({
            checkUser: (_user, _pass, callback) => callback(null, { logged_in: true }),
            success: (_req, accept) => {
                succeeded.push(true);
                accept(true);
                throw new Error('the success handler of the adapter is broken');
            },
        });
        const answers = [];
        const request = { url: '/?sid=1&user=tester&pass=secret', headers: {} };

        passportSocket(auth)(request, err => answers.push(err));

        strictEqual(succeeded.length, 1, 'must authorize');
        strictEqual(answers.length, 1, 'must answer the upgrade request exactly once');
        strictEqual(answers[0], true, 'must keep the first answer');
    });
});
