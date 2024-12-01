/**
 *      Class Socket
 *
 *      Copyright 2014-2023 bluefox <dogafox@gmail.com>,
 *      MIT License
 *
 */
import { Server as HttpServer } from 'node:http';
import { Server as HttpsServer } from 'node:https';
import { SocketIO } from '@iobroker/ws-server';
import SocketCommands from './socketCommands';
import { type Store } from './passportSocket';
import { SocketClient, type SocketSubscribeTypes } from './types';

interface SocketSettings {
    language?: ioBroker.Languages;
    defaultUser?: string;
    ttl?: number | string;
    secure?: boolean;
    auth?: boolean;
    crossDomain?: boolean;
    whiteListSettings?: boolean;
    extensions?: (socket: any) => void;
}

type Server = (HttpServer | HttpsServer) & { __inited?: boolean };

// this class can manage 3 types of Socket.io
// - socket.io v2
// - socket.io v4
// - iobroker ws socket

class SocketCommon {
    static COMMAND_RE_AUTHENTICATE = 'reauthenticate';

    // @ts-expect-error server actually cannot be null
    private server: SocketIO;
    private serverMode: boolean = false;
    private settings: SocketSettings;
    private readonly adapter: ioBroker.Adapter;
    private infoTimeout: NodeJS.Timeout | null = null;
    private store: Store | null = null; // will be set in __initAuthentication
    // @ts-expect-error commands actually cannot be null
    private commands: SocketCommands;
    private noDisconnect: any;
    private readonly eventHandlers: Record<string, (socket: any, error?: string) => void> = {};

    constructor(settings: SocketSettings, adapter: ioBroker.Adapter) {
        this.settings = settings || {};
        this.adapter = adapter;
        this.noDisconnect = this.__getIsNoDisconnect();
        (this.adapter as any)._language = this.settings.language;

        this.settings.defaultUser = this.settings.defaultUser || 'system.user.admin';
        if (!this.settings.defaultUser.match(/^system\.user\./)) {
            this.settings.defaultUser = `system.user.${this.settings.defaultUser}`;
        }

        this.settings.ttl = parseInt(this.settings.ttl as string, 10) || 3600;
    }

    __getIsNoDisconnect() {
        throw new Error('"__getIsNoDisconnect" must be implemented in SocketCommon!');
    }

    __initAuthentication(_authOptions: { store: Store; userKey: string; secret: string }) {
        throw new Error('"__initAuthentication" must be implemented in SocketCommon!');
    }

    // Extract username from socket
    __getUserFromSocket(_socket: SocketClient, _callback: (error: string, user?: string) => void) {
        throw new Error('"__getUserFromSocket" must be implemented in SocketCommon!');
    }

    __getClientAddress(_socket: SocketClient) {
        throw new Error('"__getClientAddress" must be implemented in SocketCommon!');
    }

    // update session ID, but not ofter than 60 seconds
    __updateSession(_socket: SocketClient): boolean {
        throw new Error('"__updateSession" must be implemented in SocketCommon!');
    }

    __getSessionID(_socket: SocketClient) {
        throw new Error('"__getSessionID" must be implemented in SocketCommon!');
    }

    addEventHandler(eventName: string, handler: (socket: any, error?: string) => void) {
        this.eventHandlers[eventName] = handler;
    }

    start(
        server: Server,
        socketClass: typeof SocketIO,
        authOptions: { store: Store; userKey: string; secret: string },
        socketOptions,
    ) {
        this.serverMode = !!socketClass;

        this.commands = this.commands || new SocketCommands(this.adapter, socket => this.__updateSession(socket));

        this.server = server;

        if (!this.server) {
            throw new Error('Server cannot be empty');
        }

        // it can be used as a client too for cloud
        if (socketClass) {
            if (!server.__inited) {
                // @ts-expect-error socket.io v2 has listen function
                if (typeof socketClass.listen === 'function') {
                    // old socket.io@2.x and ws
                    // @ts-expect-error socket.io v2 has the listen function
                    this.server = socketClass.listen(server, socketOptions);
                } else {
                    if (socketClass.constructor && typeof socketClass.constructor === 'function') {
                        // iobroker socket
                        this.server = new socketClass(server);
                    } else {
                        // socket.io 4.x
                        // @ts-expect-error socket.io v4 could be created without new
                        this.server = socketClass(server, socketOptions);
                    }
                }

                // @ts-expect-error socket.io v4 supports namespaces
                if (typeof this.server.of === 'function') {
                    // @ts-expect-error socket.io v4 supports namespaces
                    this.allNamespaces = this.server.of(/.*/);
                }

                server.__inited = true;
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

            this.server.on('connection', (socket, cb) => {
                this.eventHandlers.connect && this.eventHandlers.connect(socket);
                this._initSocket(socket, cb);
            });
            // support of dynamic namespaces (because of reverse proxy)
            this.allNamespaces?.on('connection', (socket, cb) => {
                this.eventHandlers.connect && this.eventHandlers.connect(socket);
                this._initSocket(socket, cb);
            });
        }

        this.server.on('error', (error: Error, details) => {
            // ignore "failed connection" as it already shown
            if (!error?.message?.includes('failed connection')) {
                if (
                    error?.message?.includes('authentication failed') ||
                    (details && details.toString().includes('authentication failed'))
                ) {
                    this.adapter.log.debug(
                        `Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${details}` : ''}`,
                    );
                } else {
                    this.adapter.log.error(
                        `Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${details}` : ''}`,
                    );
                }
            }
        });

        // support of dynamic namespaces (because of reverse proxy)
        this.allNamespaces?.on('error', (error: Error, details) => {
            // ignore "failed connection" as it already shown
            if (!error || !error.message || !error.message.includes('failed connection')) {
                if (error && error.message && error.message.includes('authentication failed')) {
                    this.adapter.log.debug(
                        `Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${details}` : ''}`,
                    );
                } else {
                    this.adapter.log.error(
                        `Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${details}` : ''}`,
                    );
                }
            }
        });

