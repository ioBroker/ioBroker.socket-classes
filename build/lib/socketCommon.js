"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketCommon = void 0;
const socketCommands_1 = require("./socketCommands");
// this class can manage 3 types of Socket.io
// - socket.io v2
// - socket.io v4
// - iobroker ws socket
class SocketCommon {
    static COMMAND_RE_AUTHENTICATE = 'reauthenticate';
    /**
     * How long a socket keeps working after its access token has expired. The browser renews the token
     * with a timer, and timers of a hidden tab fire late (Chrome wakes them up once a minute at most), so
     * the socket must not be cut off the very second the token expires.
     */
    static SESSION_GRACE_MS = 60_000;
    /** A socket with an expired token is asked to refresh it at most once in this interval */
    static REAUTHENTICATE_INTERVAL_MS = 5_000;
    /**
     * How long a socket whose session is over stays open after its first command or event was refused.
     * Everything it asks for is refused in that time, and it is still asked for a new token. Then it is
     * closed: a client that answers the pings but never brings a token - e.g. a page in an iframe with an
     * old client library - kept such a dead connection open for hours, and every event of the system
     * wrote a warning into the log (ioBroker.admin#3110). When it connects again, the browser sends the
     * access token cookie as it is now, which the admin page has renewed in the meantime.
     */
    static EXPIRED_SESSION_CLOSE_MS = 60_000;
    server = null;
    /** When each socket was last asked to refresh its expired token */
    #reauthenticateRequested = new WeakMap();
    /**
     * Sockets whose session is over: when that session expired, and since when the socket is refused.
     * A socket that gets a new token and lets it expire again is a new case.
     */
    #sessionOver = new WeakMap();
    /** Sockets that are being closed because their session is over */
    #closingExpired = new WeakSet();
    serverMode = false;
    settings;
    adapter;
    infoTimeout = null;
    store = null; // will be set in __initAuthentication
    commands = null;
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
        this.settings.defaultUser ||= 'system.user.admin';
        if (!this.settings.defaultUser.match(/^system\.user\./)) {
            this.settings.defaultUser = `system.user.${this.settings.defaultUser}`;
        }
        this.settings.ttl = parseInt(this.settings.ttl, 10) || 3600;
        this.context = {
            language: this.settings.language,
            ratings: null,
            ratingTimeout: null,
        };
    }
    __getIsNoDisconnect() {
        throw new Error('"__getIsNoDisconnect" must be implemented in SocketCommon!');
    }
    /**
     * Kick a client by closing its connection. Which method exists depends on the transport:
     * a socket.io socket exposes only `disconnect()`, the ws socket has `close()` and
     * `disconnect()` as an alias of it.
     */
    #disconnectSocket(socket) {
        const transportSocket = socket;
        if (typeof transportSocket.disconnect === 'function') {
            // for a real socket.io socket "true" closes the underlying connection
            // and not only the namespace; the ws socket ignores the argument
            transportSocket.disconnect(true);
        }
        else if (typeof transportSocket.close === 'function') {
            transportSocket.close();
        }
    }
    __initAuthentication(_authOptions) {
        throw new Error('"__initAuthentication" must be implemented in SocketCommon!');
    }
    /** Get user from pure WS socket (used in `iobroker.admin` and `iobroker.ws`) */
    __getUserFromSocket(socket, callback) {
        // Authentication by bearer token
        let accessToken;
        if (socket.conn.request.query?.token) {
            accessToken = socket.conn.request.query.token;
        }
        if (!accessToken && socket.conn.request.headers?.authorization?.startsWith('Bearer ')) {
            accessToken = socket.conn.request.headers.authorization.split(' ')[1];
        }
        if (!accessToken && socket.conn.request.headers?.cookie) {
            const cookies = socket.conn.request.headers.cookie.split(';');
            accessToken = cookies.find(cookie => cookie.trim().split('=')[0] === 'access_token');
            if (accessToken) {
                accessToken = accessToken.split('=')[1];
            }
        }
        if (accessToken) {
            socket._secure = !!this.settings.auth;
            void this.adapter.getSession(`a:${accessToken}`, (obj) => {
                if (!obj?.user) {
                    if (socket._acl) {
                        socket._acl.user = '';
                    }
                    // The caller tells the client, so that it is asked exactly once
                    callback('Cannot detect user');
                }
                else {
                    callback(null, obj.user ? `system.user.${obj.user}` : '', obj.aExp);
                }
            });
            return;
        }
        else if (socket.conn.request.sessionID) {
            socket._secure = !!this.settings.auth;
            socket._sessionID = socket.conn.request.sessionID;
            // Get user for session
            void this.adapter.getSession(socket.conn.request.sessionID, obj => {
                if (!obj?.passport) {
                    if (socket._acl) {
                        socket._acl.user = '';
                    }
                    // The caller tells the client, so that it is asked exactly once
                    callback('Cannot detect user');
                }
                else {
                    callback(null, obj.passport.user ? `system.user.${obj.passport.user}` : '', obj.cookie.expires ? new Date(obj.cookie.expires).getTime() : 0);
                }
            });
            return;
        }
        if (!this.settings.noBasicAuth) {
            let user;
            let pass;
            if (socket.conn.request.headers?.authorization?.startsWith('Basic ')) {
                const auth = Buffer.from(socket.conn.request.headers.authorization.split(' ')[1], 'base64').toString('utf8');
                const parts = auth.split(':');
                user = parts.shift();
                pass = parts.join(':');
            }
            else {
                user = socket.query.user;
                pass = socket.query.pass;
            }
            if (user && typeof user === 'string' && pass && typeof pass === 'string') {
                // Authentication by user/password
                void this.adapter.checkPassword(user, pass, async (res) => {
                    // Here no code of a second factor can be sent, so a user with one cannot log in this way
                    if (res && (await this.#hasSecondFactor(user))) {
                        this.adapter.log.warn(`The user "${user}" uses two-factor authentication and cannot log in with the password alone`);
                        callback('unknown user');
                        return;
                    }
                    if (res) {
                        this.adapter.log.debug(`Logged in: ${user}`);
                        if (typeof callback === 'function') {
                            callback(null, user, 0);
                        }
                        else {
                            this.adapter.log.warn('[_getUserFromSocket] Invalid callback');
                        }
                    }
                    else {
                        this.adapter.log.warn(`Invalid password or user name: ${user}, ${pass[0]}***(${pass.length})`);
                        if (typeof callback === 'function') {
                            callback('unknown user');
                        }
                        else {
                            this.adapter.log.warn('[_getUserFromSocket] Invalid callback');
                        }
                    }
                });
            }
            else {
                callback('Cannot detect user');
            }
        }
        else {
            callback('Cannot detect user');
        }
    }
    /**
     * Whether the user switched on the two-factor authentication of `@iobroker/webserver` (an authenticator app).
     * If the user object cannot be read, the answer is yes: better no login than a login without the second factor.
     *
     * @param user user name or ID
     */
    async #hasSecondFactor(user) {
        const id = `system.user.${user.replace(/^system\.user\./, '').toLowerCase()}`;
        try {
            const obj = await this.adapter.getForeignObjectAsync(id);
            const totp = obj?.common?.externalAuthentication?.totp;
            return !!totp?.secret;
        }
        catch (e) {
            this.adapter.log.warn(`Cannot read "${id}" to check the two-factor authentication: ${e}`);
            return true;
        }
    }
    /** Get the client address from the socket */
    __getClientAddress(socket) {
        let address;
        if (socket.connection) {
            address = socket.connection.remoteAddress;
        }
        else {
            // `_socket` is the net.Socket of `ws`, which its typings (if installed) do not declare
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
    __updateSession(socket) {
        const now = Date.now();
        if (socket._sessionExpiresAt) {
            // OAuth2: the socket knows when the access token it was authenticated with expires. A token is
            // never prolonged in place, so there is nothing to re-read from the store: the client fetches a
            // new token and announces it with `updateTokenExpiration`, which is the only thing that moves
            // `_sessionExpiresAt` forward.
            if (socket._sessionExpiresAt < now) {
                if (socket._sessionExpiresAt + _a.SESSION_GRACE_MS < now) {
                    // The client had the whole grace period to bring a new token and did not
                    this.#refuseExpiredSession(socket, socket._sessionExpiresAt, now);
                    return false;
                }
                // The token has just expired. Keep serving the socket for a while and ask the client to
                // refresh the token now, as its own timer is obviously late. A client that holds a refresh
                // token answers with `updateTokenExpiration` and nobody notices; a client without one is
                // sent to the login page by this event, as before.
                if (this.#askForNewToken(socket, now)) {
                    this.adapter.log.debug('Access token expired, asking the client to refresh it');
                }
            }
            return true;
        }
        // Legacy authentication method
        const sessionId = socket._sessionID;
        if (sessionId) {
            const ttlMs = (this.settings.ttl || 3600) * 1000;
            if (socket._lastActivity && now - socket._lastActivity > ttlMs) {
                // `_lastActivity` is not moved on any more, so the session stays over
                this.#refuseExpiredSession(socket, socket._lastActivity + ttlMs, now);
                return false;
            }
            socket._lastActivity = now;
            socket._sessionTimer ||= setTimeout(() => {
                socket._sessionTimer = undefined;
                void this.adapter.getSession(socket._sessionID, obj => {
                    if (obj) {
                        void this.adapter.setSession(socket._sessionID, this.settings.ttl || 3600, obj);
                    }
                    else {
                        this.adapter.log.warn('REAUTHENTICATE!');
                        socket.emit(_a.COMMAND_RE_AUTHENTICATE);
                    }
                });
            }, 60_000);
        }
        return true;
    }
    /**
     * Ask the client to bring a new access token, but not more often than every
     * {@link SocketCommon.REAUTHENTICATE_INTERVAL_MS}: the question is asked by every event the socket
     * gets, and a busy system has several of them per second.
     *
     * @param socket Socket instance
     * @param now The current time
     * @returns true if the client was asked now
     */
    #askForNewToken(socket, now) {
        const requested = this.#reauthenticateRequested.get(socket);
        if (requested && now - requested <= _a.REAUTHENTICATE_INTERVAL_MS) {
            return false;
        }
        this.#reauthenticateRequested.set(socket, now);
        socket.emit(_a.COMMAND_RE_AUTHENTICATE);
        return true;
    }
    /**
     * A command or event of a socket whose session is over is refused.
     *
     * This happens for every event of the system the client has subscribed to, so it must not leave a
     * trace each time: one warning per socket, and the client is asked for a new token at most every
     * {@link SocketCommon.REAUTHENTICATE_INTERVAL_MS}. Without a new token the socket is closed after
     * {@link SocketCommon.EXPIRED_SESSION_CLOSE_MS}.
     *
     * @param socket Socket instance
     * @param expiredAt When the session expired
     * @param now The current time
     */
    #refuseExpiredSession(socket, expiredAt, now) {
        if (this.#closingExpired.has(socket)) {
            // on its way out, nothing more to say
            return;
        }
        let over = this.#sessionOver.get(socket);
        if (over?.expiredAt !== expiredAt) {
            // The time to bring a new token counts from now on, not from the end of the grace period:
            // when nothing happened on the socket for a while, the client has not been asked yet
            over = { expiredAt, refusedSince: now };
            this.#sessionOver.set(socket, over);
            this.adapter.log.warn(`REAUTHENTICATE! The session of ${this.#describeSocket(socket)} expired ${_a.#since(expiredAt, now)} ago and the client did not renew it. Its requests are refused, and the connection will be closed in ${Math.round(_a.EXPIRED_SESSION_CLOSE_MS / 1000)} seconds if no new access token arrives`);
        }
        if (now - over.refusedSince >= _a.EXPIRED_SESSION_CLOSE_MS) {
            this.#closingExpired.add(socket);
            this.adapter.log.info(`Closing the connection of ${this.#describeSocket(socket)}: no new access token arrived`);
            // Not at once: this runs while an event is handed to all sockets, and closing a socket
            // removes it from the list that is being walked through
            setImmediate(() => this.#disconnectSocket(socket));
            return;
        }
        if (this.#askForNewToken(socket, now)) {
            this.adapter.log.debug(`Session of ${this.#describeSocket(socket)} is over, asking for a new access token`);
        }
    }
    /**
     * Who is behind a socket, for the log: user, address and the name the client gave itself.
     *
     * @param socket Socket instance
     */
    #describeSocket(socket) {
        let address;
        try {
            address = this.__getClientAddress(socket)?.address;
        }
        catch {
            // the transport does not tell
        }
        return `${socket._acl?.user || 'unknown user'}${address ? ` from ${address}` : ''}${socket._name ? ` (${socket._name})` : ''}`;
    }
    /**
     * How long ago something happened, for the log
     *
     * @param ts When it happened
     * @param now The current time
     */
    static #since(ts, now) {
        const seconds = Math.max(0, Math.round((now - ts) / 1000));
        if (seconds < 120) {
            return `${seconds} seconds`;
        }
        const minutes = Math.round(seconds / 60);
        if (minutes < 120) {
            return `${minutes} minutes`;
        }
        return `${Math.round(minutes / 60)} hours`;
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
            // Case if it is a server
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
        this.server?.on('error', (error, details) => {
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
                if (error?.message?.includes('authentication failed')) {
                    this.adapter.log.debug(`Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
                else {
                    this.adapter.log.error(`Error: ${error?.message || JSON.stringify(error)}${details ? ` - ${!details || typeof details === 'object' ? JSON.stringify(details) : details.toString()}` : ''}`);
                }
            }
        });
        this.#updateConnectedInfo();
    }
    /**
     * True while a socket waits for an access token: authentication is in use, but the token the socket
     * was opened with was not accepted, so it has no user yet.
     *
     * @param socket Socket instance
     */
    static isAuthenticationPending(socket) {
        return !!socket._secure && !socket._acl?.user;
    }
    /**
     * Give a socket the user of an access token that was announced with `updateTokenExpiration`.
     *
     * A socket whose token was not accepted at the connect stays open without a user. Instead of making
     * the client throw the connection away and open a new one with the refreshed token - which costs a
     * refresh token and several seconds - the announced token finishes the authentication here.
     *
     * @param socket Socket instance
     * @param user Name of the user the access token belongs to, without the `system.user.` prefix
     * @param expiresAt When the announced access token expires
     * @param callback Called with true if the socket now has a user
     */
    authenticateSocket(socket, user, expiresAt, callback) {
        const userId = user.startsWith('system.user.') ? user : `system.user.${user}`;
        const address = this.__getClientAddress(socket);
        void this.adapter.calculatePermissions(userId, socketCommands_1.SocketCommands.COMMANDS_PERMISSIONS, (acl) => {
            socket._secure = true;
            socket._acl = _a._mergeACLs(address.address, acl, this.settings.whiteListSettings);
            socket._sessionExpiresAt = expiresAt;
            this.adapter.log.debug(`Socket of ${userId} authenticated with the announced access token`);
            if (socket._authPending) {
                socket._authPending(!!socket._acl?.user, true);
                delete socket._authPending;
            }
            socket.emit('tokenInfo', { expiresAt });
            callback(true);
        });
    }
    _initSocket(socket, cb) {
        this.commands.disableEventThreshold();
        // The commands need a way back here: only this class knows how to calculate the ACL of a user
        this.commands.authenticateSocket ||= (socket, user, expiresAt, callback) => this.authenticateSocket(socket, user, expiresAt, callback);
        const address = this.__getClientAddress(socket);
        if (!socket._acl) {
            if (this.settings.auth) {
                this.__getUserFromSocket(socket, (err, user, expirationTime) => {
                    if (err || !user) {
                        socket.emit(_a.COMMAND_RE_AUTHENTICATE);
                        this.adapter.log.debug(`Socket from ${address.address} is not authenticated: ${err || 'no user found in cookies'}`);
                        if (!this.noDisconnect) {
                            this.#disconnectSocket(socket);
                            cb?.();
                            return;
                        }
                        // A websocket is not disconnected, it stays open and the client is asked to bring a
                        // new access token. For that it needs somebody to listen: without the handlers below
                        // the socket is open but deaf, `updateTokenExpiration` never arrives, and the client
                        // waits for an answer that cannot come until its own timeout closes the connection.
                        // The empty ACL makes every command that needs a permission fail, so the socket can
                        // do nothing but announce a token until `authenticateSocket` gives it a real user.
                        socket._secure = true;
                        socket._acl = { user: '', groups: [] };
                        this._socketEvents(socket, address.address, cb);
                    }
                    else {
                        socket._secure = true;
                        socket._sessionExpiresAt = expirationTime;
                        this.adapter.log.debug(`socket.io client ${user} connected`);
                        if (!user.startsWith('system.user.')) {
                            user = `system.user.${user}`;
                        }
                        void this.adapter.calculatePermissions(user, socketCommands_1.SocketCommands.COMMANDS_PERMISSIONS, (acl) => {
                            socket._acl = _a._mergeACLs(address.address, acl, this.settings.whiteListSettings);
                            this._socketEvents(socket, address.address, cb);
                            if (expirationTime) {
                                socket.emit('tokenInfo', { expiresAt: expirationTime });
                            }
                        });
                    }
                });
            }
            else {
                void this.adapter.calculatePermissions(this.settings.defaultUser || '', socketCommands_1.SocketCommands.COMMANDS_PERMISSIONS, (acl) => {
                    socket._acl = _a._mergeACLs(address.address, acl, this.settings.whiteListSettings);
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
        // "*" stands for any value of an octet, like "192.168.1.*"
        const wildCardIp = wildCardIps.find(ip => {
            const ipParts = ip.split('.');
            return ipParts.length === 4 && ipParts.every((part, i) => part === '*' || part === addressParts[i]);
        });
        return wildCardIp || null;
    }
    static _getPermissionsForIp(address, whiteList) {
        return whiteList[_a.getWhiteListIpForAddress(address, whiteList) || 'default'];
    }
    static _mergeACLs(address, acl, whiteList) {
        if (whiteList && address) {
            const whiteListAcl = _a._getPermissionsForIp(address, whiteList);
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
        if (this.serverMode && this.settings.auth) {
            let accessToken;
            if (socket.conn.request.headers?.cookie) {
                // If OAuth2 authentication is used
                accessToken = socket.conn.request.headers.cookie
                    .split(';')
                    .find(c => c.trim().startsWith('access_token='));
                if (accessToken) {
                    accessToken = accessToken.split('=')[1];
                }
                else if (socket.conn.request.headers.authorization?.startsWith('Bearer ')) {
                    accessToken = socket.conn.request.headers.authorization.split(' ')[1];
                }
                else if (socket.conn.request.query?.token) {
                    accessToken = socket.conn.request.query.token;
                }
                if (accessToken && !_a.isAuthenticationPending(socket)) {
                    // `_initSocket` has already looked the token up. Checking it a second time would only
                    // send a second `reauthenticate` and answer the waiting `authenticate` with "no", which
                    // would start the client before its new token arrived.
                    socket._secure = true;
                    this.store?.get(`a:${accessToken}`, (err, token) => {
                        const tokenData = token;
                        if (err || !tokenData?.user) {
                            if (socket._acl) {
                                socket._acl.user = '';
                            }
                            socket.emit(_a.COMMAND_RE_AUTHENTICATE);
                            // ws does not require disconnect
                            if (!this.noDisconnect) {
                                this.#disconnectSocket(socket);
                            }
                        }
                        if (socket._authPending) {
                            socket._authPending(!!socket._acl?.user, true);
                            delete socket._authPending;
                        }
                    });
                }
            }
            if (!accessToken) {
                // Legacy Session ID method
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
                            socket.emit(_a.COMMAND_RE_AUTHENTICATE);
                            // ws does not require disconnect
                            if (!this.noDisconnect) {
                                this.#disconnectSocket(socket);
                            }
                        }
                        if (socket._authPending) {
                            socket._authPending(!!socket._acl?.user, true);
                            delete socket._authPending;
                        }
                    });
                }
            }
        }
        this.commands.subscribeSocket(socket);
        if (typeof cb === 'function') {
            cb();
        }
    }
    #updateConnectedInfo() {
        // only in server mode
        if (this.serverMode && !this.settings.noInfoConnected) {
            if (this.infoTimeout) {
                clearTimeout(this.infoTimeout);
                this.infoTimeout = null;
            }
            this.infoTimeout = setTimeout(() => {
                this.infoTimeout = null;
                if (this.server) {
                    const clientsArray = [];
                    const sockets = this.getSocketsList();
                    // this could be an object or array: an array is ioBroker, an object is socket.io
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
        const sockets = this.getSocketsList();
        if (!sockets) {
            return;
        }
        // Only the sockets that called `requireLog(true)` have an entry in `subscribe.log`.
        // Without this check the log would be broadcast to every connected client, even to
        // those that are not allowed to subscribe to it.
        // this could be an object or array: an array is ioBroker, an object is socket.io
        for (const socket of Array.isArray(sockets) ? sockets : Object.values(sockets)) {
            // A client whose session is over gets no log either, the same as with states and objects
            if (socket.subscribe?.log?.length && this.__updateSession(socket)) {
                socket.emit('log', obj);
            }
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
_a = SocketCommon;
//# sourceMappingURL=socketCommon.js.map