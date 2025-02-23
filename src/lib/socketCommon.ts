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
import type { InternalStorageToken, PermissionCommands, SocketSubscribeTypes } from '../types';
import type { AddressInfo } from 'node:net';
import type { CommandsPermissionsObject } from '@iobroker/types/build/types';
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

    // For authentication
    secret: string;

    // socket.io attributes
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
        // for socket.4.x
        origin: number;
        allowedHeaders: string[];
        credentials: boolean;
    };
}

export type Server = HttpServer | HttpsServer;

export type EventNames = 'connect' | 'disconnect' | 'error';

// this class can manage 3 types of Socket.io
// - socket.io v2
// - socket.io v4
// - iobroker ws socket

export class SocketCommon {
    static COMMAND_RE_AUTHENTICATE = 'reauthenticate';

    protected server: SocketIO | null = null;
    private serverMode: boolean = false;
    protected settings: SocketSettings;
    protected readonly adapter: ioBroker.Adapter;
    private infoTimeout: NodeJS.Timeout | null = null;
    protected store: Store | null = null; // will be set in __initAuthentication
    // @ts-expect-error commands actually cannot be null
    protected commands: SocketCommands | SocketCommandsAdmin;
    private readonly noDisconnect: boolean;
    private readonly eventHandlers: { [eventName: string]: (socket: WebSocketClient, error?: string) => void } = {};
    private readonly wsRoutes: Record<string, (ws: WebSocketClient, cb: (customHandler?: boolean) => void) => void> =
        {};
    // Structure for socket.io 4
    private allNamespaces: any;
    protected readonly context: SocketDataContext;
    private initialized = false;

    constructor(settings: SocketSettings, adapter: ioBroker.Adapter) {
        this.settings = settings || {};
        this.adapter = adapter;
        this.noDisconnect = this.__getIsNoDisconnect();

        this.settings.defaultUser = this.settings.defaultUser || 'system.user.admin';
        if (!this.settings.defaultUser.match(/^system\.user\./)) {
            this.settings.defaultUser = `system.user.${this.settings.defaultUser}`;
        }

        this.settings.ttl = parseInt(this.settings.ttl as unknown as string, 10) || 3600;
        this.context = {
            language: this.settings.language,
            ratings: null,
            ratingTimeout: null,
        };
    }

    __getIsNoDisconnect(): boolean {
        throw new Error('"__getIsNoDisconnect" must be implemented in SocketCommon!');
    }

    __initAuthentication(_authOptions: {
        store: Store;
        secret?: string;
        oauth2Only?: boolean;
        checkUser?: (
            user: string,
            pass: string,
            cb: (
                error: Error | null,
                result?: {
                    logged_in: boolean;
                    user?: string;
                },
            ) => void,
        ) => void;
    }): void {
        throw new Error('"__initAuthentication" must be implemented in SocketCommon!');
    }

    // Extract username from socket
    __getUserFromSocket(
        _socket: WebSocketClient,
        _callback: (error: string | null, user?: string, expirationTime?: number) => void,
    ): void {
        throw new Error('"__getUserFromSocket" must be implemented in SocketCommon!');
    }

    __getClientAddress(_socket: WebSocketClient): AddressInfo {
        throw new Error('"__getClientAddress" must be implemented in SocketCommon!');
    }

    // update session ID, but not ofter than 60 seconds
    __updateSession(_socket: WebSocketClient): boolean {
        throw new Error('"__updateSession" must be implemented in SocketCommon!');
    }

    __getSessionID(_socket: WebSocketClient): string | null {
        throw new Error('"__getSessionID" must be implemented in SocketCommon!');
    }

    /** Install handler on connecting and disconnecting events */
    addEventHandler(eventName: EventNames, handler: (socket: WebSocketClient, error?: string) => void): void {
        this.eventHandlers[eventName] = handler;
    }

    /**
     * Add a new route for the websocket
     *
     * @param path the path to listen for like "/cameras.0/*"
     * @param handler Web socket custom handler
     */
    addWsRoute(path: string, handler: (socket: WebSocketClient, cb: (customHandler?: boolean) => void) => void): void {
        this.wsRoutes[path] = handler;
    }

