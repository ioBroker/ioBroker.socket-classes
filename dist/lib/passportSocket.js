"use strict";
// Originally taken from here: https://github.com/jfromaniello/passport.socketio/blob/master/lib/index.js
// Copyright Licensed under the MIT-License. 2012-2013 José F. Romaniello.
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = authorize;
function parseCookie(auth, cookieHeader) {
    const cookieParser = auth.cookieParser(auth.secret);
    // Simulate header
    const req = {
        headers: {
            cookie: cookieHeader,
        },
    };
    let result;
    void cookieParser(req, {}, (err) => {
        if (err) {
            throw new Error(err);
        }
        result = req.signedCookies || req.cookies;
    });
    return result;
}
function getQuery(url) {
    const query = (url || '').split('?')[1] || '';
    const parts = query.split('&');
    const result = {};
    for (let p = 0; p < parts.length; p++) {
        const parts1 = parts[p].split('=');
        result[parts1[0]] = parts1[1];
    }
    return result;
}
function authorize(options) {
    const defaults = {
        key: 'connect.sid',
        secret: null,
        store: null,
        userProperty: 'user',
    };
    const auth = Object.assign({}, defaults, options);
    if (!auth.passport) {
        throw new Error("passport is required to use require('passport'), please install passport");
    }
    if (!auth.cookieParser) {
        throw new Error("cookieParser is required use require('cookie-parser'), connect.cookieParser or express.cookieParser");
    }
    return function (req, accept) {
        const extendedReq = req;
        extendedReq.query = getQuery(extendedReq.url);
        if (options.checkUser && extendedReq.query.user && extendedReq.query.pass) {
            return options.checkUser(extendedReq.query.user, extendedReq.query.pass, (error, result) => {
                if (error) {
                    return auth.fail(extendedReq, 'Cannot check user', false, accept);
                }
                if (!result) {
                    return auth.fail(extendedReq, 'User not found', false, accept);
                }
                extendedReq[auth.userProperty] = result;
                extendedReq[auth.userProperty].logged_in = true;
                auth.success(extendedReq, accept);
            });
        }
        extendedReq.cookie = parseCookie(auth, extendedReq.headers.cookie || '');
        if (extendedReq.cookie) {
            extendedReq.sessionID = extendedReq.cookie[auth.key] || '';
        }
        extendedReq[auth.userProperty] = {
            logged_in: false,
        };
        auth.store?.get(extendedReq.sessionID, (err, session) => {
            if (err) {
                return auth.fail(extendedReq, `Error in session store:\n${err.message}`, true, accept);
            }
            if (!session) {
                return auth.fail(extendedReq, 'No session found', false, accept);
            }
            if (!session[auth.passport._key]) {
                return auth.fail(extendedReq, 'Passport was not initialized', true, accept);
            }
            const userKey = session[auth.passport._key].user;
            if (typeof userKey === 'undefined') {
                return auth.fail(extendedReq, 'User not authorized through passport. (User Property not found)', false, accept);
            }
            // extendedReq.user
            extendedReq[auth.userProperty] = userKey;
            extendedReq[auth.userProperty].logged_in = true;
            auth.success(extendedReq, accept);
        });
    };
}
//# sourceMappingURL=passportSocket.js.map