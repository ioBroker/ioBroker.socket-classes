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

## Web Methods
<!-- WEB_METHODS_START -->
### authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: function (isUserAuthenticated, isAuthenticationUsed)


### error(error)
Write error into ioBroker log
* error *(string)*: error text


### log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of ['silly', 'debug', 'info', 'warn', 'error']. Default is 'debug'.


### getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: function (error, result)


### httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: function (error, {status, statusText}, body)


### sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: function (result)


### sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: function (result)


### authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: function (isAuthenticationUsed, userName)


### logout(callback)
Logout user
* callback *(function)*: function (error)


### listPermissions(callback)
List commands and permissions
* callback *(function)*: function (permissions)


### getUserPermissions(callback)
Get user permissions
* callback *(function)*: function (error, permissions)


### getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: function (error, adapterVersion, adapterName)


### getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: function (error, adapterVersion)


### getObject(id, callback)



### getObjects(callback)



### subscribeObjects(pattern, callback)



### unsubscribeObjects(pattern, callback)



### getObjectView(design, search, params, callback)



### setObject(id, obj, callback)



### getStates(pattern, callback)



### delObject(id, options, callback)
only flot allowed


### getState(id, callback)



### setState(id, state, callback)



### getBinaryState(id, callback)



### setBinaryState(id, base64, callback)



### subscribe(pattern, callback)



### subscribeStates(pattern, callback)



### unsubscribe(pattern, callback)



### unsubscribeStates(pattern, callback)



### readFile(_adapter, fileName, callback)



### readFile64(_adapter, fileName, callback)



### writeFile64(_adapter, fileName, data64, options, callback)



### writeFile(_adapter, fileName, data, options, callback)



### unlink(_adapter, name, callback)



### deleteFile(_adapter, name, callback)



### deleteFolder(_adapter, name, callback)



### renameFile(_adapter, oldName, newName, callback)



### rename(_adapter, oldName, newName, callback)



### mkdir(_adapter, dirName, callback)



### readDir(_adapter, dirName, options, callback)



### chmodFile(_adapter, fileName, options, callback)



### chownFile(_adapter, fileName, options, callback)



### fileExists(_adapter, fileName, callback)



### subscribeFiles(id, pattern, callback)



### unsubscribeFiles(id, pattern, callback)



### getAdapterInstances(adapterName, callback)


<!-- WEB_METHODS_END -->

## Admin Methods
<!-- ADMIN_METHODS_START -->
### authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: function (isUserAuthenticated, isAuthenticationUsed)


### error(error)
Write error into ioBroker log
* error *(string)*: error text


### log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of ['silly', 'debug', 'info', 'warn', 'error']. Default is 'debug'.


### getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: function (error, result)


### httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: function (error, {status, statusText}, body)


### sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: function (result)


### sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: function (result)


### authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: function (isAuthenticationUsed, userName)


### logout(callback)
Logout user
* callback *(function)*: function (error)


### listPermissions(callback)
List commands and permissions
* callback *(function)*: function (permissions)


### getUserPermissions(callback)
Get user permissions
* callback *(function)*: function (error, permissions)


### getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: function (error, adapterVersion, adapterName)


### getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: function (error, adapterVersion)


### getHostByIp(ip, callback)



### requireLog(isEnabled, callback)



### readLogs(host, callback)



### delState(id, callback)



### cmdExec(host, id, cmd, callback)



### eventsThreshold(isActive)



### getRatings(update, callback)



### getCurrentInstance(callback)



### checkFeatureSupported(feature, callback)



### decrypt(encryptedText, callback)



### encrypt(plainText, callback)



### getIsEasyModeStrict(callback)



### getEasyMode(callback)



### getAdapters(adapterName, callback)



### updateLicenses(login, password, callback)



### getCompactInstances(callback)



### getCompactAdapters(callback)



### getCompactInstalled(host, callback)



### getCompactSystemConfig(callback)



### getCompactSystemRepositories(callback)



### getCompactRepository(host, callback)



### getCompactHosts(callback)



### addUser(user, pass, callback)



### delUser(user, callback)



### addGroup(group, desc, acl, callback)



### delGroup(group, callback)



### changePassword(user, pass, callback)



### getObject(id, callback)



### getObjects(callback)



### subscribeObjects(pattern, callback)



### unsubscribeObjects(pattern, callback)



### getObjectView(design, search, params, callback)



### setObject(id, obj, callback)



### getAllObjects(callback)



### extendObject(id, obj, callback)



### getForeignObjects(pattern, type, callback)



### delObject(id, options, callback)



### getStates(pattern, callback)



### getState(id, callback)



### setState(id, state, callback)



### getBinaryState(id, callback)



### setBinaryState(id, base64, callback)



### subscribe(pattern, callback)



### subscribeStates(pattern, callback)



### unsubscribe(pattern, callback)



### unsubscribeStates(pattern, callback)



### getForeignStates(pattern, callback)



### delObjects(id, options, callback)



### readFile(_adapter, fileName, callback)



### readFile64(_adapter, fileName, callback)



### writeFile64(_adapter, fileName, data64, options, callback)



### writeFile(_adapter, fileName, data64, options, callback)



### unlink(_adapter, name, callback)



### deleteFile(_adapter, name, callback)



### deleteFolder(_adapter, name, callback)



### renameFile(_adapter, oldName, newName, callback)



### rename(_adapter, oldName, newName, callback)



### mkdir(_adapter, dirName, callback)



### readDir(_adapter, dirName, options, callback)



### chmodFile(_adapter, fileName, options, callback)



### chownFile(_adapter, fileName, options, callback)



### fileExists(_adapter, fileName, callback)



### subscribeFiles(id, pattern, callback)



### unsubscribeFiles(id, pattern, callback)



### getAdapterInstances(adapterName, callback)


<!-- ADMIN_METHODS_END -->

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
