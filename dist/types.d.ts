export type SocketOperation = 'read' | 'write' | 'list' | 'delete' | 'create' | 'http' | 'execute' | 'sendto' | '';

export interface InternalStorageToken {
    token: string;
    exp: number;
    user: string;
}

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
    | 'requireLog'
    | 'createState'
    | 'createFile'
    | 'deleteFile'
    | 'disconnect'
    | 'listPermissions'

    // admin
    | 'getHostByIp'
    | 'delGroup'
    | 'addGroup'
    | 'delUser'
    | 'addUser'
    | 'changePassword'
    | 'readLogs'
    | 'delState'
    | 'extendObject';

export type SocketSubscribeTypes = 'fileChange' | 'stateChange' | 'objectChange' | 'log';

export interface CallOptions {
    user?: string;
}

export type SocketCallback = (error: string | Error | null | undefined, ...args: any[]) => void;
