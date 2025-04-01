import type { IncomingMessage } from 'node:http';
import type * as express from 'express';
import type * as passport from 'passport';
export interface PassportHttpRequest extends IncomingMessage {
    headers: {
        cookie: string;
        authentication?: string;
    };
    query: Record<string, string>;
    cookie: Record<string, string> | undefined;
    sessionID: string;
    user: {
        logged_in: boolean;
        user?: string;
    };
}
export interface Store {
    get: (sessionId: string, cb: (err: Error, session: {
        cookie: {
            originalMaxAge: number;
            expires: string;
            httpOnly: boolean;
            path: string;
        };
        passport: {
            user: string;
        };
    }) => void) => void;
    set: (sessionId: string, ttl: number | {
        cookie: {
            originalMaxAge: number;
            expires: string;
            httpOnly: boolean;
        };
        passport: {
            user: string;
        };
    }, session?: {
        cookie: {
            originalMaxAge: number;
            expires: string;
            httpOnly: boolean;
        };
        passport: {
            user: string;
        };
    }) => void;
}
export declare function authorize(auth: {
    passport: passport.PassportStatic;
    cookieParser: (secret: string | string[] | undefined, options?: {
        decode?(val: string): string;
    }) => express.RequestHandler;
    checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
        logged_in: boolean;
        user?: string;
    }) => void) => void;
    fail: (data: PassportHttpRequest, message: string, critical: boolean, accept: (err: boolean) => void) => void;
    success: (data: PassportHttpRequest, accept: (err: boolean) => void) => void;
    secret?: string;
    store?: Store;
    userProperty?: string;
    noBasicAuth?: boolean;
}): (req: IncomingMessage, accept: (err: boolean) => void) => void;
