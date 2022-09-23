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
* [authenticate](#authenticate_w)
* [error](#error_w)
* [log](#log_w)
* [getHistory](#gethistory_w)
* [httpGet](#httpget_w)
* [sendTo](#sendto_w)
* [sendToHost](#sendtohost_w)
* [authEnabled](#authenabled_w)
* [logout](#logout_w)
* [listPermissions](#listpermissions_w)
* [getUserPermissions](#getuserpermissions_w)
* [getVersion](#getversion_w)
* [getAdapterName](#getadaptername_w)
* [getObject](#getobject_w)
* [getObjects](#getobjects_w)
* [subscribeObjects](#subscribeobjects_w)
* [unsubscribeObjects](#unsubscribeobjects_w)
* [getObjectView](#getobjectview_w)
* [setObject](#setobject_w)
* [getStates](#getstates_w)
* [delObject](#delobject_w)
* [getState](#getstate_w)
* [setState](#setstate_w)
* [getBinaryState](#getbinarystate_w)
* [setBinaryState](#setbinarystate_w)
* [subscribe](#subscribe_w)
* [subscribeStates](#subscribestates_w)
* [unsubscribe](#unsubscribe_w)
* [unsubscribeStates](#unsubscribestates_w)
* [readFile](#readfile_w)
* [readFile64](#readfile64_w)
* [writeFile64](#writefile64_w)
* [writeFile](#writefile_w)
* [unlink](#unlink_w)
* [deleteFile](#deletefile_w)
* [deleteFolder](#deletefolder_w)
* [renameFile](#renamefile_w)
* [rename](#rename_w)
* [mkdir](#mkdir_w)
* [readDir](#readdir_w)
* [chmodFile](#chmodfile_w)
* [chownFile](#chownfile_w)
* [fileExists](#fileexists_w)
* [subscribeFiles](#subscribefiles_w)
* [unsubscribeFiles](#unsubscribefiles_w)
* [getAdapterInstances](#getadapterinstances_w)
### <a name="authenticate_w"></a>authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: `function (isUserAuthenticated, isAuthenticationUsed)`

### <a name="error_w"></a>error(error)
Write error into ioBroker log
* error *(string)*: error text

### <a name="log_w"></a>log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.

### <a name="gethistory_w"></a>getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: `function (error, result)`

### <a name="httpget_w"></a>httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: `function (error, {status, statusText}, body)`

### <a name="sendto_w"></a>sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: `function (result)`

### <a name="sendtohost_w"></a>sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: `function (result)`

### <a name="authenabled_w"></a>authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: `function (isAuthenticationUsed, userName)`

### <a name="logout_w"></a>logout(callback)
Logout user
* callback *(function)*: function (error)

### <a name="listpermissions_w"></a>listPermissions(callback)
List commands and permissions
* callback *(function)*: `function (permissions)`

### <a name="getuserpermissions_w"></a>getUserPermissions(callback)
Get user permissions
* callback *(function)*: `function (error, permissions)`

### <a name="getversion_w"></a>getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion, adapterName)`

### <a name="getadaptername_w"></a>getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion)`

### <a name="getobject_w"></a>getObject(id, callback)
Get one object
* id *(string)*: object ID.
* callback *(function)*: `function (error, obj)`

### <a name="getobjects_w"></a>getObjects(callback)
Get all objects that are relevant for web: all states and enums with rooms
* id *(string)*: object ID.
* callback *(function)*: `function (error, obj)`

### <a name="subscribeobjects_w"></a>subscribeObjects(pattern, callback)
Subscribe on object changes by pattern. The events will come as 'objectChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribeobjects_w"></a>unsubscribeObjects(pattern, callback)
Unsubscribe on object changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="getobjectview_w"></a>getObjectView(design, search, params, callback)
Make a query to the object database.
* design *(string)*: 'system' or other designs like `custom`, but it must exist object `_design/custom`. Too 99,9% use `system`.
* search *(string)*: object type, like `state`, `instance`, `adapter`, `host`, ...
* params *(string)*: parameters for the query in form `{startkey: 'system.adapter.', endkey: 'system.adapter.\u9999'}`
* callback *(function)*: `function (error)`

### <a name="setobject_w"></a>setObject(id, obj, callback)
Set object.
* id *(string)*: object ID
* obj *(object)*: object itself
* callback *(function)*: `function (error)`

### <a name="getstates_w"></a>getStates(pattern, callback)
Read states by pattern
* pattern *(string)*: optional pattern, like `system.adapter.*` or array of state IDs
* callback *(function)*: `function (error, states)`, where `states` is an object like `{'system.adapter.history.0': {_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}, 'system.adapter.history.1': {...}}}`

### <a name="delobject_w"></a>delObject(id, options, callback)
Delete object. Only deletion of flot objects is allowed
* id *(string)*: Object ID like, 'flot.0.myChart'
* options *(string)*: ignored
* callback *(function)*: `function (error)`

### <a name="getstate_w"></a>getState(id, callback)
Read one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`

### <a name="setstate_w"></a>setState(id, state, callback)
Write one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* state *(any)*: value or object like `{val: 123, ack: true}`
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`

### <a name="getbinarystate_w"></a>getBinaryState(id, callback)
Read one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* callback *(function)*: `function (error, base64)`

### <a name="setbinarystate_w"></a>setBinaryState(id, base64, callback)
Write one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* base64 *(string)*: State value as base64 string. Binary states has no acknowledge flag.
* callback *(function)*: `function (error)`

### <a name="subscribe_w"></a>subscribe(pattern, callback)
Subscribe on state changes by pattern. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="subscribestates_w"></a>subscribeStates(pattern, callback)
Subscribe on state changes by pattern. Same as `subscribe`. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribe_w"></a>unsubscribe(pattern, callback)
Unsubscribe from state changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribestates_w"></a>unsubscribeStates(pattern, callback)
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="readfile_w"></a>readFile(_adapter, fileName, callback)
Read file from ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, data, mimeType)`

### <a name="readfile64_w"></a>readFile64(_adapter, fileName, callback)
Read file from ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, base64, mimeType)`

### <a name="writefile64_w"></a>writeFile64(_adapter, fileName, data64, options, callback)
Write file into ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional `{mode: 0x0644}`
* callback *(function)*: `function (error)`

### <a name="writefile_w"></a>writeFile(_adapter, fileName, data, options, callback)
Write file into ioBroker DB as text **DEPRECATED**
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional `{mode: 0x644}`
* callback *(function)*: `function (error)`

### <a name="unlink_w"></a>unlink(_adapter, name, callback)
Delete file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`

### <a name="deletefile_w"></a>deleteFile(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for files)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`

### <a name="deletefolder_w"></a>deleteFolder(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for folders)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: folder name, e.g `main`
* callback *(function)*: `function (error)`

### <a name="renamefile_w"></a>renameFile(_adapter, oldName, newName, callback)
Rename file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`

### <a name="rename_w"></a>rename(_adapter, oldName, newName, callback)
Rename file or folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`

### <a name="mkdir_w"></a>mkdir(_adapter, dirName, callback)
Create folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: desired folder name, e.g `main`
* callback *(function)*: `function (error)`

### <a name="readdir_w"></a>readDir(_adapter, dirName, options, callback)
Read content of folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: folder name, e.g `main`
* options *(object)*: optional `{filter: '*'}` or `{filter: '*.json'}`
* callback *(function)*: `function (error, files)` where `files` is an array of objects, like `{file: 'vis-views.json', isDir: false, stats: {size: 123}, modifiedAt: 1661336290090, acl: {owner: 'system.user.admin', ownerGroup: 'system.group.administrator', permissions: 1632, read: true, write: true}`

### <a name="chmodfile_w"></a>chmodFile(_adapter, fileName, options, callback)
Change file mode in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{mode: 0x644}` or 0x644. First digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
* callback *(function)*: `function (error)`

### <a name="chownfile_w"></a>chownFile(_adapter, fileName, options, callback)
Change file owner in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{owner: 'system.user.user', ownerGroup: ''system.group.administrator'}` or 'system.user.user'. If ownerGroup is not defined, it will be taken from owner.
* callback *(function)*: `function (error)`

### <a name="fileexists_w"></a>fileExists(_adapter, fileName, callback)
Checks if the file or folder exists in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, isExist)`

### <a name="subscribefiles_w"></a>subscribeFiles(id, pattern, callback)
Subscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`

### <a name="unsubscribefiles_w"></a>unsubscribeFiles(id, pattern, callback)
Unsubscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`

### <a name="getadapterinstances_w"></a>getAdapterInstances(adapterName, callback)
Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
* adapterName *(string)*: optional adapter name, e.g `history`.
* callback *(function)*: `function (error, instanceList)`, where instanceList is an array of instance objects, e.g. `{_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}}`

<!-- WEB_METHODS_END -->

## Admin Methods
<!-- ADMIN_METHODS_START -->
### List of commands
* [authenticate](#authenticate_a)
* [error](#error_a)
* [log](#log_a)
* [getHistory](#gethistory_a)
* [httpGet](#httpget_a)
* [sendTo](#sendto_a)
* [sendToHost](#sendtohost_a)
* [authEnabled](#authenabled_a)
* [logout](#logout_a)
* [listPermissions](#listpermissions_a)
* [getUserPermissions](#getuserpermissions_a)
* [getVersion](#getversion_a)
* [getAdapterName](#getadaptername_a)
* [getHostByIp](#gethostbyip_a)
* [requireLog](#requirelog_a)
* [readLogs](#readlogs_a)
* [delState](#delstate_a)
* [cmdExec](#cmdexec_a)
* [eventsThreshold](#eventsthreshold_a)
* [getRatings](#getratings_a)
* [getCurrentInstance](#getcurrentinstance_a)
* [checkFeatureSupported](#checkfeaturesupported_a)
* [decrypt](#decrypt_a)
* [encrypt](#encrypt_a)
* [getIsEasyModeStrict](#getiseasymodestrict_a)
* [getEasyMode](#geteasymode_a)
* [getAdapters](#getadapters_a)
* [updateLicenses](#updatelicenses_a)
* [getCompactInstances](#getcompactinstances_a)
* [getCompactAdapters](#getcompactadapters_a)
* [getCompactInstalled](#getcompactinstalled_a)
* [getCompactSystemConfig](#getcompactsystemconfig_a)
* [getCompactSystemRepositories](#getcompactsystemrepositories_a)
* [getCompactRepository](#getcompactrepository_a)
* [getCompactHosts](#getcompacthosts_a)
* [addUser](#adduser_a)
* [delUser](#deluser_a)
* [addGroup](#addgroup_a)
* [delGroup](#delgroup_a)
* [changePassword](#changepassword_a)
* [getObject](#getobject_a)
* [getObjects](#getobjects_a)
* [subscribeObjects](#subscribeobjects_a)
* [unsubscribeObjects](#unsubscribeobjects_a)
* [getObjectView](#getobjectview_a)
* [setObject](#setobject_a)
* [getAllObjects](#getallobjects_a)
* [extendObject](#extendobject_a)
* [getForeignObjects](#getforeignobjects_a)
* [delObject](#delobject_a)
* [delObjects](#delobjects_a)
* [getStates](#getstates_a)
* [getState](#getstate_a)
* [setState](#setstate_a)
* [getBinaryState](#getbinarystate_a)
* [setBinaryState](#setbinarystate_a)
* [subscribe](#subscribe_a)
* [subscribeStates](#subscribestates_a)
* [unsubscribe](#unsubscribe_a)
* [unsubscribeStates](#unsubscribestates_a)
* [getForeignStates](#getforeignstates_a)
* [readFile](#readfile_a)
* [readFile64](#readfile64_a)
* [writeFile64](#writefile64_a)
* [writeFile](#writefile_a)
* [unlink](#unlink_a)
* [deleteFile](#deletefile_a)
* [deleteFolder](#deletefolder_a)
* [renameFile](#renamefile_a)
* [rename](#rename_a)
* [mkdir](#mkdir_a)
* [readDir](#readdir_a)
* [chmodFile](#chmodfile_a)
* [chownFile](#chownfile_a)
* [fileExists](#fileexists_a)
* [subscribeFiles](#subscribefiles_a)
* [unsubscribeFiles](#unsubscribefiles_a)
* [getAdapterInstances](#getadapterinstances_a)
### <a name="authenticate_a"></a>authenticate(user, pass, callback)
Authenticate user by login and password
* user *(string)*: user name
* pass *(string)*: password
* callback *(function)*: `function (isUserAuthenticated, isAuthenticationUsed)`

### <a name="error_a"></a>error(error)
Write error into ioBroker log
* error *(string)*: error text

### <a name="log_a"></a>log(text, level)
Write log entry into ioBroker log
* text *(string)*: log text
* level *(string)*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.

### <a name="gethistory_a"></a>getHistory(id, options, callback)
Get history data from specific instance
* id *(string)*: object ID
* options *(object)*: See object description here: https://github.com/ioBroker/ioBroker.history/blob/master/docs/en/README.md#access-values-from-javascript-adapter
* callback *(function)*: `function (error, result)`

### <a name="httpget_a"></a>httpGet(url, callback)
Read content of HTTP(S) page server-side (without CORS and stuff)
* url *(string)*: Page URL
* callback *(function)*: `function (error, {status, statusText}, body)`

### <a name="sendto_a"></a>sendTo(adapterInstance, command, message, callback)
Send message to specific instance
* adapterInstance *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is instance dependent
* callback *(function)*: `function (result)`

### <a name="sendtohost_a"></a>sendToHost(host, command, message, callback)
Send message to specific host.
Host can answer following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* host *(string)*: instance name, e.g. `history.0`
* command *(string)*: command name
* message *(object)*: message is command specific
* callback *(function)*: `function (result)`

### <a name="authenabled_a"></a>authEnabled(callback)
Ask server is authentication enabled and if the user authenticated
* callback *(function)*: `function (isAuthenticationUsed, userName)`

### <a name="logout_a"></a>logout(callback)
Logout user
* callback *(function)*: function (error)

### <a name="listpermissions_a"></a>listPermissions(callback)
List commands and permissions
* callback *(function)*: `function (permissions)`

### <a name="getuserpermissions_a"></a>getUserPermissions(callback)
Get user permissions
* callback *(function)*: `function (error, permissions)`

### <a name="getversion_a"></a>getVersion(callback)
Get adapter version. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion, adapterName)`

### <a name="getadaptername_a"></a>getAdapterName(callback)
Get adapter name. Not the socket-classes version!
* callback *(function)*: `function (error, adapterVersion)`

### <a name="gethostbyip_a"></a>getHostByIp(ip, callback)
Read host object by IP address
* ip *(string)*: ip address. IPv4 or IPv6
* callback *(function)*: `function (ip, obj)`. If host not found, obj is null

### <a name="requirelog_a"></a>requireLog(isEnabled, callback)
Activate or deactivate logging events. Events will be sent to the socket as `log` event. Adapter must have `common.logTransporter = true`
* isEnabled *(boolean)*: is logging enabled
* callback *(function)*: `function (error)`

### <a name="readlogs_a"></a>readLogs(host, callback)
Get logs file from given host
* host *(string)*: host id, like 'system.host.raspberrypi'
* callback *(function)*: `function (error, files)`, where `files` is array of `{fileName: `log/hostname/transport/file`, size: 123}`

### <a name="delstate_a"></a>delState(id, callback)
Delete state. Corresponding object will be deleted too.
* id *(string)*: state ID
* callback *(function)*: `function (error)`

### <a name="cmdexec_a"></a>cmdExec(host, id, cmd, callback)
Execute shell command on host/controller. Following response commands are expected: ´cmdStdout, cmdStderr, cmdExit´
* host *(string)*: host name, like 'system.host.raspberrypi'
* id *(string)*: session ID, like `Date.now()´. This session ID will come in events `cmdStdout, cmdStderr, cmdExit`
* cmd *(string)*: command
* callback *(function)*: `function (error)`

### <a name="eventsthreshold_a"></a>eventsThreshold(isActive)


### <a name="getratings_a"></a>getRatings(update, callback)


### <a name="getcurrentinstance_a"></a>getCurrentInstance(callback)


### <a name="checkfeaturesupported_a"></a>checkFeatureSupported(feature, callback)


### <a name="decrypt_a"></a>decrypt(encryptedText, callback)


### <a name="encrypt_a"></a>encrypt(plainText, callback)


### <a name="getiseasymodestrict_a"></a>getIsEasyModeStrict(callback)


### <a name="geteasymode_a"></a>getEasyMode(callback)


### <a name="getadapters_a"></a>getAdapters(adapterName, callback)


### <a name="updatelicenses_a"></a>updateLicenses(login, password, callback)


### <a name="getcompactinstances_a"></a>getCompactInstances(callback)


### <a name="getcompactadapters_a"></a>getCompactAdapters(callback)


### <a name="getcompactinstalled_a"></a>getCompactInstalled(host, callback)


### <a name="getcompactsystemconfig_a"></a>getCompactSystemConfig(callback)


### <a name="getcompactsystemrepositories_a"></a>getCompactSystemRepositories(callback)


### <a name="getcompactrepository_a"></a>getCompactRepository(host, callback)


### <a name="getcompacthosts_a"></a>getCompactHosts(callback)


### <a name="adduser_a"></a>addUser(user, pass, callback)
Add new user
* user *(string)*: user name, like `benjamin`
* pass *(string)*: user password
* callback *(function)*: `function (error)`

### <a name="deluser_a"></a>delUser(user, callback)
Delete existing user. Admin cannot be deleted.
* user *(string)*: user name, like 'benjamin
* callback *(function)*: `function (error)`

### <a name="addgroup_a"></a>addGroup(group, desc, acl, callback)
Add new group.
* group *(string)*: user name, like 'benjamin
* desc *(string)*: optional description
* acl *(object)*: optional access control list object, like `{"object":{"list":true,"read":true,"write":false,"delete":false},"state":{"list":true,"read":true,"write":true,"create":true,"delete":false},"users":{"list":true,"read":true,"write":false,"create":false,"delete":false},"other":{"execute":false,"http":true,"sendto":false},"file":{"list":true,"read":true,"write":false,"create":false,"delete":false}}`
* callback *(function)*: `function (error)`

### <a name="delgroup_a"></a>delGroup(group, callback)
Delete existing group. Administrator group cannot be deleted.
* group *(string)*: group name, like 'users`
* callback *(function)*: `function (error)`

### <a name="changepassword_a"></a>changePassword(user, pass, callback)
Change user password
* user *(string)*: user name, like 'benjamin`
* pass *(string)*: new password
* callback *(function)*: `function (error)`

### <a name="getobject_a"></a>getObject(id, callback)
Get one object
* id *(string)*: object ID.
* callback *(function)*: `function (error, obj)`

### <a name="getobjects_a"></a>getObjects(callback)
Read absolutely all objects. Same as `getAllObjects`.
* callback *(function)*: `function (error, objects)`, where `objects` is an object like `{'system.adapter.admin.0': {...}, 'system.adapter.web.0': {...}}`

### <a name="subscribeobjects_a"></a>subscribeObjects(pattern, callback)
Subscribe on object changes by pattern. The events will come as 'objectChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribeobjects_a"></a>unsubscribeObjects(pattern, callback)
Unsubscribe on object changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of IDs like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="getobjectview_a"></a>getObjectView(design, search, params, callback)
Make a query to the object database.
* design *(string)*: 'system' or other designs like `custom`, but it must exist object `_design/custom`. Too 99,9% use `system`.
* search *(string)*: object type, like `state`, `instance`, `adapter`, `host`, ...
* params *(string)*: parameters for the query in form `{startkey: 'system.adapter.', endkey: 'system.adapter.\u9999'}`
* callback *(function)*: `function (error)`

### <a name="setobject_a"></a>setObject(id, obj, callback)
Set object.
* id *(string)*: object ID
* obj *(object)*: object itself
* callback *(function)*: `function (error)`

### <a name="getallobjects_a"></a>getAllObjects(callback)
Read absolutely all objects
* callback *(function)*: `function (error, objects)`, where `objects` is an object like `{'system.adapter.admin.0': {...}, 'system.adapter.web.0': {...}}`

### <a name="extendobject_a"></a>extendObject(id, obj, callback)
Extend existing object
* id *(string)*: object ID
* obj *(object)*: new parts of the object, like `{common: {name: 'new name'}}`
* callback *(function)*: `function (error)`

### <a name="getforeignobjects_a"></a>getForeignObjects(pattern, type, callback)
Read objects by pattern
* pattern *(string)*: pattern like `system.adapter.admin.0.*`
* type *(string)*: type of objects to delete, like `state`, `channel`, `device`, `host`, `adapter`. Default - `state`
* callback *(function)*: `function (error, objects)`, where `objects` is an object like `{'system.adapter.admin.0': {...}, 'system.adapter.web.0': {...}}`

### <a name="delobject_a"></a>delObject(id, options, callback)
Delete object. Only deletion of flot objects is allowed
* id *(string)*: Object ID like, 'flot.0.myChart'
* options *(string)*: ignored
* callback *(function)*: `function (error)`

### <a name="delobjects_a"></a>delObjects(id, options, callback)
Delete objects recursively. Objects with `dontDelete` cannot be deleted. Same as `delObject` but with `recursive: true`.
* id *(string)*: Object ID like, 'adapterName.0.channel'
* options *(string)*: optional
* callback *(function)*: `function (error)`

### <a name="getstates_a"></a>getStates(pattern, callback)
Read states by pattern
* pattern *(string)*: optional pattern, like `system.adapter.*` or array of state IDs
* callback *(function)*: `function (error, states)`, where `states` is an object like `{'system.adapter.history.0': {_id: 'system.adapter.history.0', common: {name: 'history', ...}, native: {...}, 'system.adapter.history.1': {...}}}`

### <a name="getstate_a"></a>getState(id, callback)
Read one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`

### <a name="setstate_a"></a>setState(id, state, callback)
Write one state.
* id *(string)*: State ID like, 'system.adapter.admin.0.memRss'
* state *(any)*: value or object like `{val: 123, ack: true}`
* callback *(function)*: `function (error, state)`, where `state` is an object like `{val: 123, ts: 1663915537418, ack: true, from: 'system.adapter.admin.0', q: 0, lc: 1663915537418, c: 'javascript.0'}`

### <a name="getbinarystate_a"></a>getBinaryState(id, callback)
Read one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* callback *(function)*: `function (error, base64)`

### <a name="setbinarystate_a"></a>setBinaryState(id, base64, callback)
Write one binary state.
* id *(string)*: State ID like, 'javascript.0.binary'
* base64 *(string)*: State value as base64 string. Binary states has no acknowledge flag.
* callback *(function)*: `function (error)`

### <a name="subscribe_a"></a>subscribe(pattern, callback)
Subscribe on state changes by pattern. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="subscribestates_a"></a>subscribeStates(pattern, callback)
Subscribe on state changes by pattern. Same as `subscribe`. The events will come as 'stateChange' events to the socket.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribe_a"></a>unsubscribe(pattern, callback)
Unsubscribe from state changes by pattern.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="unsubscribestates_a"></a>unsubscribeStates(pattern, callback)
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
* pattern *(string)*: pattern like 'system.adapter.*' or array of states like ['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']
* callback *(function)*: `function (error)`

### <a name="getforeignstates_a"></a>getForeignStates(pattern, callback)
Change user password
* user *(string)*: user name, like 'benjamin`
* pass *(string)*: new password
* callback *(function)*: `function (error)`

### <a name="readfile_a"></a>readFile(_adapter, fileName, callback)
Read file from ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, data, mimeType)`

### <a name="readfile64_a"></a>readFile64(_adapter, fileName, callback)
Read file from ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, base64, mimeType)`

### <a name="writefile64_a"></a>writeFile64(_adapter, fileName, data64, options, callback)
Write file into ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional `{mode: 0x0644}`
* callback *(function)*: `function (error)`

### <a name="writefile_a"></a>writeFile(_adapter, fileName, data64, options, callback)
Write file into ioBroker DB as base64 string
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* data64 *(string)*: file content as base64 string
* options *(object)*: optional `{mode: 0x0644}`
* callback *(function)*: `function (error)`

### <a name="unlink_a"></a>unlink(_adapter, name, callback)
Delete file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`

### <a name="deletefile_a"></a>deleteFile(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for files)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error)`

### <a name="deletefolder_a"></a>deleteFolder(_adapter, name, callback)
Delete file in ioBroker DB (same as unlink, but only for folders)
* _adapter *(string)*: instance name, e.g. `vis.0`
* name *(string)*: folder name, e.g `main`
* callback *(function)*: `function (error)`

### <a name="renamefile_a"></a>renameFile(_adapter, oldName, newName, callback)
Rename file in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`

### <a name="rename_a"></a>rename(_adapter, oldName, newName, callback)
Rename file or folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* oldName *(string)*: current file name, e.g `main/vis-views.json`
* newName *(string)*: new file name, e.g `main/vis-views-new.json`
* callback *(function)*: `function (error)`

### <a name="mkdir_a"></a>mkdir(_adapter, dirName, callback)
Create folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: desired folder name, e.g `main`
* callback *(function)*: `function (error)`

### <a name="readdir_a"></a>readDir(_adapter, dirName, options, callback)
Read content of folder in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* dirName *(string)*: folder name, e.g `main`
* options *(object)*: optional `{filter: '*'}` or `{filter: '*.json'}`
* callback *(function)*: `function (error, files)` where `files` is an array of objects, like `{file: 'vis-views.json', isDir: false, stats: {size: 123}, modifiedAt: 1661336290090, acl: {owner: 'system.user.admin', ownerGroup: 'system.group.administrator', permissions: 1632, read: true, write: true}`

### <a name="chmodfile_a"></a>chmodFile(_adapter, fileName, options, callback)
Change file mode in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{mode: 0x644}` or 0x644. First digit is user, second group, third others. Bit 1 is `execute`, bit 2 is `write`, bit 3 is `read`
* callback *(function)*: `function (error)`

### <a name="chownfile_a"></a>chownFile(_adapter, fileName, options, callback)
Change file owner in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* options *(object)*: `{owner: 'system.user.user', ownerGroup: ''system.group.administrator'}` or 'system.user.user'. If ownerGroup is not defined, it will be taken from owner.
* callback *(function)*: `function (error)`

### <a name="fileexists_a"></a>fileExists(_adapter, fileName, callback)
Checks if the file or folder exists in ioBroker DB
* _adapter *(string)*: instance name, e.g. `vis.0`
* fileName *(string)*: file name, e.g `main/vis-views.json`
* callback *(function)*: `function (error, isExist)`

### <a name="subscribefiles_a"></a>subscribeFiles(id, pattern, callback)
Subscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`

### <a name="unsubscribefiles_a"></a>unsubscribeFiles(id, pattern, callback)
Unsubscribe on file changes in ioBroker DB
* id *(string)*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* pattern *(string)*: file name pattern, e.g `main/*.json`
* callback *(function)*: `function (error)`

### <a name="getadapterinstances_a"></a>getAdapterInstances(adapterName, callback)
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
