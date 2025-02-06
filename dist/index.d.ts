import passport from 'passport';
import cookieParser from 'cookie-parser';
export { SocketCommandsAdmin } from './lib/socketCommandsAdmin';
export { SocketCommands, type SupportedFeature } from './lib/socketCommands';
export { SocketCommon } from './lib/socketCommon';
import { authorize as passportSocket } from './lib/passportSocket';
export { passport, cookieParser, passportSocket };
