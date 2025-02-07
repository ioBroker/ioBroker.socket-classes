"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passportSocket = exports.cookieParser = exports.passport = exports.SocketAdmin = exports.SocketCommon = exports.SocketCommands = exports.SocketCommandsAdmin = void 0;
const passport_1 = __importDefault(require("passport"));
exports.passport = passport_1.default;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
exports.cookieParser = cookie_parser_1.default;
var socketCommandsAdmin_1 = require("./lib/socketCommandsAdmin");
Object.defineProperty(exports, "SocketCommandsAdmin", { enumerable: true, get: function () { return socketCommandsAdmin_1.SocketCommandsAdmin; } });
var socketCommands_1 = require("./lib/socketCommands");
Object.defineProperty(exports, "SocketCommands", { enumerable: true, get: function () { return socketCommands_1.SocketCommands; } });
var socketCommon_1 = require("./lib/socketCommon");
Object.defineProperty(exports, "SocketCommon", { enumerable: true, get: function () { return socketCommon_1.SocketCommon; } });
var socketAdmin_1 = require("./lib/socketAdmin");
Object.defineProperty(exports, "SocketAdmin", { enumerable: true, get: function () { return socketAdmin_1.SocketAdmin; } });
const passportSocket_1 = require("./lib/passportSocket");
Object.defineProperty(exports, "passportSocket", { enumerable: true, get: function () { return passportSocket_1.authorize; } });
//# sourceMappingURL=index.js.map