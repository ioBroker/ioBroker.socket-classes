import { commonTools } from '@iobroker/adapter-core'; // Get common adapter utils
import type { AxiosError, AxiosResponse } from 'axios';
import type { Socket as WebSocketClient, SocketACL } from '@iobroker/ws-server';

import {
    type CallOptions,
    type PermissionCommands,
    type SocketSubscribeTypes,
    COMMANDS_PERMISSIONS,
    type SocketOperation,
    type SocketCallback,
} from '../types';
const pattern2RegEx = commonTools.pattern2RegEx;
let axiosGet: any = null;
let zipFiles: any = null;

export type AdapterRating = {
    rating: { r: number; c: number };
    [version: string]: { r: number; c: number };
};
export type Ratings = { [adapterName: string]: AdapterRating } & { uuid: string };

export type SupportedFeature =
    | 'ALIAS'
    | 'ALIAS_SEPARATE_READ_WRITE_ID'
    | 'ADAPTER_GETPORT_BIND'
    | 'ADAPTER_DEL_OBJECT_RECURSIVE'
    | 'ADAPTER_SET_OBJECT_SETS_DEFAULT_VALUE'
    | 'ADAPTER_AUTO_DECRYPT_NATIVE'
    | 'PLUGINS'
    | 'CONTROLLER_NPM_AUTO_REBUILD'
    | 'CONTROLLER_READWRITE_BASE_SETTINGS'
    | 'CONTROLLER_MULTI_REPO'
    | 'CONTROLLER_LICENSE_MANAGER'
    | 'CONTROLLER_OS_PACKAGE_UPGRADE'
    | 'DEL_INSTANCE_CUSTOM'
    | 'CUSTOM_FULL_VIEW'
    | 'ADAPTER_GET_OBJECTS_BY_ARRAY'
    | 'CONTROLLER_UI_UPGRADE'
    | 'ADAPTER_WEBSERVER_UPGRADE'
    | 'INSTANCE_MESSAGES'
    | 'PARTIAL_OBJECT_TREE';

export interface SocketDataContext {
    language: ioBroker.Languages;
    ratings: Ratings | null;
    ratingTimeout: NodeJS.Timeout | null;
}

export class SocketCommands {
    static ERROR_PERMISSION = 'permissionError';
    static COMMANDS_PERMISSIONS: Record<string, { type: 'object' | 'state'; operation: SocketOperation }> =
        COMMANDS_PERMISSIONS;

    protected adapter: ioBroker.Adapter;

    protected context: SocketDataContext;

    protected commands: Record<string, (socket: WebSocketClient, ...args: any[]) => void> = {};

    protected subscribes: Record<string, Record<string, number>> = {};

    #logEnabled: boolean = false;

    readonly #clientSubscribes: Record<string, Record<string, string[]>> = {};

    readonly #updateSession: (socket: WebSocketClient) => boolean;

    public adapterName: string | undefined;

    protected _sendToHost:
        | ((
              id: string,
              command: string,
              data: any,
              callback: (result: { error?: string; result?: any }) => void,
          ) => void)
        | null;

    public states: Record<string, ioBroker.State> | null = null;

    constructor(
        adapter: ioBroker.Adapter,
        updateSession: (socket: WebSocketClient) => boolean,
        context: SocketDataContext,
    ) {
        this.adapter = adapter;

        this.#updateSession = updateSession;
        this.context = context;

        this.#updateSession ||= () => true;

        this._sendToHost = null;

        this.#initCommands();
    }

    /**
     * Rename file or folder
     *
     * @param adapter Object ID
     * @param oldName Old file name
     * @param newName New file name
     * @param options options { user?: string; }
     */
    async #rename(adapter: string, oldName: string, newName: string, options?: CallOptions): Promise<void> {
        // read if it is a file or folder
        try {
            if (oldName.endsWith('/')) {
                oldName = oldName.substring(0, oldName.length - 1);
            }

            if (newName.endsWith('/')) {
                newName = newName.substring(0, newName.length - 1);
            }

            const files = await this.adapter.readDirAsync(adapter, oldName, options);
            if (files?.length) {
                for (let f = 0; f < files.length; f++) {
                    await this.#rename(adapter, `${oldName}/${files[f].file}`, `${newName}/${files[f].file}`);
                }
            }
        } catch (error) {
            if (error.message !== 'Not exists') {
                throw error;
            }
            // else ignore, because it is a file and not a folder
        }