        this._updateConnectedInfo();
    }

    _initSocket(socket, cb) {
        this.commands.disableEventThreshold && this.commands.disableEventThreshold();
        const address = this.__getClientAddress(socket);

        if (!socket._acl) {
            if (this.settings.auth) {
                this.__getUserFromSocket(socket, (err, user) => {
                    if (err || !user) {
                        socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                        this.adapter.log.error(`socket.io [init] ${err || 'No user found in cookies'}`);
                        // ws does not require disconnect
                        if (!this.noDisconnect) {
                            socket.disconnect();
                        }
                    } else {
                        socket._secure = true;
                        this.adapter.log.debug(`socket.io client ${user} connected`);
                        if (!user.startsWith('system.user.')) {
                            user = `system.user.${user}`;
                        }
                        this.adapter.calculatePermissions(user, SocketCommands.COMMANDS_PERMISSIONS, acl => {
                            socket._acl = SocketCommon._mergeACLs(address, acl, this.settings.whiteListSettings);
                            this._socketEvents(socket, address, cb);
                        });
                    }
                });
            } else {
                this.adapter.calculatePermissions(
                    this.settings.defaultUser || '',
                    SocketCommands.COMMANDS_PERMISSIONS,
                    acl => {
                        socket._acl = SocketCommon._mergeACLs(address, acl, this.settings.whiteListSettings);
                        this._socketEvents(socket, address, cb);
                    },
                );
            }
        } else {
            this._socketEvents(socket, address, cb);
        }
    }

    unsubscribeSocket(socket: SocketClient, type: SocketSubscribeTypes) {
        return this.commands.unsubscribeSocket(socket, type);
    }

    _unsubscribeAll() {
        if (this.server?.ioBroker) {
            // this could be an object or array
            const sockets = this.getSocketsList();
            if (sockets) {
                Object.keys(sockets).forEach(i => this.commands.unsubscribeSocket(sockets[i]));
            }
        } else if (this.server?.sockets) {
            for (const socket in this.server.sockets) {
                if (Object.prototype.hasOwnProperty.call(this.server.sockets, socket)) {
                    this.commands.unsubscribeSocket(socket);
                }
            }
        }
    }

    static getWhiteListIpForAddress(address: string, whiteList: { address: string }): string | null {
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

    static _getPermissionsForIp(address: string, whiteList) {
        return whiteList[SocketCommon.getWhiteListIpForAddress(address, whiteList) || 'default'];
    }

    static _mergeACLs(address, acl, whiteList) {
        if (whiteList && address) {
            const whiteListAcl = SocketCommon._getPermissionsForIp(address, whiteList);
            if (whiteListAcl) {
                ['object', 'state', 'file'].forEach(key => {
                    if (
                        Object.prototype.hasOwnProperty.call(acl, key) &&
                        Object.prototype.hasOwnProperty.call(whiteListAcl, key)
                    ) {
                        Object.keys(acl[key]).forEach(permission => {
                            if (Object.prototype.hasOwnProperty.call(whiteListAcl[key], permission)) {
                                acl[key][permission] = acl[key][permission] && whiteListAcl[key][permission];
                            }
                        });
                    }
                });

                if (whiteListAcl.user !== 'auth') {
                    acl.user = `system.user.${whiteListAcl.user}`;
                }
            }
        }

        return acl;
    }

    // install event handlers on socket
    _socketEvents(socket, address, cb) {
        if (this.serverMode) {
            this.adapter.log.info(`==> Connected ${socket._acl.user} from ${address}`);
        } else {
            this.adapter.log.info(`Trying to connect as ${socket._acl.user} to ${address}`);
        }

        this._updateConnectedInfo();

        if (!this.commands.getCommandHandler('name')) {
            // socket sends its name => update list of sockets
            this.addCommandHandler('name', (_socket, name, cb) => {
                this.adapter.log.debug(`Connection from "${name}"`);
                if (_socket._name === undefined) {
                    _socket._name = name;
                    this._updateConnectedInfo();
                } else if (_socket._name !== name) {
                    this.adapter.log.warn(`socket ${_socket.id} changed socket name from ${_socket._name} to ${name}`);
                    _socket._name = name;
                    this._updateConnectedInfo();
                }

                typeof cb === 'function' && cb();
            });
        }

        this.commands.applyCommands(socket);

        // disconnect
        socket.on('disconnect', error => {
            this.commands.unsubscribeSocket(socket);
            this._updateConnectedInfo();

            // Disable logging if no one browser is connected
            if (this.adapter.requireLog && this.commands && this.commands.isLogEnabled()) {
                this.adapter.log.debug('Disable logging, because no one socket connected');
                this.adapter.requireLog(!!this.server?.engine?.clientsCount);
            }

            if (socket._sessionTimer) {
                clearTimeout(socket._sessionTimer);
                socket._sessionTimer = null;
            }

            if (this.eventHandlers.disconnect) {
                this.eventHandlers.disconnect(socket, error);
            } else {
                this.adapter.log.info(
                    `<== Disconnect ${socket._acl.user} from ${this.__getClientAddress(socket)} ${socket._name || ''}`,
                );
            }
        });

        if (typeof this.settings.extensions === 'function') {
            this.settings.extensions(socket);
        }

        // if server mode
        if (this.serverMode) {
            const sessionId = this.__getSessionID(socket);
            if (sessionId) {
                socket._secure = true;
                socket._sessionID = sessionId;
                // Get user for session
                this.store &&
                    this.store.get(socket._sessionID, (err, obj) => {
                        if (!obj || !obj.passport) {
                            socket._acl.user = '';
                            socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                            // ws does not require disconnect
                            if (!this.noDisconnect) {
                                socket.disconnect();
                            }
                        }
                        if (socket._authPending) {
                            socket._authPending(!!socket._acl.user, true);
                            delete socket._authPending;
                        }
                    });
            }
        }

        this.commands.subscribeSocket(socket);

        cb && cb();
    }

    _updateConnectedInfo() {
        // only in server mode
        if (this.serverMode) {
            if (this.infoTimeout) {
                clearTimeout(this.infoTimeout);
                this.infoTimeout = null;
            }
            this.infoTimeout = setTimeout(() => {
                this.infoTimeout = null;

                if (this.server) {
                    const clientsArray = [];
                    const sockets = this.getSocketsList();
                    if (sockets) {
                        // this could be an object or array
                        Object.keys(sockets).forEach(i => clientsArray.push(sockets[i]._name || 'noname'));
                    }
                    const text = `[${clientsArray.length}]${clientsArray.join(', ')}`;
                    this.adapter.setState('info.connected', text, true);
                }
            }, 1000);
        }
    }

    checkPermissions(socket, command: string, callback, arg) {
        return this.commands._checkPermissions(socket, command, callback, arg);
    }

    addCommandHandler(command: string, handler: (socket: SocketClient, ...args: any[]) => void) {
        this.commands.addCommandHandler(command, handler);
    }

    sendLog(obj) {
        // TODO Build in some threshold
        if (this.server && this.server.sockets) {
            this.server.sockets.emit('log', obj);
        }
    }

    publish(socket, type, id, obj) {
        return this.commands.publish(socket, type, id, obj);
    }

    publishInstanceMessage(socket, sourceInstance, messageType, data) {
        return this.commands.publishInstanceMessage(socket, sourceInstance, messageType, data);
    }

    publishFile(socket, id, fileName, size) {
        return this.commands.publishFile(socket, id, fileName, size);
    }

    getSocketsList() {
        if (this.server && this.server.sockets) {
            // this could be an object or array
            return this.server.sockets.sockets || this.server.sockets.connected;
        }
        return null;
    }

    publishInstanceMessageAll(sourceInstance, messageType, sid, data) {
        const sockets = this.getSocketsList();
        if (sockets) {
            Object.keys(sockets).forEach(i => {
                if (sockets[i].id === sid) {
                    this.publishInstanceMessage(sockets[i], sourceInstance, messageType, data);
                }
            });
        }
    }

    close() {
        this._unsubscribeAll();

        this.commands.destroy();

        const sockets = this.getSocketsList();
        if (sockets) {
            // this could be an object or array
            Object.keys(sockets).forEach(i => {
                const socket = sockets[i];
                if (socket._sessionTimer) {
                    clearTimeout(socket._sessionTimer);
                    socket._sessionTimer = null;
                }
            });
        }

        // IO server will be closed
        try {
            this.server?.close && this.server?.close();
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

module.exports = SocketCommon;