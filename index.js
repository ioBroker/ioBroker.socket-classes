const SocketAdmin = require('./lib/socketAdmin');
const SocketCommon = require('./lib/socketCommon');
const SocketCommands = require('./lib/socketCommands');
const SocketCommandsAdmin = require('./lib/socketCommandsAdmin');
const passportSocket = require('./lib/passportSocket');

module.exports = {
    SocketAdmin,
    SocketCommon,
    SocketCommands,
    SocketCommandsAdmin,
    passportSocket
};