    start(
        server: Server,
        socketClass: typeof SocketIO,
        authOptions: {
            store: Store;
            secret?: string;
            oauth2Only?: boolean;
            checkUser?: (
                user: string,
                pass: string,
                cb: (
                    error: Error | null,
                    result?: {
                        logged_in: boolean;
                        user?: string;
                    },
                ) => void,
            ) => void;
        },
        socketOptions?: SocketIoOptions,
    ): void {
        this.serverMode = !!socketClass;

        this.commands ||= new SocketCommands(this.adapter, socket => this.__updateSession(socket), this.context);

        if (!server) {
            throw new Error('Server cannot be empty');
        }

        // it can be used as a client too for cloud
        if (socketClass) {
            if (!this.initialized) {
                // @ts-expect-error socket.io v2 has listen function
                if (typeof socketClass.listen === 'function') {
                    // old socket.io@2.x and ws
                    // @ts-expect-error socket.io v2 has the listen function
                    this.server = socketClass.listen(server, socketOptions);
                } else if (typeof socketClass.constructor === 'function') {
                    // iobroker socket
                    this.server = new socketClass(server);
                } else {
                    // socket.io 4.x
                    // @ts-expect-error socket.io v4 could be created without new
                    this.server = socketClass(server, socketOptions);
                }

                // @ts-expect-error socket.io v4 supports namespaces
                if (typeof this.server.of === 'function') {
                    // @ts-expect-error socket.io v4 supports namespaces
                    this.allNamespaces = this.server.of(/.*/);
                }

                this.initialized = true;
                this.adapter.log.info(
                    `${this.settings.secure ? 'Secure ' : ''}socket.io server listening on port ${this.settings.port}`,
                );
            }

            if (this.settings.auth && this.server) {
                this.__initAuthentication(authOptions);
            }

            // Enable cross-domain access
            // deprecated, because no more used in socket.io@4 only(in @2)
            // @ts-expect-error socket.io v2 has "set" for options
            if (this.settings.crossDomain && this.server.set) {
                // @ts-expect-error socket.io v2 has "set" for options
                this.server.set('origins', '*:*');
            }

            this.server!.on('connection', (socket: WebSocketClient, cb: (customHandler?: boolean) => void): void => {
                // Support of handlers for web sockets by path
                // Todo: support of wildcards like /cameras.0/*
                if (socket.conn?.request?.pathname && this.wsRoutes[socket.conn.request.pathname]) {
                    this.wsRoutes[socket.conn.request.pathname](socket, cb);
                    return;
                }
                this.eventHandlers.connect?.(socket);
                this._initSocket(socket, cb);
            });

            // support of dynamic namespaces (because of reverse proxy) for socket.io 4
            this.allNamespaces?.on('connection', (socket: WebSocketClient, cb: (customHandler?: boolean) => void) => {
                // Support of handlers for web sockets by path
                // Todo: support of wildcards like /cameras.0/*
                if (socket.conn?.request?.pathname && this.wsRoutes[socket.conn.request.pathname]) {
                    this.wsRoutes[socket.conn.request.pathname](socket, cb);
                    return;
                }

                this.eventHandlers.connect?.(socket);
                this._initSocket(socket, cb);
            });
        }

        this.server!.on('error', (error: Error, details: unknown): void => {
            // ignore "failed connection" as it already shown
            if (!error?.message?.includes('failed connection')) {
                if (
                    error?.message?.includes('authentication failed') ||
                    details?.toString().includes('authentication failed')
                ) {
                    this.adapter.log.debug(
                        `Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : (details as string).toString()}` : ''}`,
                    );
                } else {
                    this.adapter.log.error(
                        `Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : (details as string).toString()}` : ''}`,
                    );
                }
            }
        });

        // support of dynamic namespaces (because of reverse proxy)
        this.allNamespaces?.on('error', (error: Error, details: unknown): void => {
            // ignore "failed connection" as it already shown
            if (!error?.message?.includes('failed connection')) {
                if (error && error.message && error.message.includes('authentication failed')) {
                    this.adapter.log.debug(
                        `Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : (details as string).toString()}` : ''}`,
                    );
                } else {
                    this.adapter.log.error(
                        `Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : (details as string).toString()}` : ''}`,
                    );
                }
            }
        });

        this.#updateConnectedInfo();
    }

    _initSocket(socket: WebSocketClient, cb: (customHandler?: boolean) => void): void {
        this.commands.disableEventThreshold();
        const address = this.__getClientAddress(socket);

        if (!socket._acl) {
            if (this.settings.auth) {
                this.__getUserFromSocket(socket, (err, user, expirationTime) => {
                    if (err || !user) {
                        socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                        this.adapter.log.error(`socket.io [init] ${err || 'No user found in cookies'}`);
                        // ws does not require disconnect
                        if (!this.noDisconnect) {
                            socket.close();
                        }
                    } else {
                        socket._secure = true;
                        socket._sessionExpiresAt = expirationTime;
                        this.adapter.log.debug(`socket.io client ${user} connected`);
                        if (!user.startsWith('system.user.')) {
                            user = `system.user.${user}`;
                        }
                        void this.adapter.calculatePermissions(
                            user,
                            SocketCommands.COMMANDS_PERMISSIONS as CommandsPermissionsObject,
                            (acl: SocketACL): void => {
                                socket._acl = SocketCommon._mergeACLs(
                                    address.address,
                                    acl,
                                    this.settings.whiteListSettings,
                                );
                                this._socketEvents(socket, address.address, cb);
                            },
                        );
                    }
                });
            } else {
                void this.adapter.calculatePermissions(
                    this.settings.defaultUser || '',
                    SocketCommands.COMMANDS_PERMISSIONS as CommandsPermissionsObject,
                    (acl: SocketACL): void => {
                        socket._acl = SocketCommon._mergeACLs(address.address, acl, this.settings.whiteListSettings);
                        this._socketEvents(socket, address.address, cb);
                    },
                );
            }
        } else {
            this._socketEvents(socket, address.address, cb);
        }
    }

    unsubscribeSocket(socket: WebSocketClient, type: SocketSubscribeTypes): void {
        return this.commands.unsubscribeSocket(socket, type);
    }

    _unsubscribeAll(): void {
        if (this.server?.ioBroker) {
            // this could be an object or array
            const sockets = this.getSocketsList();
            // this could be an object or array: an array is ioBroker, object is socket.io
            if (Array.isArray(sockets)) {
                for (const socket of sockets) {
                    this.commands.unsubscribeSocket(socket);
                }
            } else {
                Object.values(sockets as Record<string, WebSocketClient>).forEach(socket => {
                    this.commands.unsubscribeSocket(socket);
                });
            }
        } else if (this.server?.sockets) {
            // It is socket.io
            for (const socket in this.server.sockets) {
                if (Object.prototype.hasOwnProperty.call(this.server.sockets, socket)) {
                    // @ts-expect-error socket.io has own structure
                    this.commands.unsubscribeSocket(this.server.sockets[socket]);
                }
            }
        }
    }

    static getWhiteListIpForAddress(
        address: string,
        whiteList: { [address: string]: WhiteListSettings },
    ): string | null {
        if (!whiteList) {
            return null;
        }

        // check IPv6 or IPv4 direct match
        if (Object.prototype.hasOwnProperty.call(whiteList, address)) {
            return address;
        }

        // check if the address is IPv4
        const addressParts = address.split('.');
        if (addressParts.length !== 4) {
            return null;
        }

        // do we have settings for wild-carded ips?
        const wildCardIps = Object.keys(whiteList).filter(key => key.includes('*'));

        if (!wildCardIps.length) {
            // no wild-carded ips => no ip configured
            return null;
        }

        wildCardIps.forEach(ip => {
            const ipParts = ip.split('.');
            if (ipParts.length === 4) {
                for (let i = 0; i < 4; i++) {
                    if (ipParts[i] === '*' && i === 3) {
                        // match
                        return ip;
                    }

                    if (ipParts[i] !== addressParts[i]) {
                        break;
                    }
                }
            }
        });

        return null;
    }

    static _getPermissionsForIp(
        address: string,
        whiteList: Record<string, WhiteListSettings>,
    ): WhiteListSettings | undefined {
        return whiteList[SocketCommon.getWhiteListIpForAddress(address, whiteList) || 'default'];
    }

    static _mergeACLs(
        address: string,
        acl: SocketACL,
        whiteList: Record<string, WhiteListSettings> | undefined,
    ): SocketACL {
        if (whiteList && address) {
            const whiteListAcl = SocketCommon._getPermissionsForIp(address, whiteList);
            if (whiteListAcl) {
                if (acl.object && whiteListAcl.object) {
                    if (whiteListAcl.object.list !== undefined) {
                        acl.object.list = acl.object.list && whiteListAcl.object.list;
                    }
                    if (whiteListAcl.object.read !== undefined) {
                        acl.object.read = acl.object.read && whiteListAcl.object.read;
                    }
                    if (whiteListAcl.object.write !== undefined) {
                        acl.object.write = acl.object.write && whiteListAcl.object.write;
                    }
                    if (whiteListAcl.object.delete !== undefined) {
                        acl.object.delete = acl.object.delete && whiteListAcl.object.delete;
                    }
                }
                if (acl.state && whiteListAcl.state) {
                    if (whiteListAcl.state.list !== undefined) {
                        acl.state.list = acl.state.list && whiteListAcl.state.list;
                    }
                    if (whiteListAcl.state.read !== undefined) {
                        acl.state.read = acl.state.read && whiteListAcl.state.read;
                    }
                    if (whiteListAcl.state.write !== undefined) {
                        acl.state.write = acl.state.write && whiteListAcl.state.write;
                    }
                    if (whiteListAcl.state.create !== undefined) {
                        acl.state.create = acl.state.create && whiteListAcl.state.create;
                    }
                    if (whiteListAcl.state.delete !== undefined) {
                        acl.state.delete = acl.state.delete && whiteListAcl.state.delete;
                    }
                }
                if (acl.file && whiteListAcl.file) {
                    if (whiteListAcl.file.list !== undefined) {
                        acl.file.list = acl.file.list && whiteListAcl.file.list;
                    }
                    if (whiteListAcl.file.read !== undefined) {
                        acl.file.read = acl.file.read && whiteListAcl.file.read;
                    }
                    if (whiteListAcl.file.write !== undefined) {
                        acl.file.write = acl.file.write && whiteListAcl.file.write;
                    }
                    if (whiteListAcl.file.create !== undefined) {
                        acl.file.create = acl.file.create && whiteListAcl.file.create;
                    }
                    if (whiteListAcl.file.delete !== undefined) {
                        acl.file.delete = acl.file.delete && whiteListAcl.file.delete;
                    }
                }

                if (whiteListAcl.user !== 'auth') {
                    acl.user = `system.user.${whiteListAcl.user}`;
                }
            }
        }

        return acl;
    }

    // install event handlers on socket
    _socketEvents(socket: WebSocketClient, address: string, cb: (customHandler?: boolean) => void): void {
        if (this.serverMode) {
            this.adapter.log.info(`==> Connected ${socket._acl?.user} from ${address}`);
        } else {
            this.adapter.log.info(`Trying to connect as ${socket._acl?.user} to ${address}`);
        }

        this.#updateConnectedInfo();

        if (!this.commands.getCommandHandler('name')) {
            // socket sends its name => update list of sockets
            this.addCommandHandler('name', (_socket: WebSocketClient, name: string, cb: () => void): void => {
                this.adapter.log.debug(`Connection from "${name}"`);
                if (_socket._name === undefined) {
                    _socket._name = name;
                    this.#updateConnectedInfo();
                } else if (_socket._name !== name) {
                    this.adapter.log.warn(`socket ${_socket.id} changed socket name from ${_socket._name} to ${name}`);
                    _socket._name = name;
                    this.#updateConnectedInfo();
                }

                if (typeof cb === 'function') {
                    cb();
                }
            });
        }

        this.commands.applyCommands(socket);

        // disconnect
        socket.on('disconnect', (error: unknown): void => {
            this.commands.unsubscribeSocket(socket);
            this.#updateConnectedInfo();

            // Disable logging if no one browser is connected
            if (this.adapter.requireLog && this.commands?.isLogEnabled()) {
                this.adapter.log.debug('Disable logging, because no one socket connected');
                void this.adapter.requireLog(!!this.server?.engine?.clientsCount);
            }

            if (socket._sessionTimer) {
                clearTimeout(socket._sessionTimer);
                socket._sessionTimer = undefined;
            }

            if (this.eventHandlers.disconnect) {
                this.eventHandlers.disconnect(socket, error?.toString());
            } else {
                this.adapter.log.info(
                    `<== Disconnect ${socket._acl?.user} from ${this.__getClientAddress(socket).address} ${socket._name || ''}`,
                );
            }
        });

        if (typeof this.settings.extensions === 'function') {
            this.settings.extensions(socket);
        }

        // if server mode
        if (this.serverMode) {
            let accessToken: string | undefined;
            if (socket.conn.request.headers?.cookie) {
                // If OAuth2 authentication is used
                accessToken = socket.conn.request.headers.cookie
                    .split(';')
                    .find(c => c.trim().startsWith('access_token='));

                if (accessToken) {
                    socket._secure = true;
                    const parts = accessToken.split('=');
                    this.store?.get(`a:${parts[1]}`, (err, token: any): void => {
                        const tokenData = token as InternalStorageToken;
                        if (err || !tokenData?.user) {
                            if (socket._acl) {
                                socket._acl.user = '';
                            }
                            socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                            // ws does not require disconnect
                            if (!this.noDisconnect) {
                                socket.close();
                            }
                        }
                        if (socket._authPending) {
                            socket._authPending(!!socket._acl?.user, true);
                            delete socket._authPending;
                        }
                    });
                }
            }
            if (!accessToken) {
                // Legacy Session ID method
                const sessionId = this.__getSessionID(socket);
                if (sessionId) {
                    socket._secure = true;
                    socket._sessionID = sessionId;
                    // Get user for session
                    this.store?.get(socket._sessionID, (err, obj) => {
                        if (!obj?.passport) {
                            if (socket._acl) {
                                socket._acl.user = '';
                            }
                            socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                            // ws does not require disconnect
                            if (!this.noDisconnect) {
                                socket.close();
                            }
                        }
                        if (socket._authPending) {
                            socket._authPending(!!socket._acl?.user, true);
                            delete socket._authPending;
                        }
                    });
                }
            }
        }

        this.commands.subscribeSocket(socket);

        if (cb) {
            cb();
        }
    }

    #updateConnectedInfo(): void {
        // only in server mode
        if (this.serverMode) {
            if (this.infoTimeout) {
                clearTimeout(this.infoTimeout);
                this.infoTimeout = null;
            }
            this.infoTimeout = setTimeout(() => {
                this.infoTimeout = null;

                if (this.server) {
                    const clientsArray: string[] = [];
                    const sockets = this.getSocketsList();
                    // this could be an object or array: an array is ioBroker, object is socket.io
                    if (Array.isArray(sockets)) {
                        for (const socket of sockets) {
                            clientsArray.push(socket._name || 'noname');
                        }
                    } else {
                        Object.values(sockets as Record<string, WebSocketClient>).forEach(socket => {
                            clientsArray.push(socket._name || 'noname');
                        });
                    }

                    const text = `[${clientsArray.length}]${clientsArray.join(', ')}`;
                    void this.adapter.setState('info.connected', text, true);
                }
            }, 1000);
        }
    }

    checkPermissions(
        socket: WebSocketClient,
        command: PermissionCommands,
        callback: ((error: string | null, ...args: any[]) => void) | undefined,
        ...args: any[]
    ): boolean {
        return this.commands._checkPermissions(socket, command, callback, args);
    }

    addCommandHandler(command: string, handler: (socket: WebSocketClient, ...args: any[]) => void): void {
        this.commands.addCommandHandler(command, handler);
    }

    sendLog(obj: ioBroker.LogMessage): void {
        // TODO Build in some threshold
        this.server?.sockets?.emit('log', obj);
    }

    publish(
        socket: WebSocketClient,
        type: SocketSubscribeTypes,
        id: string,
        obj: ioBroker.Object | ioBroker.State | null | undefined,
    ): boolean {
        return this.commands.publish(socket, type, id, obj);
    }

    publishInstanceMessage(socket: WebSocketClient, sourceInstance: string, messageType: string, data: any): boolean {
        return this.commands.publishInstanceMessage(socket, sourceInstance, messageType, data);
    }

    publishFile(socket: WebSocketClient, id: string, fileName: string, size: number | null): boolean {
        return this.commands.publishFile(socket, id, fileName, size);
    }

    getSocketsList(): WebSocketClient[] | null | Record<string, WebSocketClient> {
        if (this.server?.sockets) {
            // this could be an object or array
            return this.server.sockets.sockets || this.server.sockets.connected;
        }
        return null;
    }

    publishInstanceMessageAll(sourceInstance: string, messageType: string, sid: string, data: any): void {
        const sockets = this.getSocketsList();
        if (sockets) {
            // this could be an object or array: an array is ioBroker, an object is socket.io
            if (Array.isArray(sockets)) {
                for (const socket of sockets) {
                    if (socket.id === sid) {
                        this.publishInstanceMessage(socket, sourceInstance, messageType, data);
                    }
                }
            } else {
                Object.values(sockets).forEach(socket => {
                    if (socket.id === sid) {
                        this.publishInstanceMessage(socket, sourceInstance, messageType, data);
                    }
                });
            }
        }
    }

    close(): void {
        this._unsubscribeAll();

        this.commands.destroy();

        const sockets = this.getSocketsList();
        if (Array.isArray(sockets)) {
            // this could be an object or array
            for (const socket of sockets) {
                if (socket._sessionTimer) {
                    clearTimeout(socket._sessionTimer);
                    socket._sessionTimer = undefined;
                }
            }
        } else if (sockets) {
            Object.keys(sockets).forEach(i => {
                const socket = sockets[i];
                if (socket._sessionTimer) {
                    clearTimeout(socket._sessionTimer);
                    socket._sessionTimer = undefined;
                }
            });
        }

        // IO server will be closed
        try {
            this.server?.close?.();
            this.server = null;
        } catch {
            // ignore
        }

        if (this.infoTimeout) {
            clearTimeout(this.infoTimeout);
            this.infoTimeout = null;
        }
    }
}
