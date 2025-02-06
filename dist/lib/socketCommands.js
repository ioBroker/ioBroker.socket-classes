"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _SocketCommands_instances, _SocketCommands_logEnabled, _SocketCommands_clientSubscribes, _SocketCommands_updateSession, _SocketCommands_rename, _SocketCommands_unlink, _SocketCommands_subscribeStates, _SocketCommands_unsubscribeStates, _SocketCommands_subscribeFiles, _SocketCommands_httpGet, _SocketCommands_initCommands, _SocketCommands_informAboutDisconnect;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketCommands = exports.COMMANDS_PERMISSIONS = void 0;
const adapter_core_1 = require("@iobroker/adapter-core"); // Get common adapter utils
exports.COMMANDS_PERMISSIONS = {
    getObject: { type: 'object', operation: 'read' },
    getObjects: { type: 'object', operation: 'list' },
    getObjectView: { type: 'object', operation: 'list' },
    setObject: { type: 'object', operation: 'write' },
    requireLog: { type: 'object', operation: 'write' }, // just mapping to some command
    delObject: { type: 'object', operation: 'delete' },
    extendObject: { type: 'object', operation: 'write' },
    getHostByIp: { type: 'object', operation: 'list' },
    subscribeObjects: { type: 'object', operation: 'read' },
    unsubscribeObjects: { type: 'object', operation: 'read' },
    getStates: { type: 'state', operation: 'list' },
    getState: { type: 'state', operation: 'read' },
    setState: { type: 'state', operation: 'write' },
    delState: { type: 'state', operation: 'delete' },
    createState: { type: 'state', operation: 'create' },
    subscribe: { type: 'state', operation: 'read' },
    unsubscribe: { type: 'state', operation: 'read' },
    getStateHistory: { type: 'state', operation: 'read' },
    getVersion: { type: '', operation: '' },
    getAdapterName: { type: '', operation: '' },
    addUser: { type: 'users', operation: 'create' },
    delUser: { type: 'users', operation: 'delete' },
    addGroup: { type: 'users', operation: 'create' },
    delGroup: { type: 'users', operation: 'delete' },
    changePassword: { type: 'users', operation: 'write' },
    httpGet: { type: 'other', operation: 'http' },
    cmdExec: { type: 'other', operation: 'execute' },
    sendTo: { type: 'other', operation: 'sendto' },
    sendToHost: { type: 'other', operation: 'sendto' },
    readLogs: { type: 'other', operation: 'execute' },
    readDir: { type: 'file', operation: 'list' },
    createFile: { type: 'file', operation: 'create' },
    writeFile: { type: 'file', operation: 'write' },
    readFile: { type: 'file', operation: 'read' },
    fileExists: { type: 'file', operation: 'read' },
    deleteFile: { type: 'file', operation: 'delete' },
    readFile64: { type: 'file', operation: 'read' },
    writeFile64: { type: 'file', operation: 'write' },
    unlink: { type: 'file', operation: 'delete' },
    rename: { type: 'file', operation: 'write' },
    mkdir: { type: 'file', operation: 'write' },
    chmodFile: { type: 'file', operation: 'write' },
    chownFile: { type: 'file', operation: 'write' },
    subscribeFiles: { type: 'file', operation: 'read' },
    unsubscribeFiles: { type: 'file', operation: 'read' },
    authEnabled: { type: '', operation: '' },
    disconnect: { type: '', operation: '' },
    listPermissions: { type: '', operation: '' },
    getUserPermissions: { type: 'object', operation: 'read' },
};
const pattern2RegEx = adapter_core_1.commonTools.pattern2RegEx;
let axiosGet = null;
let zipFiles = null;
class SocketCommands {
    constructor(adapter, updateSession, context) {
        _SocketCommands_instances.add(this);
        this.commands = {};
        this.subscribes = {};
        _SocketCommands_logEnabled.set(this, false);
        _SocketCommands_clientSubscribes.set(this, {});
        _SocketCommands_updateSession.set(this, void 0);
        this.states = null;
        this.adapter = adapter;
        __classPrivateFieldSet(this, _SocketCommands_updateSession, updateSession, "f");
        this.context = context;
        __classPrivateFieldSet(this, _SocketCommands_updateSession, __classPrivateFieldGet(this, _SocketCommands_updateSession, "f") || (() => true), "f");
        this._sendToHost = null;
        __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_initCommands).call(this);
    }
    /**
     * Convert errors into strings and then call cb
     *
     * @param callback Callback function
     * @param error Error
     * @param args Arguments passed to callback
     */
    static _fixCallback(callback, error, ...args) {
        if (typeof callback !== 'function') {
            return;
        }
        if (error instanceof Error) {
            error = error.message;
        }
        callback(error, ...args);
    }
    _checkPermissions(socket, command, callback, ...args) {
        var _a, _b, _c, _d, _e, _f;
        const _command = command;
        if (((_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user) !== 'system.user.admin') {
            // type: file, object, state, other
            // operation: create, read, write, list, delete, sendto, execute, sendToHost, readLogs
            if (SocketCommands.COMMANDS_PERMISSIONS[_command]) {
                // If permission required
                if (SocketCommands.COMMANDS_PERMISSIONS[_command].type) {
                    if (SocketCommands.COMMANDS_PERMISSIONS[_command].type === 'object' &&
                        ((_b = socket._acl) === null || _b === void 0 ? void 0 : _b.object) &&
                        ((_c = socket._acl) === null || _c === void 0 ? void 0 : _c.object)[SocketCommands.COMMANDS_PERMISSIONS[_command].operation]) {
                        return true;
                    }
                    else if (SocketCommands.COMMANDS_PERMISSIONS[_command].type === 'state' &&
                        ((_d = socket._acl) === null || _d === void 0 ? void 0 : _d.state) &&
                        ((_e = socket._acl) === null || _e === void 0 ? void 0 : _e.state)[SocketCommands.COMMANDS_PERMISSIONS[_command].operation]) {
                        return true;
                    }
                    this.adapter.log.warn(`No permission for "${(_f = socket._acl) === null || _f === void 0 ? void 0 : _f.user}" to call ${_command}. Need "${SocketCommands.COMMANDS_PERMISSIONS[_command].type}"."${SocketCommands.COMMANDS_PERMISSIONS[_command].operation}"`);
                }
                else {
                    return true;
                }
            }
            else {
                this.adapter.log.warn(`No rule for command: ${_command}`);
            }
            if (typeof callback === 'function') {
                callback(SocketCommands.ERROR_PERMISSION);
            }
            else {
                if (SocketCommands.COMMANDS_PERMISSIONS[_command]) {
                    socket.emit(SocketCommands.ERROR_PERMISSION, {
                        command,
                        type: SocketCommands.COMMANDS_PERMISSIONS[_command].type,
                        operation: SocketCommands.COMMANDS_PERMISSIONS[_command].operation,
                        args,
                    });
                }
                else {
                    socket.emit(SocketCommands.ERROR_PERMISSION, { command: _command, args });
                }
            }
            return false;
        }
        return true;
    }
    publish(socket, type, id, obj) {
        var _a;
        if (((_a = socket === null || socket === void 0 ? void 0 : socket.subscribe) === null || _a === void 0 ? void 0 : _a[type]) && __classPrivateFieldGet(this, _SocketCommands_updateSession, "f").call(this, socket)) {
            return !!socket.subscribe[type].find(sub => {
                if (sub.regex.test(id)) {
                    // replace language
                    if (this.context.language &&
                        id === 'system.config' &&
                        obj.common) {
                        obj.common.language = this.context.language;
                    }
                    socket.emit(type, id, obj);
                    return true;
                }
            });
        }
        return false;
    }
    publishFile(socket, id, fileName, size) {
        var _a;
        if (((_a = socket === null || socket === void 0 ? void 0 : socket.subscribe) === null || _a === void 0 ? void 0 : _a.fileChange) && __classPrivateFieldGet(this, _SocketCommands_updateSession, "f").call(this, socket)) {
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
    publishInstanceMessage(socket, sourceInstance, messageType, data) {
        var _a, _b;
        if ((_b = (_a = __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[socket.id]) === null || _a === void 0 ? void 0 : _a[sourceInstance]) === null || _b === void 0 ? void 0 : _b.includes(messageType)) {
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
    _showSubscribes(socket, type) {
        if (socket === null || socket === void 0 ? void 0 : socket.subscribe) {
            const s = socket.subscribe[type] || [];
            const ids = [];
            for (let i = 0; i < s.length; i++) {
                ids.push(s[i].pattern);
            }
            this.adapter.log.debug(`Subscribes: ${ids.join(', ')}`);
        }
        else {
            this.adapter.log.debug('Subscribes: no subscribes');
        }
    }
    isLogEnabled() {
        return __classPrivateFieldGet(this, _SocketCommands_logEnabled, "f");
    }
    subscribe(socket, type, pattern, patternFile) {
        var _a;
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
        }
        else {
            key = pattern;
        }
        try {
            p = pattern2RegEx(key);
        }
        catch (e) {
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
        const options = ((_a = socket === null || socket === void 0 ? void 0 : socket._acl) === null || _a === void 0 ? void 0 : _a.user) ? { user: socket._acl.user } : undefined;
        if (this.subscribes[type][key] === undefined) {
            this.subscribes[type][key] = 1;
            if (type === 'stateChange') {
                this.adapter
                    .subscribeForeignStatesAsync(pattern, options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            }
            else if (type === 'objectChange') {
                this.adapter
                    .subscribeForeignObjectsAsync(pattern, options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            }
            else if (type === 'log') {
                if (!__classPrivateFieldGet(this, _SocketCommands_logEnabled, "f") && this.adapter.requireLog) {
                    __classPrivateFieldSet(this, _SocketCommands_logEnabled, true, "f");
                    void this.adapter.requireLog(true, options);
                }
            }
            else if (type === 'fileChange' && this.adapter.subscribeForeignFiles) {
                void this.adapter
                    .subscribeForeignFiles(pattern, patternFile || '*', options)
                    .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
            }
        }
        else {
            this.subscribes[type][key]++;
        }
    }
    unsubscribe(socket, type, pattern, patternFile) {
        var _a;
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
        }
        else {
            key = pattern;
        }
        const options = ((_a = socket === null || socket === void 0 ? void 0 : socket._acl) === null || _a === void 0 ? void 0 : _a.user) ? { user: socket._acl.user } : undefined;
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
                                    .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                            }
                            else if (type === 'objectChange') {
                                this.adapter
                                    .unsubscribeForeignObjectsAsync(pattern, options)
                                    .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                            }
                            else if (type === 'log') {
                                if (__classPrivateFieldGet(this, _SocketCommands_logEnabled, "f") && this.adapter.requireLog) {
                                    __classPrivateFieldSet(this, _SocketCommands_logEnabled, false, "f");
                                    void this.adapter.requireLog(false, options);
                                }
                            }
                            else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                                void this.adapter
                                    .unsubscribeForeignFiles(pattern, patternFile || '*', options)
                                    .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                            }
                            delete this.subscribes[type][pattern];
                        }
                    }
                    socket.subscribe[type].splice(i, 1);
                    return;
                }
            }
        }
        else if (key) {
            // Remove a pattern from a global list
            if (this.subscribes[type][key] !== undefined) {
                this.subscribes[type][key]--;
                if (this.subscribes[type][key] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter
                            .unsubscribeForeignStatesAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    else if (type === 'objectChange') {
                        this.adapter
                            .unsubscribeForeignObjectsAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    else if (type === 'log') {
                        if (this.adapter.requireLog && __classPrivateFieldGet(this, _SocketCommands_logEnabled, "f")) {
                            __classPrivateFieldSet(this, _SocketCommands_logEnabled, false, "f");
                            void this.adapter.requireLog(false, options);
                        }
                    }
                    else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                        void this.adapter
                            .unsubscribeForeignFiles(pattern, patternFile || '*', options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    delete this.subscribes[type][key];
                }
            }
        }
        else {
            for (const pattern of Object.keys(this.subscribes[type])) {
                if (type === 'stateChange') {
                    this.adapter
                        .unsubscribeForeignStatesAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                }
                else if (type === 'objectChange') {
                    this.adapter
                        .unsubscribeForeignObjectsAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                }
                else if (type === 'log') {
                    // console.log((socket._name || socket.id) + ' requireLog false');
                    if (this.adapter.requireLog && __classPrivateFieldGet(this, _SocketCommands_logEnabled, "f")) {
                        __classPrivateFieldSet(this, _SocketCommands_logEnabled, false, "f");
                        void this.adapter.requireLog(false, options);
                    }
                }
                else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
                    const [id, fileName] = pattern.split('####');
                    void this.adapter
                        .unsubscribeForeignFiles(id, fileName, options)
                        .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                }
            }
            this.subscribes[type] = {};
        }
    }
    subscribeSocket(socket, type) {
        var _a;
        if (!socket || !socket.subscribe) {
            return;
        }
        if (!type) {
            // all
            Object.keys(socket.subscribe).forEach(type => this.subscribeSocket(socket, type));
            return;
        }
        if (!socket.subscribe[type]) {
            return;
        }
        const options = ((_a = socket === null || socket === void 0 ? void 0 : socket._acl) === null || _a === void 0 ? void 0 : _a.user) ? { user: socket._acl.user } : undefined;
        for (let i = 0; i < socket.subscribe[type].length; i++) {
            const pattern = socket.subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] === undefined) {
                this.subscribes[type][pattern] = 1;
                if (type === 'stateChange') {
                    this.adapter
                        .subscribeForeignStatesAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                }
                else if (type === 'objectChange') {
                    this.adapter
                        .subscribeForeignObjectsAsync(pattern, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                }
                else if (type === 'log') {
                    if (this.adapter.requireLog && !__classPrivateFieldGet(this, _SocketCommands_logEnabled, "f")) {
                        __classPrivateFieldSet(this, _SocketCommands_logEnabled, true, "f");
                        void this.adapter.requireLog(true, options);
                    }
                }
                else if (type === 'fileChange' && this.adapter.subscribeForeignFiles) {
                    const [id, fileName] = pattern.split('####');
                    void this.adapter
                        .subscribeForeignFiles(id, fileName, options)
                        .catch(e => this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`));
                }
            }
            else {
                this.subscribes[type][pattern]++;
            }
        }
    }
    unsubscribeSocket(socket, type) {
        var _a;
        if (!socket || !socket.subscribe) {
            return;
        }
        // inform all instances about disconnected socket
        __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_informAboutDisconnect).call(this, socket.id);
        if (!type) {
            // all
            Object.keys(socket.subscribe).forEach(type => this.unsubscribeSocket(socket, type));
            return;
        }
        if (!socket.subscribe[type]) {
            return;
        }
        const options = ((_a = socket === null || socket === void 0 ? void 0 : socket._acl) === null || _a === void 0 ? void 0 : _a.user) ? { user: socket._acl.user } : undefined;
        for (let i = 0; i < socket.subscribe[type].length; i++) {
            const pattern = socket.subscribe[type][i].pattern;
            if (this.subscribes[type][pattern] !== undefined) {
                this.subscribes[type][pattern]--;
                if (this.subscribes[type][pattern] <= 0) {
                    if (type === 'stateChange') {
                        this.adapter
                            .unsubscribeForeignStatesAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    else if (type === 'objectChange') {
                        this.adapter
                            .unsubscribeForeignObjectsAsync(pattern, options)
                            .catch(e => this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`));
                    }
                    else if (type === 'log') {
                        if (this.adapter.requireLog && !__classPrivateFieldGet(this, _SocketCommands_logEnabled, "f")) {
                            __classPrivateFieldSet(this, _SocketCommands_logEnabled, true, "f");
                            void this.adapter.requireLog(true, options);
                        }
                    }
                    else if (type === 'fileChange' && this.adapter.unsubscribeForeignFiles) {
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
    _unsubscribeFiles(socket, id, pattern, callback) {
        if (this._checkPermissions(socket, 'unsubscribeFiles', callback, pattern)) {
            if (Array.isArray(pattern)) {
                for (let p = 0; p < pattern.length; p++) {
                    this.unsubscribe(socket, 'fileChange', id, pattern[p]);
                }
            }
            else {
                this.unsubscribe(socket, 'fileChange', id, pattern);
            }
            this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'fileChange');
            typeof callback === 'function' && setImmediate(callback, null);
        }
    }
    addCommandHandler(command, handler) {
        if (handler) {
            this.commands[command] = handler;
        }
        else if (command in this.commands) {
            delete this.commands[command];
        }
    }
    getCommandHandler(command) {
        return this.commands[command];
    }
    /**
     * Converts old structures of config definitions into new one - `adminUI`
     *
     * @param obj Instance or adapter object to be converted
     */
    fixAdminUI(obj) {
        if ((obj === null || obj === void 0 ? void 0 : obj.common) && !obj.common.adminUI) {
            obj.common.adminUI = { config: 'none' };
            if (obj.common.noConfig) {
                obj.common.adminUI.config = 'none';
                // @ts-expect-error this attribute is deprecated, but still used
            }
            else if (obj.common.jsonConfig) {
                obj.common.adminUI.config = 'json';
            }
            else if (obj.common.materialize) {
                obj.common.adminUI.config = 'materialize';
            }
            else {
                obj.common.adminUI.config = 'html';
            }
            // @ts-expect-error this attribute is deprecated, but still used
            if (obj.common.jsonCustom) {
                obj.common.adminUI.custom = 'json';
            }
            else if (obj.common.supportCustoms) {
                obj.common.adminUI.custom = 'json';
            }
            if (obj.common.materializeTab && obj.common.adminTab) {
                obj.common.adminUI.tab = 'materialize';
            }
            else if (obj.common.adminTab) {
                obj.common.adminUI.tab = 'html';
            }
            if (obj.common.adminUI) {
                this.adapter.log.debug(`Please add to "${obj._id.replace(/\.\d+$/, '')}" common.adminUI=${JSON.stringify(obj.common.adminUI)}`);
            }
        }
    }
    /** Init common commands that not belong to stats, objects or files */
    _initCommandsCommon() {
        /**
         * #DOCUMENTATION commands
         * Wait till user is authenticated.
         * As the user authenticates himself, the callback will be called
         *
         * @param socket Socket instance
         * @param callback Callback `(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void`
         */
        this.commands.authenticate = (socket, callback) => {
            var _a, _b;
            if (((_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user) !== null) {
                this.adapter.log.debug(`${new Date().toISOString()} Request authenticate [${(_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user}]`);
                if (typeof callback === 'function') {
                    callback(true, socket._secure);
                }
            }
            else {
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
        this.commands.error = (_socket, error) => {
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
        this.commands.log = (_socket, text, level) => {
            if (level === 'error') {
                this.adapter.log.error(text);
            }
            else if (level === 'warn') {
                this.adapter.log.warn(text);
            }
            else if (level === 'info') {
                this.adapter.log.info(text);
            }
            else {
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
        this.commands.checkFeatureSupported = (_socket, feature, callback) => {
            if (feature === 'INSTANCE_MESSAGES') {
                SocketCommands._fixCallback(callback, null, true);
            }
            else if (feature === 'PARTIAL_OBJECT_TREE') {
                SocketCommands._fixCallback(callback, null, true);
            }
            else {
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
        this.commands.getHistory = (socket, id, options, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'getStateHistory', callback, id)) {
                if (typeof options === 'string') {
                    options = {
                        instance: options,
                    };
                }
                options = options || {};
                // @ts-expect-error fixed in js-controller
                options.user = (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user;
                options.aggregate = options.aggregate || 'none';
                try {
                    this.adapter.getHistory(id, options, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
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
        this.commands.httpGet = (socket, url, callback) => {
            if (this._checkPermissions(socket, 'httpGet', callback, url)) {
                if (axiosGet) {
                    __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_httpGet).call(this, url, callback);
                }
                else {
                    void import('axios').then(({ default: axios }) => {
                        axiosGet = axiosGet || axios.get;
                        __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_httpGet).call(this, url, callback);
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
        this.commands.sendTo = (socket, adapterInstance, command, message, callback) => {
            if (this._checkPermissions(socket, 'sendTo', callback, command)) {
                try {
                    this.adapter.sendTo(adapterInstance, command, message, res => typeof callback === 'function' && setImmediate(() => callback(res)));
                }
                catch (error) {
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
        this.commands.sendToHost = (socket, host, command, message, callback) => {
            if (this._checkPermissions(socket, protectedCommands.includes(command) ? 'cmdExec' : 'sendToHost', (error) => callback({ error: error || SocketCommands.ERROR_PERMISSION }), command)) {
                // Try to decode this file locally as redis has a limitation for files bigger than 20MB
                if (command === 'writeDirAsZip' && message && message.data.length > 1024 * 1024) {
                    let buffer;
                    try {
                        buffer = Buffer.from(message.data, 'base64');
                    }
                    catch (error) {
                        this.adapter.log.error(`Cannot convert data: ${error.toString()}`);
                        return callback && callback({ error: `Cannot convert data: ${error.toString()}` });
                    }
                    zipFiles = zipFiles || adapter_core_1.commonTools.zipFiles;
                    zipFiles
                        .writeDirAsZip(this.adapter, // normally we have to pass here the internal "objects" object, but as
                    // only writeFile is used, and it has the same name, we can pass here the
                    // adapter, which has the function with the same name and arguments
                    message.id, message.name, buffer, message.options, (error) => callback({ error: error === null || error === void 0 ? void 0 : error.toString() }))
                        .then(() => callback({}))
                        .catch((error) => {
                        this.adapter.log.error(`Cannot write zip file as folder: ${error.toString()}`);
                        if (callback) {
                            callback({ error: error === null || error === void 0 ? void 0 : error.toString() });
                        }
                    });
                }
                else if (this._sendToHost) {
                    this._sendToHost(host, command, message, callback);
                }
                else {
                    try {
                        this.adapter.sendToHost(host, command, message, callback);
                    }
                    catch (error) {
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
        this.commands.authEnabled = (socket, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'authEnabled', callback)) {
                if (typeof callback === 'function') {
                    // @ts-expect-error auth could exist in adapter settings
                    callback(this.adapter.config.auth, (((_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user) || '').replace(/^system\.user\./, ''));
                }
                else {
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
        this.commands.logout = (socket, callback) => {
            // Logout user
            // @param {function} callback - function (error)
            if (socket.id) {
                void this.adapter.destroySession(socket.id, callback);
            }
            else if (callback) {
                callback(new Error('No session'));
            }
        };
        /**
         * #DOCUMENTATION commands
         * List commands and permissions
         *
         * @param _socket Socket instance (not used)
         * @param callback callback `(permissions: Record<string, { type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: SocketOperation }>) => void`
         */
        this.commands.listPermissions = (_socket, callback) => {
            if (typeof callback === 'function') {
                callback(SocketCommands.COMMANDS_PERMISSIONS);
            }
            else {
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
        this.commands.getUserPermissions = (socket, callback) => {
            // Get user permissions
            // @param {function} callback - `function (error, permissions)`
            if (this._checkPermissions(socket, 'getUserPermissions', callback)) {
                if (typeof callback === 'function') {
                    callback(null, socket._acl);
                }
                else {
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
        this.commands.getVersion = (socket, callback) => {
            // Get the adapter version. Not the socket-classes version!
            // @param {function} callback - `function (error, adapterVersion, adapterName)`
            if (this._checkPermissions(socket, 'getVersion', callback)) {
                if (typeof callback === 'function') {
                    callback(null, this.adapter.version, this.adapter.name);
                }
                else {
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
        this.commands.getAdapterName = (socket, callback) => {
            // Get adapter name. Not the socket-classes version!
            // @param {function} callback - `function (error, adapterVersion)`
            if (this._checkPermissions(socket, 'getAdapterName', callback)) {
                if (typeof callback === 'function') {
                    callback(null, this.adapter.name || 'unknown');
                }
                else {
                    this.adapter.log.warn('[getAdapterName] Invalid callback');
                }
            }
        };
    }
    /** Init commands for files */
    _initCommandsFiles() {
        /**
         * #DOCUMENTATION files
         * Read a file from ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param callback Callback `(error: null | undefined | Error | string, data: Buffer | string, mimeType: string) => void`
         */
        this.commands.readFile = (socket, adapter, fileName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'readFile', callback, fileName)) {
                try {
                    this.adapter.readFile(adapter, fileName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[readFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Read a file from ioBroker DB as base64 string
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param callback Callback `(error: null | undefined | Error | string, base64: string, mimeType: string) => void`
         */
        this.commands.readFile64 = (socket, adapter, fileName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'readFile64', callback, fileName)) {
                try {
                    this.adapter.readFile(adapter, fileName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, buffer, type) => {
                        let data64;
                        if (buffer) {
                            try {
                                if (type === 'application/json' ||
                                    type === 'application/json5' ||
                                    fileName.toLowerCase().endsWith('.json5')) {
                                    data64 = Buffer.from(encodeURIComponent(buffer)).toString('base64');
                                }
                                else {
                                    if (typeof buffer === 'string') {
                                        data64 = Buffer.from(buffer).toString('base64');
                                    }
                                    else {
                                        data64 = buffer.toString('base64');
                                    }
                                }
                            }
                            catch (error) {
                                this.adapter.log.error(`[readFile64] Cannot convert data: ${error.toString()}`);
                            }
                        }
                        // Convert buffer to base 64
                        if (typeof callback === 'function') {
                            callback(error, data64 || '', type);
                        }
                        else {
                            this.adapter.log.warn('[readFile64] Invalid callback');
                        }
                    });
                }
                catch (error) {
                    this.adapter.log.error(`[readFile64] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Write a file into ioBroker DB as base64 string
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param data64 file content as base64 string
         * @param options optional `{mode: 0x0644}`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.writeFile64 = (socket, adapter, fileName, data64, options, callback) => {
            var _a, _b, _c;
            let _options;
            if (typeof options === 'function') {
                callback = options;
                _options = { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user };
            }
            else if (!options || options.mode === undefined) {
                _options = { user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user };
            }
            else {
                _options = { user: (_c = socket._acl) === null || _c === void 0 ? void 0 : _c.user, mode: options.mode };
            }
            if (this._checkPermissions(socket, 'writeFile64', callback, fileName)) {
                if (!data64) {
                    return SocketCommands._fixCallback(callback, 'No data provided');
                }
                // Convert base 64 to buffer
                try {
                    const buffer = Buffer.from(data64, 'base64');
                    this.adapter.writeFile(adapter, fileName, buffer, _options, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[writeFile64] Cannot convert data: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, `Cannot convert data: ${error.toString()}`);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Write a file into ioBroker DB as text
         *
         * This function is overloaded in admin (because admin accepts only base64)
         *
         * @deprecated
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param data file content as text
         * @param options optional `{mode: 0x0644}`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.writeFile = (socket, adapter, fileName, data, options, callback) => {
            var _a, _b, _c;
            if (this._checkPermissions(socket, 'writeFile', callback, fileName)) {
                let _options;
                if (typeof options === 'function') {
                    callback = options;
                    _options = { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user };
                }
                else if (!options || options.mode === undefined) {
                    _options = { user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user };
                }
                else {
                    _options = { user: (_c = socket._acl) === null || _c === void 0 ? void 0 : _c.user, mode: options.mode };
                }
                this.adapter.log.debug('writeFile deprecated. Please use writeFile64');
                try {
                    this.adapter.writeFile(adapter, fileName, data, _options, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[writeFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Delete file in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param name file name, e.g. `main/vis-views.json`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.unlink = (socket, adapter, name, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_unlink).call(this, adapter, name, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user })
                        .then(() => SocketCommands._fixCallback(callback, undefined))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                }
                catch (error) {
                    this.adapter.log.error(`[unlink] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Delete a file in ioBroker DB (same as "unlink", but only for files)
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param name file name, e.g. `main/vis-views.json`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.deleteFile = (socket, adapter, name, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    this.adapter.unlink(adapter, name, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[deleteFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Delete folder in ioBroker DB (same as `unlink`, but only for folders)
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param name folder name, e.g. `main`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.deleteFolder = (socket, adapter, name, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'unlink', callback, name)) {
                try {
                    __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_unlink).call(this, adapter, name, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user })
                        .then(() => SocketCommands._fixCallback(callback, null))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                }
                catch (error) {
                    this.adapter.log.error(`[deleteFolder] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Rename a file in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param oldName current file name, e.g. `main/vis-views.json`
         * @param newName new file name, e.g. `main/vis-views-new.json`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.renameFile = (socket, adapter, oldName, newName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'rename', callback, oldName)) {
                try {
                    this.adapter.rename(adapter, oldName, newName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[renameFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Rename file or folder in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param oldName current file name, e.g. `main/vis-views.json`
         * @param newName new file name, e.g. `main/vis-views-new.json`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.rename = (socket, adapter, oldName, newName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'rename', callback, oldName)) {
                try {
                    __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_rename).call(this, adapter, oldName, newName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user })
                        .then(() => SocketCommands._fixCallback(callback, undefined))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                }
                catch (error) {
                    this.adapter.log.error(`[rename] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Create a folder in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param dirName desired folder name, e.g. `main`
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.mkdir = (socket, adapter, dirName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'mkdir', callback, dirName)) {
                try {
                    this.adapter.mkdir(adapter, dirName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[mkdir] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Read content of folder in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param dirName folder name, e.g. `main`
         * @param options for future use
         * @param callback Callback `(error: null | undefined | Error | string, files: Array<{file: string, isDir: boolean, stats: {size: number}, modifiedAt: number, acl: {owner: string, ownerGroup: string, permissions: number, read: boolean, write: boolean}}>) => void`
         */
        this.commands.readDir = (socket, adapter, dirName, options, callback) => {
            var _a;
            if (typeof options === 'function') {
                callback = options;
            }
            if (this._checkPermissions(socket, 'readDir', callback, dirName)) {
                try {
                    this.adapter.readDir(adapter, dirName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[readDir] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Change a file mode in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param options options `{mode: 0x644}`
         * @param options.mode File mode in linux format 0x644. The first digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
         * @param callback Callback `(error: string | Error | null | undefined) => void`
         */
        this.commands.chmodFile = (socket, adapter, fileName, options, callback) => {
            var _a;
            let _options;
            if ((options === null || options === void 0 ? void 0 : options.mode) !== undefined) {
                _options = { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user, mode: options.mode };
            }
            else {
                this.adapter.log.error(`[chownFile] ERROR: no options`);
                SocketCommands._fixCallback(callback, 'no options');
                return;
            }
            if (this._checkPermissions(socket, 'chmodFile', callback, fileName)) {
                try {
                    this.adapter.chmodFile(adapter, fileName, _options, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[chmodFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Change file owner in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param options options `{owner: 'system.user.user', ownerGroup: 'system.group.administrator'}` or `system.user.user`. If ownerGroup is not defined, it will be taken from owner.
         * @param options.owner New owner, like 'system.user.user'
         * @param options.ownerGroup New owner group, like 'system.group.administrator' If ownerGroup is not defined, it will be taken from owner.
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.chownFile = (socket, adapter, fileName, options, callback) => {
            var _a;
            let _options;
            if (options) {
                _options = { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user, owner: options.owner, ownerGroup: options.ownerGroup };
            }
            else {
                this.adapter.log.error(`[chownFile] ERROR: no options`);
                SocketCommands._fixCallback(callback, 'no options');
                return;
            }
            if (this._checkPermissions(socket, 'chownFile', callback, fileName)) {
                try {
                    this.adapter.chownFile(adapter, fileName, _options, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[chownFile] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Check if the file or folder exists in ioBroker DB
         *
         * @param socket Socket instance
         * @param adapter instance name, e.g. `vis.0`
         * @param fileName file name, e.g. `main/vis-views.json`
         * @param callback Callback `(error: null | undefined | Error | string, exists?: boolean) => void`
         */
        this.commands.fileExists = (socket, adapter, fileName, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'fileExists', callback, fileName)) {
                try {
                    this.adapter.fileExists(adapter, fileName, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[fileExists] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION files
         * Subscribe to file changes in ioBroker DB
         *
         * @param socket Socket instance
         * @param id instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
         * @param pattern file name pattern, e.g. `main/*.json` or array of names
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.subscribeFiles = (socket, id, pattern, callback) => {
            return __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_subscribeFiles).call(this, socket, id, pattern, callback);
        };
        /**
         * #DOCUMENTATION files
         * Unsubscribe from file changes in ioBroker DB
         *
         * @param socket Socket instance
         * @param id instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
         * @param pattern file name pattern, e.g. `main/*.json` or array of names
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.unsubscribeFiles = (socket, id, pattern, callback) => {
            return this._unsubscribeFiles(socket, id, pattern, callback);
        };
        /**
         * #DOCUMENTATION commands
         * Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
         *
         * @param socket Socket instance
         * @param adapterName adapter name, e.g. `history`. To get all instances of all adapters just place here "".
         * @param callback callback `(error: null | undefined | Error | string, instanceList?: ioBroker.InstanceObject[]) => void`
         */
        this.commands.getAdapterInstances = (socket, adapterName, callback) => {
            var _a;
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    let _adapterName = adapterName !== undefined && adapterName !== null ? adapterName : this.adapterName || '';
                    if (_adapterName) {
                        _adapterName += '.';
                    }
                    try {
                        this.adapter.getObjectView('system', 'instance', {
                            startkey: `system.adapter.${_adapterName}`,
                            endkey: `system.adapter.${_adapterName}\u9999`,
                        }, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, doc) => {
                            if (error) {
                                callback(error);
                            }
                            else {
                                callback(null, doc === null || doc === void 0 ? void 0 : doc.rows.map(item => {
                                    const obj = item.value;
                                    if (obj.common) {
                                        delete obj.common.news;
                                    }
                                    this.fixAdminUI(obj);
                                    return obj;
                                }).filter(obj => { var _a; return obj && (!adapterName || ((_a = obj.common) === null || _a === void 0 ? void 0 : _a.name) === adapterName); }));
                            }
                        });
                    }
                    catch (error) {
                        this.adapter.log.error(`[getAdapterInstances] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            }
        };
    }
    /** Init commands for states */
    _initCommandsStates() {
        /**
         * #DOCUMENTATION states
         * Get states by pattern of current adapter
         *
         * @param socket Socket instance
         * @param pattern optional pattern, like `system.adapter.*` or array of state IDs. If the pattern is omitted, you will get ALL states of current adapter
         * @param callback callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`
         */
        this.commands.getStates = (socket, pattern, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'getStates', callback, pattern)) {
                if (typeof pattern === 'function') {
                    callback = pattern;
                    pattern = undefined;
                }
                if (typeof callback === 'function') {
                    try {
                        this.adapter.getForeignStates(pattern || '*', { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                    }
                    catch (error) {
                        this.adapter.log.error(`[getStates] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
                else {
                    this.adapter.log.warn('[getStates] Invalid callback');
                }
            }
        };
        /**
         * #DOCUMENTATION states
         * Same as getStates
         *
         * @deprecated
         * @param socket Socket instance
         * @param pattern pattern like `system.adapter.*` or array of state IDs
         * @param callback callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`
         */
        this.commands.getForeignStates = (socket, pattern, callback) => {
            this.adapter.log.info('Use getStates');
            this.commands.getStates(socket, pattern, callback);
        };
        /**
         * #DOCUMENTATION states
         * Get a state by ID
         *
         * @param socket Socket instance
         * @param id State ID, e.g. `system.adapter.admin.0.memRss`
         * @param callback Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`
         */
        this.commands.getState = (socket, id, callback) => {
            var _a;
            if (this._checkPermissions(socket, 'getState', callback, id)) {
                if (typeof callback === 'function') {
                    if (this.states && this.states[id]) {
                        callback(null, this.states[id]);
                    }
                    else {
                        try {
                            void this.adapter
                                .getForeignStateAsync(id, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user })
                                .then(state => SocketCommands._fixCallback(callback, null, [state]))
                                .catch(error => {
                                this.adapter.log.error(`[getState] ERROR: ${error.toString()}`);
                                SocketCommands._fixCallback(callback, error);
                            });
                        }
                        catch (error) {
                            this.adapter.log.error(`[getState] ERROR: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                }
                else {
                    this.adapter.log.warn('[getState] Invalid callback');
                }
            }
        };
        /**
         * #DOCUMENTATION states
         * Set a state by ID
         *
         * @param socket Socket instance
         * @param id State ID, e.g. `system.adapter.admin.0.memRss`
         * @param state State value or object, e.g. `{val: 123, ack: true}`
         * @param callback Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`
         */
        this.commands.setState = (socket, id, state, callback) => {
            var _a, _b;
            if (this._checkPermissions(socket, 'setState', callback, id)) {
                if (typeof state !== 'object') {
                    state = { val: state };
                }
                // clear cache
                if ((_a = this.states) === null || _a === void 0 ? void 0 : _a[id]) {
                    delete this.states[id];
                }
                try {
                    this.adapter.setForeignState(id, state, { user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[setState] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION states
         * Get a binary state by ID
         *
         * @deprecated
         * @param _socket Socket instance (not used)
         * @param id State ID, e.g. `javascript.0.binary`
         * @param callback Callback `(error: null | undefined | Error | string, base64?: string) => void`
         */
        this.commands.getBinaryState = (_socket, id, callback) => {
            if (typeof callback === 'function') {
                this.adapter.log.warn(`getBinaryState is deprecated, but called for ${id}`);
                callback('This function is deprecated');
            }
        };
        /**
         * #DOCUMENTATION states
         * Set a binary state by ID
         *
         * @deprecated
         * @param _socket Socket instance
         * @param id State ID, e.g. `javascript.0.binary`
         * @param _base64 State value as base64 string. Binary states have no acknowledged flag.
         * @param callback Callback `(error: null | undefined | Error | string) => void`
         */
        this.commands.setBinaryState = (_socket, id, _base64, callback) => {
            if (typeof callback === 'function') {
                this.adapter.log.warn(`setBinaryState is deprecated, but called for ${id}`);
                callback('This function is deprecated');
            }
        };
        /**
         * #DOCUMENTATION states
         * Subscribe to state changes by pattern.
         * The events will come as 'stateChange' events to the socket.
         *
         * @param socket Socket instance
         * @param pattern Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
         * @param callback Callback `(error: string | null) => void`
         */
        this.commands.subscribe = (socket, pattern, callback) => {
            __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_subscribeStates).call(this, socket, pattern, callback);
        };
        /**
         * #DOCUMENTATION states
         * Subscribe to state changes by pattern. Same as `subscribe`.
         * The events will come as 'stateChange' events to the socket.
         *
         * @param socket Socket instance
         * @param pattern Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
         * @param callback Callback `(error: string | null) => void`
         */
        this.commands.subscribeStates = (socket, pattern, callback) => {
            __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_subscribeStates).call(this, socket, pattern, callback);
        };
        /**
         * #DOCUMENTATION states
         * Unsubscribe from state changes by pattern.
         *
         * @param socket Socket instance
         * @param pattern Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
         * @param callback Callback `(error: string | null) => void`
         */
        this.commands.unsubscribe = (socket, pattern, callback) => {
            __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_unsubscribeStates).call(this, socket, pattern, callback);
        };
        /**
         * #DOCUMENTATION states
         * Unsubscribe from state changes by pattern. Same as `unsubscribe`.
         * The events will come as 'stateChange' events to the socket.
         *
         * @param socket Socket instance
         * @param pattern Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
         * @param callback Callback `(error: string | null) => void`
         */
        this.commands.unsubscribeStates = (socket, pattern, callback) => {
            __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_unsubscribeStates).call(this, socket, pattern, callback);
        };
    }
    /** Init commands for objects */
    _initCommandsObjects() {
        this.commands.getObject = (socket, id, callback) => {
            var _a;
            // Get one object
            // @param {string} id - object ID.
            // @param {function} callback - `function (error, obj)`
            if (this._checkPermissions(socket, 'getObject', callback, id)) {
                try {
                    void this.adapter.getForeignObject(id, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, obj) => {
                        // overload language from current instance
                        if (this.context.language && id === 'system.config' && (obj === null || obj === void 0 ? void 0 : obj.common)) {
                            obj.common.language = this.context.language;
                        }
                        SocketCommands._fixCallback(callback, error, obj);
                    });
                }
                catch (error) {
                    this.adapter.log.error(`[getObject] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        // not admin version of "all objects"
        // this function is overloaded in admin
        this.commands.getObjects = (socket, list, callback) => {
            var _a, _b;
            // Get all objects that are relevant for web: all states and enums with rooms
            // @param {string} id - object ID.
            // @param {string[]} list - optional list of IDs.
            // @param {function} callback - `function (error, obj)`
            if (typeof list === 'function') {
                callback = list;
                list = null;
            }
            if (list === null || list === void 0 ? void 0 : list.length) {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    if (typeof callback === 'function') {
                        try {
                            this.adapter.getForeignObjects(list, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, objs) => SocketCommands._fixCallback(callback, error, objs));
                        }
                        catch (error) {
                            this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                    else {
                        this.adapter.log.warn('[getObjects] Invalid callback');
                    }
                }
            }
            else if (this._checkPermissions(socket, 'getObjects', callback)) {
                try {
                    if (typeof callback === 'function') {
                        this.adapter.getForeignObjects('*', 'state', 'rooms', { user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user }, async (error, states) => {
                            var _a, _b, _c, _d, _e;
                            const result = {};
                            try {
                                const channels = await this.adapter.getForeignObjectsAsync('*', 'channel', null, {
                                    user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user,
                                });
                                const devices = await this.adapter.getForeignObjectsAsync('*', 'device', null, {
                                    user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user,
                                });
                                const enums = await this.adapter.getForeignObjectsAsync('*', 'enum', null, {
                                    user: (_c = socket._acl) === null || _c === void 0 ? void 0 : _c.user,
                                });
                                const config = await this.adapter.getForeignObjectAsync('system.config', {
                                    user: (_d = socket._acl) === null || _d === void 0 ? void 0 : _d.user,
                                });
                                Object.assign(result, states, channels, devices, enums);
                                if (config) {
                                    result[config._id] = config;
                                }
                            }
                            catch (e) {
                                this.adapter.log.error(`[getObjects] ERROR: ${e.toString()}`);
                            }
                            // overload language
                            if (this.context.language && ((_e = result['system.config']) === null || _e === void 0 ? void 0 : _e.common)) {
                                result['system.config'].common.language = this.context.language;
                            }
                            SocketCommands._fixCallback(callback, error, result);
                        });
                    }
                    else {
                        this.adapter.log.warn('[getObjects] Invalid callback');
                    }
                }
                catch (error) {
                    this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        this.commands.subscribeObjects = (socket, pattern, callback) => {
            // Subscribe to object changes by pattern. The events will come as 'objectChange' events to the socket.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'subscribeObjects', callback, pattern)) {
                try {
                    if (Array.isArray(pattern)) {
                        for (let p = 0; p < pattern.length; p++) {
                            this.subscribe(socket, 'objectChange', pattern[p]);
                        }
                    }
                    else {
                        this.subscribe(socket, 'objectChange', pattern);
                    }
                    if (typeof callback === 'function') {
                        setImmediate(callback, null);
                    }
                }
                catch (error) {
                    if (typeof callback === 'function') {
                        setImmediate(callback, error);
                    }
                }
            }
        };
        this.commands.unsubscribeObjects = (socket, pattern, callback) => {
            // Unsubscribe from object changes by pattern.
            // @param {string} pattern - pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'unsubscribeObjects', callback, pattern)) {
                try {
                    if (Array.isArray(pattern)) {
                        for (let p = 0; p < pattern.length; p++) {
                            this.unsubscribe(socket, 'objectChange', pattern[p]);
                        }
                    }
                    else {
                        this.unsubscribe(socket, 'objectChange', pattern);
                    }
                    if (typeof callback === 'function') {
                        setImmediate(callback, null);
                    }
                }
                catch (error) {
                    if (typeof callback === 'function') {
                        setImmediate(callback, error);
                    }
                }
            }
        };
        this.commands.getObjectView = (socket, design, search, params, callback) => {
            var _a, _b;
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
                            this.adapter.getObjectView(design, search, params, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (err, result) => {
                                var _a, _b;
                                if (((_a = result === null || result === void 0 ? void 0 : result.rows) === null || _a === void 0 ? void 0 : _a.length) && ((_b = result.rows[0].value) === null || _b === void 0 ? void 0 : _b._id)) {
                                    const rows = [];
                                    // filter rows
                                    const depth = params.depth || 1;
                                    let root = params.startkey;
                                    let rootWithoutDot;
                                    if (!root.endsWith('.')) {
                                        root += '.';
                                        rootWithoutDot = root;
                                    }
                                    else {
                                        rootWithoutDot = root.substring(0, root.length - 1);
                                    }
                                    const rootDepth = root.split('.').length;
                                    const virtualObjects = {};
                                    for (let r = 0; r < result.rows.length; r++) {
                                        if (result.rows[r].value._id.startsWith(root) ||
                                            result.rows[r].value._id === rootWithoutDot) {
                                            const parts = result.rows[r].id.split('.');
                                            if (parts.length - rootDepth <= depth) {
                                                rows.push(result.rows[r]);
                                            }
                                            else {
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
                                                    }
                                                    else {
                                                        virtualObjects[id].value.hasChildren++;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    result.rows = rows;
                                }
                                callback(err, result);
                            });
                        }
                        else {
                            this.adapter.getObjectView(design, search, params, { user: (_b = socket._acl) === null || _b === void 0 ? void 0 : _b.user }, callback);
                        }
                    }
                    catch (error) {
                        this.adapter.log.error(`[getObjectView] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            }
            else {
                this.adapter.log.error('Callback is not a function');
            }
        };
        this.commands.setObject = (socket, id, obj, callback) => {
            var _a;
            // Set object.
            // @param {string} id - object ID
            // @param {object} obj - object itself
            // @param {function} callback - `function (error)`
            if (this._checkPermissions(socket, 'setObject', callback, id)) {
                try {
                    void this.adapter.setForeignObject(id, obj, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[setObject] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
        // this function is overloaded in admin
        this.commands.delObject = (socket, id, options, callback) => {
            var _a;
            // Delete object. Only deletion of flot objects is allowed
            // @param {string} id - Object ID like, 'flot.0.myChart'
            // @param {string} options - ignored
            // @param {function} callback - `function (error)`
            if (id.startsWith('flot.') || id.startsWith('fullcalendar.')) {
                if (this._checkPermissions(socket, 'delObject', callback, id)) {
                    try {
                        this.adapter.delForeignObject(id, { user: (_a = socket._acl) === null || _a === void 0 ? void 0 : _a.user }, (error, ...args) => SocketCommands._fixCallback(callback, error, ...args));
                    }
                    catch (error) {
                        this.adapter.log.error(`[delObject] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            }
            else {
                SocketCommands._fixCallback(callback, SocketCommands.ERROR_PERMISSION);
            }
        };
        this.commands.clientSubscribe = (socket, targetInstance, messageType, data, callback) => {
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
            __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid] = __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid] || {};
            __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance] = __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance] || [];
            if (!__classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance].includes(messageType)) {
                __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance].push(messageType);
            }
            // inform instance about new subscription
            this.adapter.sendTo(targetInstance, 'clientSubscribe', { type: messageType, sid, data }, result => SocketCommands._fixCallback(callback, null, result));
        };
        this.commands.clientUnsubscribe = (socket, targetInstance, messageType, callback) => {
            // Client unsubscribes from specific instance's messages
            // @param {string} targetInstance - instance name, e.g. "cameras.0"
            // @param {string} messageType - message type, e.g. "startRecording/cam1"
            // @param {function} callback - `function (error, wasSubscribed)`, target instance MUST NOT acknowledge the un-subscription
            const sid = socket.id;
            if (!targetInstance.startsWith('system.adapter.')) {
                targetInstance = `system.adapter.${targetInstance}`;
            }
            // GUI unsubscribes for messages from targetInstance
            if (__classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid] && __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance]) {
                const pos = __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance].indexOf(messageType);
                if (pos !== -1) {
                    __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[sid][targetInstance].splice(pos, 1);
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
    applyCommands(socket) {
        Object.keys(this.commands).forEach(command => socket.on(command, (...args) => {
            if (__classPrivateFieldGet(this, _SocketCommands_updateSession, "f").call(this, socket)) {
                this.commands[command](socket, ...args);
            }
        }));
    }
    disableEventThreshold() {
        // could be overloaded
    }
    destroy() {
        // could be overloaded
    }
}
exports.SocketCommands = SocketCommands;
_SocketCommands_logEnabled = new WeakMap(), _SocketCommands_clientSubscribes = new WeakMap(), _SocketCommands_updateSession = new WeakMap(), _SocketCommands_instances = new WeakSet(), _SocketCommands_rename = 
/**
 * Rename file or folder
 *
 * @param adapter Object ID
 * @param oldName Old file name
 * @param newName New file name
 * @param options options { user?: string; }
 */
async function _SocketCommands_rename(adapter, oldName, newName, options) {
    // read if it is a file or folder
    try {
        if (oldName.endsWith('/')) {
            oldName = oldName.substring(0, oldName.length - 1);
        }
        if (newName.endsWith('/')) {
            newName = newName.substring(0, newName.length - 1);
        }
        const files = await this.adapter.readDirAsync(adapter, oldName, options);
        if (files === null || files === void 0 ? void 0 : files.length) {
            for (let f = 0; f < files.length; f++) {
                await __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_rename).call(this, adapter, `${oldName}/${files[f].file}`, `${newName}/${files[f].file}`);
            }
        }
    }
    catch (error) {
        if (error.message !== 'Not exists') {
            throw error;
        }
        // else ignore, because it is a file and not a folder
    }
    try {
        await this.adapter.renameAsync(adapter, oldName, newName, options);
    }
    catch (error) {
        if (error.message !== 'Not exists') {
            throw error;
        }
        // else ignore, because the folder cannot be deleted
    }
}, _SocketCommands_unlink = 
/**
 * Delete file or folder
 *
 * @param adapter Object ID
 * @param name File name
 * @param options options { user?: string; }
 */
async function _SocketCommands_unlink(adapter, name, options) {
    // read if it is a file or folder
    try {
        // remove trailing '/'
        if (name.endsWith('/')) {
            name = name.substring(0, name.length - 1);
        }
        const files = await this.adapter.readDirAsync(adapter, name, options);
        if (files && files.length) {
            for (let f = 0; f < files.length; f++) {
                await __classPrivateFieldGet(this, _SocketCommands_instances, "m", _SocketCommands_unlink).call(this, adapter, `${name}/${files[f].file}`);
            }
        }
    }
    catch (error) {
        // ignore, because it is a file and not a folder
        if (error.message !== 'Not exists') {
            throw error;
        }
    }
    try {
        await this.adapter.unlinkAsync(adapter, name, options);
    }
    catch (error) {
        if (error.message !== 'Not exists') {
            throw error;
        }
        // else ignore, because folder cannot be deleted
    }
}, _SocketCommands_subscribeStates = function _SocketCommands_subscribeStates(socket, pattern, callback) {
    if (this._checkPermissions(socket, 'subscribe', callback, pattern)) {
        if (Array.isArray(pattern)) {
            for (let p = 0; p < pattern.length; p++) {
                this.subscribe(socket, 'stateChange', pattern[p]);
            }
        }
        else {
            this.subscribe(socket, 'stateChange', pattern);
        }
        this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'stateChange');
        typeof callback === 'function' && setImmediate(callback, null);
    }
}, _SocketCommands_unsubscribeStates = function _SocketCommands_unsubscribeStates(socket, pattern, callback) {
    if (this._checkPermissions(socket, 'unsubscribe', callback, pattern)) {
        if (Array.isArray(pattern)) {
            for (let p = 0; p < pattern.length; p++) {
                this.unsubscribe(socket, 'stateChange', pattern[p]);
            }
        }
        else {
            this.unsubscribe(socket, 'stateChange', pattern);
        }
        this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'stateChange');
        typeof callback === 'function' && setImmediate(callback, null);
    }
}, _SocketCommands_subscribeFiles = function _SocketCommands_subscribeFiles(socket, id, pattern, callback) {
    if (this._checkPermissions(socket, 'subscribeFiles', callback, pattern)) {
        if (Array.isArray(pattern)) {
            for (let p = 0; p < pattern.length; p++) {
                this.subscribe(socket, 'fileChange', id, pattern[p]);
            }
        }
        else {
            this.subscribe(socket, 'fileChange', id, pattern);
        }
        this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'fileChange');
        typeof callback === 'function' && setImmediate(callback, null);
    }
}, _SocketCommands_httpGet = function _SocketCommands_httpGet(url, callback) {
    this.adapter.log.debug(`httpGet: ${url}`);
    if (axiosGet) {
        try {
            axiosGet(url, {
                responseType: 'arraybuffer',
                timeout: 15000,
                validateStatus: (status) => status < 400,
            })
                .then((result) => callback(null, { status: result.status, statusText: result.statusText }, result.data))
                .catch((error) => callback(error));
        }
        catch (error) {
            callback(error);
        }
    }
    else {
        callback(new Error('axios is not initialized'));
    }
}, _SocketCommands_initCommands = function _SocketCommands_initCommands() {
    this._initCommandsCommon();
    this._initCommandsObjects();
    this._initCommandsStates();
    this._initCommandsFiles();
}, _SocketCommands_informAboutDisconnect = function _SocketCommands_informAboutDisconnect(socketId) {
    // say to all instances, that this socket was disconnected
    if (__classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[socketId]) {
        Object.keys(__classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[socketId]).forEach(targetInstance => {
            this.adapter.sendTo(targetInstance, 'clientUnsubscribe', {
                type: __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[socketId][targetInstance],
                sid: socketId,
                reason: 'disconnect',
            });
        });
        delete __classPrivateFieldGet(this, _SocketCommands_clientSubscribes, "f")[socketId];
    }
};
SocketCommands.ERROR_PERMISSION = 'permissionError';
SocketCommands.COMMANDS_PERMISSIONS = exports.COMMANDS_PERMISSIONS;
//# sourceMappingURL=socketCommands.js.map