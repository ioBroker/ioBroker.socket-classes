/**
 *      Class Socket
 *
 *      Copyright 2014-2025 bluefox <dogafox@gmail.com>,
 *      MIT License
 *
 */
import { type Server, SocketCommon, type SocketIoOptions, type SocketSettings } from './socketCommon';
import { SocketCommandsAdmin } from './socketCommandsAdmin';
import passport from 'passport';
import cookieParser from 'cookie-parser';
import { authorize, type PassportHttpRequest, type Store } from './passportSocket';
import type { Socket as WebSocketClient, SocketIO } from '@iobroker/ws-server';
import type { AddressInfo } from 'node:net';
import type { SocketSubscribeTypes } from '../types';
import type { Ratings } from './socketCommands';

interface InternalToken {
    token: string;
    exp: number;
    user: string;
}

export class SocketAdmin extends SocketCommon {
    private adminCommands: SocketCommandsAdmin;
    constructor(settings: SocketSettings, adapter: ioBroker.Adapter, objects: Record<string, ioBroker.Object>) {
        super(settings, adapter);

        // user another set of commands for admin
        this.commands = new SocketCommandsAdmin(adapter, socket => this.__updateSession(socket), this.context, objects);
        this.adminCommands = this.commands as SocketCommandsAdmin;
    }

    __getIsNoDisconnect(): boolean {
        // ws does not require disconnect
        return true;
    }

