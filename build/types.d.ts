export type SocketOperation = 'read' | 'write' | 'list' | 'delete' | 'create' | 'http' | 'execute' | 'sendto' | '';

/**
 * A file sent along with a `cmdExec` command. The controller writes it to a temporary folder and the
 * command can refer to it just by its name. Requires controller feature `CONTROLLER_CMD_EXEC_FILES`.
 */
export interface CommandFile {
    /** File name (without path; the command refers to the file by this name) */
    name: string;
    /** File content, base64 encoded (binary Buffers cannot be transferred over the socket) */
    file: string;
    /** If true, the temporary file is not deleted after the command finished */
    doNotDelete?: boolean;
}

// We must save both tokens, as by logout we must revoke both
export interface InternalStorageToken {
    /** Access token */
    aToken: string;
    /** According refresh token */
    rToken: string;
    /** Expiration time of the access token */
    aExp: number;
    /** Expiration time of the refresh token */
    rExp: number;
    /** User ID */
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