        try {
            await this.adapter.renameAsync(adapter, oldName, newName, options);
        } catch (error) {
            if (error.message !== 'Not exists') {
                throw error;
            }
            // else ignore, because the folder cannot be deleted
        }
    }

    /**
     * Delete file or folder
     *
     * @param adapter Object ID
     * @param name File name
     * @param options options { user?: string; }
     */
    async #unlink(adapter: string, name: string, options?: CallOptions): Promise<void> {
        // read if it is a file or folder
        try {
            // remove trailing '/'
            if (name.endsWith('/')) {
                name = name.substring(0, name.length - 1);
            }
            const files = await this.adapter.readDirAsync(adapter, name, options);
            if (files && files.length) {
                for (let f = 0; f < files.length; f++) {
                    await this.#unlink(adapter, `${name}/${files[f].file}`);
                }
            }
        } catch (error) {
            // ignore, because it is a file and not a folder
            if (error.message !== 'Not exists') {
                throw error;
            }
        }

        try {
            await this.adapter.unlinkAsync(adapter, name, options);
        } catch (error) {
            if (error.message !== 'Not exists') {
                throw error;
            }
            // else ignore, because folder cannot be deleted
        }
    }

    /**
     * Convert errors into strings and then call cb
     *
     * @param callback Callback function
     * @param error Error
     * @param args Arguments passed to callback
     */
    static _fixCallback(
        callback: SocketCallback | null | undefined,
        error: string | Error | null | undefined,
        ...args: any[]
    ): void {
        if (typeof callback !== 'function') {
            return;
        }

        if (error instanceof Error) {
            error = error.message;
        }

        callback(error, ...args);
    }

    _checkPermissions(
        socket: WebSocketClient,
        command: PermissionCommands,
        callback: ((error: string | null, ...args: any[]) => void) | undefined,
        ...args: any[]
    ): boolean {
        const _command: string = command as unknown as string;
        if (socket._acl?.user !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendToHost, readLogs
            if (SocketCommands.COMMANDS_PERMISSIONS[_command]) {
                // If permission required
                if (SocketCommands.COMMANDS_PERMISSIONS[_command].type) {
                    if (
                        SocketCommands.COMMANDS_PERMISSIONS[_command].type === 'object' &&
                        socket._acl?.object &&
                        (socket._acl?.object as Record<string, boolean>)[
                            SocketCommands.COMMANDS_PERMISSIONS[_command].operation as string
                        ]
                    ) {
                        return true;
                    } else if (
                        SocketCommands.COMMANDS_PERMISSIONS[_command].type === 'state' &&
                        socket._acl?.state &&
                        (socket._acl?.state as Record<string, boolean>)[
                            SocketCommands.COMMANDS_PERMISSIONS[_command].operation as string
                        ]
                    ) {
                        return true;
                    }
                    this.adapter.log.warn(
                        `No permission for "${socket._acl?.user}" to call ${_command}. Need "${SocketCommands.COMMANDS_PERMISSIONS[_command].type}"."${SocketCommands.COMMANDS_PERMISSIONS[_command].operation}"`,
                    );
                } else {
                    return true;
                }
            } else {
                this.adapter.log.warn(`No rule for command: ${_command}`);
            }

            if (typeof callback === 'function') {
                callback(SocketCommands.ERROR_PERMISSION);
            } else {
                if (SocketCommands.COMMANDS_PERMISSIONS[_command]) {
                    socket.emit(SocketCommands.ERROR_PERMISSION, {
                        command,
                        type: SocketCommands.COMMANDS_PERMISSIONS[_command].type,
                        operation: SocketCommands.COMMANDS_PERMISSIONS[_command].operation,
                        args,
                    });
                } else {
                    socket.emit(SocketCommands.ERROR_PERMISSION, { command: _command, args });
                }
            }
            return false;
        }

        return true;
    }

    publish(
        socket: WebSocketClient,
        type: SocketSubscribeTypes,
        id: string,
        obj: ioBroker.Object | ioBroker.State,
    ): boolean {
        if (socket?.subscribe?.[type] && this.#updateSession(socket)) {
            return !!socket.subscribe[type].find(sub => {
                if (sub.regex.test(id)) {
                    // replace language
                    if (
                        this.context.language &&
                        id === 'system.config' &&
                        (obj as ioBroker.SystemConfigObject).common
                    ) {
                        (obj as ioBroker.SystemConfigObject).common.language = this.context.language;
                    }
                    socket.emit(type, id, obj);
                    return true;
                }
            });
        }

        return false;
    }

    publishFile(socket: WebSocketClient, id: string, fileName: string, size: number): boolean {
        if (socket?.subscribe?.fileChange && this.#updateSession(socket)) {
            const key = `${id}####${fileName}`;
            return !!socket.subscribe.fileChange.find(sub => {
                if (sub.regex.test(key)) {
                    socket.emit('fileChange', id, fileName, size);
                    return true;
                }
            });
        }

        return false;
    }

    publishInstanceMessage(socket: WebSocketClient, sourceInstance: string, messageType: string, data: any): boolean {
        if (this.#clientSubscribes[socket.id]?.[sourceInstance]?.includes(messageType)) {
            socket.emit('im', messageType, sourceInstance, data);
            return true;
        }

        // inform instance about missing subscription
        this.adapter.sendTo(sourceInstance, 'clientSubscribeError', {
            type: messageType,
            sid: socket.id,
            reason: 'no one subscribed',
        });
        return false;
    }

    _showSubscribes(socket: WebSocketClient, type: SocketSubscribeTypes): void {
        if (socket?.subscribe) {
            const s = socket.subscribe[type] || [];
            const ids = [];
            for (let i = 0; i < s.length; i++) {
                ids.push(s[i].pattern);
            }
            this.adapter.log.debug(`Subscribes: ${ids.join(', ')}`);
        } else {
            this.adapter.log.debug('Subscribes: no subscribes');
        }
    }

    isLogEnabled(): boolean {
        return this.#logEnabled;
    }

    subscribe(socket: WebSocketClient, type: SocketSubscribeTypes, pattern: string, patternFile?: string): void {
        if (!pattern) {
            this.adapter.log.warn('Empty pattern on subscribe!');
            return;
        }

        this.subscribes[type] = this.subscribes[type] || {};

        let p;
        let key;
        pattern = pattern.toString();
        if (patternFile && type === 'fileChange') {
            patternFile = patternFile.toString();
            key = `${pattern}####${patternFile}`;
        } else {
            key = pattern;
        }

        try {
            p = pattern2RegEx(key);
        } catch (e) {
            this.adapter.log.error(`Invalid pattern on subscribe: ${e.message}`);
            return;
        }

        if (p === null) {
            this.adapter.log.warn('Empty pattern on subscribe!');
            return;
        }

        let s;
        if (socket) {
            socket.subscribe = socket.subscribe || {};
            s = socket.subscribe[type] = socket.subscribe[type] || [];

            if (s.find(item => item.pattern === key)) {
                return;
            }
            s.push({ pattern: key, regex: new RegExp(p) });
        }

        const options = socket?._acl?.user ? { user: socket._acl.user } : undefined;

        if (this.subscribes[type][key] === undefined) {
            this.subscribes[type][key] = 1;
            if (type === 'stateChange') {
                this.adapter
                    .subscribeForeignStatesAsync(pattern, options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            } else if (type === 'objectChange') {
                this.adapter
                    .subscribeForeignObjectsAsync(pattern, options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            } else if (type === 'log') {
                if (!this.#logEnabled && this.adapter.requireLog) {
                    this.#logEnabled = true;
                    void this.adapter.requireLog(true, options);
                }
            } else if (type === 'fileChange' && this.adapter.subscribeForeignFiles) {
                void this.adapter
                    .subscribeForeignFiles(pattern, patternFile || '*', options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            }
        } else {
            this.subscribes[type][key]++;
        }
    }

    unsubscribe(socket: WebSocketClient, type: SocketSubscribeTypes, pattern: string, patternFile?: string): void {
        if (!pattern) {
            this.adapter.log.warn('Empty pattern on subscribe!');
            return;
        }

        if (!this.subscribes[type]) {
            return;
        }

        let key;
        pattern = pattern.toString();
        if (patternFile && type === 'fileChange') {
            patternFile = patternFile.toString();
            key = `${pattern}####${patternFile}`;
        } else {
            key = pattern;
        }

        const options = socket?._acl?.user ? { user: socket._acl.user } : undefined;

        if (socket && typeof socket === 'object') {
            if (!socket.subscribe || !socket.subscribe[type]) {
                return;
            }

            for (let i = socket.subscribe[type].length - 1; i >= 0; i--) {
                if (socket.subscribe[type][i].pattern === key) {
                    // Remove a pattern from a global list
                    if (this.subscribes[type][key] !== undefined) {
                        this.subscribes[type][key]--;
                        if (this.subscribes[type][key] <= 0) {
                            if (type === 'stateChange') {
                                this.adapter
                                    .unsubscribeForeignStatesAsync(pattern, options)
                                    .catch(e =>
                                        this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`),
                                    );
                            } else if (type === 'objectChange') {
                                this.adapter
                                    .unsubscribeForeignObjectsAsync(pattern, options)
                                    .catch(e =>
                                        this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`),
                                    );
                            } else if (type === 'log') {
                                if (this.#logEnabled && this.adapter.requireLog) {
                                    this.#logEnabled = false;
                                    void this.adapter.requireLog(false, options);
                                }
                            } else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                                void this.adapter
                                    .unsubscribeForeignFiles(pattern, patternFile || '*', options)
                                    .catch(e =>
                                        this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`),
                                    );
                            }
                            delete this.subscribes[type][pattern];
                        }
                    }

                    socket.subscribe[type].splice(i, 1);
                    return;
                }
            }
        } else if (key) {
            // Remove a pattern from a global list
            if (this.subscribes[type][key] !== undefined) {
                this.subscribes[type][key]--;
                if (this.subscribes[type][key] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter
                            .unsubscribeForeignStatesAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    } else if (type === 'objectChange') {
                        this.adapter
                            .unsubscribeForeignObjectsAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    } else if (type === 'log') {
                        if (this.adapter.requireLog && this.#logEnabled) {
                            this.#logEnabled = false;
                            void this.adapter.requireLog(false, options);
                        }
                    } else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                        void this.adapter
                            .unsubscribeForeignFiles(pattern, patternFile || '*', options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    delete this.subscribes[type][key];
                }
            }
        } else {
            for (const pattern of Object.keys(this.subscribes[type])) {
                if (type === 'stateChange') {
                    this.adapter
                        .unsubscribeForeignStatesAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                } else if (type === 'objectChange') {
                    this.adapter
                        .unsubscribeForeignObjectsAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                } else if (type === 'log') {
                    // console.log((socket._name || socket.id) + ' requireLog false');
                    if (this.adapter.requireLog && this.#logEnabled) {
                        this.#logEnabled = false;
                        void this.adapter.requireLog(false, options);
                    }
                } else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                    const [id, fileName] = pattern.split('####');
                    void this.adapter
                        .unsubscribeForeignFiles(id, fileName, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                }
            }

            this.subscribes[type] = {};
        }
    }

    subscribeSocket(socket: WebSocketClient, type?: SocketSubscribeTypes): void {
        if (!socket || !socket.subscribe) {
            return;
        }

        if (!type) {
            // all
            Object.keys(socket.subscribe).forEach(type => this.subscribeSocket(socket, type as SocketSubscribeTypes));
            return;
        }

        if (!socket.subscribe[type]) {
            return;
        }

        const options = socket?._acl?.user ? { user: socket._acl.user } : undefined;

        for (let i = 0; i < socket.subscribe[type].length; i++) {
            const pattern = socket.subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] === undefined) {
                this.subscribes[type][pattern] = 1;
                if (type === 'stateChange') {
                    this.adapter
                        .subscribeForeignStatesAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                } else if (type === 'objectChange') {
                    this.adapter
                        .subscribeForeignObjectsAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                } else if (type === 'log') {
                    if (this.adapter.requireLog && !this.#logEnabled) {
                        this.#logEnabled = true;
                        void this.adapter.requireLog(true, options);
                    }
                } else if (type === 'fileChange' && this.adapter.subscribeForeignFiles) {
                    const [id, fileName] = pattern.split('####');
                    void this.adapter
                        .subscribeForeignFiles(id, fileName, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                }
            } else {
                this.subscribes[type][pattern]++;
            }
        }
    }

    unsubscribeSocket(socket: WebSocketClient, type?: SocketSubscribeTypes): void {
        if (!socket || !socket.subscribe) {
            return;
        }
        // inform all instances about disconnected socket
        this.#informAboutDisconnect(socket.id);

        if (!type) {
            // all
            Object.keys(socket.subscribe).forEach(type => this.unsubscribeSocket(socket, type as SocketSubscribeTypes));
            return;
        }

        if (!socket.subscribe[type]) {
            return;
        }

        const options = socket?._acl?.user ? { user: socket._acl.user } : undefined;

        for (let i = 0; i < socket.subscribe[type].length; i++) {
            const pattern = socket.subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] !== undefined) {
                this.subscribes[type][pattern]--;
                if (this.subscribes[type][pattern] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter
                            .unsubscribeForeignStatesAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    } else if (type === 'objectChange') {
                        this.adapter
                            .unsubscribeForeignObjectsAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    } else if (type === 'log') {
                        if (this.adapter.requireLog && !this.#logEnabled) {
                            this.#logEnabled = true;
                            void this.adapter.requireLog(true, options);
                        }
                    } else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                        const [id, fileName] = pattern.split('####');
                        void this.adapter
                            .unsubscribeForeignFiles(id, fileName, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    delete this.subscribes[type][pattern];
                }
            }
        }
    }

    #subscribeStates(
        socket: WebSocketClient,
        pattern: string | string[],
        callback?: (error: string | null) => void,
    ): void {
        if (this._checkPermissions(socket, 'subscribe', callback, pattern)) {
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this.subscribe(socket, 'stateChange', pattern[p]);
                }
            } else {
                this.subscribe(socket, 'stateChange', pattern);
            }

            this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'stateChange');

            typeof callback === 'function' && setImmediate(callback, null);
        }
    }

    #unsubscribeStates(
        socket: WebSocketClient,
        pattern: string | string[],
        callback?: (error: string | null) => void,
    ): void {
        if (this._checkPermissions(socket, 'unsubscribe', callback, pattern)) {
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this.unsubscribe(socket, 'stateChange', pattern[p]);
                }
            } else {
                this.unsubscribe(socket, 'stateChange', pattern);
            }

            this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'stateChange');

            typeof callback === 'function' && setImmediate(callback, null);
        }
    }

    #subscribeFiles(
        socket: WebSocketClient,
        id: string,
        pattern: string | string[],
        callback?: (error: string | null) => void,
    ): void {
        if (this._checkPermissions(socket, 'subscribeFiles', callback, pattern)) {
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this.subscribe(socket, 'fileChange', id, pattern[p]);
                }
            } else {
                this.subscribe(socket, 'fileChange', id, pattern);
            }

            this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'fileChange');

            typeof callback === 'function' && setImmediate(callback, null);
        }
    }

    _unsubscribeFiles(
        socket: WebSocketClient,
        id: string,
        pattern: string | string[],
        callback?: (error: string | null) => void,
    ): void {
        if (this._checkPermissions(socket, 'unsubscribeFiles', callback, pattern)) {
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this.unsubscribe(socket, 'fileChange', id, pattern[p]);
                }
            } else {
                this.unsubscribe(socket, 'fileChange', id, pattern);
            }

            this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'fileChange');

            typeof callback === 'function' && setImmediate(callback, null);
        }
    }

    addCommandHandler(command: string, handler: (socket: WebSocketClient, ...args: any[]) => void): void {
        if (handler) {
            this.commands[command] = handler;
        } else if (command in this.commands) {
            delete this.commands[command];
        }
    }

    getCommandHandler(command: string): (socket: WebSocketClient, ...args: any[]) => void {
        return this.commands[command];
    }

    /**
     * Converts old structures of config definitions into new one - `adminUI`
     *
     * @param obj Instance or adapter object to be converted
     */
    protected fixAdminUI(obj: ioBroker.AdapterObject): void {
        if (obj?.common && !obj.common.adminUI) {
            obj.common.adminUI = { config: 'none' };
            if (obj.common.noConfig) {
                obj.common.adminUI.config = 'none';
                // @ts-expect-error this attribute is deprecated, but still used
            } else if (obj.common.jsonConfig) {
                obj.common.adminUI.config = 'json';
            } else if (obj.common.materialize) {
                obj.common.adminUI.config = 'materialize';
            } else {
                obj.common.adminUI.config = 'html';
            }

            // @ts-expect-error this attribute is deprecated, but still used
            if (obj.common.jsonCustom) {
                obj.common.adminUI.custom = 'json';
            } else if (obj.common.supportCustoms) {
                obj.common.adminUI.custom = 'json';
            }

            if (obj.common.materializeTab && obj.common.adminTab) {
                obj.common.adminUI.tab = 'materialize';
            } else if (obj.common.adminTab) {
                obj.common.adminUI.tab = 'html';
            }

            if (obj.common.adminUI) {
                this.adapter.log.debug(
                    `Please add to "${obj._id.replace(/\.\d+$/, '')}" common.adminUI=${JSON.stringify(
                        obj.common.adminUI,
                    )}`,
                );
            }
        }
    }

    #httpGet(
        url: string,
        callback: (
            error: Error | null | undefined | string,
            result?: { status: number; statusText: string },
            data?: string,
        ) => void,
    ): void {
        this.adapter.log.debug(`httpGet: ${url}`);
        if (axiosGet) {
            try {
                axiosGet(url, {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    validateStatus: (status: number) => status < 400,
                })
                    .then((result: AxiosResponse) =>
                        callback(null, { status: result.status, statusText: result.statusText }, result.data),
                    )
                    .catch((error: AxiosError) => callback(error));
            } catch (error) {
                callback(error as Error);
            }
        } else {
            callback(new Error('axios is not initialized'));
        }
    }

    /** Init common commands that not belong to stats, objects or files */
    protected _initCommandsCommon(): void {
        /**
         * #DOCUMENTATION commands
         * Wait till user is authenticated.
         * As the user authenticates himself, the callback will be called
         *
         * @param socket Socket instance
         * @param callback Callback `(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void`
         */
        this.commands.authenticate = (
            socket: WebSocketClient,
            callback: (isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void,
        ) => {
            if (socket._acl?.user !== null) {
                this.adapter.log.debug(`${new Date().toISOString()} Request authenticate [${socket._acl?.user}]`);
                if (typeof callback === 'function') {
                    callback(true, socket._secure);
                }
            } else {
                socket._authPending = callback;
            }
        };

        /**
         * #DOCUMENTATION commands
         * Write error into ioBroker log
         *
         * @param _socket Socket instance (not used)
         * @param error Error object or error text
         */
        this.commands.error = (_socket: WebSocketClient, error: Error | string): void => {
            this.adapter.log.error(`Socket error: ${error.toString()}`);
        };

        /**
         * #DOCUMENTATION commands
         * Write log entry into ioBroker log
         *
         * @param _socket Socket instance (not used)
         * @param text log text
         * @param level one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.
         */
        this.commands.log = (_socket: WebSocketClient, text: string, level: ioBroker.LogLevel): void => {
            if (level === 'error') {
                this.adapter.log.error(text);
            } else if (level === 'warn') {
                this.adapter.log.warn(text);
            } else if (level === 'info') {
                this.adapter.log.info(text);
            } else {
                this.adapter.log.debug(text);
            }
        };

        /**
         * #DOCUMENTATION commands
         * Checks, if the same feature is supported by the current js-controller
         *
         * @param _socket Socket instance (not used)
         * @param feature feature name like `CONTROLLER_LICENSE_MANAGER`
         * @param callback callback `(error: string | Error | null | undefined, isSupported: boolean) => void`
         */
        this.commands.checkFeatureSupported = (
            _socket: WebSocketClient,
            feature: SupportedFeature,
            callback: (error: string | Error | null | undefined, isSupported?: boolean) => void,
        ) => {
            if (feature === 'INSTANCE_MESSAGES') {
                SocketCommands._fixCallback(callback, null, true);
            } else if (feature === 'PARTIAL_OBJECT_TREE') {
                SocketCommands._fixCallback(callback, null, true);
            } else {
                SocketCommands._fixCallback(callback, null, this.adapter.supportsFeature(feature));
            }
        };

        /**
         * #DOCUMENTATION commands
         * Get history data from specific instance
         *
         * @param socket Socket instance
         * @param id object ID
         * @param options History options
         * @param callback callback `(error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void`
         */
        this.commands.getHistory = (
            socket: WebSocketClient,
            id: string,
            options: ioBroker.GetHistoryOptions,
            callback: (error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void,
        ) => {
            if (this._checkPermissions(socket, 'getStateHistory', callback, id)) {
                if (typeof options === 'string') {
                    options = {
                        instance: options,
                    };
                }
                options = options || {};
                // @ts-expect-error fixed in js-controller
                options.user = socket._acl?.user;
                options.aggregate = options.aggregate || 'none';
                try {
                    this.adapter.getHistory(id, options, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[getHistory] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Read content of HTTP(s) page server-side (without CORS and stuff)
         *
         * @param socket Socket instance
         * @param url Page URL
         * @param callback callback `(error: Error | null, result?: { status: number; statusText: string }, data?: string) => void`
         */
        this.commands.httpGet = (
            socket: WebSocketClient,
            url: string,
            callback: (
                error: Error | null | undefined | string,
                result?: { status: number; statusText: string },
                data?: string,
            ) => void,
        ): void => {
            if (this._checkPermissions(socket, 'httpGet', callback, url)) {
                if (axiosGet) {
                    this.#httpGet(url, callback);
                } else {
                    void import('axios').then(({ default: axios }) => {
                        axiosGet = axiosGet || axios.get;
                        this.#httpGet(url, callback);
                    });
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Send the message to specific instance
         *
         * @param socket Socket instance
         * @param adapterInstance instance name, e.g. `history.0`
         * @param command command name
         * @param message the message is instance-dependent
         * @param callback callback `(result: any) => void`
         */
        this.commands.sendTo = (
            socket: WebSocketClient,
            adapterInstance: string,
            command: string,
            message: any,
            callback: (result: any) => void,
        ): void => {
            if (this._checkPermissions(socket, 'sendTo', callback, command)) {
                try {
                    this.adapter.sendTo(
                        adapterInstance,
                        command,
                        message,
                        res => typeof callback === 'function' && setImmediate(() => callback(res)),
                    );
                } catch (error) {
                    typeof callback === 'function' && setImmediate(() => callback({ error }));
                }
            }
        };

        // following commands are protected and require the extra permissions
        const protectedCommands = [
            'cmdExec',
            'getLocationOnDisk',
            'getDiagData',
            'getDevList',
            'delLogs',
            'writeDirAsZip',
            'writeObjectsAsZip',
            'readObjectsAsZip',
            'checkLogging',
            'updateMultihost',
            'rebuildAdapter',
        ];

        /**
         * #DOCUMENTATION commands
         * Send a message to the specific host.
         * Host can answer to the following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
         *
         * @param socket Socket instance
         * @param host Host name. With or without 'system.host.' prefix
         * @param command Host command
         * @param message the message is command-specific
         * @param callback callback `(result: { error?: string; result?: any }) => void`
         */
        this.commands.sendToHost = (
            socket: WebSocketClient,
            host: string,
            command:
                | 'shell'
                | 'cmdExec'
                | 'getRepository'
                | 'getInstalled'
                | 'getInstalledAdapter'
                | 'getVersion'
                | 'getDiagData'
                | 'getLocationOnDisk'
                | 'getDevList'
                | 'getLogs'
                | 'getLogFile'
                | 'getLogFiles'
                | 'getHostInfo'
                | 'getHostInfoShort'
                | 'delLogs'
                | 'readDirAsZip'
                | 'writeDirAsZip'
                | 'readObjectsAsZip'
                | 'writeObjectsAsZip'
                | 'checkLogging'
                | 'updateMultihost'
                | 'upgradeController'
                | 'upgradeAdapterWithWebserver'
                | 'getInterfaces'
                | 'upload'
                | 'rebuildAdapter'
                | 'readBaseSettings'
                | 'writeBaseSettings'
                | 'addNotification'
                | 'clearNotifications'
                | 'getNotifications'
                | 'updateLicenses'
                | 'upgradeOsPackages'
                | 'restartController'
                | 'sendToSentry',
            message: any,
            callback: (result: { error?: string; result?: any }) => void,
        ) => {
            if (
                this._checkPermissions(
                    socket,
                    protectedCommands.includes(command) ? 'cmdExec' : 'sendToHost',
                    (error: string | null) => callback({ error: error || SocketCommands.ERROR_PERMISSION }),
                    command,
                )
            ) {
                // Try to decode this file locally as redis has a limitation for files bigger than 20MB
                if (command === 'writeDirAsZip' && message && message.data.length > 1024 * 1024) {
                    let buffer;
                    try {
                        buffer = Buffer.from(message.data, 'base64');
                    } catch (error) {
                        this.adapter.log.error(`Cannot convert data: ${error.toString()}`);
                        return callback && callback({ error: `Cannot convert data: ${error.toString()}` });
                    }

                    zipFiles = zipFiles || commonTools.zipFiles;

                    zipFiles
                        .writeDirAsZip(
                            this.adapter, // normally we have to pass here the internal "objects" object, but as
                            // only writeFile is used, and it has the same name, we can pass here the
                            // adapter, which has the function with the same name and arguments
                            message.id,
                            message.name,
                            buffer,
                            message.options,
                            (error: Error) => callback({ error: error?.toString() }), // this is for back compatibility with js-controller@4.0 or older
                        )
                        .then(() => callback({}))
                        .catch((error: Error) => {
                            this.adapter.log.error(`Cannot write zip file as folder: ${error.toString()}`);
                            if (callback) {
                                callback({ error: error?.toString() });
                            }
                        });
                } else if (this._sendToHost) {
                    this._sendToHost(host, command, message, callback);
                } else {
                    try {
                        this.adapter.sendToHost(host, command, message, callback as ioBroker.MessageCallback);
                    } catch (error) {
                        if (callback) {
                            callback({ error });
                        }
                    }
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Ask server is authentication enabled, and if the user authenticated
         *
         * @param socket Socket instance
         * @param callback callback `(isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void`
         */
        this.commands.authEnabled = (
            socket: WebSocketClient,
            callback: (isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void,
        ) => {
            if (
                this._checkPermissions(
                    socket,
                    'authEnabled',
                    callback as (error: string | null, ...args: any[]) => void,
                )
            ) {
                if (typeof callback === 'function') {
                    // @ts-expect-error auth could exist in adapter settings
                    callback(this.adapter.config.auth, (socket._acl?.user || '').replace(/^system\.user\./, ''));
                } else {
                    this.adapter.log.warn('[authEnabled] Invalid callback');
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Logout user
         *
         * @param socket Socket instance
         * @param callback callback `(error?: Error) => void`
         */
        this.commands.logout = (socket: WebSocketClient, callback: ioBroker.ErrorCallback): void => {
            // Logout user
            // @param {function} callback - function (error)
            if (socket.id) {
                void this.adapter.destroySession(socket.id, callback);
            } else if (callback) {
                callback(new Error('No session'));
            }
        };

        /**
         * #DOCUMENTATION commands
         * List commands and permissions
         *
         * @param _socket Socket instance (not used)
         * @param callback callback `(permissions: Record<string, { type: 'object' | 'state'; operation: SocketOperation }>) => void`
         */
        this.commands.listPermissions = (
            _socket: WebSocketClient,
            callback: (permissions: Record<string, { type: 'object' | 'state'; operation: SocketOperation }>) => void,
        ) => {
            if (typeof callback === 'function') {
                callback(SocketCommands.COMMANDS_PERMISSIONS);
            } else {
                this.adapter.log.warn('[listPermissions] Invalid callback');
            }
        };

        /**
         * #DOCUMENTATION commands
         * Get user permissions
         *
         * @param socket Socket instance
         * @param callback callback `(error: string | null | undefined, userPermissions?: SocketACL | null) => void`
         */
        this.commands.getUserPermissions = (
            socket: WebSocketClient,
            callback: (error: string | null | undefined, userPermissions?: SocketACL | null) => void,
        ): void => {
            // Get user permissions
            // @param {function} callback - `function (error, permissions)`
            if (this._checkPermissions(socket, 'getUserPermissions', callback)) {
                if (typeof callback === 'function') {
                    callback(null, socket._acl);
                } else {
                    this.adapter.log.warn('[getUserPermissions] Invalid callback');
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Get the adapter version. Not the socket-classes version!
         *
         * @param socket Socket instance
         * @param callback callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`
         */
        this.commands.getVersion = (
            socket: WebSocketClient,
            callback: (
                error: string | Error | null | undefined,
                version: string | undefined,
                adapterName: string,
            ) => void,
        ): void => {
            // Get the adapter version. Not the socket-classes version!
            // @param {function} callback - `function (error, adapterVersion, adapterName)`
            if (this._checkPermissions(socket, 'getVersion', callback)) {
                if (typeof callback === 'function') {
                    callback(null, this.adapter.version, this.adapter.name);
                } else {
                    this.adapter.log.warn('[getVersion] Invalid callback');
                }
            }
        };

        /**
         * #DOCUMENTATION commands
         * Get adapter name: "iobroker.ws", "iobroker.socketio", "iobroker.web", "iobroker.admin"
         *
         * @param socket Socket instance
         * @param callback callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`
         */
        this.commands.getAdapterName = (
            socket: WebSocketClient,
            callback: (error: string | Error | null | undefined, adapterName: string) => void,
        ): void => {
            // Get adapter name. Not the socket-classes version!
            // @param {function} callback - `function (error, adapterVersion)`
            if (this._checkPermissions(socket, 'getAdapterName', callback)) {
                if (typeof callback === 'function') {
                    callback(null, this.adapter.name || 'unknown');
                } else {
                    this.adapter.log.warn('[getAdapterName] Invalid callback');
                }
            }
        };
    }

    /** Init commands for files */
    protected _initCommandsFiles(): void {
        // file operations
        this.commands.readFile = (socket: WebSocketClient, _adapter, fileName, callback) => {
            // Read file from ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {function} callback - `function (error, data, mimeType)`
            if (this._checkPermissions(socket, 'readFile', callback, fileName)) {
                try {
                    this.adapter.readFile(_adapter, fileName, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[readFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.readFile64 = (socket: WebSocketClient, _adapter, fileName, callback) => {
            // Read a file from ioBroker DB as base64 string
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {function} callback - `function (error, base64, mimeType)`
            if (this._checkPermissions(socket, 'readFile64', callback, fileName)) {
                try {
                    this.adapter.readFile(_adapter, fileName, { user: socket._acl?.user }, (error, buffer, type) => {
                        let data64;
                        if (buffer) {
                            try {
                                if (
                                    type === 'application/json' ||
                                    type === 'application/json5' ||
                                    fileName.toLowerCase().endsWith('.json5')
                                ) {
                                    data64 = Buffer.from(encodeURIComponent(buffer as string)).toString('base64');
                                } else {
                                    if (typeof buffer === 'string') {
                                        data64 = Buffer.from(buffer).toString('base64');
                                    } else {
                                        data64 = buffer.toString('base64');
                                    }
                                }
                            } catch (error) {
                                this.adapter.log.error(`[readFile64] Cannot convert data: ${error.toString()}`);
                            }
                        }

                        // Convert buffer to base 64
                        if (typeof callback === 'function') {
                            callback(error, data64 || '', type);
                        } else {
                            this.adapter.log.warn('[readFile64] Invalid callback');
                        }
                    });
                } catch (error) {
                    this.adapter.log.error(`[readFile64] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.writeFile64 = (socket: WebSocketClient, _adapter, fileName, data64, options, callback) => {
            // Write file into ioBroker DB as base64 string
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {string} data64 - file content as base64 string
            // @param {object} options - optional `{mode: 0x0644}`
            // @param {function} callback - `function (error)`
            if (typeof options === 'function') {
                callback = options;
                options = { user: socket._acl?.user };
            }

            options = options || {};
            options.user = socket._acl?.user;

            if (this._checkPermissions(socket, 'writeFile64', callback, fileName)) {
                if (!data64) {
                    return SocketCommands._fixCallback(callback, 'No data provided');
                }
                // Convert base 64 to buffer

                try {
                    const buffer = Buffer.from(data64, 'base64');
                    this.adapter.writeFile(_adapter, fileName, buffer, options, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[writeFile64] Cannot convert data: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, `Cannot convert data: ${error.toString()}`);
                }
            }
        };

        // this function is overloaded in admin (because admin accepts only base64)
        this.commands.writeFile = (socket: WebSocketClient, _adapter, fileName, data, options, callback) => {
            // Write file into ioBroker DB as text **DEPRECATED**
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {string} data64 - file content as base64 string
            // @param {object} options - optional `{mode: 0x644}`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'writeFile', callback, fileName)) {
                if (typeof options === 'function') {
                    callback = options;
                    options = { user: socket._acl?.user };
                }
                options = options || {};
                options.user = socket._acl?.user;
                this.adapter.log.debug('writeFile deprecated. Please use writeFile64');
                // const buffer = Buffer.from(data64, 'base64');
                try {
                    this.adapter.writeFile(_adapter, fileName, data, options, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[writeFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.unlink = (socket: WebSocketClient, _adapter, name, callback) => {
            // Delete file in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} name - file name, e.g. `main/vis-views.json`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    this.#unlink(_adapter, name, { user: socket._acl?.user })
                        .then(() => SocketCommands._fixCallback(callback, undefined))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                } catch (error) {
                    this.adapter.log.error(`[unlink] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.deleteFile = (socket: WebSocketClient, _adapter, name, callback) => {
            // Delete file in ioBroker DB (same as unlink, but only for files)
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} name - file name, e.g. `main/vis-views.json`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    this.adapter.unlink(_adapter, name, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[deleteFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.deleteFolder = (socket: WebSocketClient, _adapter, name, callback) => {
            // Delete file in ioBroker DB (same as `unlink`, but only for folders)
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} name - folder name, e.g. `main`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    this.#unlink(_adapter, name, { user: socket._acl?.user })
                        .then(() => SocketCommands._fixCallback(callback, null))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                } catch (error) {
                    this.adapter.log.error(`[deleteFolder] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.renameFile = (socket: WebSocketClient, _adapter, oldName, newName, callback) => {
            // Rename file in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} oldName - current file name, e.g. `main/vis-views.json`
            // @param {string} newName - new file name, e.g. `main/vis-views-new.json`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'rename', callback, oldName)) {
                try {
                    this.adapter.rename(_adapter, oldName, newName, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[renameFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.rename = (socket: WebSocketClient, _adapter, oldName, newName, callback) => {
            // Rename file or folder in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} oldName - current file name, e.g. `main/vis-views.json`
            // @param {string} newName - new file name, e.g. `main/vis-views-new.json`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'rename', callback, oldName)) {
                try {
                    this.#rename(_adapter, oldName, newName, { user: socket._acl?.user })
                        .then(() => SocketCommands._fixCallback(callback, undefined))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                } catch (error) {
                    this.adapter.log.error(`[rename] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.mkdir = (socket: WebSocketClient, _adapter, dirName, callback) => {
            // Create folder in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} dirName - desired folder name, e.g. `main`
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'mkdir', callback, dirName)) {
                try {
                    this.adapter.mkdir(_adapter, dirName, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[mkdir] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.readDir = (socket: WebSocketClient, _adapter, dirName, options, callback) => {
            // Read content of folder in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} dirName - folder name, e.g. `main`
            // @param {object} options - optional `{filter: '*'}` or `{filter: '*.json'}`
            // @param {function} callback - `function (error, files)` where `files` is an array of objects, like `{file: 'vis-views.json', isDir: false, stats: {size: 123}, modifiedAt: 1661336290090, acl: {owner: 'system.user.admin', ownerGroup: 'system.group.administrator', permissions: 1632, read: true, write: true}`
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            options = options || {};
            options.user = socket._acl?.user;

            if (options.filter === undefined) {
                options.filter = true;
            }

            if (this._checkPermissions(socket, 'readDir', callback, dirName)) {
                try {
                    this.adapter.readDir(_adapter, dirName, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[readDir] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.chmodFile = (
            socket: WebSocketClient,
            /** instance name, e.g. `vis.0` */
            adapter: string,
            /** file name, e.g. `main/vis-views.json` */
            fileName,
            options: { mode?: number; user?: string; filter?: boolean },
            callback?: (error: string | Error | null | undefined) => void,
        ) => {
            // Change file mode in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {object} options - `{mode: 0x644}` or 0x644. The first digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
            // @param {function} callback - `function (error)`
            if (typeof options === 'function') {
                callback = options;
                options = {};
            }
            options = options || {};
            options.user = socket._acl?.user;

            if (options.filter === undefined) {
                options.filter = true;
            }

            if (this._checkPermissions(socket, 'chmodFile', callback, fileName)) {
                try {
                    this.adapter.chmodFile(adapter, fileName, options, (error, ...args) =>
                        SocketCommands._fixCallback(callback as SocketCallback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[chmodFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback as SocketCallback, error);
                }
            }
        };

        this.commands.chownFile = (socket: WebSocketClient, _adapter, fileName, options, callback) => {
            // Change file owner in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {object} options - `{owner: 'system.user.user', ownerGroup: ''system.group.administrator'}` or 'system.user.user'. If ownerGroup is not defined, it will be taken from owner.
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'chownFile', callback, fileName)) {
                options = options || {};
                options.user = socket._acl?.user;
                try {
                    this.adapter.chownFile(_adapter, fileName, options, (error, ...args) =>
                        SocketCommands._fixCallback(callback as SocketCallback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[chownFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.fileExists = (socket: WebSocketClient, _adapter, fileName, callback) => {
            // Check if the file or folder exists in ioBroker DB
            // @param {string} _adapter - instance name, e.g. `vis.0`
            // @param {string} fileName - file name, e.g. `main/vis-views.json`
            // @param {function} callback - `function (error, isExist)`
            if (this._checkPermissions(socket, 'fileExists', callback, fileName)) {
                try {
                    this.adapter.fileExists(_adapter, fileName, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[fileExists] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.subscribeFiles = (socket: WebSocketClient, id, pattern, callback) => {
            // Subscribe to file changes in ioBroker DB
            // @param {string} id - instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
            // @param {string} pattern - file name pattern, e.g. `main/*.json`
            // @param {function} callback - `function (error)`
            return this.#subscribeFiles(socket, id, pattern, callback);
        };

        this.commands.unsubscribeFiles = (socket: WebSocketClient, id, pattern, callback) => {
            // Unsubscribe from file changes in ioBroker DB
            // @param {string} id - instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
            // @param {string} pattern - file name pattern, e.g. `main/*.json`
            // @param {function} callback - `function (error)`

            return this._unsubscribeFiles(socket, id, pattern, callback);
        };

        this.commands.getAdapterInstances = (socket: WebSocketClient, adapterName, callback) => {
            // Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
            // @param {string} adapterName - optional adapter name, e.g. `history`.
            // @param {function} callback - `function (error, instanceList)`, where instanceList is an array of instance objects, e.g. `{_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}}`
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    let _adapterName =
                        adapterName !== undefined && adapterName !== null ? adapterName : this.adapterName || '';
                    if (_adapterName) {
                        _adapterName += '.';
                    }
                    try {
                        this.adapter.getObjectView(
                            'system',
                            'instance',
                            {
                                startkey: `system.adapter.${_adapterName}`,
                                endkey: `system.adapter.${_adapterName}\u9999`,
                            },
                            { user: socket._acl?.user },
                            (error, doc) => {
                                if (error) {
                                    callback(error);
                                } else {
                                    callback(
                                        null,
                                        doc?.rows
                                            .map(item => {
                                                const obj = item.value;
                                                if (obj.common) {
                                                    delete obj.common.news;
                                                }
                                                // @ts-expect-error fixed in js-controller 7
                                                this.fixAdminUI(obj);
                                                return obj;
                                            })
                                            .filter(
                                                obj =>
                                                    obj &&
                                                    (!adapterName || (obj.common && obj.common.name === adapterName)),
                                            ),
                                    );
                                }
                            },
                        );
                    } catch (error) {
                        this.adapter.log.error(`[getAdapterInstances] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            }
        };
    }

    /** Init commands for states */
    protected _initCommandsStates(): void {
        this.commands.getStates = (socket: WebSocketClient, pattern, callback) => {
            // Read states by pattern
            // @param {string} pattern - optional pattern, like `system.adapter.*` or array of state IDs
            // @param {function} callback - `function (error, states)`, where `states` is an object like `{'system.adapter.history.0': {_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}, 'system.adapter.history.1': {...}}}`
            if (this._checkPermissions(socket, 'getStates', callback, pattern)) {
                if (typeof pattern === 'function') {
                    callback = pattern;
                    pattern = null;
                }
                if (typeof callback === 'function') {
                    try {
                        this.adapter.getForeignStates(pattern || '*', { user: socket._acl?.user }, (error, ...args) =>
                            SocketCommands._fixCallback(callback, error, ...args),
                        );
                    } catch (error) {
                        this.adapter.log.error(`[getStates] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                } else {
                    this.adapter.log.warn('[getStates] Invalid callback');
                }
            }
        };

        this.commands.getForeignStates = (socket: WebSocketClient, pattern, callback) => {
            // Read all states (which might not belong to this adapter) which match the given pattern
            // @param {string} pattern - pattern like `system.adapter.*` or array of state IDs
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'getStates', callback)) {
                if (typeof callback === 'function') {
                    try {
                        this.adapter.getForeignStates(pattern, { user: socket._acl?.user }, (error, ...args) =>
                            SocketCommands._fixCallback(callback, error, ...args),
                        );
                    } catch (error) {
                        this.adapter.log.error(`[getForeignStates] ERROR: ${error}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                } else {
                    this.adapter.log.warn('[getForeignStates] Invalid callback');
                }
            }
        };

        this.commands.getState = (socket: WebSocketClient, id, callback) => {
            // Read one state.
            // @param {string} id - State ID like, 'system.adapter.admin.0.memRss'
            // @param {function} callback - `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`
            if (this._checkPermissions(socket, 'getState', callback, id)) {
                if (typeof callback === 'function') {
                    if (this.states && this.states[id]) {
                        callback(null, this.states[id]);
                    } else {
                        try {
                            void this.adapter
                                .getForeignStateAsync(id, { user: socket._acl?.user })
                                .then(state => SocketCommands._fixCallback(callback, null, [state]))
                                .catch(error => {
                                    this.adapter.log.error(`[getState] ERROR: ${error.toString()}`);
                                    SocketCommands._fixCallback(callback, error);
                                });
                        } catch (error) {
                            this.adapter.log.error(`[getState] ERROR: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                } else {
                    this.adapter.log.warn('[getState] Invalid callback');
                }
            }
        };

        this.commands.setState = (socket: WebSocketClient, id, state, callback) => {
            // Write one state.
            // @param {string} id - State ID like, 'system.adapter.admin.0.memRss'
            // @param {any} state - value or object like `{val: 123, ack: true}`
            // @param {function} callback - `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`
            if (this._checkPermissions(socket, 'setState', callback, id)) {
                if (typeof state !== 'object') {
                    state = { val: state };
                }

                // clear cache
                if (this.states && this.states[id]) {
                    delete this.states[id];
                }

                try {
                    this.adapter.setForeignState(id, state, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[setState] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.getBinaryState = (_socket: WebSocketClient, id, callback) => {
            // Read one binary state.
            // @param {string} id - State ID like, 'javascript.0.binary'
            // @param {function} callback - `function (error, base64)`
            if (typeof callback === 'function') {
                this.adapter.log.warn(`getBinaryState is deprecated, but called for ${id}`);
                callback('This function is deprecated');
            }
        };

        this.commands.setBinaryState = (_socket: WebSocketClient, id, base64, callback) => {
            // Write one binary state.
            // @param {string} id - State ID like, 'javascript.0.binary'
            // @param {string} base64 - State value as base64 string. Binary states have no acknowledged flag.
            // @param {function} callback - `function (error)`
            if (typeof callback === 'function') {
                this.adapter.log.warn(`setBinaryState is deprecated, but called for ${id}`);
                callback('This function is deprecated');
            }
        };

        this.commands.subscribe = (socket: WebSocketClient, pattern, callback) => {
            // Subscribe to state changes by pattern. The events will come as 'stateChange' events to the socket.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            return this.#subscribeStates(socket, pattern, callback);
        };

        this.commands.subscribeStates = (socket: WebSocketClient, pattern, callback) => {
            // Subscribe to state changes by pattern. Same as `subscribe`. The events will come as 'stateChange' events to the socket.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            return this.#subscribeStates(socket, pattern, callback);
        };

        this.commands.unsubscribe = (socket: WebSocketClient, pattern, callback) => {
            // Unsubscribe from state changes by pattern.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            return this.#unsubscribeStates(socket, pattern, callback);
        };

        this.commands.unsubscribeStates = (socket: WebSocketClient, pattern, callback) => {
            // Unsubscribe from state changes by pattern. Same as `unsubscribe`.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            return this.#unsubscribeStates(socket, pattern, callback);
        };
    }

    /** Init commands for objects */
    protected _initCommandsObjects(): void {
        this.commands.getObject = (socket: WebSocketClient, id, callback) => {
            // Get one object
            // @param {string} id - object ID.
            // @param {function} callback - `function (error, obj)`
            if (this._checkPermissions(socket, 'getObject', callback, id)) {
                try {
                    void this.adapter.getForeignObject(id, { user: socket._acl?.user }, (error, obj) => {
                        // overload language from current instance
                        if (this.context.language && id === 'system.config' && obj?.common) {
                            (obj as ioBroker.SystemConfigObject).common.language = this.context.language;
                        }
                        SocketCommands._fixCallback(callback, error, obj);
                    });
                } catch (error) {
                    this.adapter.log.error(`[getObject] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        // not admin version of "all objects"
        // this function is overloaded in admin
        this.commands.getObjects = (socket: WebSocketClient, list, callback) => {
            // Get all objects that are relevant for web: all states and enums with rooms
            // @param {string} id - object ID.
            // @param {string[]} list - optional list of IDs.
            // @param {function} callback - `function (error, obj)`
            if (typeof list === 'function') {
                callback = list;
                list = null;
            }
            if (list?.length) {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    if (typeof callback === 'function') {
                        try {
                            this.adapter.getForeignObjects(list, { user: socket._acl?.user }, (error, objs) =>
                                SocketCommands._fixCallback(callback, error, objs),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    } else {
                        this.adapter.log.warn('[getObjects] Invalid callback');
                    }
                }
            } else if (this._checkPermissions(socket, 'getObjects', callback)) {
                try {
                    if (typeof callback === 'function') {
                        this.adapter.getForeignObjects(
                            '*',
                            'state',
                            'rooms',
                            { user: socket._acl?.user },
                            async (error, states) => {
                                const result: Record<string, ioBroker.Object> = {};
                                try {
                                    const channels = await this.adapter.getForeignObjectsAsync('*', 'channel', null, {
                                        user: socket._acl?.user,
                                    });
                                    const devices = await this.adapter.getForeignObjectsAsync('*', 'device', null, {
                                        user: socket._acl?.user,
                                    });
                                    const enums = await this.adapter.getForeignObjectsAsync('*', 'enum', null, {
                                        user: socket._acl?.user,
                                    });
                                    const config = await this.adapter.getForeignObjectAsync('system.config', {
                                        user: socket._acl?.user,
                                    });
                                    Object.assign(result, states, channels, devices, enums);
                                    if (config) {
                                        result[config._id] = config;
                                    }
                                } catch (e) {
                                    this.adapter.log.error(`[getObjects] ERROR: ${e.toString()}`);
                                }
                                // overload language
                                if (this.context.language && result['system.config']?.common) {
                                    result['system.config'].common.language = this.context.language;
                                }

                                SocketCommands._fixCallback(callback, error, result);
                            },
                        );
                    } else {
                        this.adapter.log.warn('[getObjects] Invalid callback');
                    }
                } catch (error) {
                    this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        this.commands.subscribeObjects = (socket: WebSocketClient, pattern, callback) => {
            // Subscribe to object changes by pattern. The events will come as 'objectChange' events to the socket.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'subscribeObjects', callback, pattern)) {
                try {
                    if (Array.isArray(pattern)) {
                        for (let p = 0; p < pattern.length; p++) {
                            this.subscribe(socket, 'objectChange', pattern[p]);
                        }
                    } else {
                        this.subscribe(socket, 'objectChange', pattern);
                    }
                    if (typeof callback === 'function') {
                        setImmediate(callback, null);
                    }
                } catch (error) {
                    if (typeof callback === 'function') {
                        setImmediate(callback, error);
                    }
                }
            }
        };

        this.commands.unsubscribeObjects = (socket: WebSocketClient, pattern, callback) => {
            // Unsubscribe from object changes by pattern.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'unsubscribeObjects', callback, pattern)) {
                try {
                    if (Array.isArray(pattern)) {
                        for (let p = 0; p < pattern.length; p++) {
                            this.unsubscribe(socket, 'objectChange', pattern[p]);
                        }
                    } else {
                        this.unsubscribe(socket, 'objectChange', pattern);
                    }
                    if (typeof callback === 'function') {
                        setImmediate(callback, null);
                    }
                } catch (error) {
                    if (typeof callback === 'function') {
                        setImmediate(callback, error);
                    }
                }
            }
        };

        this.commands.getObjectView = (socket: WebSocketClient, design, search, params, callback) => {
            // Make a query to the object database.
            // @param {string} design - 'system' or other designs like `custom`, but it must exist object `_design/custom`. Too 99,9% use `system`.
            // @param {string} search - object type, like `state`, `instance`, `adapter`, `host`, ...
            // @param {string} params - parameters for the query in form `{startkey: 'system.adapter.', endkey?: 'system.adapter.\u9999', depth?: number}`
            // @param {function} callback - `function (error)`
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObjectView', callback, search)) {
                    try {
                        if (params && (params.root || params.depth)) {
                            // To save the bandwidth, the request can define root and depth. Default is depth 1.
                            this.adapter.getObjectView(
                                design,
                                search,
                                params,
                                { user: socket._acl?.user },
                                (err, result) => {
                                    if (result?.rows?.length && result.rows[0].value?._id) {
                                        const rows = [];
                                        // filter rows
                                        const depth = params.depth || 1;
                                        let root = params.startkey;
                                        let rootWithoutDot;
                                        if (!root.endsWith('.')) {
                                            root += '.';
                                            rootWithoutDot = root;
                                        } else {
                                            rootWithoutDot = root.substring(0, root.length - 1);
                                        }

                                        const rootDepth = root.split('.').length;
                                        const virtualObjects: Record<
                                            string,
                                            {
                                                id: string;
                                                value: {
                                                    _id: string;
                                                    common: Record<string, any>;
                                                    type: string;
                                                    virtual: boolean;
                                                    hasChildren: number;
                                                };
                                            }
                                        > = {};

                                        for (let r = 0; r < result.rows.length; r++) {
                                            if (
                                                result.rows[r].value._id.startsWith(root) ||
                                                result.rows[r].value._id === rootWithoutDot
                                            ) {
                                                const parts = result.rows[r].id.split('.');
                                                if (parts.length - rootDepth <= depth) {
                                                    rows.push(result.rows[r]);
                                                } else {
                                                    // create virtual objects to show that there are more objects
                                                    for (let d = depth; d < parts.length - rootDepth; d++) {
                                                        const id = parts.slice(0, rootDepth + d).join('.');
                                                        if (!virtualObjects[id]) {
                                                            virtualObjects[id] = {
                                                                id,
                                                                value: {
                                                                    _id: id,
                                                                    common: {},
                                                                    type: 'folder',
                                                                    virtual: true,
                                                                    hasChildren: 1,
                                                                },
                                                            };
                                                            rows.push(virtualObjects[id]);
                                                        } else {
                                                            virtualObjects[id].value.hasChildren++;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        result.rows = rows;
                                    }
                                    callback(err, result);
                                },
                            );
                        } else {
                            this.adapter.getObjectView(design, search, params, { user: socket._acl?.user }, callback);
                        }
                    } catch (error) {
                        this.adapter.log.error(`[getObjectView] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            } else {
                this.adapter.log.error('Callback is not a function');
            }
        };

        this.commands.setObject = (socket: WebSocketClient, id, obj, callback) => {
            // Set object.
            // @param {string} id - object ID
            // @param {object} obj - object itself
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'setObject', callback, id)) {
                try {
                    void this.adapter.setForeignObject(id, obj, { user: socket._acl?.user }, (error, ...args): void =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[setObject] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        // this function is overloaded in admin
        this.commands.delObject = (socket: WebSocketClient, id: string, options, callback) => {
            // Delete object. Only deletion of flot objects is allowed
            // @param {string} id - Object ID like, 'flot.0.myChart'
            // @param {string} options - ignored
            // @param {function} callback - `function (error)`
            if (id.startsWith('flot.') || id.startsWith('fullcalendar.')) {
                if (this._checkPermissions(socket, 'delObject', callback, id)) {
                    try {
                        this.adapter.delForeignObject(id, { user: socket._acl?.user }, (error, ...args) =>
                            SocketCommands._fixCallback(callback, error, ...args),
                        );
                    } catch (error) {
                        this.adapter.log.error(`[delObject] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            } else {
                SocketCommands._fixCallback(callback, SocketCommands.ERROR_PERMISSION);
            }
        };

        this.commands.clientSubscribe = (socket: WebSocketClient, targetInstance, messageType, data, callback) => {
            // Client informs specific instance about subscription on its messages. After subscription the socket will receive "im" messages from desired instance
            // @param {string} targetInstance - instance name, e.g. "cameras.0"
            // @param {string} messageType - message type, e.g. "startRecording/cam1"
            // @param {object} data - optional data object, e.g. {width: 640, height: 480}
            // @param {function} callback - `function (error, result)`, target instance MUST acknowledge the subscription and return some object as result
            if (typeof data === 'function') {
                callback = data;
                data = null;
            }
            if (!targetInstance.startsWith('system.adapter.')) {
                targetInstance = `system.adapter.${targetInstance}`;
            }
            const sid = socket.id;
            // GUI subscribes for messages from targetInstance
            this.#clientSubscribes[sid] = this.#clientSubscribes[sid] || {};
            this.#clientSubscribes[sid][targetInstance] = this.#clientSubscribes[sid][targetInstance] || [];
            if (!this.#clientSubscribes[sid][targetInstance].includes(messageType)) {
                this.#clientSubscribes[sid][targetInstance].push(messageType);
            }
            // inform instance about new subscription
            this.adapter.sendTo(targetInstance, 'clientSubscribe', { type: messageType, sid, data }, result =>
                SocketCommands._fixCallback(callback, null, result),
            );
        };

        this.commands.clientUnsubscribe = (socket: WebSocketClient, targetInstance, messageType, callback) => {
            // Client unsubscribes from specific instance's messages
            // @param {string} targetInstance - instance name, e.g. "cameras.0"
            // @param {string} messageType - message type, e.g. "startRecording/cam1"
            // @param {function} callback - `function (error, wasSubscribed)`, target instance MUST NOT acknowledge the un-subscription
            const sid = socket.id;
            if (!targetInstance.startsWith('system.adapter.')) {
                targetInstance = `system.adapter.${targetInstance}`;
            }

            // GUI unsubscribes for messages from targetInstance
            if (this.#clientSubscribes[sid] && this.#clientSubscribes[sid][targetInstance]) {
                const pos = this.#clientSubscribes[sid][targetInstance].indexOf(messageType);
                if (pos !== -1) {
                    this.#clientSubscribes[sid][targetInstance].splice(pos, 1);
                    // inform instance about unsubscription
                    this.adapter.sendTo(targetInstance, 'clientUnsubscribe', {
                        type: [messageType],
                        sid,
                        reason: 'client',
                    });
                    SocketCommands._fixCallback(callback, null, true);
                    return;
                }
            }
            SocketCommands._fixCallback(callback, null, false);
        };
    }

    /** Init all commands: common, objects, states, files */
    #initCommands(): void {
        this._initCommandsCommon();
        this._initCommandsObjects();
        this._initCommandsStates();
        this._initCommandsFiles();
    }

    #informAboutDisconnect(socketId: string): void {
        // say to all instances, that this socket was disconnected
        if (this.#clientSubscribes[socketId]) {
            Object.keys(this.#clientSubscribes[socketId]).forEach(targetInstance => {
                this.adapter.sendTo(targetInstance, 'clientUnsubscribe', {
                    type: this.#clientSubscribes[socketId][targetInstance],
                    sid: socketId,
                    reason: 'disconnect',
                });
            });
            delete this.#clientSubscribes[socketId];
        }
    }

    applyCommands(socket: WebSocketClient): void {
        Object.keys(this.commands).forEach(command =>
            socket.on(command, (...args) => {
                if (this.#updateSession(socket)) {
                    this.commands[command](socket, ...args);
                }
            }),
        );
    }

    disableEventThreshold(): void {
        // could be overloaded
    }

    destroy(): void {
        // could be overloaded
    }
}
