# @iobroker/socket-classes

This library is used at least for the following adapters:
- [iobroker.admin](https://github.com/ioBroker/ioBroker.admin)
- [iobroker.cloud](https://github.com/ioBroker/ioBroker.cloud)
- [iobroker.socketio](https://github.com/ioBroker/ioBroker.socketio)
- [iobroker.ws](https://github.com/ioBroker/ioBroker.ws)
- [iobroker.rest-api](https://github.com/ioBroker/ioBroker.rest-api)
- [iobroker.iot](https://github.com/ioBroker/ioBroker.iot)

## Usage as admin
```js
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
```js
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

## GUI subscribes
GUI client can send to desired instance the `subscribe` message
```js
    socket.emit('clientSubscribe', 'cameras.0', 'startCamera', { width: 640, height: 480 }, result => console.log('Started: ' + result));
```

The instance 'cameras.0' will receive message `clientSubscribe` with information who want to receive messages.
```js
adapter.on('message', obj => {
    if (obj?.command === 'clientSubscribe') {
        if (obj?.message.type && obj.message.type.startsWith('startCamera/')) {
            const [, camera] = obj.message.type.split('/');
            // start camera with obj.message.data
            // ...
            
            // inform GUI that camera is started
            adapter.sendTo(obj.from, obj.command, {result: true}, obj.callback);
            this.subscribes = this.subscribes || [];
            this.subscribes.push({sid: obj.message.sid, from: obj.from, type: obj.message.type, camera});
        }
    } else if (obj?.command === 'clientUnsubscribe' || obj?.command === 'clientSubscribeError') {
        if (obj?.message.type && obj.message.type.startsWith('startCamera/')) {
            const [, camera] = obj.message.type.split('/');
            if (this.subscribes) {
                const pos = this.subscribes.findIndex(s => s.sid === obj.message.sid && s.from === obj.from && s.type === obj.message.type);
                if (pos !== -1) {
                    this.subscribes.splice(pos, 1);

                    // stop camera
                    // ...
                }
            }
        }
    }
});
```

and after that client will receive messages from instance

```js
function sendImage(camera, data) {
    this.subscribes.forEach(it => {
        if (it.camera !== camera) {
            return;
        }
        // send image to GUI
        adapter.sendTo(it.from, 'im', {m: it.type, s: it.sid, d: data});
    });
}
```


## Web Methods
<!-- WEB_METHODS_START -->
### List of commands
* [`authenticate`](#authenticate_w)
* [`error`](#error_w)
* [`log`](#log_w)
* [`checkFeatureSupported`](#checkfeaturesupported_w)
* [`getHistory`](#gethistory_w)
* [`httpGet`](#httpget_w)
* [`sendTo`](#sendto_w)
* [`sendToHost`](#sendtohost_w)
* [`authEnabled`](#authenabled_w)
* [`logout`](#logout_w)
* [`listPermissions`](#listpermissions_w)
* [`getUserPermissions`](#getuserpermissions_w)
* [`getVersion`](#getversion_w)
* [`getAdapterName`](#getadaptername_w)
* [`clientSubscribe`](#clientsubscribe_w)
* [`clientUnsubscribe`](#clientunsubscribe_w)
* [`getAdapterInstances`](#getadapterinstances_w)
* [`getObject`](#getobject_w)
* [`getObjects`](#getobjects_w)
* [`subscribeObjects`](#subscribeobjects_w)
* [`unsubscribeObjects`](#unsubscribeobjects_w)
* [`getObjectView`](#getobjectview_w)
* [`setObject`](#setobject_w)
* [`delObject`](#delobject_w)
* [`getStates`](#getstates_w)
* [`getForeignStates`](#getforeignstates_w)
* [`getState`](#getstate_w)
* [`setState`](#setstate_w)
* [`getBinaryState`](#getbinarystate_w)
* [`setBinaryState`](#setbinarystate_w)
* [`subscribe`](#subscribe_w)
* [`subscribeStates`](#subscribestates_w)
* [`unsubscribe`](#unsubscribe_w)
* [`unsubscribeStates`](#unsubscribestates_w)
* [`readFile`](#readfile_w)
* [`readFile64`](#readfile64_w)
* [`writeFile64`](#writefile64_w)
* [`writeFile`](#writefile_w)
* [`unlink`](#unlink_w)
* [`deleteFile`](#deletefile_w)
* [`deleteFolder`](#deletefolder_w)
* [`renameFile`](#renamefile_w)
* [`rename`](#rename_w)
* [`mkdir`](#mkdir_w)
* [`readDir`](#readdir_w)
* [`chmodFile`](#chmodfile_w)
* [`chownFile`](#chownfile_w)
* [`fileExists`](#fileexists_w)
* [`subscribeFiles`](#subscribefiles_w)
* [`unsubscribeFiles`](#unsubscribefiles_w)
### Commands
#### <a name="authenticate_w"></a>`authenticate(callback)`
Wait till the user is authenticated.
As the user authenticates himself, the callback will be called
* `callback` *(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void) => void*: Callback `(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void`

#### <a name="error_w"></a>`error(error)`
Write error into ioBroker log
* `error` *Error | string*: Error object or error text

#### <a name="log_w"></a>`log(text, level)`
Write log entry into ioBroker log
* `text` *string*: log text
* `level` *ioBroker.LogLevel*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.

#### <a name="checkfeaturesupported_w"></a>`checkFeatureSupported(feature, callback)`
Check if the same feature is supported by the current js-controller
* `feature` *SupportedFeature*: feature name like `CONTROLLER_LICENSE_MANAGER`
* `callback` *(error: string | Error | null | undefined, isSupported?: boolean) => void) => void*: callback `(error: string | Error | null | undefined, isSupported: boolean) => void`

#### <a name="gethistory_w"></a>`getHistory(id, options, callback)`
Get history data from specific instance
* `id` *string*: object ID
* `options` *ioBroker.GetHistoryOptions*: History options
* `callback` *(error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void) => void*: callback `(error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void`

#### <a name="httpget_w"></a>`httpGet(url, callback)`
Read content of HTTP(s) page server-side (without CORS and stuff)
* `url` *string*: Page URL
* `callback` *(error: Error | null | undefined | string, result?: {status: number; statusText: string}, data?: string) => void*: callback `(error: Error | null, result?: { status: number; statusText: string }, data?: string) => void`

#### <a name="sendto_w"></a>`sendTo(adapterInstance, command, message, callback)`
Send the message to specific instance
* `adapterInstance` *string*: instance name, e.g. `history.0`
* `command` *string*: command name
* `message` *any*: the message is instance-dependent
* `callback` *(result: any) => void) => void*: callback `(result: any) => void`

#### <a name="sendtohost_w"></a>`sendToHost(host, command, message, callback)`
Send a message to the specific host.
Host can answer to the following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* `host` *string*: Host name. With or without 'system.host.' prefix
* `command` * 'shell' | 'cmdExec' | 'getRepository' | 'getInstalled' | 'getInstalledAdapter' | 'getVersion' | 'getDiagData' | 'getLocationOnDisk' | 'getDevList' | 'getLogs' | 'getLogFile' | 'getLogFiles' | 'getHostInfo' | 'getHostInfoShort' | 'delLogs' | 'readDirAsZip' | 'writeDirAsZip' | 'readObjectsAsZip' | 'writeObjectsAsZip' | 'checkLogging' | 'updateMultihost' | 'upgradeController' | 'upgradeAdapterWithWebserver' | 'getInterfaces' | 'upload' | 'rebuildAdapter' | 'readBaseSettings' | 'writeBaseSettings' | 'addNotification' | 'clearNotifications' | 'getNotifications' | 'updateLicenses' | 'upgradeOsPackages' | 'restartController' | 'sendToSentry'*: Host command
* `message` *any*: the message is command-specific
* `callback` *(result: {error?: string; result?: any}) => void) => void*: callback `(result: { error?: string; result?: any }) => void`

#### <a name="authenabled_w"></a>`authEnabled(callback)`
Ask server is authentication enabled, and if the user authenticated
* `callback` *(isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void) => void*: callback `(isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void`

#### <a name="logout_w"></a>`logout(callback)`
Logout user
* `callback` *ioBroker.ErrorCallback*: callback `(error?: Error) => void`

#### <a name="listpermissions_w"></a>`listPermissions(callback)`
List commands and permissions
* `callback` *(permissions: Record< string, {type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: SocketOperation} >) => void*: callback `(permissions: Record<string, { type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: SocketOperation }>) => void`

#### <a name="getuserpermissions_w"></a>`getUserPermissions(callback)`
Get user permissions
* `callback` *(error: string | null | undefined, userPermissions?: SocketACL | null) => void) => void*: callback `(error: string | null | undefined, userPermissions?: SocketACL | null) => void`

#### <a name="getversion_w"></a>`getVersion(callback)`
Get the adapter version. Not the socket-classes version!
* `callback` *(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void*: callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`

#### <a name="getadaptername_w"></a>`getAdapterName(callback)`
Get adapter name: "iobroker.ws", "iobroker.socketio", "iobroker.web", "iobroker.admin"
* `callback` *(error: string | Error | null | undefined, adapterName: string) => void) => void*: callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`

#### <a name="clientsubscribe_w"></a>`clientSubscribe(targetInstance, messageType, data, callback)`
Client subscribes to specific instance's messages.
Client informs specific instance about subscription on its messages.
After subscription, the socket will receive "im" messages from desired instance
The target instance MUST acknowledge the subscription and return result
* `targetInstance` *string*: Instance name, e.g., 'cameras.0'
* `messageType` *string*: Message type, e.g., 'startRecording/cam1'
* `data` *any*: Optional data object, e.g., {width: 640, height: 480}
* `callback` *(error: string | null | Error | undefined, result?: {accepted: boolean; heartbeat?: number; error?: string}) => void*: Callback `(error: string | null, result?:{ accepted: boolean; heartbeat?: number; error?: string; }) => void`

#### <a name="clientunsubscribe_w"></a>`clientUnsubscribe(targetInstance, messageType, callback)`
Client unsubscribes from specific instance's messages.
The target instance MUST NOT acknowledge the un-subscription
* `targetInstance` *string*: Instance name, e.g., 'cameras.0'
* `messageType` *string*: Message type, e.g., 'startRecording/cam1'
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="getadapterinstances_w"></a>`getAdapterInstances(adapterName, callback)`
Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
* `adapterName` *string | undefined*: adapter name, e.g. `history`. To get all instances of all adapters just place here "".
* `callback` *(error: null | undefined | Error | string, instanceList?: ioBroker.InstanceObject[]) => void) => void*: callback `(error: null | undefined | Error | string, instanceList?: ioBroker.InstanceObject[]) => void`

### Objects
#### <a name="getobject_w"></a>`getObject(id, callback)`
Get one object.
* `id` *string*: Object ID
* `callback` *(error: Error | undefined | string | null, obj?: ioBroker.Object) => void) => void*: Callback `(error: string | null, obj?: ioBroker.Object) => void`

#### <a name="getobjects_w"></a>`getObjects(list, callback)`
Get all objects that are relevant for web: all states and enums with rooms.
This is non-admin version of "all objects" and will be overloaded in admin
* `list` *string[] | null*: Optional list of IDs
* `callback` *(error: Error | undefined | string | null, objs?: Record<string, ioBroker.Object>) => void) => void*: Callback `(error: string | null, objs?: Record<string, ioBroker.Object>) => void`

#### <a name="subscribeobjects_w"></a>`subscribeObjects(pattern, callback)`
Subscribe to object changes by pattern. The events will come as 'objectChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of IDs like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: Error | undefined | string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribeobjects_w"></a>`unsubscribeObjects(pattern, callback)`
Unsubscribe from object changes by pattern.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of IDs like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="getobjectview_w"></a>`getObjectView(design, search, params, callback)`
Get a view of objects. Make a query to the object database.
* `design` *string*: Design name, e.g., 'system' or other designs like `custom`, but it must exist object `_design/custom`. To 99,9% use `system`.
* `search` *string*: Search name, object type, like `state`, `instance`, `adapter`, `host`, ...
* `params` *{startkey?: string; endkey?: string; depth?: number}*: Parameters for the query, e.g., `{startkey: 'system.adapter.', endkey: 'system.adapter.\u9999', depth?: number}`
* `callback` *(error: string | null | Error | undefined, result?: {rows: {id: string; value: ioBroker.Object & {virtual: boolean; hasChildren: number;};}[];}) => void*: Callback `(error: string | null, result?: { rows: Array<GetObjectViewItem>) => void`

#### <a name="setobject_w"></a>`setObject(id, obj, callback)`
Set an object.
* `id` *string*: Object ID
* `obj` *ioBroker.Object*: Object to set
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="delobject_w"></a>`delObject(id, _options, callback)`
Delete an object. Only deletion of flot and fullcalendar objects is allowed
* `id` *string*: Object ID, like 'flot.0.myChart'
* `_options` *any*: Options for deletion. Ignored
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

### States
#### <a name="getstates_w"></a>`getStates(pattern, callback)`
Get states by pattern of current adapter
* `pattern` *string | string[] | undefined*: optional pattern, like `system.adapter.*` or array of state IDs. If the pattern is omitted, you will get ALL states of current adapter
* `callback` *(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void) => void*: callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`

#### <a name="getforeignstates_w"></a>`getForeignStates(pattern, callback)`
Same as getStates
* `pattern` *string | string[]*: pattern like `system.adapter.*` or array of state IDs
* `callback` *(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void) => void*: callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`

#### <a name="getstate_w"></a>`getState(id, callback)`
Get a state by ID
* `id` *string*: State ID, e.g. `system.adapter.admin.0.memRss`
* `callback` *(error: null | undefined | Error | string, state?: ioBroker.State) => void) => void*: Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`

#### <a name="setstate_w"></a>`setState(id, state, callback)`
Set a state by ID
* `id` *string*: State ID, e.g. `system.adapter.admin.0.memRss`
* `state` *ioBroker.SettableState*: State value or object, e.g. `{val: 123, ack: true}`
* `callback` *(error: null | undefined | Error | string, state?: ioBroker.State) => void) => void*: Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`

#### <a name="getbinarystate_w"></a>`getBinaryState(id, callback)`
Get a binary state by ID
* `id` *string*: State ID, e.g. `javascript.0.binary`
* `callback` *(error: null | undefined | Error | string, base64?: string) => void) => void*: Callback `(error: null | undefined | Error | string, base64?: string) => void`

#### <a name="setbinarystate_w"></a>`setBinaryState(id, _base64, callback)`
Set a binary state by ID
* `id` *string*: State ID, e.g. `javascript.0.binary`
* `_base64` *string*: State value as base64 string. Binary states have no acknowledged flag.
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="subscribe_w"></a>`subscribe(pattern, callback)`
Subscribe to state changes by pattern.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="subscribestates_w"></a>`subscribeStates(pattern, callback)`
Subscribe to state changes by pattern. Same as `subscribe`.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribe_w"></a>`unsubscribe(pattern, callback)`
Unsubscribe from state changes by pattern.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribestates_w"></a>`unsubscribeStates(pattern, callback)`
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

### Files
#### <a name="readfile_w"></a>`readFile(adapter, fileName, callback)`
Read a file from ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, data: Buffer | string, mimeType: string) => void) => void*: Callback `(error: null | undefined | Error | string, data: Buffer | string, mimeType: string) => void`

#### <a name="readfile64_w"></a>`readFile64(adapter, fileName, callback)`
Read a file from ioBroker DB as base64 string
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, base64?: string, mimeType?: string) => void) => void*: Callback `(error: null | undefined | Error | string, base64: string, mimeType: string) => void`

#### <a name="writefile64_w"></a>`writeFile64(adapter, fileName, data64, options, callback?)`
Write a file into ioBroker DB as base64 string
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `data64` *string*: file content as base64 string
* `options` *{mode?: number} | ((error: null | undefined | Error | string) => void)*: optional `{mode: 0x0644}`
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="writefile_w"></a>`writeFile(adapter, fileName, data, options, callback?)`
Write a file into ioBroker DB as text
This function is overloaded in admin (because admin accepts only base64)
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `data` *string*: file content as text
* `options` *{mode?: number} | ((error: null | undefined | Error | string) => void)*: optional `{mode: 0x0644}`
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="unlink_w"></a>`unlink(adapter, name, callback)`
Delete file in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="deletefile_w"></a>`deleteFile(adapter, name, callback)`
Delete a file in ioBroker DB (same as "unlink", but only for files)
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="deletefolder_w"></a>`deleteFolder(adapter, name, callback)`
Delete folder in ioBroker DB (same as `unlink`, but only for folders)
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: folder name, e.g. `main`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="renamefile_w"></a>`renameFile(adapter, oldName, newName, callback)`
Rename a file in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `oldName` *string*: current file name, e.g. `main/vis-views.json`
* `newName` *string*: new file name, e.g. `main/vis-views-new.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="rename_w"></a>`rename(adapter, oldName, newName, callback)`
Rename file or folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `oldName` *string*: current file name, e.g. `main/vis-views.json`
* `newName` *string*: new file name, e.g. `main/vis-views-new.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="mkdir_w"></a>`mkdir(adapter, dirName, callback)`
Create a folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `dirName` *string*: desired folder name, e.g. `main`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="readdir_w"></a>`readDir(adapter, dirName, options, callback?)`
Read content of folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `dirName` *string*: folder name, e.g. `main`
* `options` *object | ((error: null | undefined | Error | string, files: ioBroker.ReadDirResult[]) => void)*: for future use
* `callback?` *(error: null | undefined | Error | string, files: ioBroker.ReadDirResult[]) => void*: Callback `(error: null | undefined | Error | string, files: Array<{file: string, isDir: boolean, stats: {size: number}, modifiedAt: number, acl: {owner: string, ownerGroup: string, permissions: number, read: boolean, write: boolean}}>) => void`

#### <a name="chmodfile_w"></a>`chmodFile(adapter, fileName, options, callback?)`
Change a file mode in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `options` *{mode?: number}*: options `{mode: 0x644}`
* `callback?` *(error: string | Error | null | undefined) => void*: Callback `(error: string | Error | null | undefined) => void`

#### <a name="chownfile_w"></a>`chownFile(adapter, fileName, options, callback?)`
Change file owner in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `options` *{owner: `system.user.${string}`; ownerGroup?: `system.group.${string}`}*: options `{owner: 'system.user.user', ownerGroup: 'system.group.administrator'}` or `system.user.user`. If ownerGroup is not defined, it will be taken from owner.
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="fileexists_w"></a>`fileExists(adapter, fileName, callback)`
Check if the file or folder exists in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, exists?: boolean) => void) => void*: Callback `(error: null | undefined | Error | string, exists?: boolean) => void`

#### <a name="subscribefiles_w"></a>`subscribeFiles(id, pattern, callback)`
Subscribe to file changes in ioBroker DB
* `id` *string*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* `pattern` *string | string[]*: file name pattern, e.g. `main/*.json` or array of names
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="unsubscribefiles_w"></a>`unsubscribeFiles(id, pattern, callback)`
Unsubscribe from file changes in ioBroker DB
* `id` *string*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* `pattern` *string | string[]*: file name pattern, e.g. `main/*.json` or array of names
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

<!-- WEB_METHODS_END -->

## Admin Methods
<!-- ADMIN_METHODS_START -->
### List of commands
* [`authenticate`](#authenticate_a)
* [`error`](#error_a)
* [`log`](#log_a)
* [`checkFeatureSupported`](#checkfeaturesupported_a)
* [`getHistory`](#gethistory_a)
* [`httpGet`](#httpget_a)
* [`sendTo`](#sendto_a)
* [`sendToHost`](#sendtohost_a)
* [`authEnabled`](#authenabled_a)
* [`logout`](#logout_a)
* [`listPermissions`](#listpermissions_a)
* [`getUserPermissions`](#getuserpermissions_a)
* [`getVersion`](#getversion_a)
* [`getAdapterName`](#getadaptername_a)
* [`clientSubscribe`](#clientsubscribe_a)
* [`clientUnsubscribe`](#clientunsubscribe_a)
* [`getAdapterInstances`](#getadapterinstances_a)
* [`getHostByIp`](#gethostbyip_a)
* [`requireLog`](#requirelog_a)
* [`readLogs`](#readlogs_a)
* [`cmdExec`](#cmdexec_a)
* [`eventsThreshold`](#eventsthreshold_a)
* [`getRatings`](#getratings_a)
* [`getCurrentInstance`](#getcurrentinstance_a)
* [`decrypt`](#decrypt_a)
* [`encrypt`](#encrypt_a)
* [`getIsEasyModeStrict`](#getiseasymodestrict_a)
* [`getEasyMode`](#geteasymode_a)
* [`getAdapters`](#getadapters_a)
* [`updateLicenses`](#updatelicenses_a)
* [`getCompactInstances`](#getcompactinstances_a)
* [`getCompactAdapters`](#getcompactadapters_a)
* [`getCompactInstalled`](#getcompactinstalled_a)
* [`getCompactSystemConfig`](#getcompactsystemconfig_a)
* [`getCompactSystemRepositories`](#getcompactsystemrepositories_a)
* [`getCompactRepository`](#getcompactrepository_a)
* [`getCompactHosts`](#getcompacthosts_a)
* [`delState`](#delstate_a)
* [`getStates`](#getstates_a)
* [`getForeignStates`](#getforeignstates_a)
* [`getState`](#getstate_a)
* [`setState`](#setstate_a)
* [`getBinaryState`](#getbinarystate_a)
* [`setBinaryState`](#setbinarystate_a)
* [`subscribe`](#subscribe_a)
* [`subscribeStates`](#subscribestates_a)
* [`unsubscribe`](#unsubscribe_a)
* [`unsubscribeStates`](#unsubscribestates_a)
* [`addUser`](#adduser_a)
* [`delUser`](#deluser_a)
* [`addGroup`](#addgroup_a)
* [`delGroup`](#delgroup_a)
* [`changePassword`](#changepassword_a)
* [`getObject`](#getobject_a)
* [`getObjects`](#getobjects_a)
* [`subscribeObjects`](#subscribeobjects_a)
* [`unsubscribeObjects`](#unsubscribeobjects_a)
* [`getObjectView`](#getobjectview_a)
* [`setObject`](#setobject_a)
* [`delObject`](#delobject_a)
* [`getAllObjects`](#getallobjects_a)
* [`extendObject`](#extendobject_a)
* [`getForeignObjects`](#getforeignobjects_a)
* [`delObjects`](#delobjects_a)
* [`readFile`](#readfile_a)
* [`readFile64`](#readfile64_a)
* [`writeFile64`](#writefile64_a)
* [`writeFile`](#writefile_a)
* [`unlink`](#unlink_a)
* [`deleteFile`](#deletefile_a)
* [`deleteFolder`](#deletefolder_a)
* [`renameFile`](#renamefile_a)
* [`rename`](#rename_a)
* [`mkdir`](#mkdir_a)
* [`readDir`](#readdir_a)
* [`chmodFile`](#chmodfile_a)
* [`chownFile`](#chownfile_a)
* [`fileExists`](#fileexists_a)
* [`subscribeFiles`](#subscribefiles_a)
* [`unsubscribeFiles`](#unsubscribefiles_a)
### Commands
#### <a name="authenticate_a"></a>`authenticate(callback)`
Wait till the user is authenticated.
As the user authenticates himself, the callback will be called
* `callback` *(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void) => void*: Callback `(isUserAuthenticated: boolean, isAuthenticationUsed: boolean) => void`

#### <a name="error_a"></a>`error(error)`
Write error into ioBroker log
* `error` *Error | string*: Error object or error text

#### <a name="log_a"></a>`log(text, level)`
Write log entry into ioBroker log
* `text` *string*: log text
* `level` *ioBroker.LogLevel*: one of `['silly', 'debug', 'info', 'warn', 'error']`. Default is 'debug'.

#### <a name="checkfeaturesupported_a"></a>`checkFeatureSupported(feature, callback)`
Check if the same feature is supported by the current js-controller
* `feature` *SupportedFeature*: feature name like `CONTROLLER_LICENSE_MANAGER`
* `callback` *(error: string | Error | null | undefined, isSupported?: boolean) => void) => void*: callback `(error: string | Error | null | undefined, isSupported: boolean) => void`

#### <a name="gethistory_a"></a>`getHistory(id, options, callback)`
Get history data from specific instance
* `id` *string*: object ID
* `options` *ioBroker.GetHistoryOptions*: History options
* `callback` *(error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void) => void*: callback `(error: string | Error | null | undefined, result: ioBroker.GetHistoryResult) => void`

#### <a name="httpget_a"></a>`httpGet(url, callback)`
Read content of HTTP(s) page server-side (without CORS and stuff)
* `url` *string*: Page URL
* `callback` *(error: Error | null | undefined | string, result?: {status: number; statusText: string}, data?: string) => void*: callback `(error: Error | null, result?: { status: number; statusText: string }, data?: string) => void`

#### <a name="sendto_a"></a>`sendTo(adapterInstance, command, message, callback)`
Send the message to specific instance
* `adapterInstance` *string*: instance name, e.g. `history.0`
* `command` *string*: command name
* `message` *any*: the message is instance-dependent
* `callback` *(result: any) => void) => void*: callback `(result: any) => void`

#### <a name="sendtohost_a"></a>`sendToHost(host, command, message, callback)`
Send a message to the specific host.
Host can answer to the following commands: `cmdExec, getRepository, getInstalled, getInstalledAdapter, getVersion, getDiagData, getLocationOnDisk, getDevList, getLogs, getHostInfo, delLogs, readDirAsZip, writeDirAsZip, readObjectsAsZip, writeObjectsAsZip, checkLogging, updateMultihost`.
* `host` *string*: Host name. With or without 'system.host.' prefix
* `command` * 'shell' | 'cmdExec' | 'getRepository' | 'getInstalled' | 'getInstalledAdapter' | 'getVersion' | 'getDiagData' | 'getLocationOnDisk' | 'getDevList' | 'getLogs' | 'getLogFile' | 'getLogFiles' | 'getHostInfo' | 'getHostInfoShort' | 'delLogs' | 'readDirAsZip' | 'writeDirAsZip' | 'readObjectsAsZip' | 'writeObjectsAsZip' | 'checkLogging' | 'updateMultihost' | 'upgradeController' | 'upgradeAdapterWithWebserver' | 'getInterfaces' | 'upload' | 'rebuildAdapter' | 'readBaseSettings' | 'writeBaseSettings' | 'addNotification' | 'clearNotifications' | 'getNotifications' | 'updateLicenses' | 'upgradeOsPackages' | 'restartController' | 'sendToSentry'*: Host command
* `message` *any*: the message is command-specific
* `callback` *(result: {error?: string; result?: any}) => void) => void*: callback `(result: { error?: string; result?: any }) => void`

#### <a name="authenabled_a"></a>`authEnabled(callback)`
Ask server is authentication enabled, and if the user authenticated
* `callback` *(isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void) => void*: callback `(isUserAuthenticated: boolean | Error | string, isAuthenticationUsed: boolean) => void`

#### <a name="logout_a"></a>`logout(callback)`
Logout user
* `callback` *ioBroker.ErrorCallback*: callback `(error?: Error) => void`

#### <a name="listpermissions_a"></a>`listPermissions(callback)`
List commands and permissions
* `callback` *(permissions: Record< string, {type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: SocketOperation} >) => void*: callback `(permissions: Record<string, { type: 'object' | 'state' | 'users' | 'other' | 'file' | ''; operation: SocketOperation }>) => void`

#### <a name="getuserpermissions_a"></a>`getUserPermissions(callback)`
Get user permissions
* `callback` *(error: string | null | undefined, userPermissions?: SocketACL | null) => void) => void*: callback `(error: string | null | undefined, userPermissions?: SocketACL | null) => void`

#### <a name="getversion_a"></a>`getVersion(callback)`
Get the adapter version. Not the socket-classes version!
* `callback` *(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void*: callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`

#### <a name="getadaptername_a"></a>`getAdapterName(callback)`
Get adapter name: "iobroker.ws", "iobroker.socketio", "iobroker.web", "iobroker.admin"
* `callback` *(error: string | Error | null | undefined, adapterName: string) => void) => void*: callback `(error: string | Error | null | undefined, version: string | undefined, adapterName: string) => void`

#### <a name="clientsubscribe_a"></a>`clientSubscribe(targetInstance, messageType, data, callback)`
Client subscribes to specific instance's messages.
Client informs specific instance about subscription on its messages.
After subscription, the socket will receive "im" messages from desired instance
The target instance MUST acknowledge the subscription and return result
* `targetInstance` *string*: Instance name, e.g., 'cameras.0'
* `messageType` *string*: Message type, e.g., 'startRecording/cam1'
* `data` *any*: Optional data object, e.g., {width: 640, height: 480}
* `callback` *(error: string | null | Error | undefined, result?: {accepted: boolean; heartbeat?: number; error?: string}) => void*: Callback `(error: string | null, result?:{ accepted: boolean; heartbeat?: number; error?: string; }) => void`

#### <a name="clientunsubscribe_a"></a>`clientUnsubscribe(targetInstance, messageType, callback)`
Client unsubscribes from specific instance's messages.
The target instance MUST NOT acknowledge the un-subscription
* `targetInstance` *string*: Instance name, e.g., 'cameras.0'
* `messageType` *string*: Message type, e.g., 'startRecording/cam1'
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="getadapterinstances_a"></a>`getAdapterInstances(adapterName, callback)`
Read all instances of the given adapter, or all instances of all adapters if adapterName is not defined
* `adapterName` *string | undefined*: adapter name, e.g. `history`. To get all instances of all adapters just place here "".
* `callback` *(error: null | undefined | Error | string, instanceList?: ioBroker.InstanceObject[]) => void) => void*: callback `(error: null | undefined | Error | string, instanceList?: ioBroker.InstanceObject[]) => void`

### Admin
#### <a name="gethostbyip_a"></a>`getHostByIp(ip, callback?)`
Read the host object by IP address.
* `ip` *string*: - IP address, e.g., `192.168.1.1`. IPv4 or IPv6
* `callback?` *(error: string | null | Error | undefined, hostObject?: ioBroker.HostObject | null) => void*: - Callback function `(ip: string, obj: ioBroker.HostObject | null) => void`

#### <a name="requirelog_a"></a>`requireLog(isEnabled, callback?)`
Activate or deactivate logging events. Events will be sent to the socket as `log` event. Adapter must have `common.logTransporter = true`.
* `isEnabled` *boolean*: - Is logging enabled
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="readlogs_a"></a>`readLogs(host, callback?)`
Get the log files from the given host.
* `host` *string*: - Host ID, e.g., `system.host.raspberrypi`
* `callback?` *(error: string | null | Error | undefined, list?: {fileName: string; size: number}[]) => void*: - Callback function `(error: string | null, list?: { fileName: string; size: number }[]) => void`

#### <a name="cmdexec_a"></a>`cmdExec(host, id, cmd, callback?)`
Execute the shell command on host/controller.
Following response commands are expected: `cmdStdout`, `cmdStderr`, `cmdExit`.
* `host` *string*: - Host name, e.g., `system.host.raspberrypi`
* `id` *number*: - Session ID, e.g., `Date.now()`. This session ID will come in events `cmdStdout`, `cmdStderr`, `cmdExit`
* `cmd` *string*: - Command to execute
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="eventsthreshold_a"></a>`eventsThreshold(isActive)`
Enable or disable the event threshold. Used only for admin to limit the number of events to the front-end.
* `isActive` *boolean*: - If true, then events will be limited

#### <a name="getratings_a"></a>`getRatings(update, callback?)`
Get the ratings of adapters.
* `update` *boolean | ((error: string | null | Error | undefined, ratings?: Ratings) => void)*: - If true, the ratings will be read from the central server, if false from the local cache
* `callback?` *(error: string | null | Error | undefined, ratings?: Ratings) => void*: - Callback function `(error: string | null, ratings?: Ratings) => void`

#### <a name="getcurrentinstance_a"></a>`getCurrentInstance(callback)`
Get the current instance name, like "admin.0"
* `callback` *(error: string | null | Error | undefined, namespace: string) => void) => void*: - Callback function `(error: string | null, namespace?: string) => void`

#### <a name="decrypt_a"></a>`decrypt(encryptedText, callback)`
Decrypts text with the system secret key.
* `encryptedText` *string*: - Encrypted text
* `callback` *(error: string | null | Error | undefined, decryptedText?: string) => void) => void*: - Callback function `(error: string | null, decryptedText?: string) => void`

#### <a name="encrypt_a"></a>`encrypt(plainText, callback)`
Encrypts text with the system secret key.
* `plainText` *string*: - Plain text to encrypt
* `callback` *(error: string | null | Error | undefined, encryptedText?: string) => void) => void*: - Callback function `(error: string | null, encryptedText?: string) => void`

#### <a name="getiseasymodestrict_a"></a>`getIsEasyModeStrict(callback)`
Get if the admin has easy mode enabled.
* `callback` *(error: string | null | Error | undefined, isEasyModeStrict?: boolean) => void) => void*: - Callback function `(error: string | null, isEasyModeStrict?: boolean) => void`

#### <a name="geteasymode_a"></a>`getEasyMode(callback)`
Get easy mode configuration.
* `callback` *(error: string | null | Error | undefined, easyModeConfig?: {strict: boolean; configs: InstanceConfig[]}) => void*: - Callback function `(error: string | null, easyModeConfig?: { strict: boolean; configs: InstanceConfig[] }) => void`

#### <a name="getadapters_a"></a>`getAdapters(adapterName, callback)`
Get all adapter as objects.
* `adapterName` *string*: - Optional adapter name
* `callback` *(error: string | null | Error | undefined, result?: ioBroker.AdapterObject[]) => void) => void*: - Callback function `(error: string | null, results?: ioBroker.Object[]) => void`

#### <a name="updatelicenses_a"></a>`updateLicenses(login, password, callback)`
Read software licenses (vis, knx, ...) from ioBroker.net cloud for given user
* `login` *string*: - Cloud login
* `password` *string*: - Cloud password
* `callback` *(error: string | null | Error | undefined, result?: License[]) => void) => void*: - Callback function `(error: string | null, results?: License[]) => void`

#### <a name="getcompactinstances_a"></a>`getCompactInstances(callback)`
Get all instances in a compact form to save bandwidth.
* `callback` *(error: string | null | Error | undefined, result?: Record<string, CompactInstanceInfo>) => void) => void*: - Callback function `(error: string | null, results?: Record<string, { adminTab: boolean; name: string; icon: string; enabled: boolean }>) => void`

#### <a name="getcompactadapters_a"></a>`getCompactAdapters(callback)`
Get all adapters in a compact form to save bandwidth.
* `callback` *(error: string | null | Error | undefined, result?: Record<string, CompactAdapterInfo>) => void) => void*: - Callback function `(error: string | null, results?: Record<string, { icon: string; v: string; iv: string }>) => void`

#### <a name="getcompactinstalled_a"></a>`getCompactInstalled(host, callback)`
Get all installed adapters in a compact form to save bandwidth.
* `host` *string*: - Host name, e.g., `system.host.raspberrypi`
* `callback` *(result?: Record<string, {version: string}>) => void) => void*: - Callback function `(error: string | null, results?: Record<string, { version: string }>) => void`

#### <a name="getcompactsystemconfig_a"></a>`getCompactSystemConfig(callback)`
Get the system configuration in a compact form to save bandwidth.
* `callback` *(error: string | null | Error | undefined, systemConfig?: {common: ioBroker.SystemConfigCommon; native?: {secret: string}}) => void*: - Callback function `(error: string | null, systemConfig?: { common: any; native?: { secret: string } }) => void`

#### <a name="getcompactsystemrepositories_a"></a>`getCompactSystemRepositories(callback)`
Get system repositories in a compact form to save bandwidth.
* `callback` *(error: string | null | Error | undefined, systemRepositories?: CompactSystemRepository) => void) => void*: - Callback function `(error: string | null, systemRepositories?: { common: any; native?: { repositories: Record<string, { json: { _repoInfo: any } } } } }) => void`

#### <a name="getcompactrepository_a"></a>`getCompactRepository(host, callback)`
Get the repository in a compact form to save bandwidth.
* `host` *string*: - Host name, e.g., `system.host.raspberrypi`
* `callback` *(result: Record<string, {version: string; icon?: string}>) => void) => void*: - Callback function `(error: string | null, results?: Record<string, { version: string; icon?: string }>) => void`

#### <a name="getcompacthosts_a"></a>`getCompactHosts(callback)`
Get all hosts in a compact form to save bandwidth.
* `callback` *(error: string | null | Error | undefined, hosts?: CompactHost[]) => void) => void*: - Callback function `(error: string | null, results?: Record<string, { common: { name: string; icon: string; color: string; installedVersion: string }; native: { hardware: { networkInterfaces: any[] } } }>) => void`

### States
#### <a name="delstate_a"></a>`delState(id, callback?)`
Delete a state. The corresponding object will be deleted too.
* `id` *string*: - State ID
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="getstates_a"></a>`getStates(pattern, callback)`
Get states by pattern of current adapter
* `pattern` *string | string[] | undefined*: optional pattern, like `system.adapter.*` or array of state IDs. If the pattern is omitted, you will get ALL states of current adapter
* `callback` *(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void) => void*: callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`

#### <a name="getforeignstates_a"></a>`getForeignStates(pattern, callback)`
Same as getStates
* `pattern` *string | string[]*: pattern like `system.adapter.*` or array of state IDs
* `callback` *(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void) => void*: callback `(error: null | undefined | Error | string, states?: Record<string, ioBroker.State>) => void`

#### <a name="getstate_a"></a>`getState(id, callback)`
Get a state by ID
* `id` *string*: State ID, e.g. `system.adapter.admin.0.memRss`
* `callback` *(error: null | undefined | Error | string, state?: ioBroker.State) => void) => void*: Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`

#### <a name="setstate_a"></a>`setState(id, state, callback)`
Set a state by ID
* `id` *string*: State ID, e.g. `system.adapter.admin.0.memRss`
* `state` *ioBroker.SettableState*: State value or object, e.g. `{val: 123, ack: true}`
* `callback` *(error: null | undefined | Error | string, state?: ioBroker.State) => void) => void*: Callback `(error: null | undefined | Error | string, state?: ioBroker.State) => void`

#### <a name="getbinarystate_a"></a>`getBinaryState(id, callback)`
Get a binary state by ID
* `id` *string*: State ID, e.g. `javascript.0.binary`
* `callback` *(error: null | undefined | Error | string, base64?: string) => void) => void*: Callback `(error: null | undefined | Error | string, base64?: string) => void`

#### <a name="setbinarystate_a"></a>`setBinaryState(id, _base64, callback)`
Set a binary state by ID
* `id` *string*: State ID, e.g. `javascript.0.binary`
* `_base64` *string*: State value as base64 string. Binary states have no acknowledged flag.
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="subscribe_a"></a>`subscribe(pattern, callback)`
Subscribe to state changes by pattern.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="subscribestates_a"></a>`subscribeStates(pattern, callback)`
Subscribe to state changes by pattern. Same as `subscribe`.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribe_a"></a>`unsubscribe(pattern, callback)`
Unsubscribe from state changes by pattern.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribestates_a"></a>`unsubscribeStates(pattern, callback)`
Unsubscribe from state changes by pattern. Same as `unsubscribe`.
The events will come as 'stateChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of states like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null) => void) => void*: Callback `(error: string | null) => void`

### Users
#### <a name="adduser_a"></a>`addUser(user, pass, callback?)`
Add a new user.
* `user` *string*: - User name, e.g., `benjamin`
* `pass` *string*: - User password
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="deluser_a"></a>`delUser(user, callback?)`
Delete an existing user. Admin cannot be deleted.
* `user` *string*: - User name, e.g., `benjamin`
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="addgroup_a"></a>`addGroup(group, desc, acl, callback?)`
Add a new group.
* `group` *string*: - Group name, e.g., `users`
* `desc` *ioBroker.StringOrTranslated | null*: - Optional description
* `acl` *Omit<ioBroker.PermissionSet, 'user' | 'groups'> | null*: - Optional access control list object, e.g., `{"object":{"list":true,"read":true,"write":false,"delete":false},"state":{"list":true,"read":true,"write":true,"create":true,"delete":false},"users":{"list":true,"read":true,"write":false,"create":false,"delete":false},"other":{"execute":false,"http":true,"sendto":false},"file":{"list":true,"read":true,"write":false,"create":false,"delete":false}}`
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="delgroup_a"></a>`delGroup(group, callback?)`
Delete an existing group. Administrator group cannot be deleted.
* `group` *string*: - Group name, e.g., `users`
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="changepassword_a"></a>`changePassword(user, pass, callback?)`
Change user password.
* `user` *string*: - User name, e.g., `benjamin`
* `pass` *string*: - New password
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

### Objects
#### <a name="getobject_a"></a>`getObject(id, callback)`
Get one object.
* `id` *string*: Object ID
* `callback` *(error: Error | undefined | string | null, obj?: ioBroker.Object) => void) => void*: Callback `(error: string | null, obj?: ioBroker.Object) => void`

#### <a name="getobjects_a"></a>`getObjects(list, callback)`
Get all objects that are relevant for web: all states and enums with rooms.
This is non-admin version of "all objects" and will be overloaded in admin
* `list` *string[] | null*: Optional list of IDs
* `callback` *(error: Error | undefined | string | null, objs?: Record<string, ioBroker.Object>) => void) => void*: Callback `(error: string | null, objs?: Record<string, ioBroker.Object>) => void`

#### <a name="subscribeobjects_a"></a>`subscribeObjects(pattern, callback)`
Subscribe to object changes by pattern. The events will come as 'objectChange' events to the socket.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of IDs like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: Error | undefined | string | null) => void) => void*: Callback `(error: string | null) => void`

#### <a name="unsubscribeobjects_a"></a>`unsubscribeObjects(pattern, callback)`
Unsubscribe from object changes by pattern.
* `pattern` *string | string[]*: Pattern like `system.adapter.*` or array of IDs like `['system.adapter.admin.0.memRss', 'system.adapter.admin.0.memHeapTotal']`
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="getobjectview_a"></a>`getObjectView(design, search, params, callback)`
Get a view of objects. Make a query to the object database.
* `design` *string*: Design name, e.g., 'system' or other designs like `custom`, but it must exist object `_design/custom`. To 99,9% use `system`.
* `search` *string*: Search name, object type, like `state`, `instance`, `adapter`, `host`, ...
* `params` *{startkey?: string; endkey?: string; depth?: number}*: Parameters for the query, e.g., `{startkey: 'system.adapter.', endkey: 'system.adapter.\u9999', depth?: number}`
* `callback` *(error: string | null | Error | undefined, result?: {rows: {id: string; value: ioBroker.Object & {virtual: boolean; hasChildren: number;};}[];}) => void*: Callback `(error: string | null, result?: { rows: Array<GetObjectViewItem>) => void`

#### <a name="setobject_a"></a>`setObject(id, obj, callback)`
Set an object.
* `id` *string*: Object ID
* `obj` *ioBroker.Object*: Object to set
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="delobject_a"></a>`delObject(id, _options, callback)`
Delete an object. Only deletion of flot and fullcalendar objects is allowed
* `id` *string*: Object ID, like 'flot.0.myChart'
* `_options` *any*: Options for deletion. Ignored
* `callback` *(error: string | null | Error | undefined) => void) => void*: Callback `(error: string | null) => void`

#### <a name="getallobjects_a"></a>`getAllObjects(callback)`
Read absolutely all objects.
* `callback` *(error: null | undefined | Error | string, result?: Record<string, ioBroker.Object>) => void) => void*: - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`

#### <a name="extendobject_a"></a>`extendObject(id, obj, callback?)`
Extend the existing object.
* `id` *string*: - Object ID
* `obj` *Partial<ioBroker.Object>*: - New parts of the object, e.g., `{common: {name: 'new name'}}`
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

#### <a name="getforeignobjects_a"></a>`getForeignObjects(pattern, type, callback?)`
Read objects by pattern.
* `pattern` *string*: - Pattern like `system.adapter.admin.0.*`
* `type` * ioBroker.ObjectType | undefined | ((error: string | null | Error | undefined, objects?: Record<string, ioBroker.Object>) => void)*: - Type of objects to delete, like `state`, `channel`, `device`, `host`, `adapter`. Default - `state`
* `callback?` *(error: string | null | Error | undefined, objects?: Record<string, ioBroker.Object>) => void*: - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`

#### <a name="delobjects_a"></a>`delObjects(id, options?, callback?)`
Delete an object or objects recursively.
Objects with `dontDelete` cannot be deleted.
Same as `delObject` but with `recursive: true`.
* `id` *string*: - Object ID, like 'adapterName.0.channel'
* `options?` *ioBroker.DelObjectOptions | ((error: string | null | Error | undefined) => void) | null*: - Options for deletion.
* `callback?` *(error: string | null | Error | undefined) => void*: - Callback function `(error: string | null) => void`

### Files
#### <a name="readfile_a"></a>`readFile(adapter, fileName, callback)`
Read a file from ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, data: Buffer | string, mimeType: string) => void) => void*: Callback `(error: null | undefined | Error | string, data: Buffer | string, mimeType: string) => void`

#### <a name="readfile64_a"></a>`readFile64(adapter, fileName, callback)`
Read a file from ioBroker DB as base64 string
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, base64?: string, mimeType?: string) => void) => void*: Callback `(error: null | undefined | Error | string, base64: string, mimeType: string) => void`

#### <a name="writefile64_a"></a>`writeFile64(adapter, fileName, data64, options, callback?)`
Write a file into ioBroker DB as base64 string
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `data64` *string*: file content as base64 string
* `options` *{mode?: number} | ((error: null | undefined | Error | string) => void)*: optional `{mode: 0x0644}`
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="writefile_a"></a>`writeFile(adapter, fileName, data, options, callback?)`
Write a file into ioBroker DB as text
This function is overloaded in admin (because admin accepts only base64)
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `data` *string*: file content as text
* `options` *{mode?: number} | ((error: null | undefined | Error | string) => void)*: optional `{mode: 0x0644}`
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="unlink_a"></a>`unlink(adapter, name, callback)`
Delete file in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="deletefile_a"></a>`deleteFile(adapter, name, callback)`
Delete a file in ioBroker DB (same as "unlink", but only for files)
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="deletefolder_a"></a>`deleteFolder(adapter, name, callback)`
Delete folder in ioBroker DB (same as `unlink`, but only for folders)
* `adapter` *string*: instance name, e.g. `vis.0`
* `name` *string*: folder name, e.g. `main`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="renamefile_a"></a>`renameFile(adapter, oldName, newName, callback)`
Rename a file in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `oldName` *string*: current file name, e.g. `main/vis-views.json`
* `newName` *string*: new file name, e.g. `main/vis-views-new.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="rename_a"></a>`rename(adapter, oldName, newName, callback)`
Rename file or folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `oldName` *string*: current file name, e.g. `main/vis-views.json`
* `newName` *string*: new file name, e.g. `main/vis-views-new.json`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="mkdir_a"></a>`mkdir(adapter, dirName, callback)`
Create a folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `dirName` *string*: desired folder name, e.g. `main`
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="readdir_a"></a>`readDir(adapter, dirName, options, callback?)`
Read content of folder in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `dirName` *string*: folder name, e.g. `main`
* `options` *object | ((error: null | undefined | Error | string, files: ioBroker.ReadDirResult[]) => void)*: for future use
* `callback?` *(error: null | undefined | Error | string, files: ioBroker.ReadDirResult[]) => void*: Callback `(error: null | undefined | Error | string, files: Array<{file: string, isDir: boolean, stats: {size: number}, modifiedAt: number, acl: {owner: string, ownerGroup: string, permissions: number, read: boolean, write: boolean}}>) => void`

#### <a name="chmodfile_a"></a>`chmodFile(adapter, fileName, options, callback?)`
Change a file mode in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `options` *{mode?: number}*: options `{mode: 0x644}`
* `callback?` *(error: string | Error | null | undefined) => void*: Callback `(error: string | Error | null | undefined) => void`

#### <a name="chownfile_a"></a>`chownFile(adapter, fileName, options, callback?)`
Change file owner in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `options` *{owner: `system.user.${string}`; ownerGroup?: `system.group.${string}`}*: options `{owner: 'system.user.user', ownerGroup: 'system.group.administrator'}` or `system.user.user`. If ownerGroup is not defined, it will be taken from owner.
* `callback?` *(error: null | undefined | Error | string) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="fileexists_a"></a>`fileExists(adapter, fileName, callback)`
Check if the file or folder exists in ioBroker DB
* `adapter` *string*: instance name, e.g. `vis.0`
* `fileName` *string*: file name, e.g. `main/vis-views.json`
* `callback` *(error: null | undefined | Error | string, exists?: boolean) => void) => void*: Callback `(error: null | undefined | Error | string, exists?: boolean) => void`

#### <a name="subscribefiles_a"></a>`subscribeFiles(id, pattern, callback)`
Subscribe to file changes in ioBroker DB
* `id` *string*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* `pattern` *string | string[]*: file name pattern, e.g. `main/*.json` or array of names
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

#### <a name="unsubscribefiles_a"></a>`unsubscribeFiles(id, pattern, callback)`
Unsubscribe from file changes in ioBroker DB
* `id` *string*: instance name, e.g. `vis.0` or any object ID of type `meta`. `id` could have wildcards `*` too.
* `pattern` *string | string[]*: file name pattern, e.g. `main/*.json` or array of names
* `callback` *(error: null | undefined | Error | string) => void) => void*: Callback `(error: null | undefined | Error | string) => void`

<!-- ADMIN_METHODS_END -->

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

## Changelog
### **WORK IN PROGRESS**
* (@GermanBluefox) Code migrated to TypeScript

### 1.6.2 (2024-12-01)
* (@GermanBluefox) Caught the error if no authentication and logout called

### 1.6.1 (2024-10-05)
* (@GermanBluefox) Added support of iobroker.SocketIO with typescript

### 1.5.6 (2024-06-26)
* (@GermanBluefox) Corrected call of getObjectView with null parameter

### 1.5.5 (2024-06-26)
* (@GermanBluefox) updated packages

### 1.5.4 (2024-06-02)
* (@GermanBluefox) extend `getCompactInstances`method with version information

### 1.5.2 (2024-05-28)
* (foxriver76) ensure compatible `adapter-core` version

### 1.5.0 (2024-02-22)
* (@GermanBluefox) Extended getObjects function with the possibility to read the list of IDs in admin

### 1.4.6 (2023-10-19)
* (@GermanBluefox) Added `publishInstanceMessageAll` command

### 1.4.4 (2023-10-11)
* (@GermanBluefox) Caught errors by subscribe/unsubscribe

### 1.4.3 (2023-10-07)
* (foxriver76) do not await the subscribes anymore

### 1.4.2 (2023-09-28)
* (@GermanBluefox) Corrected error by unsubscribing on client disconnect

### 1.4.1 (2023-09-12)
* (foxriver76) do not cancel follow subscribes if one subscribe has an error

### 1.4.0 (2023-09-11)
* (foxriver76) fixed crash on invalid patterns with js-controller version 5

### 1.3.3 (2023-08-01)
* (@GermanBluefox) Implemented subscribing of a client on messages from specific instance
* (@GermanBluefox) Moved checkFeatureSupported to regular connection and not only admin

### 1.2.0 (2023-07-07)
* (foxriver76) fixed crash on invalid patterns with js-controller version 5
* (@GermanBluefox) extended the getObjects function with the possibility to read the list of IDs

### 1.1.5 (2023-03-13)
* (@GermanBluefox) Added command `name`

### 1.1.3 (2023-03-12)
* (@GermanBluefox) Treat `json5` as `json`

### 1.1.2 (2023-03-03)
* (@GermanBluefox) Allow deletion of fullcalendar objects

### 1.1.1 (2022-12-22)
* (@GermanBluefox) Corrected error with subscribe

### 1.1.0 (2022-12-22)
* (@GermanBluefox) Added user check to many commands
* (@GermanBluefox) Downgrade axios to 0.27.2

### 1.0.2 (2022-11-08)
* (@GermanBluefox) Function `getObjects`for web was extended by devices, channels and enums

### 1.0.1 (2022-10-10)
* (@GermanBluefox) Fixed error with delObject

### 0.5.5 (2022-10-09)
* (Apollon77) Prepare for future js-controller versions

### 0.5.4 (2022-09-23)
* (@GermanBluefox) Fixed error in `delObjects` method

### 0.5.3 (2022-08-24)
* (@GermanBluefox) Caught error by subscribing

### 0.5.2 (2022-08-19)
* (@GermanBluefox) Added command `getCompactSystemRepositories`

### 0.5.0 (2022-07-20)
* (@GermanBluefox) Buffer conversion errors caught and handled

### 0.4.12 (2022-07-08)
* (@GermanBluefox) Corrected getAdapterInstances method

### 0.4.11 (2022-07-05)
* (@GermanBluefox) Corrected log transportation

### 0.4.10 (2022-06-22)
* (@GermanBluefox) Corrected getAdapterInstances

### 0.4.9 (2022-06-20)
* (@GermanBluefox) Do not show error with failed authentication

### 0.4.7 (2022-06-20)
* (@GermanBluefox) Allowed overloading system language

### 0.4.6 (2022-06-20)
* (@GermanBluefox) updated `passport`

### 0.4.5 (2022-06-20)
* (@GermanBluefox) allowed running socket.io behind reverse proxy

### 0.4.4 (2022-06-09)
* (@GermanBluefox) Do not show requireLog message

### 0.4.3 (2022-06-03)
* (@GermanBluefox) Allowed call of getAdapterInstances for non admin

### 0.4.2 (2022-05-23)
* (@GermanBluefox) Corrected renameFile command for admin

### 0.4.1 (2022-05-23)
* (@GermanBluefox) Corrected changePassword command for admin

### 0.4.0 (2022-05-19)
* (@GermanBluefox) Added support of socket.io 4.x

### 0.3.2 (2022-05-19)
* (@GermanBluefox) Hide warn messages

### 0.3.1 (2022-05-16)
* (@GermanBluefox) Added back compatibility with js-controller@4.0  for `writeDirAsZip`

### 0.3.0 (2022-05-16)
* (@GermanBluefox) Process `writeDirAsZip` locally

### 0.2.1 (2022-05-12)
* (@GermanBluefox) fixed `getObjects` command

### 0.2.0 (2022-05-09)
* (@GermanBluefox) fixed `delObjects` command

### 0.1.10 (2022-05-09)
* (@GermanBluefox) Added support for fileChanges

### 0.1.9 (2022-05-07)
* (@GermanBluefox) Corrected readLogs command and implement file subscriptions

### 0.1.7 (2022-05-05)
* (@GermanBluefox) Caught some sentry errors

### 0.1.6 (2022-05-05)
* (@GermanBluefox) fixed `delObject` command

### 0.1.5 (2022-04-25)
* (@GermanBluefox) added updateRatings

### 0.1.4 (2022-04-24)
* (@GermanBluefox) added passportSocket

### 0.1.2 (2022-04-24)
* (@GermanBluefox) initial commit

## License
The MIT License (MIT)

Copyright (c) 2020-2025 @GermanBluefox <dogafox@gmail.com>

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