    #onAuthorizeSuccess = (data: PassportHttpRequest, accept: (err: boolean) => void): void => {
        this.adapter.log.debug(
            `successful connection to socket.io from ${(data.socket || data.connection).remoteAddress}`,
        );
        // no error
        accept(false);
    };

    #onAuthorizeFail = (
        data: PassportHttpRequest,
        message: string,
        critical: boolean,
        accept: (err: boolean) => void,
    ): void => {
        setTimeout(() => data.socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE), 100);

        if (critical) {
            this.adapter?.log.info(
                `failed connection to socket.io from ${(data.socket || data.connection).remoteAddress}: ${message}`,
            );
        }

        // this error will be sent to the user as a special error-package
        // see: http://socket.io/docs/client-api/#socket > error-object
        if (critical) {
            // @ts-expect-error
            accept(new Error(message));
        } else {
            // @ts-expect-error
            accept(new Error(`failed connection to socket.io: ${message}`));
        }
    };

    __initAuthentication(authOptions: {
        store: Store;
        secret: string;
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
        this.store = authOptions.store;

        this.server?.use(
            authorize({
                passport,
                cookieParser,
                secret: authOptions.secret, // the session_secret to parse the cookie
                store: authOptions.store, // we NEED to use a sessionstore. no memorystore, please
                success: this.#onAuthorizeSuccess, // *optional* callback on success - read more below
                fail: this.#onAuthorizeFail, // *optional* callback on fail/error - read more below
            }),
        );
    }

    // Extract username from socket
    __getUserFromSocket(socket: WebSocketClient, callback: (error: string | null, user?: string) => void): void {
        if (socket.conn.request.headers?.cookie) {
            const cookies: string[] = socket.conn.request.headers.cookie.split(';');
            const accessSocket = cookies.find(cookie => cookie.split('=')[0] === 'access_token');
            if (accessSocket) {
                const token = accessSocket.split('=')[1];
                void this.adapter.getSession(`a:${token}`, (obj: InternalToken | undefined): void => {
                    if (!obj?.user) {
                        if (socket._acl) {
                            socket._acl.user = '';
                        }
                        socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                        callback('Cannot detect user');
                    } else {
                        callback(null, obj.user ? `system.user.${obj.user}` : '');
                    }
                });
                return;
            }
        }

        if (socket.conn.request.sessionID) {
            socket._secure = true;
            socket._sessionID = socket.conn.request.sessionID;

            // Get user for session
            void this.adapter.getSession(socket.conn.request.sessionID, obj => {
                if (!obj?.passport) {
                    if (socket._acl) {
                        socket._acl.user = '';
                    }
                    socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                    callback('Cannot detect user');
                } else {
                    callback(null, obj.passport.user ? `system.user.${obj.passport.user}` : '');
                }
            });
        } else {
            callback('Cannot detect user');
        }
    }

    __getClientAddress(socket: WebSocketClient): AddressInfo {
        let address;
        if (socket.connection) {
            address = socket.connection.remoteAddress;
        } else {
            address = socket.ws._socket.remoteAddress;
        }

        // @ts-expect-error socket.io
        if (!address && socket.handshake) {
            // @ts-expect-error socket.io
            address = socket.handshake.address;
        }
        // @ts-expect-error socket.io
        if (!address && socket.conn.request?.connection) {
            // @ts-expect-error socket.io
            address = socket.conn.request.connection.remoteAddress;
        }
        return address;
    }

    // update session ID, but not ofter than 60 seconds
    __updateSession(socket: WebSocketClient): boolean {
        if (socket._sessionID) {
            const time = Date.now();
            if (socket._lastActivity && time - socket._lastActivity > (this.settings.ttl || 3600) * 1000) {
                this.adapter.log.warn('REAUTHENTICATE!');
                socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                return false;
            }
            socket._lastActivity = time;
            socket._sessionTimer ||= setTimeout(() => {
                socket._sessionTimer = undefined;
                void this.adapter.getSession(socket._sessionID!, obj => {
                    if (obj) {
                        void this.adapter.setSession(socket._sessionID!, this.settings.ttl || 3600, obj);
                    } else {
                        this.adapter.log.warn('REAUTHENTICATE!');
                        socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                    }
                });
            }, 60_000);
        }

        return true;
    }

    __getSessionID(socket: WebSocketClient): string | null {
        return this.settings.auth ? socket.conn.request.sessionID : null;
    }

    start(
        server: Server,
        socketClass: typeof SocketIO,
        authOptions: { store: Store; userKey: string; secret: string },
        socketOptions?: SocketIoOptions,
    ): void {
        super.start(server, socketClass, authOptions, socketOptions);

        this.adminCommands.start(thresholdEnabled => this.onThresholdChanged(thresholdEnabled));
    }

    onThresholdChanged(enabled: boolean): void {
        this.server && this.server.sockets && this.server.sockets.emit('eventsThreshold', enabled);
    }

    stateChange(id: string, state: ioBroker.State | null | undefined): void {
        this.adminCommands.stateChange(id, state);

        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publish(socket, 'stateChange', id, state));
            } else {
                Object.values(sockets).forEach(socket => this.commands.publish(socket, 'stateChange', id, state));
            }
        }
    }

    fileChange(id: string, fileName: string, size: number | null): void {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publishFile(socket, id, fileName, size));
            } else {
                Object.values(sockets).forEach(socket => this.commands.publishFile(socket, id, fileName, size));
            }
        }
    }

    repoUpdated(): void {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.__updateSession(socket));
            } else {
                Object.values(sockets).forEach(socket => this.__updateSession(socket));
            }

            this.server?.sockets.emit('repoUpdated');
        }
    }

    objectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publish(socket, 'objectChange', id, obj));
            } else {
                Object.values(sockets).forEach(socket => this.commands.publish(socket, 'objectChange', id, obj));
            }
        }
    }

    subscribe(type: SocketSubscribeTypes, pattern: string): void {
        this.commands.subscribe(null, type, pattern);
    }

    subscribeFile(id: string, patternFile: string): void {
        this.commands.subscribe(null, 'fileChange', id, patternFile);
    }

    sendCommand(obj: ioBroker.Message): void {
        if (this.adminCommands.sendCommand(obj)) {
            const sockets = this.getSocketsList();
            if (sockets) {
                if (Array.isArray(sockets)) {
                    sockets.forEach(socket => this.__updateSession(socket));
                } else {
                    Object.values(sockets).forEach(socket => this.__updateSession(socket));
                }

                this.server?.sockets.emit(obj.command, obj.message.id, obj.message.data);
            }
        }
    }

    updateRatings(uuid?: string, isAutoUpdate?: boolean): Promise<Ratings | null> {
        return this.adminCommands.updateRatings(uuid, isAutoUpdate);
    }
}
