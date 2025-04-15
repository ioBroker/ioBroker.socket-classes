import type { Socket as WebSocketClient } from '@iobroker/ws-server';
import { type PermissionCommands, type SocketSubscribeTypes, type SocketOperation, type SocketCallback } from '../types';
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
export type SupportedFeature = 'ALIAS' | 'ALIAS_SEPARATE_READ_WRITE_ID' | 'ADAPTER_GETPORT_BIND' | 'ADAPTER_DEL_OBJECT_RECURSIVE' | 'ADAPTER_SET_OBJECT_SETS_DEFAULT_VALUE' | 'ADAPTER_AUTO_DECRYPT_NATIVE' | 'PLUGINS' | 'CONTROLLER_NPM_AUTO_REBUILD' | 'CONTROLLER_READWRITE_BASE_SETTINGS' | 'CONTROLLER_MULTI_REPO' | 'CONTROLLER_LICENSE_MANAGER' | 'CONTROLLER_OS_PACKAGE_UPGRADE' | 'DEL_INSTANCE_CUSTOM' | 'CUSTOM_FULL_VIEW' | 'ADAPTER_GET_OBJECTS_BY_ARRAY' | 'CONTROLLER_UI_UPGRADE' | 'ADAPTER_WEBSERVER_UPGRADE' | 'INSTANCE_MESSAGES' | 'PARTIAL_OBJECT_TREE';
export interface SocketDataContext {
    language?: ioBroker.Languages;
    ratings: Ratings | null;
    ratingTimeout: NodeJS.Timeout | null;
}
export declare class SocketCommands {
    #private;
    static ERROR_PERMISSION: string;
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
    constructor(adapter: ioBroker.Adapter, updateSession: (socket: WebSocketClient) => boolean, context: SocketDataContext);
    /**
     * Convert errors into strings and then call cb
     *
     * @param callback Callback function
     * @param error Error
     * @param args Arguments passed to callback
     */
    static _fixCallback(callback: SocketCallback | null | undefined, error: string | Error | null | undefined, ...args: any[]): void;
    _checkPermissions(socket: WebSocketClient, command: PermissionCommands, callback: ((error: string | null, ...args: any[]) => void) | undefined, ...args: any[]): boolean;
    publish(socket: WebSocketClient, type: SocketSubscribeTypes, id: string, obj: ioBroker.Object | ioBroker.State | null | undefined): boolean;
    publishFile(socket: WebSocketClient, id: string, fileName: string, size: number | null): boolean;
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
