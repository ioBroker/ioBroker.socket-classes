# @iobroker/socket-classes

This library is used for following adapters:
- [iobroker.admin](https://github.com/ioBroker/ioBroker.admin)
- [iobroker.cloud](https://github.com/ioBroker/ioBroker.cloud)
- [iobroker.socketio](https://github.com/ioBroker/ioBroker.socketio)
- [iobroker.ws](https://github.com/ioBroker/ioBroker.ws)
- [iobroker.rest-api](https://github.com/ioBroker/ioBroker.rest-api)
- [iobroker.iot](https://github.com/ioBroker/ioBroker.iot)

## Usage as admin
```
const TTL_SEC      = 3600;

const SocketAdmin  = require('@iobroker/socket-classes').SocketAdmin;
const ws           = require('@iobroker/ws-server');
const session      = require('express-session');
const utils 	   = require('@iobroker/adapter-core'); // Get common adapter utils
const AdapterStore = require(utils.controllerDir + '/lib/session.js')(session, TTL_SEC);

const store = new AdapterStore({adapter});

const io = new SocketAdmin(adapter.config, adapter, objects);
io.start(
    server,
    ws,
    {
        userKey: 'connect.sid',
        store,
        secret: adapter.config.secret
    }
);

// subscribe on all object changes
io.subscribe('objectChange', '*');


// later
io.close();
```

## Usage as socket (ws or socketio)
```
const TTL_SEC      = 3600;

const ws           = require('@iobroker/ws-server');
const SocketWS     = require('@iobroker/socket-classes').SocketCommon;
const session      = require('express-session');
const utils 	   = require('@iobroker/adapter-core'); // Get common adapter utils
const AdapterStore = require(utils.controllerDir + '/lib/session.js')(session, TTL_SEC);

const store = new AdapterStore({adapter});

const settings = adapter.config;
settings.crossDomain = true;
settings.ttl = settings.ttl || TTL_SEC;

const io = new SocketWS(settings, adapter);
io.start(server.server, ws, {userKey: 'connect.sid', checkUser, store, secret: adapter.config.secret});


// later
io.close();
```

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### 0.5.3 (2022-08-24)
* (bluefox) Caught error by subscribe

### 0.5.2 (2022-08-19)
* (bluefox) Added command `getCompactSystemRepositories`

### 0.5.0 (2022-07-20)
* (bluefox) Buffer conversion errors caught and handled

### 0.4.12 (2022-07-08)
* (bluefox) Corrected getAdapterInstances method

### 0.4.11 (2022-07-05)
* (bluefox) Corrected log transportation

### 0.4.10 (2022-06-22)
* (bluefox) Corrected getAdapterInstances

### 0.4.9 (2022-06-20)
* (bluefox) Do not show error with failed authentication

### 0.4.7 (2022-06-20)
* (bluefox) Allowed to overload system language

### 0.4.6 (2022-06-20)
* (bluefox) updated `passport`

### 0.4.5 (2022-06-20)
* (bluefox) allow to run socket.io behind reverse proxy

### 0.4.4 (2022-06-09)
* (bluefox) Do not show requireLog message

### 0.4.3 (2022-06-03)
* (bluefox) Allowed call of getAdapterInstances for non admin

### 0.4.2 (2022-05-23)
* (bluefox) Corrected renameFile command for admin

### 0.4.1 (2022-05-23)
* (bluefox) Corrected changePassword command for admin

### 0.4.0 (2022-05-19)
* (bluefox) Added support of socket.io 4.x

### 0.3.2 (2022-05-19)
* (bluefox) Hide warn messages

### 0.3.1 (2022-05-16)
* (bluefox) Added back compatibility with js-controller@4.0  for `writeDirAsZip`

### 0.3.0 (2022-05-16)
* (bluefox) Process `writeDirAsZip` locally

### 0.2.1 (2022-05-12)
* (bluefox) fixed `getObjects` command

### 0.2.0 (2022-05-09)
* (bluefox) fixed `delObjects` command

### 0.1.10 (2022-05-09)
* (bluefox) Added support for fileChanges

### 0.1.9 (2022-05-07)
* (bluefox) Corrected readLogs command and implement file subscriptions

### 0.1.7 (2022-05-05)
* (bluefox) Caught some sentry errors

### 0.1.6 (2022-05-05)
* (bluefox) fixed `delObject` command

### 0.1.5 (2022-04-25)
* (bluefox) added updateRatings

### 0.1.4 (2022-04-24)
* (bluefox) added passportSocket

### 0.1.2 (2022-04-24)
* (bluefox) initial commit

## License
The MIT License (MIT)

Copyright (c) 2020-2022 Bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
