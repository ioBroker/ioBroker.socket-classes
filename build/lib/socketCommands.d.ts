import type { Socket as WebSocketClient } from '@iobroker/ws-server';
import { type PermissionCommands, type SocketSubscribeTypes, type SocketOperation, type SocketCallback } from '../types';
/**
 * The options of an outbound message, as far as this package needs them.
 *
 * `timeout` has always been there. `user` is read by js-controller 7.2.5 and newer and silently
 * ignored by older ones, and it is not in the older `@iobroker/types` this package builds against -
 * hence the own declaration.
 */
interface MessageSendOptions {
    /** Reject/err-callback if no answer arrives in time (single targets only) */
    timeout?: number;
    /** The user the message is sent on behalf of */
    user?: `system.user.${string}`;
}
export declare const COMMANDS_PERMISSIONS: Record<PermissionCommands, {
    type: 'object' | 'state' | 'users' | 'other' | 'file' | '';
    operation: SocketOperation;
}>;
export type AdapterRating = {
    rating: {
        r: number;
        c: number;
    };
    [version: string]: {
        r: number;
        c: number;
    };
};
export type Ratings = {
    [adapterName: string]: AdapterRating;
} & {
    uuid: string;
};
export type SupportedFeature = 'ALIAS' | 'ALIAS_SEPARATE_READ_WRITE_ID' | 'ADAPTER_GETPORT_BIND' | 'ADAPTER_DEL_OBJECT_RECURSIVE' | 'ADAPTER_SET_OBJECT_SETS_DEFAULT_VALUE' | 'ADAPTER_AUTO_DECRYPT_NATIVE' | 'PLUGINS' | 'CONTROLLER_NPM_AUTO_REBUILD' | 'CONTROLLER_READWRITE_BASE_SETTINGS' | 'CONTROLLER_MULTI_REPO' | 'CONTROLLER_LICENSE_MANAGER' | 'CONTROLLER_OS_PACKAGE_UPGRADE' | 'DEL_INSTANCE_CUSTOM' | 'CUSTOM_FULL_VIEW' | 'ADAPTER_GET_OBJECTS_BY_ARRAY' | 'CONTROLLER_UI_UPGRADE' | 'ADAPTER_WEBSERVER_UPGRADE' | 'INSTANCE_MESSAGES' | 'PARTIAL_OBJECT_TREE'
/** The command `getObjectsCount` counts the objects instead of the client reading them all */
 | 'OBJECTS_COUNT';
