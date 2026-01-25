import passport from 'passport';
import cookieParser from 'cookie-parser';
export type { SocketSubscribeTypes, InternalStorageToken } from './types';
export { SocketCommandsAdmin } from './lib/socketCommandsAdmin';
export { SocketCommands, type SupportedFeature, COMMANDS_PERMISSIONS } from './lib/socketCommands';
export { SocketCommon, type Server, type SocketSettings, type SocketIoOptions, type WhiteListSettings, } from './lib/socketCommon';
export { SocketAdmin } from './lib/socketAdmin';
import { authorize as passportSocket, type PassportHttpRequest, type Store } from './lib/passportSocket';
export { passport, cookieParser, passportSocket, type PassportHttpRequest, type Store };
