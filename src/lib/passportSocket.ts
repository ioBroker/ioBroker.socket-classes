// Originally taken from here: https://github.com/jfromaniello/passport.socketio/blob/master/lib/index.js
// Copyright Licensed under the MIT-License. 2012-2013 José F. Romaniello.

import type { IncomingMessage } from 'node:http';
import type * as express from 'express';
import type * as passport from 'passport';

interface AuthRequest {
    signedCookies?: Record<string, string>;
    cookies?: Record<string, string>;
    headers: {
        cookie: string;
    };
}

export interface PassportHttpRequest extends IncomingMessage {
    headers: {
        cookie: string;
    };
    query: Record<string, string>;
    cookie: Record<string, string> | undefined;
    sessionID: string;
    user: { logged_in: boolean };
}

export interface Store {
    get: (key: string, cb: (err: Error, session: Record<string, { user: { logged_in: boolean } }>) => void) => void;
}

function parseCookie(
    auth: {
        cookieParser: (secret: string | null, options?: { decode?(val: string): string }) => express.RequestHandler;
        secret: string | null;
    },
    cookieHeader: string,
): Record<string, string> | undefined {
    const cookieParser = auth.cookieParser(auth.secret);
    // Simulate header
    const req: AuthRequest = {
        headers: {
            cookie: cookieHeader,
        },
    };

    let result: Record<string, string> | undefined;

    void cookieParser(req as express.Request, {} as express.Response, (err: string): void => {
        if (err) {
            throw new Error(err);
        }
        result = req.signedCookies || req.cookies;
    });

    return result;
}

function getQuery(url: string | undefined): Record<string, string> {
    const query = (url || '').split('?')[1] || '';
    const parts = query.split('&');
    const result: Record<string, string> = {};
    for (let p = 0; p < parts.length; p++) {
        const parts1 = parts[p].split('=');
        result[parts1[0]] = parts1[1];
    }
    return result;
}

export function authorize(options: {
    passport: passport.PassportStatic & { _key: string };
    cookieParser: (secret: string | null, options?: { decode?(val: string): string }) => express.RequestHandler;
    checkUser?: (
        user: string,
        pass: string,
        cb: (error: Error | null, result?: { logged_in: boolean }) => void,
    ) => void;
    fail: (data: PassportHttpRequest, message: string, critical: boolean, accept: (err: boolean) => void) => void;
    success: (data: PassportHttpRequest, accept: (err: boolean) => void) => void;
}): (req: IncomingMessage, accept: (err: boolean) => void) => void {
    const defaults: { key: string; secret: null | string; store: Store | null; userProperty: 'user' } = {
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
        throw new Error(
            "cookieParser is required use require('cookie-parser'), connect.cookieParser or express.cookieParser",
        );
    }

    return function (req: IncomingMessage, accept: (err: boolean) => void): void {
        const extendedReq = req as PassportHttpRequest;
        extendedReq.query = getQuery(extendedReq.url);

        if (options.checkUser && extendedReq.query.user && extendedReq.query.pass) {
            return options.checkUser(
                extendedReq.query.user,
                extendedReq.query.pass,
                (error: Error | null, result?: { logged_in: boolean }) => {
                    if (error) {
                        return auth.fail(extendedReq, 'Cannot check user', false, accept);
                    }
                    if (!result) {
                        return auth.fail(extendedReq, 'User not found', false, accept);
                    }

                    extendedReq[auth.userProperty] = result;
                    extendedReq[auth.userProperty].logged_in = true;
                    auth.success(extendedReq, accept);
                },
            );
        }

        extendedReq.cookie = parseCookie(auth, extendedReq.headers.cookie || '');
        if (extendedReq.cookie) {
            extendedReq.sessionID = extendedReq.cookie[auth.key] || '';
        }
        extendedReq[auth.userProperty] = {
            logged_in: false,
        };

        auth.store?.get(
            extendedReq.sessionID,
            (err: Error, session: Record<string, { user: { logged_in: boolean } }>) => {
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
                    return auth.fail(
                        extendedReq,
                        'User not authorized through passport. (User Property not found)',
                        false,
                        accept,
                    );
                }

                // extendedReq.user
                extendedReq[auth.userProperty] = userKey;
                extendedReq[auth.userProperty].logged_in = true;
                auth.success(extendedReq, accept);
            },
        );
    };
}
