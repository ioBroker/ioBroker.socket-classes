/**
 *      Class Socket
 *
 *      Copyright 2014-2025 bluefox <dogafox@gmail.com>,
 *      MIT License
 *
 */
import { type Server, SocketCommon, type SocketIoOptions, type SocketSettings } from './socketCommon';
import { type Store } from './passportSocket';
import type { Socket as WebSocketClient, SocketIO } from '@iobroker/ws-server';
import type { AddressInfo } from 'node:net';
import type { SocketSubscribeTypes } from '../types';
import type { Ratings } from './socketCommands';
export declare class SocketAdmin extends SocketCommon {
    #private;
    private adminCommands;
    constructor(settings: SocketSettings, adapter: ioBroker.Adapter, objects: Record<string, ioBroker.Object>);
    __getIsNoDisconnect(): boolean;
    __initAuthentication(authOptions: {
        store: Store;
        secret: string;
        checkUser?: (user: string, pass: string, cb: (error: Error | null, result?: {
            logged_in: boolean;
            user?: string;
        }) => void) => void;
    }): void;
    __getUserFromSocket(socket: WebSocketClient, callback: (error: string | null, user?: string) => void): void;
    __getClientAddress(socket: WebSocketClient): AddressInfo;
    __updateSession(socket: WebSocketClient): boolean;
    __getSessionID(socket: WebSocketClient): string | null;
    start(server: Server, socketClass: typeof SocketIO, authOptions: {
        store: Store;
        userKey: string;
        secret: string;
    }, socketOptions?: SocketIoOptions): void;
    onThresholdChanged(enabled: boolean): void;
    stateChange(id: string, state: ioBroker.State | null | undefined): void;
    fileChange(id: string, fileName: string, size: number | null): void;
    repoUpdated(): void;
    objectChange(id: string, obj: ioBroker.Object | null | undefined): void;
    subscribe(type: SocketSubscribeTypes, pattern: string): void;
    subscribeFile(id: string, patternFile: string): void;
    sendCommand(obj: ioBroker.Message): void;
    updateRatings(uuid?: string, isAutoUpdate?: boolean): Promise<Ratings | null>;
}
