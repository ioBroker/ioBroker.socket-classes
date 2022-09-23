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
### List of commands

* [authenticate](#authenticate-user-pass-callback)

* [error](#error-error)

* [log](#log-text-level)

* [getHistory](#gethistory-id-options-callback)

* [httpGet](#httpget-url-callback)

* [sendTo](#sendto-adapterinstance-command-message-callback)

* [sendToHost](#sendtohost-host-command-message-callback)

* [authEnabled](#authenabled-callback)

* [logout](#logout-callback)

* [listPermissions](#listpermissions-callback)

* [getUserPermissions](#getuserpermissions-callback)

* [getVersion](#getversion-callback)

* [getAdapterName](#getadaptername-callback)

* [getObject](#getobject-id-callback)

* [getObjects](#getobjects-callback)

* [subscribeObjects](#subscribeobjects-pattern-callback)

* [unsubscribeObjects](#unsubscribeobjects-pattern-callback)

* [getObjectView](#getobjectview-design-search-params-callback)

* [setObject](#setobject-id-obj-callback)

* [getStates](#getstates-pattern-callback)

* [delObject](#delobject-id-options-callback)

* [getState](#getstate-id-callback)

* [setState](#setstate-id-state-callback)

* [getBinaryState](#getbinarystate-id-callback)

* [setBinaryState](#setbinarystate-id-base64-callback)

* [subscribe](#subscribe-pattern-callback)

* [subscribeStates](#subscribestates-pattern-callback)

* [unsubscribe](#unsubscribe-pattern-callback)

* [unsubscribeStates](#unsubscribestates-pattern-callback)

* [readFile](#readfile-_adapter-filename-callback)

* [readFile64](#readfile64-_adapter-filename-callback)

* [writeFile64](#writefile64-_adapter-filename-data64-options-callback)

* [writeFile](#writefile-_adapter-filename-data-options-callback)

* [unlink](#unlink-_adapter-name-callback)

* [deleteFile](#deletefile-_adapter-name-callback)

* [deleteFolder](#deletefolder-_adapter-name-callback)

* [renameFile](#renamefile-_adapter-oldname-newname-callback)

* [rename](#rename-_adapter-oldname-newname-callback)

* [mkdir](#mkdir-_adapter-dirname-callback)

* [readDir](#readdir-_adapter-dirname-options-callback)

* [chmodFile](#chmodfile-_adapter-filename-options-callback)

* [chownFile](#chownfile-_adapter-filename-options-callback)

* [fileExists](#fileexists-_adapter-filename-callback)

* [subscribeFiles](#subscribefiles-id-pattern-callback)

* [unsubscribeFiles](#unsubscribefiles-id-pattern-callback)

* [getAdapterInstances](#getadapterinstances-adaptername-callback)

### authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: `function (isUserAuthenticated, isAuthenticationUsed)`


### error(error)
Write error into ioBroker log
* error *(string)*: error text


### log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.


### getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: `function (error, result)`


### httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: `function (error, {status, statusText}, body)`


### sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: `function (result)`


### sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: `function (result)`


### authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: `function (isAuthenticationUsed, userName)`


### logout(callback)
Logout user
* callback *(function)*: function (error)


### listPermissions(callback)
List commands and permissions
* callback *(function)*: `function (permissions)`


### getUserPermissions(callback)
Get user permissions
* callback *(function)*: `function (error, permissions)`


### getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion, adapterName)`


### getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion)`


### getObject(id, callback)



### getObjects(callback)



### subscribeObjects(pattern, callback)



### unsubscribeObjects(pattern, callback)



### getObjectView(design, search, params, callback)



### setObject(id, obj, callback)



### getStates(pattern, callback)
Read states by pattern
* pattern *(string)*: optional pattern, like `system.adapter.*` or array of state IDs
* callback *(function)*: `function (error, states)`, where `states` is an object like `{'system.adapter.history.0': {_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}, 'system.adapter.history.1': {...}}}`


### delObject(id, options, callback)
Delete object. Only deletion of flot objects is allowed
* id *(string)*: Object ID like, 'flot.0.myChart'
* options *(string)*: ignored
* callback *(function)*: `function (error)`


### getState(id, callback)
Read one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`


### setState(id, state, callback)
Write one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* state *(any)*: value or object like `{val: 123, ack: true}`
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`


### getBinaryState(id, callback)
Read one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* callback *(function)*: `function (error, base64)`


### setBinaryState(id, base64, callback)
Write one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* base64 *(string)*: State value as base64 string. Binary states has no acknowledge flag.
* callback *(function)*: `function (error)`


### subscribe(pattern, callback)
Subscribe on state changes by pattern. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### subscribeStates(pattern, callback)
Subscribe on state changes by pattern. Same as `subscribe`. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### unsubscribe(pattern, callback)
Unsubscribe from state changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### unsubscribeStates(pattern, callback)
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### readFile(_adapter, fileName, callback)
Read file from ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, data, mimeType)`


### readFile64(_adapter, fileName, callback)
Read file from ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, base64, mimeType)`


### writeFile64(_adapter, fileName, data64, options, callback)
Write file into ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional {mode: '0644'}
* callback *(function)*: `function (error, base64, mimeType)`


### writeFile(_adapter, fileName, data, options, callback)
Write file into ioBroker DB as text **DEPRECATED**
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional `{mode: 0x644}`
* callback *(function)*: `function (error, base64, mimeType)`


### unlink(_adapter, name, callback)
Delete file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`


### deleteFile(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for files)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`


### deleteFolder(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for folders)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: folder name, e.g `main`
* callback *(function)*: `function (error)`


### renameFile(_adapter, oldName, newName, callback)
Rename file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`


### rename(_adapter, oldName, newName, callback)
Rename file or folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`


### mkdir(_adapter, dirName, callback)
Create folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: desired folder name, e.g `main`
* callback *(function)*: `function (error)`


### readDir(_adapter, dirName, options, callback)
Read content of folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: folder name, e.g `main`
* options *(object)*: optional `{filter: '*'}` or `{filter: '*.json'}`
* callback *(function)*: `function (error, files)` where `files` is an array of objects, like `{file: 'vis-views.json', isDir: false, stats: {size: 123}, modifiedAt: 1661336290090, acl: {owner: 'system.user.admin', ownerGroup: 'system.group.administrator', permissions: 1632, read: true, write: true}`


### chmodFile(_adapter, fileName, options, callback)
Change file mode in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{mode: 0x644}` or 0x644. First digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
* callback *(function)*: `function (error)`


### chownFile(_adapter, fileName, options, callback)
Change file owner in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{owner: 'system.user.user', ownerGroup: ''system.group.administrator'}` or 'system.user.user'. If ownerGroup is not defined, it will be taken from owner.
* callback *(function)*: `function (error)`


### fileExists(_adapter, fileName, callback)
Checks if the file or folder exists in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, isExist)`


### subscribeFiles(id, pattern, callback)
Subscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`


### unsubscribeFiles(id, pattern, callback)
Unsubscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`


### getAdapterInstances(adapterName, callback)
Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
* adapterName *(string)*: optional adapter name, e.g `history`.
* callback *(function)*: `function (error, instanceList)`, where instanceList is an array of instance objects, e.g. `{_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}}`

<!-- WEB_METHODS_END -->

## Admin Methods
<!-- ADMIN_METHODS_START -->
### List of commands

* [authenticate](#authenticate-user-pass-callback)

* [error](#error-error)

* [log](#log-text-level)

* [getHistory](#gethistory-id-options-callback)

* [httpGet](#httpget-url-callback)

* [sendTo](#sendto-adapterinstance-command-message-callback)

* [sendToHost](#sendtohost-host-command-message-callback)

* [authEnabled](#authenabled-callback)

* [logout](#logout-callback)

* [listPermissions](#listpermissions-callback)

* [getUserPermissions](#getuserpermissions-callback)

* [getVersion](#getversion-callback)

* [getAdapterName](#getadaptername-callback)

* [getHostByIp](#gethostbyip-ip-callback)

* [requireLog](#requirelog-isenabled-callback)

* [readLogs](#readlogs-host-callback)

* [delState](#delstate-id-callback)

* [cmdExec](#cmdexec-host-id-cmd-callback)

* [eventsThreshold](#eventsthreshold-isactive)

* [getRatings](#getratings-update-callback)

* [getCurrentInstance](#getcurrentinstance-callback)

* [checkFeatureSupported](#checkfeaturesupported-feature-callback)

* [decrypt](#decrypt-encryptedtext-callback)

* [encrypt](#encrypt-plaintext-callback)

* [getIsEasyModeStrict](#getiseasymodestrict-callback)

* [getEasyMode](#geteasymode-callback)

* [getAdapters](#getadapters-adaptername-callback)

* [updateLicenses](#updatelicenses-login-password-callback)

* [getCompactInstances](#getcompactinstances-callback)

* [getCompactAdapters](#getcompactadapters-callback)

* [getCompactInstalled](#getcompactinstalled-host-callback)

* [getCompactSystemConfig](#getcompactsystemconfig-callback)

* [getCompactSystemRepositories](#getcompactsystemrepositories-callback)

* [getCompactRepository](#getcompactrepository-host-callback)

* [getCompactHosts](#getcompacthosts-callback)

* [addUser](#adduser-user-pass-callback)

* [delUser](#deluser-user-callback)

* [addGroup](#addgroup-group-desc-acl-callback)

* [delGroup](#delgroup-group-callback)

* [changePassword](#changepassword-user-pass-callback)

* [getObject](#getobject-id-callback)

* [getObjects](#getobjects-callback)

* [subscribeObjects](#subscribeobjects-pattern-callback)

* [unsubscribeObjects](#unsubscribeobjects-pattern-callback)

* [getObjectView](#getobjectview-design-search-params-callback)

* [setObject](#setobject-id-obj-callback)

* [getAllObjects](#getallobjects-callback)

* [extendObject](#extendobject-id-obj-callback)

* [getForeignObjects](#getforeignobjects-pattern-type-callback)

* [delObject](#delobject-id-options-callback)

* [getStates](#getstates-pattern-callback)

* [getState](#getstate-id-callback)

* [setState](#setstate-id-state-callback)

* [getBinaryState](#getbinarystate-id-callback)

* [setBinaryState](#setbinarystate-id-base64-callback)

* [subscribe](#subscribe-pattern-callback)

* [subscribeStates](#subscribestates-pattern-callback)

* [unsubscribe](#unsubscribe-pattern-callback)

* [unsubscribeStates](#unsubscribestates-pattern-callback)

* [getForeignStates](#getforeignstates-pattern-callback)

* [delObjects](#delobjects-id-options-callback)

* [readFile](#readfile-_adapter-filename-callback)

* [readFile64](#readfile64-_adapter-filename-callback)

* [writeFile64](#writefile64-_adapter-filename-data64-options-callback)

* [writeFile](#writefile-_adapter-filename-data64-options-callback)

* [unlink](#unlink-_adapter-name-callback)

* [deleteFile](#deletefile-_adapter-name-callback)

* [deleteFolder](#deletefolder-_adapter-name-callback)

* [renameFile](#renamefile-_adapter-oldname-newname-callback)

* [rename](#rename-_adapter-oldname-newname-callback)

* [mkdir](#mkdir-_adapter-dirname-callback)

* [readDir](#readdir-_adapter-dirname-options-callback)

* [chmodFile](#chmodfile-_adapter-filename-options-callback)

* [chownFile](#chownfile-_adapter-filename-options-callback)

* [fileExists](#fileexists-_adapter-filename-callback)

* [subscribeFiles](#subscribefiles-id-pattern-callback)

* [unsubscribeFiles](#unsubscribefiles-id-pattern-callback)

* [getAdapterInstances](#getadapterinstances-adaptername-callback)

### authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: `function (isUserAuthenticated, isAuthenticationUsed)`


### error(error)
Write error into ioBroker log
* error *(string)*: error text


### log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.


### getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: `function (error, result)`


### httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: `function (error, {status, statusText}, body)`


### sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: `function (result)`


### sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: `function (result)`


### authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: `function (isAuthenticationUsed, userName)`


### logout(callback)
Logout user
* callback *(function)*: function (error)


### listPermissions(callback)
List commands and permissions
* callback *(function)*: `function (permissions)`


### getUserPermissions(callback)
Get user permissions
* callback *(function)*: `function (error, permissions)`


### getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion, adapterName)`


### getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion)`


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
Delete object or objects recursively. Objects with `dontDelete` cannot be deleted.
* id *(string)*: Object ID like, 'adapterName.0.channel'
* options *(string)*: `{recursive: true}`
* callback *(function)*: `function (error)`


### getStates(pattern, callback)
Read states by pattern
* pattern *(string)*: optional pattern, like `system.adapter.*` or array of state IDs
* callback *(function)*: `function (error, states)`, where `states` is an object like `{'system.adapter.history.0': {_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}, 'system.adapter.history.1': {...}}}`


### getState(id, callback)
Read one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`


### setState(id, state, callback)
Write one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* state *(any)*: value or object like `{val: 123, ack: true}`
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`


### getBinaryState(id, callback)
Read one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* callback *(function)*: `function (error, base64)`


### setBinaryState(id, base64, callback)
Write one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* base64 *(string)*: State value as base64 string. Binary states has no acknowledge flag.
* callback *(function)*: `function (error)`


### subscribe(pattern, callback)
Subscribe on state changes by pattern. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### subscribeStates(pattern, callback)
Subscribe on state changes by pattern. Same as `subscribe`. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### unsubscribe(pattern, callback)
Unsubscribe from state changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### unsubscribeStates(pattern, callback)
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`


### getForeignStates(pattern, callback)



### delObjects(id, options, callback)



### readFile(_adapter, fileName, callback)
Read file from ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, data, mimeType)`


### readFile64(_adapter, fileName, callback)
Read file from ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, base64, mimeType)`


### writeFile64(_adapter, fileName, data64, options, callback)
Write file into ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional {mode: '0644'}
* callback *(function)*: `function (error, base64, mimeType)`


### writeFile(_adapter, fileName, data64, options, callback)



### unlink(_adapter, name, callback)
Delete file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`


### deleteFile(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for files)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`


### deleteFolder(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for folders)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: folder name, e.g `main`
* callback *(function)*: `function (error)`


### renameFile(_adapter, oldName, newName, callback)
Rename file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`


### rename(_adapter, oldName, newName, callback)
Rename file or folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`


### mkdir(_adapter, dirName, callback)
Create folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: desired folder name, e.g `main`
* callback *(function)*: `function (error)`


### readDir(_adapter, dirName, options, callback)
Read content of folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: folder name, e.g `main`
* options *(object)*: optional `{filter: '*'}` or `{filter: '*.json'}`
* callback *(function)*: `function (error, files)` where `files` is an array of objects, like `{file: 'vis-views.json', isDir: false, stats: {size: 123}, modifiedAt: 1661336290090, acl: {owner: 'system.user.admin', ownerGroup: 'system.group.administrator', permissions: 1632, read: true, write: true}`


### chmodFile(_adapter, fileName, options, callback)
Change file mode in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{mode: 0x644}` or 0x644. First digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
* callback *(function)*: `function (error)`


### chownFile(_adapter, fileName, options, callback)
Change file owner in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{owner: 'system.user.user', ownerGroup: ''system.group.administrator'}` or 'system.user.user'. If ownerGroup is not defined, it will be taken from owner.
* callback *(function)*: `function (error)`


### fileExists(_adapter, fileName, callback)
Checks if the file or folder exists in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, isExist)`


### subscribeFiles(id, pattern, callback)
Subscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`


### unsubscribeFiles(id, pattern, callback)
Unsubscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`


### getAdapterInstances(adapterName, callback)
Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
* adapterName *(string)*: optional adapter name, e.g `history`.
* callback *(function)*: `function (error, instanceList)`, where instanceList is an array of instance objects, e.g. `{_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}}`

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
