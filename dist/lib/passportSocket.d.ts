import type { IncomingMessage } from 'node:http';
import type * as express from 'express';
import type * as passport from 'passport';
export interface PassportHttpRequest extends IncomingMessage {
    headers: {
        cookie: string;
    };
    query: Record<string, string>;
    cookie: Record<string, string> | undefined;
    sessionID: string;
    user: {
        logged_in: boolean;
    };
}
export interface Store {
    get: (key: string, cb: (err: Error, session: Record<string, {
        user: {
            logged_in: boolean;
        };
    }>) => void) => void;
}
export declare function authorize(options: {
    passport: passport.PassportStatic & {
        _key: string;
    };
    cookieParser: (secret: string | null, options?: {
        decode?(val: string): string;
    }) => express.RequestHandler;
    checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
        logged_in: boolean;
    }) => void) => void;
    fail: (data: PassportHttpRequest, message: string, critical: boolean, accept: (err: boolean) => void) => void;
    success: (data: PassportHttpRequest, accept: (err: boolean) => void) => void;
}): (req: IncomingMessage, accept: (err: boolean) => void) => void;
