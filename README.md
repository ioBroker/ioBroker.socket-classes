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

const SocketAdmin  = require('./lib/socketAdmin');
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
const SocketWS     = require('./lib/socketWS.js');
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
