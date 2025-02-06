interface AuthRequest {
    signedCookies?: Record<string, string>;
    cookies?: Record<string, string>;
    headers: {
        cookie: string;
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
    passport: {
        _key: string;
    };
    cookieParser: (secret: string | null) => (req: AuthRequest, options: Record<string, any>, cb: (err: string) => void) => void;
    checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
        logged_in: boolean;
    }) => void) => void;
    fail: (data: any, message: string, critical: boolean, accept: (err: Error | null) => void) => void;
    success: (data: any, accept: (err: Error | null) => void) => void;
}): (data: {
    headers: {
        cookie: string;
    };
    url: string;
    query: Record<string, string>;
    cookie: Record<string, string> | undefined;
    sessionID: string;
    user: {
        logged_in: boolean;
    };
}, accept: (err: Error | null) => void) => void;
export {};
