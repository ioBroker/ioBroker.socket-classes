// Originally taken from here: https://github.com/jfromaniello/passport.socketio/blob/master/lib/index.js
// Copyright Licensed under the MIT-License. 2012-2013 José F. Romaniello.

import type { IncomingMessage } from 'node:http';
import type * as express from 'express';
import type * as passport from 'passport';
import type { InternalStorageToken } from '../types';

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
    user: { logged_in: boolean; user?: string };
}

export interface Store {
    get: (
        sessionId: string,
        cb: (
            err: Error,
            session: {
                cookie: {
                    originalMaxAge: number;
                    expires: string;
                    httpOnly: boolean;
                    path: string;
                };
                passport: {
                    user: string;
                };
            },
        ) => void,
    ) => void;
    set: (
        sessionId: string,
        session: {
            cookie: {
                originalMaxAge: number;
                expires: string;
                httpOnly: boolean;
            };
            passport: {
                user: string;
            };
        },
    ) => void;
}

function parseCookie(
    auth: {
        cookieParser: (
            secret: string | undefined | string[],
            options?: { decode?(val: string): string },
        ) => express.RequestHandler;
        secret?: string;
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

export function authorize(auth: {
    passport: passport.PassportStatic;
    cookieParser: (
        secret: string | string[] | undefined,
        options?: { decode?(val: string): string },
    ) => express.RequestHandler;
    checkUser?: (
        user: string,
        pass: string,
        cb: (error: Error | null, result?: { logged_in: boolean; user?: string }) => void,
    ) => void;
    fail: (data: PassportHttpRequest, message: string, critical: boolean, accept: (err: boolean) => void) => void;
    success: (data: PassportHttpRequest, accept: (err: boolean) => void) => void;
    secret?: string;
    store?: Store;
    userProperty?: string;
}): (req: IncomingMessage, accept: (err: boolean) => void) => void {
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

        if (auth.checkUser && extendedReq.query.user && extendedReq.query.pass) {
            return auth.checkUser(
                extendedReq.query.user,
                extendedReq.query.pass,
                (error: Error | null, result?: { logged_in: boolean; user?: string }) => {
                    if (error) {
                        return auth.fail(extendedReq, 'Cannot check user', false, accept);
                    }
                    if (!result) {
                        return auth.fail(extendedReq, 'User not found', false, accept);
                    }

                    extendedReq.user = result;
                    extendedReq.user.user = extendedReq.query.user;
                    extendedReq.user.logged_in = true;
                    auth.success(extendedReq, accept);
                },
            );
        }

        extendedReq.cookie = parseCookie(auth, extendedReq.headers.cookie || '');
        if (extendedReq.cookie) {
            extendedReq.sessionID = extendedReq.cookie['connect.sid'] || '';

            if (extendedReq.cookie.access_token) {
                void auth.store?.get(`a:${extendedReq.cookie.access_token}`, (err: Error, token: any): void => {
                    const tokenData = token as InternalStorageToken;

                    if (err) {
                        return auth.fail(extendedReq, `Error in session store:\n${err.message}`, true, accept);
                    }
                    if (!tokenData?.user) {
                        return auth.fail(extendedReq, 'No session found', false, accept);
                    }
                    // extendedReq.user
                    extendedReq.user = { logged_in: true, user: tokenData.user };
                    auth.success(extendedReq, accept);
                });
                return;
            }
        }

        extendedReq.user = {
            logged_in: false,
        };

        auth.store?.get(
            extendedReq.sessionID,
            (
                err: Error,
                session: {
                    cookie: {
                        originalMaxAge: number;
                        expires: string;
                        httpOnly: boolean;
                        path: string;
                    };
                    passport: {
                        user: string;
                    };
                },
            ): void => {
                // session looks like:
                // {
                //     cookie: {
                //         originalMaxAge: 5999991,
                //         expires: '2025-02-07T17:15:06.466Z',
                //         httpOnly: true,
                //         path: '/',
                //     },
                //     passport: {
                //         user: 'admin',
                //     },
                // };

                if (err) {
                    return auth.fail(extendedReq, `Error in session store:\n${err.message}`, true, accept);
                }
                if (!session) {
                    return auth.fail(extendedReq, 'No session found', false, accept);
                }
                if (!session.passport) {
                    return auth.fail(extendedReq, 'Passport was not initialized', true, accept);
                }

                const userKey = session.passport.user;

                if (!userKey) {
                    return auth.fail(
                        extendedReq,
                        'User not authorized through passport. (User Property not found)',
                        false,
                        accept,
                    );
                }

                // extendedReq.user
                extendedReq.user = session.passport as { logged_in: boolean; user?: string };
                extendedReq.user.logged_in = true;
                auth.success(extendedReq, accept);
            },
        );
    };
}
