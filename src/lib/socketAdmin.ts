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
import type { InternalStorageToken, SocketSubscribeTypes } from '../types';
import type { Ratings } from './socketCommands';

export class SocketAdmin extends SocketCommon {
    private adminCommands: SocketCommandsAdmin;
    private checkUser:
        | ((
              user: string,
              pass: string,
              cb: (
                  error: Error | null,
                  result?: {
                      logged_in: boolean;
                      user?: string;
                  },
              ) => void,
          ) => void)
        | undefined;

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
        this.store = authOptions.store;
        this.checkUser = authOptions.checkUser;

        if (!authOptions.oauth2Only) {
            this.server?.use(
                authorize({
                    passport,
                    cookieParser,
                    checkUser: authOptions.checkUser,
                    secret: authOptions.secret, // the session_secret to parse the cookie
                    store: authOptions.store, // we NEED to use a sessionstore. no memorystore, please
                    success: this.#onAuthorizeSuccess, // *optional* callback on success - read more below
                    fail: this.#onAuthorizeFail, // *optional* callback on fail/error - read more below
                }),
            );
        }
    }

    // Extract username from socket
    __getUserFromSocket(
        socket: WebSocketClient,
        callback: (error: string | null, user?: string, expirationTime?: number) => void,
    ): void {
        let accessToken: string | undefined;
        if (socket.conn.request.headers?.cookie) {
            const cookies: string[] = socket.conn.request.headers.cookie.split(';');
            accessToken = cookies.find(cookie => cookie.trim().split('=')[0] === 'access_token');
            if (accessToken) {
                accessToken = accessToken.split('=')[1];
            }
        }

        if (!accessToken && socket.conn.request.headers?.authorization?.startsWith('Bearer ')) {
            accessToken = socket.conn.request.headers.authorization.split(' ')[1];
        }

        if (!accessToken && socket.conn.request.query?.token) {
            accessToken = socket.conn.request.query.token as string;
        }

        if (accessToken) {
            void this.adapter.getSession(`a:${accessToken}`, (tokenData: InternalStorageToken | undefined): void => {
                if (!tokenData?.user) {
                    if (socket._acl) {
                        socket._acl.user = '';
                    }
                    socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                    callback('Cannot detect user');
                } else {
                    callback(null, tokenData.user ? `system.user.${tokenData.user}` : '', tokenData.exp);
                }
            });
            return;
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
                    callback(
                        null,
                        obj.passport.user ? `system.user.${obj.passport.user}` : '',
                        obj.cookie.expires ? new Date(obj.cookie.expires).getTime() : 0,
                    );
                }
            });
        } else if (this.checkUser && socket.conn.request.headers?.authorization?.startsWith('Basic ')) {
            // Extract username and password
            const auth = Buffer.from(socket.conn.request.headers.authorization.split(' ')[1], 'base64').toString(
                'utf-8',
            );
            const parts = auth.split(':');
            const username = parts.shift() || '';
            const password = parts.join(':');
            if (password && username) {
                this.checkUser(username, password, (err, result) => {
                    if (err) {
                        callback(err.toString());
                    } else {
                        callback(null, result?.user, 0);
                    }
                });
            } else {
                callback('Cannot detect user');
            }
        } else if (this.checkUser && socket.conn.request.query?.user && socket.conn.request.query?.pass) {
            // Extract username and password
            this.checkUser(
                socket.conn.request.query.user as string,
                socket.conn.request.query.pass as string,
                (err, result) => {
                    if (err) {
                        callback(err.toString());
                    } else {
                        callback(null, result?.user, 0);
                    }
                },
            );
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

        if (address && typeof address !== 'object') {
            return {
                address,
                family: address.includes(':') ? 'IPv6' : 'IPv4',
                port: 0,
            };
        }

        return address;
    }

    // update session ID, but not ofter than 60 seconds
    __updateSession(socket: WebSocketClient): boolean {
        const now = Date.now();
        if (socket._sessionExpiresAt) {
            // If less than 10 seconds, then recheck the socket
            if (socket._sessionExpiresAt < Date.now() - 10_000) {
                let accessToken = socket.conn.request.headers?.cookie
                    ?.split(';')
                    .find(c => c.trim().startsWith('access_token='));

                if (accessToken) {
                    accessToken = accessToken.split('=')[1];
                } else {
                    // Try to find in a query
                    accessToken = socket.conn.request.query?.token as string;
                    if (!accessToken && socket.conn.request.headers?.authorization?.startsWith('Bearer ')) {
                        // Try to find in Authentication header
                        accessToken = socket.conn.request.headers.authorization.split(' ')[1];
                    }
                }

                if (accessToken) {
                    const tokenStr = accessToken.split('=')[1];
                    void this.store?.get(`a:${tokenStr}`, (err: Error, token: any): void => {
                        const tokenData = token as InternalStorageToken;
                        if (err) {
                            this.adapter.log.error(`Cannot get token: ${err}`);
                        } else if (!tokenData?.user) {
                            this.adapter.log.error('No session found');
                        } else {
                            socket._sessionExpiresAt = tokenData.exp;
                        }
                    });
                }
            }

            // Check socket expiration time
            return socket._sessionExpiresAt > now;
        }

        if (socket._sessionID) {
            if (socket._lastActivity && now - socket._lastActivity > (this.settings.ttl || 3600) * 1000) {
                this.adapter.log.warn('REAUTHENTICATE!');
                socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                return false;
            }
            socket._lastActivity = now;
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
        authOptions: {
            store: Store;
            secret?: string;
            oauth2Only?: boolean;
        },
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
