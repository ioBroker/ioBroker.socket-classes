"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocketAdmin = void 0;
/**
 *      Class Socket
 *
 *      Copyright 2014-2025 bluefox <dogafox@gmail.com>,
 *      MIT License
 *
 */
const socketCommon_1 = require("./socketCommon");
const socketCommandsAdmin_1 = require("./socketCommandsAdmin");
const passport_1 = __importDefault(require("passport"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const passportSocket_1 = require("./passportSocket");
class SocketAdmin extends socketCommon_1.SocketCommon {
    adminCommands;
    constructor(settings, adapter, objects) {
        super(settings, adapter);
        // user another set of commands for admin
        this.commands = new socketCommandsAdmin_1.SocketCommandsAdmin(adapter, socket => this.__updateSession(socket), this.context, objects);
        this.adminCommands = this.commands;
    }
    __getIsNoDisconnect() {
        // ws does not require disconnect
        return true;
    }
    #onAuthorizeSuccess = (data, accept) => {
        this.adapter.log.debug(`successful connection to socket.io from ${(data.socket || data.connection).remoteAddress}`);
        // no error
        accept(false);
    };
    #onAuthorizeFail = (data, message, critical, accept) => {
        setTimeout(() => data.socket.emit(socketCommon_1.SocketCommon.COMMAND_RE_AUTHENTICATE), 100);
        if (critical) {
            this.adapter?.log.info(`failed connection to socket.io from ${(data.socket || data.connection).remoteAddress}: ${message}`);
        }
        // this error will be sent to the user as a special error-package
        // see: http://socket.io/docs/client-api/#socket > error-object
        if (critical) {
            // @ts-expect-error
            accept(new Error(message));
        }
        else {
            // @ts-expect-error
            accept(new Error(`failed connection to socket.io: ${message}`));
        }
    };
    __initAuthentication(authOptions) {
        this.store = authOptions.store;
        this.server?.use((0, passportSocket_1.authorize)({
            passport: passport_1.default,
            cookieParser: cookie_parser_1.default,
            secret: authOptions.secret, // the session_secret to parse the cookie
            store: authOptions.store, // we NEED to use a sessionstore. no memorystore, please
            success: this.#onAuthorizeSuccess, // *optional* callback on success - read more below
            fail: this.#onAuthorizeFail, // *optional* callback on fail/error - read more below
        }));
    }
    // Extract username from socket
    __getUserFromSocket(socket, callback) {
        if (socket.conn.request.sessionID) {
            socket._secure = true;
            socket._sessionID = socket.conn.request.sessionID;
            // Get user for session
            void this.adapter.getSession(socket.conn.request.sessionID, obj => {
                if (!obj?.passport) {
                    if (socket._acl) {
                        socket._acl.user = '';
                    }
                    socket.emit(socketCommon_1.SocketCommon.COMMAND_RE_AUTHENTICATE);
                    callback('Cannot detect user');
                }
                else {
                    callback(null, obj.passport.user ? `system.user.${obj.passport.user}` : '');
                }
            });
        }
        else {
            callback('Cannot detect user');
        }
    }
    __getClientAddress(socket) {
        let address;
        if (socket.connection) {
            address = socket.connection.remoteAddress;
        }
        else {
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
    __updateSession(socket) {
        if (socket._sessionID) {
            const time = Date.now();
            if (socket._lastActivity && time - socket._lastActivity > (this.settings.ttl || 3600) * 1000) {
                this.adapter.log.warn('REAUTHENTICATE!');
                socket.emit(socketCommon_1.SocketCommon.COMMAND_RE_AUTHENTICATE);
                return false;
            }
            socket._lastActivity = time;
            socket._sessionTimer ||= setTimeout(() => {
                socket._sessionTimer = undefined;
                void this.adapter.getSession(socket._sessionID, obj => {
                    if (obj) {
                        void this.adapter.setSession(socket._sessionID, this.settings.ttl || 3600, obj);
                    }
                    else {
                        this.adapter.log.warn('REAUTHENTICATE!');
                        socket.emit(socketCommon_1.SocketCommon.COMMAND_RE_AUTHENTICATE);
                    }
                });
            }, 60_000);
        }
        return true;
    }
    __getSessionID(socket) {
        return this.settings.auth ? socket.conn.request.sessionID : null;
    }
    start(server, socketClass, authOptions, socketOptions) {
        super.start(server, socketClass, authOptions, socketOptions);
        this.adminCommands.start(thresholdEnabled => this.onThresholdChanged(thresholdEnabled));
    }
    onThresholdChanged(enabled) {
        this.server && this.server.sockets && this.server.sockets.emit('eventsThreshold', enabled);
    }
    stateChange(id, state) {
        this.adminCommands.stateChange(id, state);
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publish(socket, 'stateChange', id, state));
            }
            else {
                Object.values(sockets).forEach(socket => this.commands.publish(socket, 'stateChange', id, state));
            }
        }
    }
    fileChange(id, fileName, size) {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publishFile(socket, id, fileName, size));
            }
            else {
                Object.values(sockets).forEach(socket => this.commands.publishFile(socket, id, fileName, size));
            }
        }
    }
    repoUpdated() {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.__updateSession(socket));
            }
            else {
                Object.values(sockets).forEach(socket => this.__updateSession(socket));
            }
            this.server?.sockets.emit('repoUpdated');
        }
    }
    objectChange(id, obj) {
        const sockets = this.getSocketsList();
        if (sockets) {
            if (Array.isArray(sockets)) {
                sockets.forEach(socket => this.commands.publish(socket, 'objectChange', id, obj));
            }
            else {
                Object.values(sockets).forEach(socket => this.commands.publish(socket, 'objectChange', id, obj));
            }
        }
    }
    subscribe(type, pattern) {
        this.commands.subscribe(null, type, pattern);
    }
    subscribeFile(id, patternFile) {
        this.commands.subscribe(null, 'fileChange', id, patternFile);
    }
    sendCommand(obj) {
        if (this.adminCommands.sendCommand(obj)) {
            const sockets = this.getSocketsList();
            if (sockets) {
                if (Array.isArray(sockets)) {
                    sockets.forEach(socket => this.__updateSession(socket));
                }
                else {
                    Object.values(sockets).forEach(socket => this.__updateSession(socket));
                }
                this.server?.sockets.emit(obj.command, obj.message.id, obj.message.data);
            }
        }
    }
    updateRatings(uuid, isAutoUpdate) {
        return this.adminCommands.updateRatings(uuid, isAutoUpdate);
    }
}
exports.SocketAdmin = SocketAdmin;
//# sourceMappingURL=socketAdmin.js.map