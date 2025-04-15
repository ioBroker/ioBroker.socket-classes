/**
 *      Class Socket
 *
 *      Copyright 2014-2025 bluefox <dogafox@gmail.com>,
 *      MIT License
 *
 */
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { SocketIO, Socket as WebSocketClient, SocketACL } from '@iobroker/ws-server';
import { SocketCommands, type SocketDataContext } from './socketCommands';
import type { Store } from './passportSocket';
import type { PermissionCommands, SocketSubscribeTypes } from '../types';
import type { AddressInfo } from 'node:net';
import type { SocketCommandsAdmin } from './socketCommandsAdmin';
export interface WhiteListSettings {
    /** Like "admin" or "user". No "system.user." prefix */
    user: string;
    object: {
        read: boolean;
        list: boolean;
        write: boolean;
        delete: boolean;
    };
    state: {
        read: boolean;
        list: boolean;
        write: boolean;
        create: boolean;
        delete: boolean;
    };
    file: {
        read: boolean;
        list: boolean;
        write: boolean;
        create: boolean;
        delete: boolean;
    };
}
export interface SocketSettings {
    language?: ioBroker.Languages;
    defaultUser?: string;
    ttl?: number;
    secure?: boolean;
    auth?: boolean;
    whiteListSettings?: Record<string, WhiteListSettings>;
    extensions?: (socket: WebSocketClient) => void;
    port?: number;
    noBasicAuth?: boolean;
    secret: string;
    compatibilityV2?: boolean;
    forceWebSockets?: boolean;
    crossDomain?: boolean;
}
export interface SocketIoOptions {
    transports?: 'websocket'[];
    allowEIO3?: boolean;
    cookie?: {
        cookieName: string;
        cookieHttpOnly: boolean;
        cookiePath: string;
    };
    maxHttpBufferSize?: number;
    pingInterval: number;
    pingTimeout: number;
    cors?: {
        origin: number;
        allowedHeaders: string[];
        credentials: boolean;
    };
}
export type Server = HttpServer | HttpsServer;
export type EventNames = 'connect' | 'disconnect' | 'error';
export declare class SocketCommon {
    #private;
    static COMMAND_RE_AUTHENTICATE: string;
    protected server: SocketIO | null;
    private serverMode;
    protected settings: SocketSettings;
    protected readonly adapter: ioBroker.Adapter;
    private infoTimeout;
    protected store: Store | null;
    protected commands: SocketCommands | SocketCommandsAdmin | null;
    private readonly noDisconnect;
    private readonly eventHandlers;
    private readonly wsRoutes;
    private allNamespaces;
    protected readonly context: SocketDataContext;
    private initialized;
    constructor(settings: SocketSettings, adapter: ioBroker.Adapter);
    __getIsNoDisconnect(): boolean;
    __initAuthentication(_authOptions: {
        store: Store;
        secret?: string;
        oauth2Only?: boolean;
        noBasicAuth?: boolean;
        checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
            logged_in: boolean;
            user?: string;
        }) => void) => void;
    }): void;
    /** Get user from pure WS socket (used in `iobroker.admin` and `iobroker.ws`) */
    __getUserFromSocket(socket: WebSocketClient, callback: (error: string | null, user?: string, expirationTime?: number) => void): void;
    /** Get client address from socket */
    __getClientAddress(socket: WebSocketClient): AddressInfo;
    __updateSession(socket: WebSocketClient): boolean;
    __getSessionID(_socket: WebSocketClient): string | null;
    /** Install handler on connecting and disconnecting events */
    addEventHandler(eventName: EventNames, handler: (socket: WebSocketClient, error?: string) => void): void;
    /**
     * Add a new route for the websocket
     *
     * @param path the path to listen for like "/cameras.0/*"
     * @param handler Web socket custom handler
     */
    addWsRoute(path: string, handler: (socket: WebSocketClient, cb: (customHandler?: boolean) => void) => void): void;
    start(server: Server, socketClass: typeof SocketIO, authOptions: {
        store: Store;
        secret?: string;
        oauth2Only?: boolean;
        noBasicAuth?: boolean;
        checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
            logged_in: boolean;
            user?: string;
        }) => void) => void;
    }, socketOptions?: SocketIoOptions): void;
    _initSocket(socket: WebSocketClient, cb?: (customHandler?: boolean) => void): void;
    unsubscribeSocket(socket: WebSocketClient, type?: SocketSubscribeTypes): void;
    _unsubscribeAll(): void;
    static getWhiteListIpForAddress(address: string, whiteList: {
        [address: string]: WhiteListSettings;
    }): string | null;
    static _getPermissionsForIp(address: string, whiteList: Record<string, WhiteListSettings>): WhiteListSettings | undefined;
    static _mergeACLs(address: string, acl: SocketACL, whiteList: Record<string, WhiteListSettings> | undefined): SocketACL;
    _socketEvents(socket: WebSocketClient, address: string, cb?: (customHandler?: boolean) => void): void;
    checkPermissions(socket: WebSocketClient, command: PermissionCommands, callback: ((error: string | null, ...args: any[]) => void) | undefined, ...args: any[]): boolean;
    addCommandHandler(command: string, handler?: (socket: WebSocketClient, ...args: any[]) => void): void;
    sendLog(obj: ioBroker.LogMessage): void;
    publish(socket: WebSocketClient, type: SocketSubscribeTypes, id: string, obj: ioBroker.Object | ioBroker.State | null | undefined): boolean;
    publishInstanceMessage(socket: WebSocketClient, sourceInstance: string, messageType: string, data: any): boolean;
    publishFile(socket: WebSocketClient, id: string, fileName: string, size: number | null): boolean;
    getSocketsList(): WebSocketClient[] | null | Record<string, WebSocketClient>;
    publishInstanceMessageAll(sourceInstance: string, messageType: string, sid: string, data: any): void;
    close(): void;
}
