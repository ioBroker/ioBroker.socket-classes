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
import type { SocketSubscribeTypes } from '../types';
import type { Ratings } from './socketCommands';

export class SocketAdmin extends SocketCommon {
    private adminCommands: SocketCommandsAdmin;

    constructor(settings: SocketSettings, adapter: ioBroker.Adapter, objects?: Record<string, ioBroker.Object>) {
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
        noBasicAuth?: boolean;
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

        if (!authOptions.oauth2Only) {
            this.server?.use(
                authorize({
                    passport,
                    cookieParser,
                    noBasicAuth: authOptions.noBasicAuth,
                    checkUser: authOptions.checkUser,
                    secret: authOptions.secret, // the session_secret to parse the cookie
                    store: authOptions.store, // we NEED to use a sessionstore. no memorystore, please
                    success: this.#onAuthorizeSuccess, // *optional* callback on success - read more below
                    fail: this.#onAuthorizeFail, // *optional* callback on fail/error - read more below
                }),
            );
        }
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
            noBasicAuth?: boolean;
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
                sockets.forEach(socket => this.commands!.publish(socket, 'stateChange', id, state));
            } else {
                Object.values(sockets).forEach(socket => this.commands!.publish(socket, 'stateChange', id, state));
            }
        }
    }

    fileChange(id: string, fileName: string, size: number | null): void {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands!.publishFile(socket, id, fileName, size));
            } else {
                Object.values(sockets).forEach(socket => this.commands!.publishFile(socket, id, fileName, size));
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
                sockets.forEach(socket => this.commands!.publish(socket, 'objectChange', id, obj));
            } else {
                Object.values(sockets).forEach(socket => this.commands!.publish(socket, 'objectChange', id, obj));
            }
        }
    }

    subscribe(type: SocketSubscribeTypes, pattern: string): void {
        this.commands!.subscribe(null, type, pattern);
    }

    subscribeFile(id: string, patternFile: string): void {
        this.commands!.subscribe(null, 'fileChange', id, patternFile);
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
