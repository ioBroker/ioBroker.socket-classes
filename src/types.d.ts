export type SocketOperation = 'read' | 'write' | 'list' | 'delete' | 'create' | 'http' | 'execute' | 'sendto';

export type PermissionCommands =
    | 'subscribe'
    | 'unsubscribe'
    | 'subscribeFiles'
    | 'unsubscribeFiles'
    | 'getStateHistory'
    | 'httpGet'
    | 'sendTo'
    | 'cmdExec'
    | 'sendToHost'
    | 'authEnabled'
    | 'getUserPermissions'
    | 'getVersion'
    | 'getAdapterName'

    | 'readFile'
    | 'readFile64'
    | 'writeFile64'
    | 'writeFile'
    | 'unlink'
    | 'rename'
    | 'mkdir'
    | 'readDir'
    | 'chmodFile'
    | 'chownFile'
    | 'fileExists'

    | 'getObject'
    | 'setObject'
    | 'getObjects'
    | 'subscribeObjects'
    | 'unsubscribeObjects'

    | 'getStates'
    | 'getState'
    | 'setState'
    | 'getObjectView'
    | 'delObject'

    // admin
    | 'getHostByIp'
    | 'delGroup'
    | 'addGroup'
    | 'delUser'
    | 'addUser'
    | 'changePassword'
    | 'readLogs'
    | 'delState'
    | 'extendObject'
;

export const COMMANDS_PERMISSIONS: Record<PermissionCommands, { type: 'object' | 'state', operation: SocketOperation }> = {
    getObject: { type: 'object', operation: 'read' },
    getObjects: { type: 'object', operation: 'list' },
    getObjectView: { type: 'object', operation: 'list' },
    setObject: { type: 'object', operation: 'write' },
    requireLog: { type: 'object', operation: 'write' }, // just mapping to some command
    delObject: { type: 'object', operation: 'delete' },
    extendObject: { type: 'object', operation: 'write' },
    getHostByIp: { type: 'object', operation: 'list' },
    subscribeObjects: { type: 'object', operation: 'read' },
    unsubscribeObjects: { type: 'object', operation: 'read' },

    getStates: { type: 'state', operation: 'list' },
    getState: { type: 'state', operation: 'read' },
    setState: { type: 'state', operation: 'write' },
    delState: { type: 'state', operation: 'delete' },
    createState: { type: 'state', operation: 'create' },
    subscribe: { type: 'state', operation: 'read' },
    unsubscribe: { type: 'state', operation: 'read' },
    getStateHistory: { type: 'state', operation: 'read' },
    getVersion: { type: '', operation: '' },
    getAdapterName: { type: '', operation: '' },

    addUser: { type: 'users', operation: 'create' },
    delUser: { type: 'users', operation: 'delete' },
    addGroup: { type: 'users', operation: 'create' },
    delGroup: { type: 'users', operation: 'delete' },
    changePassword: { type: 'users', operation: 'write' },

    httpGet: { type: 'other', operation: 'http' },
    cmdExec: { type: 'other', operation: 'execute' },
    sendTo: { type: 'other', operation: 'sendto' },
    sendToHost: { type: 'other', operation: 'sendto' },
    readLogs: { type: 'other', operation: 'execute' },

    readDir: { type: 'file', operation: 'list' },
    createFile: { type: 'file', operation: 'create' },
    writeFile: { type: 'file', operation: 'write' },
    readFile: { type: 'file', operation: 'read' },
    fileExists: { type: 'file', operation: 'read' },
    deleteFile: { type: 'file', operation: 'delete' },
    readFile64: { type: 'file', operation: 'read' },
    writeFile64: { type: 'file', operation: 'write' },
    unlink: { type: 'file', operation: 'delete' },
    rename: { type: 'file', operation: 'write' },
    mkdir: { type: 'file', operation: 'write' },
    chmodFile: { type: 'file', operation: 'write' },
    chownFile: { type: 'file', operation: 'write' },
    subscribeFiles: { type: 'file', operation: 'read' },
    unsubscribeFiles: { type: 'file', operation: 'read' },

    authEnabled: { type: '', operation: '' },
    disconnect: { type: '', operation: '' },
    listPermissions: { type: '', operation: '' },
    getUserPermissions: { type: 'object', operation: 'read' }
};

export type SocketSubscribeTypes = 'fileChange' | 'stateChange' | 'objectChange' | 'log';

export interface CallOptions {
    user?: string;
}

export type SocketCallback = (error: string | Error | null | undefined, ...args: any[]) => void;

export interface SocketClient {
    id: string;
    _sessionID: string;
    ___socket: SocketClient;
    _secure: boolean;
    _authPending: ((isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void) | null;
    emit: (command: SocketTextCommands, ...args: any[]) => void;
    on: (command: SocketTextCommands, callback: (...args: any[]) => void) => void;
    _acl: {
        user: `system.user.${string}`;
        groups: `system.group.${string}`[];
        object?: {
            read: boolean;
            write: boolean;
            create: boolean;
            list: boolean;
            delete: boolean;
        }
        state?: {
            read: boolean;
            write: boolean;
            create: boolean;
            list: boolean;
            delete: boolean;
        }
    };
    subscribe: {
        fileChange: { regex: RegExp, pattern: string }[];
        stateChange: { regex: RegExp, pattern: string }[];
        objectChange: { regex: RegExp, pattern: string }[];
        log: { regex: RegExp, pattern: string }[];
    };
}
