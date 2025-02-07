import passport from 'passport';
import cookieParser from 'cookie-parser';
export { SocketCommandsAdmin } from './lib/socketCommandsAdmin';
export { SocketCommands, type SupportedFeature } from './lib/socketCommands';
export { SocketCommon } from './lib/socketCommon';
export { SocketAdmin } from './lib/socketAdmin';
import { authorize as passportSocket, type PassportHttpRequest } from './lib/passportSocket';
export { passport, cookieParser, passportSocket, type PassportHttpRequest };
