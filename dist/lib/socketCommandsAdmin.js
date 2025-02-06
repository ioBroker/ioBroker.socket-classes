"use strict";
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _SocketCommandsAdmin_instances, _a, _SocketCommandsAdmin_readInstanceConfig, _SocketCommandsAdmin_readLicenses, _SocketCommandsAdmin_updateLicenses, _SocketCommandsAdmin_enableEventThreshold, _SocketCommandsAdmin_addUser, _SocketCommandsAdmin_delUser, _SocketCommandsAdmin_addGroup, _SocketCommandsAdmin_delGroup, _SocketCommandsAdmin_checkObject, _SocketCommandsAdmin_getAllObjects;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketCommandsAdmin = void 0;
const axios_1 = __importDefault(require("axios"));
const node_path_1 = require("node:path");
const node_fs_1 = require("node:fs");
const socketCommands_1 = require("./socketCommands");
const ACL_READ = 4;
// const ACL_WRITE = 2;
class SocketCommandsAdmin extends socketCommands_1.SocketCommands {
    constructor(adapter, updateSession, context, objects, states) {
        super(adapter, updateSession, context);
        _SocketCommandsAdmin_instances.add(this);
        this.thresholdInterval = null;
        this.cmdSessions = {};
        this.cache = {};
        this.cacheGB = null; // cache garbage collector
        this.onThresholdChanged = null;
        this.secret = '';
        this._sendToHost = (host, command, message, callback) => {
            const hash = `${host}_${command}`;
            if (!message && _a.ALLOW_CACHE.includes(command) && this.cache[hash]) {
                if (Date.now() - this.cache[hash].ts < 500) {
                    if (typeof callback === 'function') {
                        setImmediate(data => callback(data), JSON.parse(this.cache[hash].res));
                    }
                    return;
                }
                delete this.cache[hash];
            }
            try {
                this.adapter.sendToHost(host, command, message, res => {
                    if (!message && _a.ALLOW_CACHE.includes(command)) {
                        this.cache[hash] = { ts: Date.now(), res: JSON.stringify(res) };
                        this.cacheGB =
                            this.cacheGB ||
                                setInterval(() => {
                                    const commands = Object.keys(this.cache);
                                    commands.forEach(cmd => {
                                        if (Date.now() - this.cache[cmd].ts > 500) {
                                            delete this.cache[cmd];
                                        }
                                    });
                                    if (!commands.length && this.cacheGB) {
                                        clearInterval(this.cacheGB);
                                        this.cacheGB = null;
                                    }
                                }, 2000);
                    }
                    if (typeof callback === 'function') {
                        setImmediate(() => callback(res));
                    }
                });
            }
            catch (error) {
                this.adapter.log.error(`[sendToHost] ERROR: ${error.toString()}`);
                typeof callback === 'function' && setImmediate(() => callback({ error }));
            }
        };
        this.objects = objects;
        this.states = states;
        this.eventsThreshold = {
            count: 0,
            timeActivated: 0,
            active: false,
            accidents: 0,
            repeatSeconds: 3, // how many seconds continuously must be number of events > value
            value: parseInt(adapter.config.thresholdValue, 10) || 200, // how many events allowed in one check interval
            checkInterval: 1000, // duration of one check interval
        };
        // do not send too many state updates
    }
    start(onThresholdChanged) {
        // detect event bursts
        this.thresholdInterval = setInterval(() => {
            if (!this.eventsThreshold.active) {
                if (this.eventsThreshold.count > this.eventsThreshold.value) {
                    this.eventsThreshold.accidents++;
                    if (this.eventsThreshold.accidents >= this.eventsThreshold.repeatSeconds) {
                        __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_enableEventThreshold).call(this);
                    }
                }
                else {
                    this.eventsThreshold.accidents = 0;
                }
                this.eventsThreshold.count = 0;
            }
            else if (Date.now() - this.eventsThreshold.timeActivated > 60000) {
                this.disableEventThreshold();
            }
        }, this.eventsThreshold.checkInterval);
        this.onThresholdChanged = onThresholdChanged;
    }
    async updateRatings(uuid) {
        let _uuid;
        if (!uuid) {
            const obj = await this.adapter.getForeignObjectAsync('system.meta.uuid');
            _uuid = obj?.native?.uuid || '';
        }
        else {
            _uuid = uuid;
        }
        try {
            const response = await axios_1.default.get(`https://rating.iobroker.net/rating?uuid=${uuid}`, {
                timeout: 15000,
                validateStatus: status => status < 400,
            });
            this.context.ratings = response.data;
            if (!this.context.ratings ||
                typeof this.context.ratings !== 'object' ||
                Array.isArray(this.context.ratings)) {
                // @ts-expect-error exception
                this.context.ratings = { uuid: _uuid };
            }
            else {
                this.context.ratings.uuid = _uuid;
            }
            // auto update only in admin
            if (this.adapter.name === 'admin') {
                this.context.ratingTimeout && clearTimeout(this.context.ratingTimeout);
                this.context.ratingTimeout = setTimeout(() => {
                    this.context.ratingTimeout = null;
                    void this.updateRatings(uuid).then(() => this.adapter.log.info('Adapter rating updated'));
                }, 24 * 3600000);
            }
            return this.context.ratings;
        }
        catch (error) {
            this.adapter.log.warn(`Cannot update rating: ${error.response ? error.response.data : error.message || error.code}`);
            return null;
        }
    }
    disableEventThreshold() {
        if (this.eventsThreshold.active) {
            this.eventsThreshold.accidents = 0;
            this.eventsThreshold.count = 0;
            this.eventsThreshold.active = false;
            this.eventsThreshold.timeActivated = 0;
            this.adapter.log.info('Subscribe to all states again');
            setTimeout(async () => {
                this.onThresholdChanged && this.onThresholdChanged(false);
                try {
                    await this.adapter.unsubscribeForeignStatesAsync('system.adapter.*');
                }
                catch (e) {
                    this.adapter.log.error(`Cannot unsubscribe "system.adapter.*": ${e.message}`);
                }
                for (const pattern of Object.keys(this.subscribes.stateChange)) {
                    try {
                        await this.adapter.subscribeForeignStatesAsync(pattern);
                    }
                    catch (e) {
                        this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`);
                    }
                }
            }, 50);
        }
    }
    _initCommandsUser() {
        /**
         * #DOCUMENTATION users
         * Add a new user.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param pass - User password
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.addUser = (socket, user, pass, callback) => {
            if (this._checkPermissions(socket, 'addUser', callback, user)) {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_addUser).call(this, user, pass, { user: socket._acl?.user || '' }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
            }
        };
        /**
         * #DOCUMENTATION users
         * Delete an existing user. Admin cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delUser = (socket, user, callback) => {
            if (this._checkPermissions(socket, 'delUser', callback, user)) {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_delUser).call(this, user, { user: socket._acl?.user || '' }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
            }
        };
        /**
         * #DOCUMENTATION users
         * Add a new group.
         *
         * @param socket - WebSocket client instance
         * @param group - Group name, e.g., `users`
         * @param desc - Optional description
         * @param acl - Optional access control list object, e.g., `{"object":{"list":true,"read":true,"write":false,"delete":false},"state":{"list":true,"read":true,"write":true,"create":true,"delete":false},"users":{"list":true,"read":true,"write":false,"create":false,"delete":false},"other":{"execute":false,"http":true,"sendto":false},"file":{"list":true,"read":true,"write":false,"create":false,"delete":false}}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.addGroup = (socket, group, desc, acl, callback) => {
            if (this._checkPermissions(socket, 'addGroup', callback, group)) {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_addGroup).call(this, group, desc, acl, { user: socket._acl?.user || '' }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
            }
        };
        /**
         * #DOCUMENTATION users
         * Delete an existing group. Administrator group cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param group - Group name, e.g., `users`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delGroup = (socket, group, callback) => {
            if (this._checkPermissions(socket, 'delGroup', callback, group)) {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_delGroup).call(this, group, { user: socket._acl?.user || '' }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
            }
        };
        /**
         * #DOCUMENTATION users
         * Change user password.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param pass - New password
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.changePassword = (socket, user, pass, callback) => {
            if (user === socket._acl?.user || this._checkPermissions(socket, 'changePassword', callback, user)) {
                try {
                    void this.adapter.setPassword(user, pass, { user: socket._acl?.user }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[_changePassword] ERROR: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
    }
    _initCommandsAdmin() {
        /**
         * #DOCUMENTATION admin
         * Read the host object by IP address.
         *
         * @param socket - WebSocket client instance
         * @param ip - IP address, e.g., `192.168.1.1`. IPv4 or IPv6
         * @param callback - Callback function `(ip: string, obj: ioBroker.HostObject | null) => void`
         */
        this.commands.getHostByIp = (socket, ip, callback) => {
            if (typeof callback !== 'function') {
                return this.adapter.log.warn('[getHostByIp] Invalid callback');
            }
            if (this._checkPermissions(socket, 'getHostByIp', callback, ip)) {
                try {
                    this.adapter.getObjectView('system', 'host', {}, { user: socket._acl?.user }, (error, data) => {
                        if (data?.rows?.length) {
                            for (let i = 0; i < data.rows.length; i++) {
                                const obj = data.rows[i].value;
                                // if we requested specific name
                                if (obj.common.hostname === ip) {
                                    return callback(ip, obj);
                                }
                                if (obj.native.hardware?.networkInterfaces) {
                                    // try to find this IP in the list
                                    const net = obj.native.hardware.networkInterfaces;
                                    for (const eth in net) {
                                        if (!Object.prototype.hasOwnProperty.call(net, eth) || !net[eth]) {
                                            continue;
                                        }
                                        for (let j = 0; j < net[eth].length; j++) {
                                            if (net[eth][j].address === ip) {
                                                return callback(ip, obj);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        callback(ip, null);
                    });
                }
                catch (error) {
                    this.adapter.log.error(`[_changePassword] ERROR: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Activate or deactivate logging events. Events will be sent to the socket as `log` event. Adapter must have `common.logTransporter = true`.
         *
         * @param socket - WebSocket client instance
         * @param isEnabled - Is logging enabled
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.requireLog = (socket, isEnabled, callback) => {
            if (this._checkPermissions(socket, 'setObject', callback)) {
                if (isEnabled) {
                    this.subscribe(socket, 'log', 'dummy');
                }
                else {
                    this.unsubscribe(socket, 'log', 'dummy');
                }
                this.adapter.log.level === 'debug' && this._showSubscribes(socket, 'log');
                typeof callback === 'function' && setImmediate(callback, null);
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get the log files from the given host.
         *
         * @param socket - WebSocket client instance
         * @param host - Host ID, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, list?: { fileName: string; size: number }[]) => void`
         */
        this.commands.readLogs = (socket, host, callback) => {
            if (this._checkPermissions(socket, 'readLogs', callback)) {
                let timeout = setTimeout(() => {
                    if (timeout) {
                        let result = { list: [] };
                        // deliver the file list
                        try {
                            const config = this.adapter.systemConfig;
                            // detect file log
                            if (config?.log?.transport) {
                                for (const transport in config.log.transport) {
                                    if (Object.prototype.hasOwnProperty.call(config.log.transport, transport) &&
                                        config.log.transport[transport].type === 'file') {
                                        let fileName = config.log.transport[transport].filename || 'log/';
                                        const parts = fileName.replace(/\\/g, '/').split('/');
                                        parts.pop();
                                        fileName = parts.join('/');
                                        if (fileName[0] !== '/' && !fileName.match(/^\W:/)) {
                                            const _filename = (0, node_path_1.normalize)(`${__dirname}/../../../`) + fileName;
                                            if (!(0, node_fs_1.existsSync)(_filename)) {
                                                fileName = (0, node_path_1.normalize)(`${__dirname}/../../`) + fileName;
                                            }
                                            else {
                                                fileName = _filename;
                                            }
                                        }
                                        if ((0, node_fs_1.existsSync)(fileName)) {
                                            const files = (0, node_fs_1.readdirSync)(fileName);
                                            for (let f = 0; f < files.length; f++) {
                                                try {
                                                    if (!files[f].endsWith('-audit.json')) {
                                                        const stat = (0, node_fs_1.lstatSync)(`${fileName}/${files[f]}`);
                                                        if (!stat.isDirectory()) {
                                                            result.list?.push({
                                                                fileName: `log/${transport}/${files[f]}`,
                                                                size: stat.size,
                                                            });
                                                        }
                                                    }
                                                }
                                                catch {
                                                    // push unchecked
                                                    // result.list.push('log/' + transport + '/' + files[f]);
                                                    this.adapter.log.error(`Cannot check file: ${fileName}/${files[f]}`);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            else {
                                result = { error: 'no file loggers' };
                            }
                        }
                        catch (error) {
                            this.adapter.log.error(`Cannot read logs: ${error}`);
                            result = { error };
                        }
                        socketCommands_1.SocketCommands._fixCallback(callback, result.error, result.list);
                    }
                }, 500);
                this._sendToHost(host, 'getLogFiles', null, (result) => {
                    if (timeout) {
                        clearTimeout(timeout);
                        timeout = null;
                    }
                    socketCommands_1.SocketCommands._fixCallback(callback, result.error, result.list);
                });
            }
        };
        /**
         * #DOCUMENTATION states
         * Delete a state. The corresponding object will be deleted too.
         *
         * @param socket - WebSocket client instance
         * @param id - State ID
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delState = (socket, id, callback) => {
            if (this._checkPermissions(socket, 'delState', callback, id)) {
                // clear cache
                if (this.states && this.states[id]) {
                    delete this.states[id];
                }
                try {
                    this.adapter.delForeignState(id, { user: socket._acl?.user }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[delState] ERROR: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Execute the shell command on host/controller.
         * Following response commands are expected: `cmdStdout`, `cmdStderr`, `cmdExit`.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param id - Session ID, e.g., `Date.now()`. This session ID will come in events `cmdStdout`, `cmdStderr`, `cmdExit`
         * @param cmd - Command to execute
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.cmdExec = (socket, host, id, cmd, callback) => {
            if (id === undefined) {
                this.adapter.log.error(`cmdExec no session ID for "${cmd}"`);
                socketCommands_1.SocketCommands._fixCallback(callback, 'no session ID');
            }
            else if (this._checkPermissions(socket, 'cmdExec', callback, cmd)) {
                this.adapter.log.debug(`cmdExec on ${host}(${id}): ${cmd}`);
                // remember socket for this ID.
                this.cmdSessions[id] = { socket };
                try {
                    this.adapter.sendToHost(host, 'cmdExec', { data: cmd, id });
                    socketCommands_1.SocketCommands._fixCallback(callback, null);
                }
                catch (error) {
                    this.adapter.log.error(`[cmdExec] ERROR: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Enable or disable the event threshold. Used only for admin to limit the number of events to the front-end.
         *
         * @param _socket - WebSocket client instance
         * @param isActive - If true, then events will be limited
         */
        this.commands.eventsThreshold = (_socket, isActive) => {
            if (!isActive) {
                this.disableEventThreshold();
            }
            else {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_enableEventThreshold).call(this);
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get the ratings of adapters.
         *
         * @param _socket - WebSocket client instance
         * @param update - If true, the ratings will be read from the central server, if false from the local cache
         * @param callback - Callback function `(error: string | null, ratings?: Ratings) => void`
         */
        this.commands.getRatings = (_socket, update, callback) => {
            if (typeof update === 'function') {
                callback = update;
                update = false;
            }
            if (update || !this.context.ratings) {
                void this.updateRatings().then(() => socketCommands_1.SocketCommands._fixCallback(callback, null, this.context.ratings));
            }
            else {
                socketCommands_1.SocketCommands._fixCallback(callback, null, this.context.ratings);
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get the current instance name, like "admin.0"
         *
         * @param _socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, namespace?: string) => void`
         */
        this.commands.getCurrentInstance = (_socket, callback) => {
            socketCommands_1.SocketCommands._fixCallback(callback, null, this.adapter.namespace);
        };
        /**
         * #DOCUMENTATION admin
         * Decrypts text with the system secret key.
         *
         * @param socket - WebSocket client instance
         * @param encryptedText - Encrypted text
         * @param callback - Callback function `(error: string | null, decryptedText?: string) => void`
         */
        this.commands.decrypt = (socket, encryptedText, callback) => {
            if (this.secret) {
                socketCommands_1.SocketCommands._fixCallback(callback, null, this.adapter.decrypt(this.secret, encryptedText));
            }
            else {
                try {
                    void this.adapter.getForeignObject('system.config', { user: socket._acl?.user }, (error, obj) => {
                        if (obj && obj.native && obj.native.secret) {
                            this.secret = obj.native.secret;
                            socketCommands_1.SocketCommands._fixCallback(callback, null, this.adapter.decrypt(this.secret, encryptedText));
                        }
                        else {
                            this.adapter.log.error(`No system.config found: ${error}`);
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                    });
                }
                catch (error) {
                    this.adapter.log.error(`Cannot decrypt: ${error}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Encrypts text with the system secret key.
         *
         * @param socket - WebSocket client instance
         * @param plainText - Plain text to encrypt
         * @param callback - Callback function `(error: string | null, encryptedText?: string) => void`
         */
        this.commands.encrypt = (socket, plainText, callback) => {
            if (this.secret) {
                socketCommands_1.SocketCommands._fixCallback(callback, null, this.adapter.encrypt(this.secret, plainText));
            }
            else {
                void this.adapter.getForeignObject('system.config', { user: socket._acl?.user }, (error, obj) => {
                    if (obj && obj.native && obj.native.secret) {
                        this.secret = obj.native.secret;
                        try {
                            const encrypted = this.adapter.encrypt(this.secret, plainText);
                            socketCommands_1.SocketCommands._fixCallback(callback, null, encrypted);
                        }
                        catch (error) {
                            this.adapter.log.error(`Cannot encrypt: ${error}`);
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                    }
                    else {
                        this.adapter.log.error(`No system.config found: ${error}`);
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                });
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get if the admin has easy mode enabled.
         *
         * @param _socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, isEasyModeStrict?: boolean) => void`
         */
        this.commands.getIsEasyModeStrict = (_socket, callback) => {
            socketCommands_1.SocketCommands._fixCallback(callback, null, this.adapter.config.accessLimit);
        };
        /**
         * #DOCUMENTATION admin
         * Get easy mode configuration.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, easyModeConfig?: { strict: boolean; configs: InstanceConfig[] }) => void`
         */
        this.commands.getEasyMode = (socket, callback) => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                let user;
                if (this.adapter.config.auth) {
                    user = socket._acl?.user || '';
                }
                else {
                    user = this.adapter.config.defaultUser || socket._acl?.user || '';
                }
                if (!user.startsWith('system.user.')) {
                    user = `system.user.${user}`;
                }
                if (this.adapter.config.accessLimit) {
                    const configs = [];
                    const promises = [];
                    this.adapter.config.accessAllowedConfigs?.forEach(id => promises.push(__classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_readInstanceConfig).call(this, id, user, false, configs)));
                    this.adapter.config.accessAllowedTabs?.forEach(id => promises.push(__classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_readInstanceConfig).call(this, id, user, true, configs)));
                    void Promise.all(promises).then(() => {
                        socketCommands_1.SocketCommands._fixCallback(callback, null, {
                            strict: true,
                            configs,
                        });
                    });
                }
                else {
                    this.adapter.getObjectView('system', 'instance', { startkey: 'system.adapter.', endkey: 'system.adapter.\u9999' }, { user }, (error, doc) => {
                        const configs = [];
                        const promises = [];
                        if (!error && doc?.rows?.length) {
                            for (let i = 0; i < doc.rows.length; i++) {
                                const obj = doc.rows[i].value;
                                if (obj.common.noConfig && !obj.common.adminTab) {
                                    continue;
                                }
                                if (!obj.common.enabled) {
                                    continue;
                                }
                                if (!obj.common.noConfig) {
                                    promises.push(__classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_readInstanceConfig).call(this, obj._id.substring('system.adapter.'.length), user, false, configs));
                                }
                            }
                        }
                        void Promise.all(promises).then(() => socketCommands_1.SocketCommands._fixCallback(callback, null, {
                            strict: false,
                            configs,
                        }));
                    });
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get all adapter as objects.
         *
         * @param socket - WebSocket client instance
         * @param adapterName - Optional adapter name
         * @param callback - Callback function `(error: string | null, results?: ioBroker.Object[]) => void`
         */
        this.commands.getAdapters = (socket, adapterName, callback) => {
            if (typeof callback === 'function' && this._checkPermissions(socket, 'getObject', callback)) {
                this.adapter.getObjectView('system', 'adapter', {
                    startkey: `system.adapter.${adapterName || ''}`,
                    endkey: `system.adapter.${adapterName || '\u9999'}`,
                }, { user: socket._acl?.user }, (error, doc) => {
                    if (error) {
                        callback(error);
                    }
                    else {
                        callback(null, doc?.rows
                            .filter(obj => obj && (!adapterName || obj.value.common?.name === this.adapterName))
                            .map(item => {
                            const obj = item.value;
                            if (obj.common) {
                                delete obj.common.news;
                                // @ts-expect-error to save the memory
                                delete obj.native;
                            }
                            this.fixAdminUI(obj);
                            return obj;
                        }));
                    }
                });
            }
        };
        /**
         * #DOCUMENTATION admin
         * Read software licenses (vis, knx, ...) from ioBroker.net cloud for given user
         *
         * @param socket - WebSocket client instance
         * @param login - Cloud login
         * @param password - Cloud password
         * @param callback - Callback function `(error: string | null, results?: License[]) => void`
         */
        this.commands.updateLicenses = (socket, login, password, callback) => {
            if (this._checkPermissions(socket, 'setObject', callback, login, password)) {
                if (this.adapter.supportsFeature('CONTROLLER_LICENSE_MANAGER')) {
                    let timeout = setTimeout(() => {
                        if (timeout) {
                            timeout = null;
                            socketCommands_1.SocketCommands._fixCallback(callback, 'updateLicenses timeout');
                        }
                    }, 7000);
                    if (!this.adapter.common) {
                        throw new Error('"common" is not defined in adapter!');
                    }
                    this._sendToHost(this.adapter.common.host, 'updateLicenses', { login, password }, result => {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                            socketCommands_1.SocketCommands._fixCallback(callback, result.error, result?.result);
                        }
                    });
                }
                else {
                    // remove this branch when js-controller 4.x is mainstream
                    __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_updateLicenses).call(this, login, password, { user: socket._acl?.user || '' })
                        .then(licenses => socketCommands_1.SocketCommands._fixCallback(callback, null, licenses))
                        .catch(error => socketCommands_1.SocketCommands._fixCallback(callback, error));
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get all instances in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { adminTab: boolean; name: string; icon: string; enabled: boolean }>) => void`
         */
        this.commands.getCompactInstances = (socket, callback) => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    this.adapter.getObjectView('system', 'instance', { startkey: `system.adapter.`, endkey: `system.adapter.\u9999` }, { user: socket._acl?.user }, (error, doc) => {
                        if (error) {
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                        else {
                            // calculate
                            const result = {};
                            doc?.rows.forEach(item => {
                                const obj = item.value;
                                result[item.id] = {
                                    adminTab: obj.common.adminTab,
                                    name: obj.common.name,
                                    icon: obj.common.icon,
                                    enabled: obj.common.enabled,
                                    version: obj.common.version,
                                };
                            });
                            socketCommands_1.SocketCommands._fixCallback(callback, null, result);
                        }
                    });
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get all adapters in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { icon: string; v: string; iv: string }>) => void`
         */
        this.commands.getCompactAdapters = (socket, callback) => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    this.adapter.getObjectView('system', 'adapter', { startkey: `system.adapter.`, endkey: `system.adapter.\u9999` }, { user: socket._acl?.user }, (error, doc) => {
                        if (error) {
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                        else {
                            // calculate
                            const result = {};
                            doc?.rows.forEach(item => {
                                const obj = item.value;
                                if (obj?.common?.name) {
                                    result[obj.common.name] = { icon: obj.common.icon, v: obj.common.version };
                                    if (obj.common.ignoreVersion) {
                                        result[obj.common.name].iv = obj.common.ignoreVersion;
                                    }
                                }
                            });
                            socketCommands_1.SocketCommands._fixCallback(callback, null, result);
                        }
                    });
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get all installed adapters in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, results?: Record<string, { version: string }>) => void`
         */
        this.commands.getCompactInstalled = (socket, host, callback) => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'sendToHost', callback)) {
                    this._sendToHost(host, 'getInstalled', null, (data) => {
                        const castData = data;
                        const result = {};
                        Object.keys(castData).forEach(name => {
                            if (name !== 'hosts') {
                                result[name] = { version: castData[name].version };
                            }
                        });
                        callback(result);
                    });
                }
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get the system configuration in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, systemConfig?: { common: any; native?: { secret: string } }) => void`
         */
        this.commands.getCompactSystemConfig = (socket, callback) => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                void this.adapter.getForeignObject('system.config', { user: socket._acl?.user }, (error, obj) => {
                    obj || (obj = {});
                    const secret = obj?.native?.secret;
                    // @ts-expect-error to save the memory
                    delete obj.native;
                    if (secret) {
                        obj.native = { secret };
                    }
                    socketCommands_1.SocketCommands._fixCallback(callback, error, obj);
                });
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get system repositories in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, systemRepositories?: { common: any; native?: { repositories: Record<string, { json: { _repoInfo: any } } } } }) => void`
         */
        this.commands.getCompactSystemRepositories = (socket, callback) => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                void this.adapter.getForeignObject('system.repositories', { user: socket._acl?.user }, (error, obj) => {
                    obj &&
                        obj.native &&
                        obj.native.repositories &&
                        Object.keys(obj.native.repositories).forEach(name => {
                            if (obj.native.repositories[name].json) {
                                // limit information to _repoInfo
                                obj.native.repositories[name].json = {
                                    _repoInfo: obj.native.repositories[name].json._repoInfo,
                                };
                            }
                        });
                    socketCommands_1.SocketCommands._fixCallback(callback, error, obj);
                });
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get the repository in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, results?: Record<string, { version: string; icon?: string }>) => void`
         */
        this.commands.getCompactRepository = (socket, host, callback) => {
            if (this._checkPermissions(socket, 'sendToHost', callback)) {
                this._sendToHost(host, 'getRepository', null, (data) => {
                    // Extract only the version and icon
                    const castData = data;
                    const result = {};
                    if (castData) {
                        Object.keys(castData).forEach(name => (result[name] = {
                            version: castData[name].version,
                            icon: castData[name].extIcon,
                        }));
                    }
                    callback(result);
                });
            }
        };
        /**
         * #DOCUMENTATION admin
         * Get all hosts in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { common: { name: string; icon: string; color: string; installedVersion: string }; native: { hardware: { networkInterfaces: any[] } } }>) => void`
         */
        this.commands.getCompactHosts = (socket, callback) => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                this.adapter.getObjectView('system', 'host', { startkey: 'system.host.', endkey: 'system.host.\u9999' }, { user: socket._acl?.user }, (error, doc) => {
                    if (error) {
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                    else {
                        const result = [];
                        doc?.rows.map(item => {
                            const host = item.value;
                            if (host) {
                                host.common || (host.common = host.common);
                                result.push({
                                    _id: host._id,
                                    common: {
                                        name: host.common.name,
                                        icon: host.common.icon,
                                        color: host.common.color,
                                        installedVersion: host.common.installedVersion,
                                    },
                                    native: {
                                        hardware: {
                                            networkInterfaces: host.native?.hardware?.networkInterfaces || undefined,
                                        },
                                    },
                                });
                            }
                        });
                        socketCommands_1.SocketCommands._fixCallback(callback, null, result);
                    }
                });
            }
        };
    }
    _initCommandsCommon() {
        super._initCommandsCommon();
        this._initCommandsAdmin();
        this._initCommandsUser();
    }
    _initCommandsFiles() {
        super._initCommandsFiles();
        /**
         * #DOCUMENTATION files
         * Write the file into ioBroker DB as base64 string.
         *
         * @param socket - WebSocket client instance
         * @param adapter - Instance name, e.g., `vis.0`
         * @param fileName - File name, e.g., `main/vis-views.json`
         * @param data64 - File content as base64 string
         * @param options - Optional settings, e.g., `{mode: 0x0644}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.writeFile = (socket, adapter, fileName, data64, options, callback) => {
            if (this._checkPermissions(socket, 'writeFile', callback, fileName)) {
                let _options;
                if (typeof options === 'function') {
                    callback = options;
                    _options = { user: socket._acl?.user };
                }
                else if (!options || options.mode === undefined) {
                    _options = { user: socket._acl?.user };
                }
                else {
                    _options = { user: socket._acl?.user, mode: options.mode };
                }
                try {
                    const buffer = Buffer.from(data64, 'base64');
                    this.adapter.writeFile(adapter, fileName, buffer, _options, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[writeFile] Cannot convert data: ${error.toString()}`);
                    if (callback) {
                        callback(`Cannot convert data: ${error.toString()}`);
                    }
                }
            }
        };
    }
    _initCommandsObjects() {
        super._initCommandsObjects();
        /**
         * #DOCUMENTATION objects
         * Read absolutely all objects.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getAllObjects = (socket, callback) => {
            return __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_getAllObjects).call(this, socket, callback);
        };
        /**
         * #DOCUMENTATION objects
         * Read absolutely all objects. Same as `getAllObjects`.
         *
         * @param socket - WebSocket client instance
         * @param list - optional list of IDs.
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getObjects = (socket, list, callback) => {
            if (typeof list === 'function') {
                callback = list;
                list = null;
            }
            if (typeof callback !== 'function') {
                this.adapter.log.warn('[getObjects] Invalid callback');
            }
            else if (list && !list.length) {
                socketCommands_1.SocketCommands._fixCallback(callback, null, {});
            }
            else if (list?.length) {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    try {
                        this.adapter.getForeignObjects(list, { user: socket._acl?.user }, (error, objs) => socketCommands_1.SocketCommands._fixCallback(callback, error, objs));
                    }
                    catch (error) {
                        this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                }
            }
            else {
                __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_getAllObjects).call(this, socket, callback);
            }
        };
        /**
         * #DOCUMENTATION objects
         * Extend the existing object.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID
         * @param obj - New parts of the object, e.g., `{common: {name: 'new name'}}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.extendObject = (socket, id, obj, callback) => {
            if (this._checkPermissions(socket, 'extendObject', callback, id)) {
                try {
                    this.adapter.extendForeignObject(id, obj, { user: socket._acl?.user }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION objects
         * Read objects by pattern.
         *
         * @param socket - WebSocket client instance
         * @param pattern - Pattern like `system.adapter.admin.0.*`
         * @param type - Type of objects to delete, like `state`, `channel`, `device`, `host`, `adapter`. Default - `state`
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getForeignObjects = (socket, pattern, type, callback) => {
            // Read objects by pattern
            // @param {string} pattern - pattern like `system.adapter.admin.0.*`
            // @param {string} type - type of objects to delete, like `state`, `channel`, `device`, `host`, `adapter`. Default - `state`
            // @param {function} callback - `function (error, objects)`, where `objects` is an object like `{'system.adapter.admin.0': {...}, 'system.adapter.web.0': {...}}`
            if (this._checkPermissions(socket, 'getObjects', callback)) {
                if (typeof type === 'function') {
                    callback = type;
                    type = undefined;
                }
                if (typeof callback === 'function') {
                    if (type) {
                        try {
                            this.adapter.getForeignObjects(pattern, type, { user: socket._acl?.user }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                        }
                        catch (error) {
                            this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                    }
                    else {
                        try {
                            this.adapter.getForeignObjects(pattern, { user: socket._acl?.user }, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                        }
                        catch (error) {
                            this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                            socketCommands_1.SocketCommands._fixCallback(callback, error);
                        }
                    }
                }
                else {
                    this.adapter.log.warn('[getObjects] Invalid callback');
                }
            }
        };
        /**
         * #DOCUMENTATION objects
         * Delete an object or objects recursively.
         * Objects with `dontDelete` cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID, like 'adapterName.0.channel'
         * @param options - Options for deletion.
         * @param options.recursive - Delete all sub objects in this branch
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delObject = (socket, id, options, callback) => {
            if (this._checkPermissions(socket, 'delObject', callback, id)) {
                let _options;
                if (typeof options === 'function') {
                    callback = options;
                    _options = { user: socket._acl?.user };
                }
                else if (options?.recursive) {
                    _options = { user: socket._acl?.user, recursive: true };
                }
                else {
                    _options = { user: socket._acl?.user };
                }
                try {
                    // options.recursive = true; // the only difference between delObject and delObjects is this line
                    this.adapter.delForeignObject(id, _options, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[delObject] ERROR: ${error}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
        /**
         * #DOCUMENTATION objects
         * Delete an object or objects recursively.
         * Objects with `dontDelete` cannot be deleted.
         * Same as `delObject` but with `recursive: true`.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID, like 'adapterName.0.channel'
         * @param options - Options for deletion.
         * @param options.recursive - Delete all sub objects in this branch
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delObjects = (socket, id, options, callback) => {
            if (this._checkPermissions(socket, 'delObject', callback, id)) {
                let _options;
                if (typeof options === 'function') {
                    callback = options;
                    _options = { user: socket._acl?.user, recursive: true };
                }
                else if (options?.recursive) {
                    _options = { user: socket._acl?.user, recursive: true };
                }
                else {
                    _options = { user: socket._acl?.user, recursive: true };
                }
                try {
                    this.adapter.delForeignObject(id, _options, (error, ...args) => socketCommands_1.SocketCommands._fixCallback(callback, error, ...args));
                }
                catch (error) {
                    this.adapter.log.error(`[delObjects] ERROR: ${error}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        };
    }
    stateChange(id, state) {
        if (this.states) {
            if (!state) {
                if (this.states[id]) {
                    delete this.states[id];
                }
            }
            else {
                this.states[id] = state;
            }
        }
        if (!this.eventsThreshold.active) {
            this.eventsThreshold.count++;
        }
    }
    sendCommand(obj) {
        if (obj.message && this.cmdSessions[obj.message.id]) {
            if (obj.command === 'cmdExit') {
                delete this.cmdSessions[obj.message.id];
            }
            return true;
        }
    }
    destroy() {
        this.thresholdInterval && clearInterval(this.thresholdInterval);
        this.thresholdInterval = null;
        this.cacheGB && clearInterval(this.cacheGB);
        this.cacheGB = null;
        super.destroy();
    }
}
exports.SocketCommandsAdmin = SocketCommandsAdmin;
_a = SocketCommandsAdmin, _SocketCommandsAdmin_instances = new WeakSet(), _SocketCommandsAdmin_readInstanceConfig = async function _SocketCommandsAdmin_readInstanceConfig(id, user, isTab, configs) {
    let obj;
    try {
        obj = await this.adapter.getForeignObjectAsync(`system.adapter.${id}`, {
            user,
        });
    }
    catch {
        // ignore
    }
    if (obj?.common) {
        const instance = id.split('.').pop();
        const config = {
            id,
            title: obj.common.titleLang || obj.common.title,
            desc: obj.common.desc,
            color: obj.common.color,
            url: '',
            icon: obj.common.icon,
            materialize: obj.common.materialize,
            // @ts-expect-error it is deprecated
            jsonConfig: obj.common.jsonConfig,
            version: obj.common.version,
        };
        if (obj.common.adminUI?.config === 'materialize') {
            config.materialize = true;
        }
        else if (obj.common.adminUI?.config === 'json') {
            config.jsonConfig = true;
        }
        config.url = `/adapter/${obj.common.name}/${isTab ? 'tab' : 'index'}${!isTab && config.materialize ? '_m' : ''}.html${instance ? `?${instance}` : ''}`;
        if (isTab) {
            config.tab = true;
        }
        else {
            config.config = true;
        }
        configs.push(config);
    }
}, _SocketCommandsAdmin_readLicenses = 
// remove this function when js.controller 4.x are mainstream
async function _SocketCommandsAdmin_readLicenses(login, password) {
    const config = {
        headers: { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
        timeout: 4000,
        validateStatus: (status) => status < 400,
    };
    try {
        const response = await axios_1.default.get(`https://iobroker.net:3001/api/v1/licenses`, config);
        if (response?.data?.length) {
            const now = Date.now();
            response.data = response.data.filter((license) => !license.validTill ||
                license.validTill === '0000-00-00 00:00:00' ||
                new Date(license.validTill).getTime() > now);
        }
        return response.data;
    }
    catch (error) {
        if (error.response) {
            throw new Error((error.response.data && error.response.data.error) || error.response.data || error.response.status);
        }
        if (error.request) {
            throw new Error('no response');
        }
        throw error;
    }
}, _SocketCommandsAdmin_updateLicenses = 
// remove this function when js.controller 4.x is mainstream
async function _SocketCommandsAdmin_updateLicenses(login, password, options) {
    // if login and password provided in the message, just try to read without saving it in system.licenses
    if (login && password) {
        return __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_readLicenses).call(this, login, password);
    }
    // get actual object
    const systemLicenses = await this.adapter.getForeignObjectAsync('system.licenses', options);
    // If password and login exist
    if (systemLicenses?.native?.password && systemLicenses.native.login) {
        // get the secret to decode the password
        if (!this.secret) {
            const systemConfig = await this.adapter.getForeignObjectAsync('system.config', options);
            if (systemConfig?.native?.secret) {
                this.secret = systemConfig.native.secret;
            }
        }
        // decode the password
        let password = '';
        try {
            password = this.adapter.decrypt(this.secret, systemLicenses.native.password);
        }
        catch {
            throw new Error('Cannot decode password');
        }
        try {
            const licenses = await __classPrivateFieldGet(this, _SocketCommandsAdmin_instances, "m", _SocketCommandsAdmin_readLicenses).call(this, systemLicenses.native.login, password);
            // save licenses to system.licenses and remember the time
            // merge the information together
            const oldLicenses = systemLicenses.native.licenses || [];
            systemLicenses.native.licenses = licenses;
            oldLicenses.forEach(oldLicense => {
                if (oldLicense.usedBy) {
                    const newLicense = licenses.find(item => item.json === oldLicense.json);
                    if (newLicense) {
                        newLicense.usedBy = oldLicense.usedBy;
                    }
                }
            });
            systemLicenses.native.readTime = new Date().toISOString();
            // save only if an object changed
            await this.adapter.setForeignObjectAsync('system.licenses', systemLicenses, options);
            return licenses;
        }
        catch (error) {
            // if password is invalid
            if (error.message.includes('Authentication required') ||
                error.message.includes('Cannot decode password')) {
                // clear existing licenses if exist
                if (systemLicenses?.native?.licenses?.length) {
                    systemLicenses.native.licenses = [];
                    systemLicenses.native.readTime = new Date().toISOString();
                    return this.adapter
                        .setForeignObjectAsync('system.licenses', systemLicenses, options)
                        .then(() => {
                        throw error;
                    });
                }
                throw error;
            }
            else {
                throw error;
            }
        }
    }
    else {
        // if password or login are empty => clear existing licenses if exist
        if (systemLicenses?.native?.licenses?.length) {
            systemLicenses.native.licenses = [];
            systemLicenses.native.readTime = new Date().toISOString();
            return this.adapter.setForeignObjectAsync('system.licenses', systemLicenses, options).then(() => {
                throw new Error('No password or login');
            });
        }
        throw new Error('No password or login');
    }
}, _SocketCommandsAdmin_enableEventThreshold = function _SocketCommandsAdmin_enableEventThreshold() {
    if (!this.eventsThreshold.active) {
        this.eventsThreshold.active = true;
        setTimeout(async () => {
            this.adapter.log.info(`Unsubscribe from all states, except system's, because over ${this.eventsThreshold.repeatSeconds} seconds the number of events is over ${this.eventsThreshold.value} (in last second ${this.eventsThreshold.count})`);
            this.eventsThreshold.timeActivated = Date.now();
            this.onThresholdChanged && this.onThresholdChanged(true);
            for (const pattern of Object.keys(this.subscribes.stateChange)) {
                try {
                    await this.adapter.unsubscribeForeignStatesAsync(pattern);
                }
                catch (e) {
                    this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`);
                }
            }
            try {
                await this.adapter.subscribeForeignStatesAsync('system.adapter.*');
            }
            catch (e) {
                this.adapter.log.error(`Cannot subscribe "system.adapter.*": ${e.message}`);
            }
        }, 100);
    }
}, _SocketCommandsAdmin_addUser = function _SocketCommandsAdmin_addUser(user, password, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = null;
    }
    if (!user.match(/^[-.A-Za-züäößÖÄÜа-яА-Я@+$§0-9=?!&# ]+$/)) {
        return socketCommands_1.SocketCommands._fixCallback(callback, 'Invalid characters in the name. Only following special characters are allowed: -@+$§=?!&# and letters');
    }
    try {
        void this.adapter
            .getForeignObjectAsync(`system.user.${user}`, options)
            .then(async (obj) => {
            if (obj) {
                socketCommands_1.SocketCommands._fixCallback(callback, 'User yet exists');
            }
            else {
                try {
                    await this.adapter.setForeignObject(`system.user.${user}`, {
                        type: 'user',
                        common: {
                            name: user,
                            enabled: true,
                            password: '',
                        },
                        native: {},
                    }, options);
                    try {
                        await this.adapter.setPassword(user, password, options || {}, callback);
                    }
                    catch (error) {
                        this.adapter.log.error(`[#addUser] cannot set password: ${error.toString()}`);
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                }
                catch (error) {
                    this.adapter.log.error(`[#addUser] cannot save user: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        });
    }
    catch (error) {
        this.adapter.log.error(`[#addUser] cannot read user: ${error.toString()}`);
        socketCommands_1.SocketCommands._fixCallback(callback, error);
    }
}, _SocketCommandsAdmin_delUser = function _SocketCommandsAdmin_delUser(user, options, callback) {
    try {
        void this.adapter.getForeignObject(`system.user.${user}`, options, (error, obj) => {
            if (error || !obj) {
                socketCommands_1.SocketCommands._fixCallback(callback, 'User does not exist');
            }
            else {
                if (obj.common.dontDelete) {
                    socketCommands_1.SocketCommands._fixCallback(callback, 'Cannot delete user, while is system user');
                }
                else {
                    try {
                        this.adapter.delForeignObject(`system.user.${user}`, options || {}, error => 
                        // Remove this user from all groups in the web client
                        socketCommands_1.SocketCommands._fixCallback(callback, error));
                    }
                    catch (error) {
                        this.adapter.log.error(`[#delUser] cannot delete user: ${error.toString()}`);
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                }
            }
        });
    }
    catch (error) {
        this.adapter.log.error(`[#delUser] cannot read user: ${error.toString()}`);
        socketCommands_1.SocketCommands._fixCallback(callback, error);
    }
}, _SocketCommandsAdmin_addGroup = function _SocketCommandsAdmin_addGroup(group, desc, acl, options, callback) {
    let name = group;
    if (name && name.substring(0, 1) !== name.substring(0, 1).toUpperCase()) {
        name = name.substring(0, 1).toUpperCase() + name.substring(1);
    }
    group = group.substring(0, 1).toLowerCase() + group.substring(1);
    if (!group.match(/^[-.A-Za-züäößÖÄÜа-яА-Я@+$§0-9=?!&#_ ]+$/)) {
        return socketCommands_1.SocketCommands._fixCallback(callback, 'Invalid characters in the group name. Only following special characters are allowed: -@+$§=?!&# and letters');
    }
    try {
        void this.adapter.getForeignObject(`system.group.${group}`, options, (_error, obj) => {
            if (obj) {
                socketCommands_1.SocketCommands._fixCallback(callback, 'Group yet exists');
            }
            else {
                obj = {
                    _id: `system.group.${group}`,
                    type: 'group',
                    common: {
                        name,
                        desc: desc || undefined,
                        members: [],
                        acl: acl || {
                            object: {
                                list: false,
                                read: false,
                                write: false,
                                create: false,
                                delete: false,
                            },
                            state: {
                                list: false,
                                read: false,
                                write: false,
                                create: false,
                                delete: false,
                            },
                            users: {
                                list: false,
                                read: false,
                                write: false,
                                create: false,
                                delete: false,
                            },
                            other: {
                                execute: false,
                                http: false,
                                sendto: false,
                            },
                            file: {
                                list: false,
                                read: false,
                                write: false,
                                create: false,
                                delete: false,
                            },
                        },
                    },
                    native: {},
                };
                try {
                    void this.adapter.setForeignObject(`system.group.${group}`, obj, options, error => socketCommands_1.SocketCommands._fixCallback(callback, error, obj));
                }
                catch (error) {
                    this.adapter.log.error(`[#addGroup] cannot write group: ${error.toString()}`);
                    socketCommands_1.SocketCommands._fixCallback(callback, error);
                }
            }
        });
    }
    catch (error) {
        this.adapter.log.error(`[#addGroup] cannot read group: ${error.toString()}`);
        socketCommands_1.SocketCommands._fixCallback(callback, error);
    }
}, _SocketCommandsAdmin_delGroup = function _SocketCommandsAdmin_delGroup(group, options, callback) {
    try {
        void this.adapter.getForeignObject(`system.group.${group}`, options, (error, obj) => {
            if (error || !obj) {
                socketCommands_1.SocketCommands._fixCallback(callback, 'Group does not exist');
            }
            else {
                if (obj.common.dontDelete) {
                    socketCommands_1.SocketCommands._fixCallback(callback, 'Cannot delete group, while is system group');
                }
                else {
                    try {
                        this.adapter.delForeignObject(`system.group.${group}`, options, error => 
                        // Remove this group from all users in the web client
                        socketCommands_1.SocketCommands._fixCallback(callback, error));
                    }
                    catch (error) {
                        this.adapter.log.error(`[#delGroup] cannot delete group: ${error.toString()}`);
                        socketCommands_1.SocketCommands._fixCallback(callback, error);
                    }
                }
            }
        });
    }
    catch (error) {
        this.adapter.log.error(`[#delGroup] cannot read group: ${error.toString()}`);
        socketCommands_1.SocketCommands._fixCallback(callback, error);
    }
}, _SocketCommandsAdmin_checkObject = function _SocketCommandsAdmin_checkObject(obj, options, flag) {
    // read the rights of the object
    if (!obj?.common || !obj.acl || flag === 'list') {
        return true;
    }
    if (options.user !== 'system.user.admin' && !options.groups.includes('system.group.administrator')) {
        if (obj.acl.owner !== options.user) {
            // Check if the user is in the group
            if (options.groups.includes(obj.acl.ownerGroup)) {
                // Check group rights
                if (!(obj.acl.object & (flag << 4))) {
                    return false;
                }
            }
            else {
                // everybody
                if (!(obj.acl.object & flag)) {
                    return false;
                }
            }
        }
        else {
            // Check group rights
            if (!(obj.acl.object & (flag << 8))) {
                return false;
            }
        }
    }
    return true;
}, _SocketCommandsAdmin_getAllObjects = function _SocketCommandsAdmin_getAllObjects(socket, callback) {
    if (typeof callback !== 'function') {
        return this.adapter.log.warn('[#getAllObjects] Invalid callback');
    }
    if (this._checkPermissions(socket, 'getObjects', callback)) {
        if (this.objects) {
            if (socket._acl &&
                socket._acl?.user !== 'system.user.admin' &&
                !socket._acl.groups.includes('system.group.administrator')) {
                const result = {};
                for (const id in this.objects) {
                    if (Object.prototype.hasOwnProperty.call(this.objects, id) &&
                        __classPrivateFieldGet(_a, _a, "m", _SocketCommandsAdmin_checkObject).call(_a, this.objects[id], socket._acl, ACL_READ /* 'read' */)) {
                        result[id] = this.objects[id];
                    }
                }
                callback(null, result);
            }
            else {
                callback(null, this.objects);
            }
        }
        else {
            try {
                this.adapter.getObjectList({ include_docs: true }, { user: socket._acl?.user }, (_error, res) => {
                    this.adapter.log.info('received all objects');
                    const rows = res?.rows || [];
                    const objects = {};
                    if (socket._acl &&
                        socket._acl?.user !== 'system.user.admin' &&
                        !socket._acl.groups.includes('system.group.administrator')) {
                        for (let i = 0; i < rows.length; i++) {
                            if (__classPrivateFieldGet(_a, _a, "m", _SocketCommandsAdmin_checkObject).call(_a, rows[i].doc, socket._acl, ACL_READ)) {
                                objects[rows[i].doc._id] = rows[i].doc;
                            }
                        }
                        callback(null, objects);
                    }
                    else {
                        for (let j = 0; j < rows.length; j++) {
                            objects[rows[j].doc._id] = rows[j].doc;
                        }
                        callback(null, objects);
                    }
                });
            }
            catch (error) {
                this.adapter.log.error(`[#getAllObjects] ERROR: ${error.toString()}`);
                socketCommands_1.SocketCommands._fixCallback(callback, error);
            }
        }
    }
};
SocketCommandsAdmin.ALLOW_CACHE = [
    'getRepository',
    'getInstalled',
    'getInstalledAdapter',
    'getVersion',
    'getDiagData',
    'getLocationOnDisk',
    'getDevList',
    'getLogs',
    'getHostInfo',
];
//# sourceMappingURL=socketCommandsAdmin.js.map