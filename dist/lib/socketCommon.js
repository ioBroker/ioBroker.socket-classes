"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketCommon = void 0;
const socketCommands_1 = require("./socketCommands");
// this class can manage 3 types of Socket.io
// - socket.io v2
// - socket.io v4
// - iobroker ws socket
class SocketCommon {
    static COMMAND_RE_AUTHENTICATE = 'reauthenticate';
    server = null;
    serverMode = false;
    settings;
    adapter;
    infoTimeout = null;
    store = null; // will be set in __initAuthentication
    // @ts-expect-error commands actually cannot be null
    commands;
    noDisconnect;
    eventHandlers = {};
    wsRoutes = {};
    // Structure for socket.io 4
    allNamespaces;
    context;
    initialized = false;
    constructor(settings, adapter) {
        this.settings = settings || {};
        this.adapter = adapter;
        this.noDisconnect = this.__getIsNoDisconnect();
        this.settings.defaultUser = this.settings.defaultUser || 'system.user.admin';
        if (!this.settings.defaultUser.match(/^system\.user\./)) {
            this.settings.defaultUser = `system.user.${this.settings.defaultUser}`;
        }
        this.settings.ttl = parseInt(this.settings.ttl, 10) || 3600;
        this.context = {
            language: this.settings.language || 'en',
            ratings: null,
            ratingTimeout: null,
        };
    }
    __getIsNoDisconnect() {
        throw new Error('"__getIsNoDisconnect" must be implemented in SocketCommon!');
    }
    __initAuthentication(_authOptions) {
        throw new Error('"__initAuthentication" must be implemented in SocketCommon!');
    }
    // Extract username from socket
    __getUserFromSocket(_socket, _callback) {
        throw new Error('"__getUserFromSocket" must be implemented in SocketCommon!');
    }
    __getClientAddress(_socket) {
        throw new Error('"__getClientAddress" must be implemented in SocketCommon!');
    }
    // update session ID, but not ofter than 60 seconds
    __updateSession(_socket) {
        throw new Error('"__updateSession" must be implemented in SocketCommon!');
    }
    __getSessionID(_socket) {
        throw new Error('"__getSessionID" must be implemented in SocketCommon!');
    }
    /** Install handler on connecting and disconnecting events */
    addEventHandler(eventName, handler) {
        this.eventHandlers[eventName] = handler;
    }
    /**
     * Add a new route for the websocket
     *
     * @param path the path to listen for like "/cameras.0/*"
     * @param handler Web socket custom handler
     */
    addWsRoute(path, handler) {
        this.wsRoutes[path] = handler;
    }
    start(server, socketClass, authOptions, socketOptions) {
        this.serverMode = !!socketClass;
        this.commands ||= new socketCommands_1.SocketCommands(this.adapter, socket => this.__updateSession(socket), this.context);
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
                }
                else if (typeof socketClass.constructor === 'function') {
                    // iobroker socket
                    this.server = new socketClass(server);
                }
                else {
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
                this.adapter.log.info(`${this.settings.secure ? 'Secure ' : ''}socket.io server listening on port ${this.settings.port}`);
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
            this.allNamespaces?.on('connection', (socket, cb) => {
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
        this.server.on('error', (error, details) => {
            // ignore "failed connection" as it already shown
            if (!error?.message?.includes('failed connection')) {
                if (error?.message?.includes('authentication failed') ||
                    details?.toString().includes('authentication failed')) {
                    this.adapter.log.debug(`Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
                else {
                    this.adapter.log.error(`Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
            }
        });
        // support of dynamic namespaces (because of reverse proxy)
        this.allNamespaces?.on('error', (error, details) => {
            // ignore "failed connection" as it already shown
            if (!error?.message?.includes('failed connection')) {
                if (error && error.message && error.message.includes('authentication failed')) {
                    this.adapter.log.debug(`Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
                else {
                    this.adapter.log.error(`Error: ${(error && error.message) || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
            }
        });
        this.#updateConnectedInfo();
    }
    _initSocket(socket, cb) {
        this.commands.disableEventThreshold();
        const address = this.__getClientAddress(socket);
        if (!socket._acl) {
            if (this.settings.auth) {
                this.__getUserFromSocket(socket, (err, user) => {
                    if (err || !user) {
                        socket.emit(SocketCommon.COMMAND_RE_AUTHENTICATE);
                        this.adapter.log.error(`socket.io [init] ${err || 'No user found in cookies'}`);
                        // ws does not require disconnect
                        if (!this.noDisconnect) {
                            socket.close();
                        }
                    }
                    else {
                        socket._secure = true;
                        this.adapter.log.debug(`socket.io client ${user} connected`);
                        if (!user.startsWith('system.user.')) {
                            user = `system.user.${user}`;
                        }
                        void this.adapter.calculatePermissions(user, socketCommands_1.SocketCommands.COMMANDS_PERMISSIONS, (acl) => {
                            socket._acl = SocketCommon._mergeACLs(address.address, acl, this.settings.whiteListSettings);
                            this._socketEvents(socket, address.address, cb);
                        });
                    }
                });
            }
            else {
                void this.adapter.calculatePermissions(this.settings.defaultUser || '', socketCommands_1.SocketCommands.COMMANDS_PERMISSIONS, (acl) => {
                    socket._acl = SocketCommon._mergeACLs(address.address, acl, this.settings.whiteListSettings);
                    this._socketEvents(socket, address.address, cb);
                });
            }
        }
        else {
            this._socketEvents(socket, address.address, cb);
        }
    }
    unsubscribeSocket(socket, type) {
        return this.commands.unsubscribeSocket(socket, type);
    }
    _unsubscribeAll() {
        if (this.server?.ioBroker) {
            // this could be an object or array
            const sockets = this.getSocketsList();
            // this could be an object or array: an array is ioBroker, object is socket.io
            if (Array.isArray(sockets)) {
                for (const socket of sockets) {
                    this.commands.unsubscribeSocket(socket);
                }
            }
            else {
                Object.values(sockets).forEach(socket => {
                    this.commands.unsubscribeSocket(socket);
                });
            }
        }
        else if (this.server?.sockets) {
            // It is socket.io
            for (const socket in this.server.sockets) {
                if (Object.prototype.hasOwnProperty.call(this.server.sockets, socket)) {
                    // @ts-expect-error socket.io has own structure
                    this.commands.unsubscribeSocket(this.server.sockets[socket]);
                }
            }
        }
    }
    static getWhiteListIpForAddress(address, whiteList) {
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
    static _getPermissionsForIp(address, whiteList) {
        return whiteList[SocketCommon.getWhiteListIpForAddress(address, whiteList) || 'default'];
    }
    static _mergeACLs(address, acl, whiteList) {
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
    _socketEvents(socket, address, cb) {
        if (this.serverMode) {
            this.adapter.log.info(`==> Connected ${socket._acl?.user} from ${address}`);
        }
        else {
            this.adapter.log.info(`Trying to connect as ${socket._acl?.user} to ${address}`);
        }
        this.#updateConnectedInfo();
        if (!this.commands.getCommandHandler('name')) {
            // socket sends its name => update list of sockets
            this.addCommandHandler('name', (_socket, name, cb) => {
                this.adapter.log.debug(`Connection from "${name}"`);
                if (_socket._name === undefined) {
                    _socket._name = name;
                    this.#updateConnectedInfo();
                }
                else if (_socket._name !== name) {
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
        socket.on('disconnect', (error) => {
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
            }
            else {
                this.adapter.log.info(`<== Disconnect ${socket._acl?.user} from ${this.__getClientAddress(socket).address} ${socket._name || ''}`);
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
        this.commands.subscribeSocket(socket);
        if (cb) {
            cb();
        }
    }
    #updateConnectedInfo() {
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
                    // this could be an object or array: an array is ioBroker, object is socket.io
                    if (Array.isArray(sockets)) {
                        for (const socket of sockets) {
                            clientsArray.push(socket._name || 'noname');
                        }
                    }
                    else {
                        Object.values(sockets).forEach(socket => {
                            clientsArray.push(socket._name || 'noname');
                        });
                    }
                    const text = `[${clientsArray.length}]${clientsArray.join(', ')}`;
                    void this.adapter.setState('info.connected', text, true);
                }
            }, 1000);
        }
    }
    checkPermissions(socket, command, callback, ...args) {
        return this.commands._checkPermissions(socket, command, callback, args);
    }
    addCommandHandler(command, handler) {
        this.commands.addCommandHandler(command, handler);
    }
    sendLog(obj) {
        // TODO Build in some threshold
        this.server?.sockets?.emit('log', obj);
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
        if (this.server?.sockets) {
            // this could be an object or array
            return this.server.sockets.sockets || this.server.sockets.connected;
        }
        return null;
    }
    publishInstanceMessageAll(sourceInstance, messageType, sid, data) {
        const sockets = this.getSocketsList();
        if (sockets) {
            // this could be an object or array: an array is ioBroker, an object is socket.io
            if (Array.isArray(sockets)) {
                for (const socket of sockets) {
                    if (socket.id === sid) {
                        this.publishInstanceMessage(socket, sourceInstance, messageType, data);
                    }
                }
            }
            else {
                Object.values(sockets).forEach(socket => {
                    if (socket.id === sid) {
                        this.publishInstanceMessage(socket, sourceInstance, messageType, data);
                    }
                });
            }
        }
    }
    close() {
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
        }
        else if (sockets) {
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
        }
        catch {
            // ignore
        }
        if (this.infoTimeout) {
            clearTimeout(this.infoTimeout);
            this.infoTimeout = null;
        }
    }
}
exports.SocketCommon = SocketCommon;
//# sourceMappingURL=socketCommon.js.map