export interface SocketDataContext {
    language?: ioBroker.Languages;
    ratings: Ratings | null;
    ratingTimeout: NodeJS.Timeout | null;
}
export declare class SocketCommands {
    #private;
    static ERROR_PERMISSION: string;
    /** Commands that must be executed even when the access token of the socket has expired */
    static COMMANDS_WITHOUT_SESSION_CHECK: string[];
    static COMMANDS_PERMISSIONS: Record<string, {
        type: 'object' | 'state' | 'users' | 'other' | 'file' | '';
        operation: SocketOperation;
    }>;
    protected adapter: ioBroker.Adapter;
    protected context: SocketDataContext;
    protected commands: Record<string, (socket: WebSocketClient, ...args: any[]) => void>;
    protected subscribes: Record<string, Record<string, number>>;
    adapterName: string | undefined;
    protected _sendToHost: ((id: string, command: string, data: any, callback: (result: {
        error?: string;
        result?: any;
    }) => void) => void) | null;
    states: Record<string, ioBroker.State> | undefined;
    /**
     * Finish the authentication of a socket with an access token the client announced.
     * Set by `SocketCommon`, which is the only one that knows how to calculate the ACL of a user.
     */
    authenticateSocket: ((socket: WebSocketClient, user: string, expiresAt: number, callback: (success: boolean) => void) => void) | null;
    constructor(adapter: ioBroker.Adapter, updateSession?: (socket: WebSocketClient) => boolean, context?: SocketDataContext);
    /**
     * Convert errors into strings and then call cb
     *
     * @param callback Callback function
     * @param error Error
     * @param args Arguments passed to callback
     */
    static _fixCallback(callback: SocketCallback | null | undefined, error: string | Error | null | undefined, ...args: any[]): void;
    _checkPermissions(socket: WebSocketClient, command: PermissionCommands, callback: ((error: string | null, ...args: any[]) => void) | undefined, ...args: any[]): boolean;
    /**
     * Give one event to one connection, if it is subscribed to it and may see it.
     *
     * Returns whether the event is on its way to this client: `true` where it was sent, and also
     * where it is waiting for the database to decide whether this user may read the object - the
     * answer to that is not worth holding up every other connection for. `false` means the client is
     * not subscribed to it, or may not see it.
     *
     * @param socket the connection
     * @param type what kind of event it is
     * @param id the object it is about
     * @param obj the state or object as it is sent to the client
     */
    publish(socket: WebSocketClient, type: SocketSubscribeTypes, id: string, obj: ioBroker.Object | ioBroker.State | null | undefined): boolean;
    /**
     * Give one file event to one connection, if it is subscribed to it and may see it.
     *
     * The decision is taken on the meta object the files belong to - `vis.0` for every file of vis -
     * which is one question per adapter and user instead of one per file, and it still works where the
     * file the event is about has just been deleted. Per-file owners and modes, which `chownFile` and
     * `chmodFile` can set, are not looked at; that needs the same canonical check from the controller
     * that the state events want.
     *
     * The answer means the same as in {@link publish}: `true` where the event is on its way.
     *
     * @param socket the connection
     * @param id the adapter the file belongs to, e.g. `vis.0`
     * @param fileName the path of the file inside it
     * @param size how big it is now, or null where it is gone
     */
    publishFile(socket: WebSocketClient, id: string, fileName: string, size: number | null): boolean;
    /**
     * The send options for a message triggered by this socket: the user it is sent on behalf of.
     *
     * Objects, states and files have always been read and written with `{ user }` so the database
     * applies the ACLs of the logged-in user. A message had no such channel: the receiving instance saw
     * `from` and nothing else, so every adapter reachable over `sendTo` had to act with its own rights,
     * and could not tell one caller from another. The user travels with the message now: js-controller
     * 7.2.5 and newer put it into the message as `obj.user`, older ones ignore the option, so nothing
     * breaks. A receiver treats the field as optional - where nobody was named there is nothing to
     * check against, which is how every message looked before.
     *
     * @param socket the socket the command came in on
     */
    protected static sendOptionsOf(socket: WebSocketClient): MessageSendOptions | undefined;
    publishInstanceMessage(socket: WebSocketClient, sourceInstance: string, messageType: string, data: any): boolean;
    _showSubscribes(socket: WebSocketClient, type: SocketSubscribeTypes): void;
    isLogEnabled(): boolean;
    subscribe(socket: WebSocketClient | null, type: SocketSubscribeTypes, pattern: string, patternFile?: string): void;
    unsubscribe(socket: WebSocketClient, type: SocketSubscribeTypes, pattern: string, patternFile?: string): void;
    subscribeSocket(socket: WebSocketClient, type?: SocketSubscribeTypes): void;
    unsubscribeSocket(socket: WebSocketClient, type?: SocketSubscribeTypes): void;
    _unsubscribeFiles(socket: WebSocketClient, id: string, pattern: string | string[], callback?: (error: string | null) => void): void;
    addCommandHandler(command: string, handler?: (socket: WebSocketClient, ...args: any[]) => void): void;
    getCommandHandler(command: string): (socket: WebSocketClient, ...args: any[]) => void;
    /**
     * Converts old structures of config definitions into new one - `adminUI`
     *
     * @param obj Instance or adapter object to be converted
     */
    protected fixAdminUI(obj: ioBroker.AdapterObject | ioBroker.InstanceObject): void;
    protected _initCommandsCommon(): void;
    /** Init commands for files */
    protected _initCommandsFiles(): void;
    /** Init commands for states */
    protected _initCommandsStates(): void;
    /** Init commands for objects */
    protected _initCommandsObjects(): void;
    applyCommands(socket: WebSocketClient): void;
    disableEventThreshold(): void;
    destroy(): void;
}
export {};
