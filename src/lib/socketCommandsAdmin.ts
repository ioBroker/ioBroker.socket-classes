import axios from 'axios';
import { normalize } from 'node:path';
import type os from 'node:os';
import { existsSync, readdirSync, lstatSync } from 'node:fs';

import type { tools } from '@iobroker/js-controller-common-db';
import { type Socket as WebSocketClient } from '@iobroker/ws-server';

import { type Ratings, SocketCommands, type SocketDataContext } from './socketCommands';
import type { CommandFile, SocketCallback } from '../types';

export interface InstanceConfig {
    id: string;
    title: ioBroker.StringOrTranslated | undefined;
    desc: ioBroker.StringOrTranslated | undefined;
    color: string | undefined;
    url: string;
    icon: string | undefined;
    materialize: boolean;
    jsonConfig: boolean;
    version: string;
    tab?: boolean;
    config?: boolean;
}

export interface CompactAdapterInfo {
    icon: ioBroker.AdapterCommon['icon'];
    v: ioBroker.AdapterCommon['version'];
    iv?: ioBroker.AdapterCommon['ignoreVersion'];
}

export type CompactSystemRepositoryEntry = {
    link: string;
    hash?: string;
    stable?: boolean;
    json:
        | {
              _repoInfo: {
                  stable?: boolean;
                  name?: ioBroker.StringOrTranslated;
              };
          }
        | null
        | undefined;
};

export type CompactSystemRepository = {
    _id: ioBroker.HostObject['_id'];
    common: {
        name: ioBroker.HostCommon['name'];
        dontDelete: boolean;
    };
    native: {
        repositories: Record<string, CompactSystemRepositoryEntry>;
    };
};

export interface License {
    id: string;
    product: string;
    time: number;
    uuid: string;
    validTill: string;
    version: string;
    usedBy: string;
    invoice: string;
    json: string;
}

export interface CompactInstanceInfo {
    adminTab: ioBroker.AdapterCommon['adminTab'];
    name: ioBroker.InstanceCommon['name'];
    icon: ioBroker.InstanceCommon['icon'];
    enabled: ioBroker.InstanceCommon['enabled'];
    version: ioBroker.InstanceCommon['version'];
}

export interface License {
    id: string;
    product: string;
    time: number;
    uuid: string;
    validTill: string;
    version: string;
    usedBy: string;
    json: string;
    invoice: string;
}

interface SocketAdapterSettings {
    language?: ioBroker.Languages;
    defaultUser?: string;
    ttl?: number | string;
    secure?: boolean;
    auth?: boolean;
    crossDomain?: boolean;
    whiteListSettings?: any;
    accessLimit?: any;
    accessAllowedConfigs?: string[];
    accessAllowedTabs?: string[];
    extensions?: (socket: WebSocketClient) => void;
}

export type CompactHost = {
    _id: ioBroker.HostObject['_id'];
    common: {
        name: ioBroker.HostCommon['name'];
        icon: ioBroker.HostCommon['icon'];
        color: string;
        installedVersion: ioBroker.HostCommon['installedVersion'];
    };
    native: {
        hardware: {
            networkInterfaces?: ioBroker.HostNative['hardware']['networkInterfaces'];
        };
    };
};

export interface AdminTab {
    name?: ioBroker.StringOrTranslated;
    /** Base 64 icon for the tab */
    icon?: string;
    /** @deprecated icon name for FontAwesome (works only in admin 4)*/
    'fa-icon'?: string;
    /** If true, the Tab is not reloaded when the configuration changes */
    ignoreConfigUpdate?: boolean;
    /** Which URL should be loaded in the tab. Supports placeholders like http://%ip%:%port% */
    link?: string;
    /** If true, only one instance of this tab will be created for all instances */
    singleton?: boolean;
    /** Order number in admin tabs */
    order?: number;
}

export interface RepoAdapterObject extends ioBroker.AdapterCommon {
    versionDate: string;
    controller?: boolean;
    stat?: number;
    node?: string;
    allowAdapterInstall?: boolean;
    allowAdapterUpdate?: boolean;
    allowAdapterDelete?: boolean;
    allowAdapterReadme?: boolean;
    allowAdapterRating?: boolean;
}
const ACL_READ = 4;
// const ACL_WRITE = 2;

/** Design document with the views these commands need. It is created and kept up to date on demand */
const ADMIN_DESIGN = 'admin';
/**
 * View behind `getObjectsCount`. Counting needs nothing of an object but its type, so the view emits
 * the type as the key and a zero as the value, and the database answers with a fraction of what the
 * objects themselves weigh: measured on 10,000 objects, 250 kB instead of 32 MB.
 */
const COUNT_TYPES_VIEW = "function(doc) { emit(doc.type || '', 0) }";

/**
 * How often the host is asked for the repository although the answer is not needed.
 *
 * The GUI is served from the objects in memory, but the host does more than answer: it sends the
 * statistics, checks for a new Docker image and for OS updates, applies the blocklist and upgrades
 * adapters automatically. All of that used to happen on every start of the GUI, because every start
 * asked for the repository. None of it needs to happen that often, and the answer carries the whole
 * repository through the message box, so it is asked once an hour.
 */
const REPO_SIDE_EFFECT_INTERVAL = 3_600_000;
/** How long that request waits, so it stays out of the way while the GUI is starting */
const REPO_SIDE_EFFECT_DELAY = 10_000;

/**
 * Reduces a repository to what the GUI needs: the version and the icon of every entry.
 *
 * Reading into `result` lets the caller merge the active repositories in their order, the later one
 * winning, exactly as the host merges them before it answers. Every key is kept, including the
 * pseudo entry `_repoInfo`, which has neither a version nor an icon and therefore stays an empty
 * object - as the GUI has always received it.
 *
 * @param source repository content, as the host sends it or as it is stored in `system.repositories`
 * @param result what to read into
 */
function toCompactRepository(
    source: Record<string, RepoAdapterObject> | null | undefined,
    result: Record<string, { version: string; icon?: string }> = {},
): Record<string, { version: string; icon?: string }> {
    if (source) {
        for (const name of Object.keys(source)) {
            result[name] = { version: source[name].version, icon: source[name].extIcon };
        }
    }
    return result;
}

export interface ObjectsCount {
    /** Number of all objects */
    total: number;
    /** Number of objects per type, e.g. `{ state: 8170, channel: 979 }` */
    byType: Record<string, number>;
}

export class SocketCommandsAdmin extends SocketCommands {
    static ALLOW_CACHE: string[] = [
        'getRepository',
        'getRepositoryCompact',
        'getInstalled',
        'getInstalledAdapter',
        'getVersion',
        'getDiagData',
        'getLocationOnDisk',
        'getDevList',
        'getLogs',
        'getHostInfo',
    ];

    public readonly states: Record<string, ioBroker.State> | undefined;

    private readonly objects: Record<string, ioBroker.Object> | undefined;
    private thresholdInterval: NodeJS.Timeout | null = null;
    private readonly cmdSessions: Record<string, any> = {};
    private eventsThreshold: {
        count: number;
        timeActivated: number;
        active: boolean;
        accidents: number;
        repeatSeconds: number; // how many seconds continuously must be number of events > value
        value: number; // shows how many events allowed in one check interval
        checkInterval: number; // duration of one check interval
    };
    private readonly cache: Record<string, { ts: number; res: string }> = {};
    private cacheGB: NodeJS.Timeout | null = null; // cache garbage collector
    private onThresholdChanged: ((on: boolean) => void) | null = null;
    private secret: string = '';
    /** When the host was last asked for the repository for the sake of its side effects, per host */
    private readonly lastRepoSideEffects: Record<string, number> = {};
    /** Pending requests of the above, per host */
    private readonly repoSideEffectTimers: Record<string, NodeJS.Timeout> = {};

    constructor(
        adapter: ioBroker.Adapter,
        updateSession?: (socket: WebSocketClient) => boolean,
        context?: SocketDataContext,
        objects?: Record<string, ioBroker.Object>,
        states?: Record<string, ioBroker.State>,
    ) {
        super(adapter, updateSession, context);

        this.objects = objects;
        this.states = states;

        this.eventsThreshold = {
            count: 0,
            timeActivated: 0,
            active: false,
            accidents: 0,
            repeatSeconds: 3, // how many seconds continuously must be number of events > value
            value: parseInt((adapter.config as any).thresholdValue, 10) || 200, // how many events allowed in one check interval
            checkInterval: 1000, // duration of one check interval
        };

        // do not send too many state updates
    }

    start(onThresholdChanged: ((on: boolean) => void) | null): void {
        // detect event bursts
        this.thresholdInterval = setInterval(() => {
            if (!this.eventsThreshold.active) {
                if (this.eventsThreshold.count > this.eventsThreshold.value) {
                    this.eventsThreshold.accidents++;

                    if (this.eventsThreshold.accidents >= this.eventsThreshold.repeatSeconds) {
                        this.#enableEventThreshold();
                    }
                } else {
                    this.eventsThreshold.accidents = 0;
                }
                this.eventsThreshold.count = 0;
            } else if (Date.now() - this.eventsThreshold.timeActivated > 60000) {
                this.disableEventThreshold();
            }
        }, this.eventsThreshold.checkInterval);

        this.onThresholdChanged = onThresholdChanged;
    }

    /**
     * Read a file with ratings from server
     *
     * @param uuid Unique ioBroker system identification
     * @param _isAutoUpdate not implemented
     */
    async updateRatings(uuid?: string, _isAutoUpdate?: boolean): Promise<Ratings | null> {
        let _uuid: string;
        if (!uuid) {
            const obj = await this.adapter.getForeignObjectAsync('system.meta.uuid');
            _uuid = obj?.native?.uuid || '';
        } else {
            _uuid = uuid;
        }

        try {
            const response = await axios.get(`https://rating.iobroker.net/rating?uuid=${_uuid}`, {
                timeout: 15000,
                validateStatus: status => status < 400,
            });
            this.context.ratings = response.data as Ratings;
            if (
                !this.context.ratings ||
                typeof this.context.ratings !== 'object' ||
                Array.isArray(this.context.ratings)
            ) {
                // @ts-expect-error exception
                this.context.ratings = { uuid: _uuid };
            } else {
                this.context.ratings.uuid = _uuid;
            }

            // auto update only in admin
            if (this.adapter.name === 'admin') {
                if (this.context.ratingTimeout) {
                    clearTimeout(this.context.ratingTimeout);
                }
                this.context.ratingTimeout = setTimeout(() => {
                    this.context.ratingTimeout = null;
                    void this.updateRatings(uuid).then(() => this.adapter.log.info('Adapter rating updated'));
                }, 24 * 3600000);
            }

            return this.context.ratings;
        } catch (error) {
            this.adapter.log.warn(
                `Cannot update rating: ${error.response ? error.response.data : error.message || error.code}`,
            );
            return null;
        }
    }

    async #readInstanceConfig(id: string, user: string, isTab: boolean, configs: InstanceConfig[]): Promise<void> {
        let obj: ioBroker.AdapterObject | null | undefined;
        try {
            obj = await this.adapter.getForeignObjectAsync<`system.adapter.${string}`>(`system.adapter.${id}`, {
                user,
            });
        } catch {
            // ignore
        }
        if (obj?.common) {
            const instance = id.split('.').pop();
            const config: InstanceConfig = {
                id,
                title: obj.common.titleLang || obj.common.title,
                desc: obj.common.desc,
                color: obj.common.color,
                url: '',
                icon: obj.common.icon,
                materialize: obj.common.materialize,
                // @ts-expect-error it is deprecated
                jsonConfig: obj.common.jsonConfig,
                version: obj.common.version,
            };
            if (obj.common.adminUI?.config === 'materialize') {
                config.materialize = true;
            } else if (obj.common.adminUI?.config === 'json') {
                config.jsonConfig = true;
            }
            config.url = `/adapter/${obj.common.name}/${isTab ? 'tab' : 'index'}${
                !isTab && config.materialize ? '_m' : ''
            }.html${instance ? `?${instance}` : ''}`;

            if (isTab) {
                config.tab = true;
            } else {
                config.config = true;
            }

            configs.push(config);
        }
    }

    protected _sendToHost: (
        host: string,
        command: string,
        message: any,
        callback: (result: { error?: string; result?: any }) => void,
    ) => void = (
        host: string,
        command: string,
        message: any,
        callback: (result: { error?: string; result?: any }) => void,
    ): void => {
        const hash = `${host}_${command}`;
        if (!message && SocketCommandsAdmin.ALLOW_CACHE.includes(command) && this.cache[hash]) {
            if (Date.now() - this.cache[hash].ts < 500) {
                if (typeof callback === 'function') {
                    setImmediate(data => callback(data), JSON.parse(this.cache[hash].res));
                }
                return;
            }
            delete this.cache[hash];
        }

        try {
            this.adapter.sendToHost(host, command, message, res => {
                if (!message && SocketCommandsAdmin.ALLOW_CACHE.includes(command)) {
                    this.cache[hash] = { ts: Date.now(), res: JSON.stringify(res) };

                    this.cacheGB ||= setInterval(() => {
                        const commands = Object.keys(this.cache);
                        commands.forEach(cmd => {
                            if (Date.now() - this.cache[cmd].ts > 500) {
                                delete this.cache[cmd];
                            }
                        });
                        if (!Object.keys(this.cache).length && this.cacheGB) {
                            clearInterval(this.cacheGB);
                            this.cacheGB = null;
                        }
                    }, 2000);
                }
                if (typeof callback === 'function') {
                    setImmediate(() => callback(res as { error?: string; result?: any }));
                }
            });
        } catch (error) {
            this.adapter.log.error(`[sendToHost] ERROR: ${error.toString()}`);
            if (typeof callback === 'function') {
                setImmediate(() => callback({ error }));
            }
        }
    };

    /**
     * Asks the host for the repository and answers with the compact form.
     *
     * A controller that has `getRepositoryCompact` reduces it itself, so the message box does not
     * have to carry the whole repository for two fields per adapter. An older one only knows
     * `getRepository` and is reduced here, as before.
     *
     * @param host host to ask, e.g. `system.host.raspberrypi`
     * @param callback answered with the compact repository
     */
    #askHostForRepository(
        host: string,
        callback: (result: Record<string, { version: string; icon?: string }>) => void,
    ): void {
        if (this.adapter.supportsFeature('CONTROLLER_REPOSITORY_COMPACT' as ioBroker.SupportedFeature)) {
            this._sendToHost(host, 'getRepositoryCompact', null, (data: any) =>
                callback((data as Record<string, { version: string; icon?: string }>) || {}),
            );
        } else {
            this._sendToHost(host, 'getRepository', null, (data: any) =>
                callback(toCompactRepository(data as Record<string, RepoAdapterObject>)),
            );
        }
    }

    /**
     * Builds the compact repository from the objects that admin keeps in memory.
     *
     * The host answers `getRepository` with the whole merged repository - several megabytes through
     * the message box, of which the GUI uses two fields per adapter. Admin already holds
     * `system.repositories` and keeps it up to date, so the same answer can be built here without
     * asking anybody.
     *
     * @returns the compact repository, or null if it cannot be built here and only the host can
     * answer - because there is no object cache, or because a repository was never downloaded
     */
    #compactRepositoryFromObjects(): Record<string, { version: string; icon?: string }> | null {
        // web and ws do not hand an object cache to these commands
        if (!this.objects) {
            return null;
        }

        const systemConfig = this.objects['system.config'] as ioBroker.SystemConfigObject | undefined;
        const systemRepos = this.objects['system.repositories'] as ioBroker.RepositoryObject | undefined;
        if (!systemConfig?.common || !systemRepos?.native?.repositories) {
            return null;
        }

        const activeRepo = systemConfig.common.activeRepo;
        const active = Array.isArray(activeRepo) ? activeRepo : activeRepo ? [activeRepo] : [];
        if (!active.length) {
            return null;
        }

        const result: Record<string, { version: string; icon?: string }> = {};
        for (const repoName of active) {
            const repo = systemRepos.native.repositories[repoName];
            // A repository that is missing here, that is still a plain link, or that was never
            // downloaded is something only the host can turn into content
            if (!repo || typeof repo === 'string' || !repo.json) {
                return null;
            }
            toCompactRepository(repo.json as unknown as Record<string, RepoAdapterObject>, result);
        }

        return result;
    }

    /**
     * Asks the host for the repository without waiting for the answer, at most once an hour and only
     * after a delay, so the side effects of that command keep happening without holding up the GUI.
     *
     * @param host host to ask, e.g. `system.host.raspberrypi`
     */
    #triggerRepositorySideEffects(host: string): void {
        if (
            this.repoSideEffectTimers[host] ||
            Date.now() - (this.lastRepoSideEffects[host] || 0) < REPO_SIDE_EFFECT_INTERVAL
        ) {
            return;
        }

        this.lastRepoSideEffects[host] = Date.now();
        this.repoSideEffectTimers[host] = setTimeout(() => {
            delete this.repoSideEffectTimers[host];
            this.adapter.log.debug(`Asking ${host} for the repository, only for the side effects`);
            this.#askHostForRepository(host, () => {
                // The answer is thrown away on purpose - see REPO_SIDE_EFFECT_INTERVAL
            });
        }, REPO_SIDE_EFFECT_DELAY);
    }

    /**
     * Makes sure the design document with the views of admin is in the objects database.
     *
     * The views of the controller all emit the whole object, so there is no way to count without
     * transferring everything. This one is owned by admin and can be written from here, which keeps
     * the counting independent of a release of js-controller.
     *
     * It is checked before every count instead of once: the read costs a millisecond or two against
     * the second the counting itself takes, and the document is written again if it went missing,
     * e.g. with a restored backup.
     */
    async #ensureAdminDesign(): Promise<void> {
        const id = `_design/${ADMIN_DESIGN}`;
        const obj = await this.adapter.getForeignObjectAsync(id);

        if (obj?.views?.countTypes?.map !== COUNT_TYPES_VIEW) {
            // other views of this document are left as they are, only the own one is written
            await this.adapter.setForeignObjectAsync(id, {
                ...obj,
                type: 'design',
                language: 'javascript',
                native: obj?.native || {},
                views: { ...obj?.views, countTypes: { map: COUNT_TYPES_VIEW } },
            });
            this.adapter.log.debug(`Wrote the view "${ADMIN_DESIGN}/countTypes" to count objects`);
        }
    }

    /**
     * Counts all objects and the objects of every type
     *
     * @param user user the count is read for, so the permissions of the database apply
     */
    async #countObjects(user: string | undefined): Promise<ObjectsCount> {
        await this.#ensureAdminDesign();

        const doc = await this.adapter.getObjectViewAsync(ADMIN_DESIGN, 'countTypes', null, { user });

        const byType: Record<string, number> = {};
        for (const row of doc?.rows || []) {
            // the view emits the type as the key, so the id of a row IS the type
            const type = row.id || '';
            byType[type] = (byType[type] || 0) + 1;
        }

        return { total: doc?.rows.length || 0, byType };
    }

    // remove this function when js.controller 4.x are mainstream
    async #readLicenses(login: string, password: string): Promise<License[]> {
        const config = {
            headers: { Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}` },
            timeout: 4000,
            validateStatus: (status: number) => status < 400,
        };

        try {
            const response = await axios.get(`https://iobroker.net:3001/api/v1/licenses`, config);

            if (response?.data?.length) {
                const now = Date.now();
                response.data = response.data.filter(
                    (license: { validTill: string }) =>
                        !license.validTill ||
                        license.validTill === '0000-00-00 00:00:00' ||
                        new Date(license.validTill).getTime() > now,
                );
            }
            return response.data;
        } catch (error) {
            if (error.response) {
                throw new Error(error.response.data?.error || error.response.data || error.response.status);
            }

            if (error.request) {
                throw new Error('no response');
            }

            throw error;
        }
    }

    // remove this function when js.controller 4.x is mainstream
    async #updateLicenses(login: string, password: string, options: { user: string }): Promise<License[]> {
        // if login and password provided in the message, just try to read without saving it in system.licenses
        if (login && password) {
            return this.#readLicenses(login, password);
        }
        // get actual object
        const systemLicenses = await this.adapter.getForeignObjectAsync('system.licenses', options);
        // If password and login exist
        if (systemLicenses?.native?.password && systemLicenses.native.login) {
            // get the secret to decode the password
            if (!this.secret) {
                const systemConfig: ioBroker.SystemConfigObject | null | undefined =
                    await this.adapter.getForeignObjectAsync('system.config', options);
                if (systemConfig?.native?.secret) {
                    this.secret = systemConfig.native.secret;
                }
            }
            // decode the password
            let password = '';
            try {
                password = this.adapter.decrypt(this.secret, systemLicenses.native.password);
            } catch {
                throw new Error('Cannot decode password');
            }
            try {
                const licenses: License[] = await this.#readLicenses(systemLicenses.native.login, password);
                // save licenses to system.licenses and remember the time
                // merge the information together
                const oldLicenses: License[] = systemLicenses.native.licenses || [];
                systemLicenses.native.licenses = licenses;
                oldLicenses.forEach(oldLicense => {
                    if (oldLicense.usedBy) {
                        const newLicense = licenses.find(item => item.json === oldLicense.json);
                        if (newLicense) {
                            newLicense.usedBy = oldLicense.usedBy;
                        }
                    }
                });

                systemLicenses.native.readTime = new Date().toISOString();

                // save only if an object changed
                await this.adapter.setForeignObjectAsync('system.licenses', systemLicenses, options);
                return licenses;
            } catch (error) {
                // if password is invalid
                if (
                    error.message.includes('Authentication required') ||
                    error.message.includes('Cannot decode password')
                ) {
                    // clear existing licenses if exist
                    if (systemLicenses?.native?.licenses?.length) {
                        systemLicenses.native.licenses = [];
                        systemLicenses.native.readTime = new Date().toISOString();
                        return this.adapter
                            .setForeignObjectAsync('system.licenses', systemLicenses, options)
                            .then(() => {
                                throw error;
                            });
                    }
                    throw error;
                } else {
                    throw error;
                }
            }
        } else {
            // if password or login are empty => clear existing licenses if exist
            if (systemLicenses?.native?.licenses?.length) {
                systemLicenses.native.licenses = [];
                systemLicenses.native.readTime = new Date().toISOString();
                return this.adapter.setForeignObjectAsync('system.licenses', systemLicenses, options).then(() => {
                    throw new Error('No password or login');
                });
            }
            throw new Error('No password or login');
        }
    }

    disableEventThreshold(): void {
        if (this.eventsThreshold.active) {
            this.eventsThreshold.accidents = 0;
            this.eventsThreshold.count = 0;
            this.eventsThreshold.active = false;
            this.eventsThreshold.timeActivated = 0;
            this.adapter.log.info('Subscribe to all states again');

            setTimeout(async () => {
                this.onThresholdChanged?.(false);
                try {
                    await this.adapter.unsubscribeForeignStatesAsync('system.adapter.*');
                } catch (e) {
                    this.adapter.log.error(`Cannot unsubscribe "system.adapter.*": ${e.message}`);
                }

                for (const pattern of Object.keys(this.subscribes.stateChange)) {
                    try {
                        await this.adapter.subscribeForeignStatesAsync(pattern);
                    } catch (e) {
                        this.adapter.log.error(`Cannot subscribe "${pattern}": ${e.message}`);
                    }
                }
            }, 50);
        }
    }

    #enableEventThreshold(): void {
        if (!this.eventsThreshold.active) {
            this.eventsThreshold.active = true;
            // set at once, otherwise a check in between sees an old time and disables the threshold again
            this.eventsThreshold.timeActivated = Date.now();

            setTimeout(async () => {
                if (!this.eventsThreshold.active) {
                    // disabled meanwhile
                    return;
                }
                this.adapter.log.info(
                    `Unsubscribe from all states, except system's, because over ${this.eventsThreshold.repeatSeconds} seconds the number of events is over ${this.eventsThreshold.value} (in last second ${this.eventsThreshold.count})`,
                );

                this.onThresholdChanged?.(true);

                for (const pattern of Object.keys(this.subscribes.stateChange)) {
                    try {
                        await this.adapter.unsubscribeForeignStatesAsync(pattern);
                    } catch (e) {
                        this.adapter.log.error(`Cannot unsubscribe "${pattern}": ${e.message}`);
                    }
                }

                try {
                    await this.adapter.subscribeForeignStatesAsync('system.adapter.*');
                } catch (e) {
                    this.adapter.log.error(`Cannot subscribe "system.adapter.*": ${e.message}`);
                }
            }, 100);
        }
    }

    #addUser(
        user: string,
        password: string,
        options: { user: string } | SocketCallback | null,
        callback?: SocketCallback,
    ): void {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }

        if (!user.match(/^[-.A-Za-züäößÖÄÜа-яА-Я@+$§0-9=?!&# ]+$/)) {
            return SocketCommands._fixCallback(
                callback,
                'Invalid characters in the name. Only following special characters are allowed: -@+$§=?!&# and letters',
            );
        }

        try {
            void this.adapter
                .getForeignObjectAsync(`system.user.${user}`, options)
                .then(async (obj: ioBroker.UserObject | null | undefined): Promise<void> => {
                    if (obj) {
                        SocketCommands._fixCallback(callback, 'User yet exists');
                    } else {
                        try {
                            await this.adapter.setForeignObject(
                                `system.user.${user}`,
                                {
                                    type: 'user',
                                    common: {
                                        name: user,
                                        enabled: true,
                                        password: '',
                                    },
                                    native: {},
                                },
                                options,
                            );

                            try {
                                await this.adapter.setPassword(user, password, options || {}, callback);
                            } catch (error) {
                                this.adapter.log.error(`[#addUser] cannot set password: ${error.toString()}`);
                                SocketCommands._fixCallback(callback, error);
                            }
                        } catch (error) {
                            this.adapter.log.error(`[#addUser] cannot save user: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                });
        } catch (error) {
            this.adapter.log.error(`[#addUser] cannot read user: ${error.toString()}`);
            SocketCommands._fixCallback(callback, error);
        }
    }

    #delUser(user: string, options: { user: string } | null, callback?: SocketCallback): void {
        try {
            void this.adapter.getForeignObject(`system.user.${user}`, options, (error, obj) => {
                if (error || !obj) {
                    SocketCommands._fixCallback(callback, 'User does not exist');
                } else {
                    if (obj.common.dontDelete) {
                        SocketCommands._fixCallback(callback, 'Cannot delete user, while is system user');
                    } else {
                        try {
                            this.adapter.delForeignObject(`system.user.${user}`, options || {}, error =>
                                // Remove this user from all groups in the web client
                                SocketCommands._fixCallback(callback, error),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[#delUser] cannot delete user: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                }
            });
        } catch (error) {
            this.adapter.log.error(`[#delUser] cannot read user: ${error.toString()}`);
            SocketCommands._fixCallback(callback, error);
        }
    }

    #addGroup(
        group: string,
        desc: ioBroker.StringOrTranslated | null,
        acl: Omit<ioBroker.PermissionSet, 'user' | 'groups'> | null,
        options: { user: string },
        callback: SocketCallback,
    ): void {
        let name = group;
        if (name && name.substring(0, 1) !== name.substring(0, 1).toUpperCase()) {
            name = name.substring(0, 1).toUpperCase() + name.substring(1);
        }
        group = group.substring(0, 1).toLowerCase() + group.substring(1);

        if (!group.match(/^[-.A-Za-züäößÖÄÜа-яА-Я@+$§0-9=?!&#_ ]+$/)) {
            return SocketCommands._fixCallback(
                callback,
                'Invalid characters in the group name. Only following special characters are allowed: -@+$§=?!&# and letters',
            );
        }

        try {
            void this.adapter.getForeignObject<`system.group.${string}`>(
                `system.group.${group}`,
                options,
                (_error, obj: ioBroker.GroupObject | null | undefined) => {
                    if (obj) {
                        SocketCommands._fixCallback(callback, 'Group yet exists');
                    } else {
                        obj = {
                            _id: `system.group.${group}`,
                            type: 'group',
                            common: {
                                name,
                                desc: desc || undefined,
                                members: [],
                                acl: acl || {
                                    object: {
                                        list: false,
                                        read: false,
                                        write: false,
                                        create: false,
                                        delete: false,
                                    },
                                    state: {
                                        list: false,
                                        read: false,
                                        write: false,
                                        create: false,
                                        delete: false,
                                    },
                                    users: {
                                        list: false,
                                        read: false,
                                        write: false,
                                        create: false,
                                        delete: false,
                                    },
                                    other: {
                                        execute: false,
                                        http: false,
                                        sendto: false,
                                    },
                                    file: {
                                        list: false,
                                        read: false,
                                        write: false,
                                        create: false,
                                        delete: false,
                                    },
                                },
                            },
                            native: {},
                        };
                        try {
                            void this.adapter.setForeignObject(`system.group.${group}`, obj, options, error =>
                                SocketCommands._fixCallback(callback, error, obj),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[#addGroup] cannot write group: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                },
            );
        } catch (error) {
            this.adapter.log.error(`[#addGroup] cannot read group: ${error.toString()}`);
            SocketCommands._fixCallback(callback, error);
        }
    }

    #delGroup(group: string, options: { user: string }, callback: SocketCallback): void {
        try {
            void this.adapter.getForeignObject(`system.group.${group}`, options, (error, obj) => {
                if (error || !obj) {
                    SocketCommands._fixCallback(callback, 'Group does not exist');
                } else {
                    if (obj.common.dontDelete) {
                        SocketCommands._fixCallback(callback, 'Cannot delete group, while is system group');
                    } else {
                        try {
                            this.adapter.delForeignObject(`system.group.${group}`, options, error =>
                                // Remove this group from all users in the web client
                                SocketCommands._fixCallback(callback, error),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[#delGroup] cannot delete group: ${error.toString()}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                }
            });
        } catch (error) {
            this.adapter.log.error(`[#delGroup] cannot read group: ${error.toString()}`);
            SocketCommands._fixCallback(callback, error);
        }
    }

    /**
     * Check if the socket belongs to an administrator: `system.user.admin` itself or a member
     * of `system.group.administrator`. A socket without ACL means authentication is disabled,
     * which grants full access.
     *
     * @param socket - WebSocket client instance
     */
    static #isAdmin(socket: WebSocketClient): boolean {
        return (
            !socket._acl ||
            socket._acl.user === 'system.user.admin' ||
            socket._acl.groups.includes('system.group.administrator')
        );
    }

    static #checkObject(
        obj: ioBroker.Object,
        options: { user: string; groups: string[] },
        flag: 'list' | number,
    ): boolean {
        // read the rights of the object
        if (!obj?.common || !obj.acl || flag === 'list') {
            return true;
        }

        if (options.user !== 'system.user.admin' && !options.groups.includes('system.group.administrator')) {
            if (obj.acl.owner !== options.user) {
                // Check if the user is in the group
                if (options.groups.includes(obj.acl.ownerGroup)) {
                    // Check group rights
                    if (!(obj.acl.object & (flag << 4))) {
                        return false;
                    }
                } else {
                    // everybody
                    if (!(obj.acl.object & flag)) {
                        return false;
                    }
                }
            } else {
                // Check group rights
                if (!(obj.acl.object & (flag << 8))) {
                    return false;
                }
            }
        }
        return true;
    }

    #getAllObjects(socket: WebSocketClient, callback: SocketCallback): void {
        if (typeof callback !== 'function') {
            return this.adapter.log.warn('[#getAllObjects] Invalid callback');
        }

        if (this._checkPermissions(socket, 'getObjects', callback)) {
            if (this.objects) {
                if (
                    socket._acl &&
                    socket._acl?.user !== 'system.user.admin' &&
                    !socket._acl.groups.includes('system.group.administrator')
                ) {
                    const result: Record<string, ioBroker.Object> = {};
                    for (const id in this.objects) {
                        if (
                            Object.prototype.hasOwnProperty.call(this.objects, id) &&
                            SocketCommandsAdmin.#checkObject(this.objects[id], socket._acl, ACL_READ /* 'read' */)
                        ) {
                            result[id] = this.objects[id];
                        }
                    }
                    callback(null, result);
                } else {
                    callback(null, this.objects);
                }
            } else {
                try {
                    this.adapter.getObjectList({ include_docs: true }, { user: socket._acl?.user }, (_error, res) => {
                        this.adapter.log.info('received all objects');
                        const rows = res?.rows || [];
                        const objects: Record<string, ioBroker.Object> = {};

                        if (
                            socket._acl &&
                            socket._acl?.user !== 'system.user.admin' &&
                            !socket._acl.groups.includes('system.group.administrator')
                        ) {
                            for (let i = 0; i < rows.length; i++) {
                                if (SocketCommandsAdmin.#checkObject(rows[i].doc, socket._acl, ACL_READ)) {
                                    objects[rows[i].doc._id] = rows[i].doc;
                                }
                            }
                            callback(null, objects);
                        } else {
                            for (let j = 0; j < rows.length; j++) {
                                objects[rows[j].doc._id] = rows[j].doc;
                            }
                            callback(null, objects);
                        }
                    });
                } catch (error) {
                    this.adapter.log.error(`[#getAllObjects] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        }
    }

    _initCommandsUser(): void {
        /**
         * #DOCUMENTATION users
         * Add a new user.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param pass - User password
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.addUser = (
            socket: WebSocketClient,
            user: string,
            pass: string,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'addUser', callback, user)) {
                this.#addUser(user, pass, { user: socket._acl?.user || '' }, (error, ...args) =>
                    SocketCommands._fixCallback(callback, error, ...args),
                );
            }
        };

        /**
         * #DOCUMENTATION users
         * Delete an existing user. Admin cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delUser = (
            socket: WebSocketClient,
            user: string,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'delUser', callback, user)) {
                this.#delUser(user, { user: socket._acl?.user || '' }, (error, ...args) =>
                    SocketCommands._fixCallback(callback, error, ...args),
                );
            }
        };

        /**
         * #DOCUMENTATION users
         * Add a new group.
         *
         * @param socket - WebSocket client instance
         * @param group - Group name, e.g., `users`
         * @param desc - Optional description
         * @param acl - Optional access control list object, e.g., `{"object":{"list":true,"read":true,"write":false,"delete":false},"state":{"list":true,"read":true,"write":true,"create":true,"delete":false},"users":{"list":true,"read":true,"write":false,"create":false,"delete":false},"other":{"execute":false,"http":true,"sendto":false},"file":{"list":true,"read":true,"write":false,"create":false,"delete":false}}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.addGroup = (
            socket: WebSocketClient,
            group: string,
            desc: ioBroker.StringOrTranslated | null,
            acl: Omit<ioBroker.PermissionSet, 'user' | 'groups'> | null,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'addGroup', callback, group)) {
                this.#addGroup(group, desc, acl, { user: socket._acl?.user || '' }, (error, ...args): void =>
                    SocketCommands._fixCallback(callback, error, ...args),
                );
            }
        };

        /**
         * #DOCUMENTATION users
         * Delete an existing group. Administrator group cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param group - Group name, e.g., `users`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delGroup = (
            socket: WebSocketClient,
            group: string,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'delGroup', callback, group)) {
                this.#delGroup(group, { user: socket._acl?.user || '' }, (error, ...args) =>
                    SocketCommands._fixCallback(callback, error, ...args),
                );
            }
        };

        /**
         * #DOCUMENTATION users
         * Change user password.
         *
         * @param socket - WebSocket client instance
         * @param user - User name, e.g., `benjamin`
         * @param pass - New password
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.changePassword = (
            socket: WebSocketClient,
            user: string,
            pass: string,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (user === socket._acl?.user || this._checkPermissions(socket, 'changePassword', callback, user)) {
                try {
                    void this.adapter.setPassword(user, pass, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[_changePassword] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
    }

    _initCommandsAdmin(): void {
        /**
         * #DOCUMENTATION admin
         * Read the host object by IP address.
         *
         * @param socket - WebSocket client instance
         * @param ip - IP address, e.g., `192.168.1.1`. IPv4 or IPv6
         * @param callback - Callback function `(ip: string, obj: ioBroker.HostObject | null) => void`
         */
        this.commands.getHostByIp = (
            socket: WebSocketClient,
            ip: string,
            callback?: (error: string | null | Error | undefined, hostObject?: ioBroker.HostObject | null) => void,
        ): void => {
            if (typeof callback !== 'function') {
                return this.adapter.log.warn('[getHostByIp] Invalid callback');
            }

            if (this._checkPermissions(socket, 'getHostByIp', callback, ip)) {
                try {
                    this.adapter.getObjectView('system', 'host', {}, { user: socket._acl?.user }, (error, data) => {
                        if (data?.rows?.length) {
                            for (let i = 0; i < data.rows.length; i++) {
                                const obj = data.rows[i].value;
                                // if we requested specific name
                                if (obj.common.hostname === ip) {
                                    return callback(ip, obj);
                                }
                                if (obj.native.hardware?.networkInterfaces) {
                                    // try to find this IP in the list
                                    const net = obj.native.hardware.networkInterfaces;
                                    for (const eth in net) {
                                        if (!Object.prototype.hasOwnProperty.call(net, eth) || !net[eth]) {
                                            continue;
                                        }
                                        for (let j = 0; j < net[eth].length; j++) {
                                            if (net[eth][j].address === ip) {
                                                return callback(ip, obj);
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        callback(ip, null);
                    });
                } catch (error) {
                    this.adapter.log.error(`[_changePassword] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Activate or deactivate logging events. Events will be sent to the socket as `log` events. Adapter must have `common.logTransporter = true`.
         *
         * @param socket - WebSocket client instance
         * @param isEnabled - Is logging enabled
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.requireLog = (
            socket: WebSocketClient,
            isEnabled: boolean,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'setObject', callback)) {
                if (isEnabled) {
                    this.subscribe(socket, 'log', 'dummy');
                } else {
                    this.unsubscribe(socket, 'log', 'dummy');
                }

                if (this.adapter.log.level === 'debug') {
                    this._showSubscribes(socket, 'log');
                }

                if (typeof callback === 'function') {
                    setImmediate(callback, null);
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get the log files from the given host.
         *
         * @param socket - WebSocket client instance
         * @param host - Host ID, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, list?: { fileName: string; size: number }[]) => void`
         */
        this.commands.readLogs = (
            socket: WebSocketClient,
            host: string,
            callback?: (error: string | null | Error | undefined, list?: { fileName: string; size: number }[]) => void,
        ): void => {
            if (this._checkPermissions(socket, 'readLogs', callback)) {
                let timeout: NodeJS.Timeout | null = setTimeout(() => {
                    if (timeout) {
                        let result: { list?: { fileName: string; size: number }[]; error?: string } = { list: [] };

                        // deliver the file list
                        try {
                            const config = this.adapter.systemConfig;
                            // detect file log
                            if (config?.log?.transport) {
                                for (const transport in config.log.transport) {
                                    if (
                                        Object.prototype.hasOwnProperty.call(config.log.transport, transport) &&
                                        config.log.transport[transport].type === 'file'
                                    ) {
                                        let fileName = config.log.transport[transport].filename || 'log/';
                                        const parts = fileName.replace(/\\/g, '/').split('/');
                                        parts.pop();
                                        fileName = parts.join('/');
                                        if (fileName[0] !== '/' && !fileName.match(/^\w:/)) {
                                            const _filename = normalize(`${__dirname}/../../../`) + fileName;
                                            if (!existsSync(_filename)) {
                                                fileName = normalize(`${__dirname}/../../`) + fileName;
                                            } else {
                                                fileName = _filename;
                                            }
                                        }
                                        if (existsSync(fileName)) {
                                            const files = readdirSync(fileName);

                                            for (let f = 0; f < files.length; f++) {
                                                try {
                                                    if (!files[f].endsWith('-audit.json')) {
                                                        const stat = lstatSync(`${fileName}/${files[f]}`);
                                                        if (!stat.isDirectory()) {
                                                            result.list?.push({
                                                                fileName: `log/${transport}/${files[f]}`,
                                                                size: stat.size,
                                                            });
                                                        }
                                                    }
                                                } catch {
                                                    // push unchecked
                                                    // result.list.push('log/' + transport + '/' + files[f]);
                                                    this.adapter.log.error(
                                                        `Cannot check file: ${fileName}/${files[f]}`,
                                                    );
                                                }
                                            }
                                        }
                                    }
                                }
                            } else {
                                result = { error: 'no file loggers' };
                            }
                        } catch (error) {
                            this.adapter.log.error(`Cannot read logs: ${error}`);
                            result = { error };
                        }
                        SocketCommands._fixCallback(callback, result.error, result.list);
                    }
                }, 500);

                this._sendToHost(
                    host,
                    'getLogFiles',
                    null,
                    (result: { error?: string; list?: { fileName: string; size: number }[] }) => {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                        }
                        SocketCommands._fixCallback(callback, result.error, result.list);
                    },
                );
            }
        };

        /**
         * #DOCUMENTATION states
         * Delete a state. The corresponding object will be deleted too.
         *
         * @param socket - WebSocket client instance
         * @param id - State ID
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delState = (
            socket: WebSocketClient,
            id: string,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'delState', callback, id)) {
                // clear cache
                if (this.states?.[id]) {
                    delete this.states[id];
                }
                try {
                    this.adapter.delForeignState(id, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[delState] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Execute the shell command on host/controller.
         * The following response commands are expected: `cmdStdout`, `cmdStderr`, `cmdExit`.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param id - Session ID, e.g., `Date.now()`. This session ID will come in events `cmdStdout`, `cmdStderr`, `cmdExit`
         * @param cmd - Command to execute
         * @param files - Optional files to send with the command (base64 encoded). The command can refer to them just by name. Requires controller feature `CONTROLLER_CMD_EXEC_FILES`.
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.cmdExec = (
            socket: WebSocketClient,
            host: string,
            id: number,
            cmd: string,
            files?: CommandFile[] | ((error: string | null | Error | undefined) => void),
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            // Backward compatibility: old clients call cmdExec(socket, host, id, cmd, callback) without files
            if (typeof files === 'function') {
                callback = files;
                files = undefined;
            }
            if (id === undefined) {
                this.adapter.log.error(`cmdExec no session ID for "${cmd}"`);
                SocketCommands._fixCallback(callback, 'no session ID');
            } else if (this._checkPermissions(socket, 'cmdExec', callback, cmd)) {
                this.adapter.log.debug(`cmdExec on ${host}(${id}): ${cmd}`);
                // remember socket for this ID.
                this.cmdSessions[id] = { socket };
                try {
                    this.adapter.sendToHost(host, 'cmdExec', { data: cmd, id, files: files || undefined });
                    SocketCommands._fixCallback(callback, null);
                } catch (error) {
                    this.adapter.log.error(`[cmdExec] ERROR: ${error.toString()}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Enable or disable the event threshold. Used only for admin to limit the number of events to the front-end.
         *
         * @param socket - WebSocket client instance
         * @param isActive - If true, then events will be limited
         */
        this.commands.eventsThreshold = (socket: WebSocketClient, isActive: boolean): void => {
            if (!this._checkPermissions(socket, 'eventsThreshold', undefined, isActive)) {
                return;
            }
            if (!isActive) {
                this.disableEventThreshold();
            } else {
                this.#enableEventThreshold();
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get the ratings of adapters.
         *
         * @param _socket - WebSocket client instance
         * @param update - If true, the ratings will be read from the central server, if false from the local cache
         * @param callback - Callback function `(error: string | null, ratings?: Ratings) => void`
         */
        this.commands.getRatings = (
            _socket: WebSocketClient,
            update: boolean | ((error: string | null | Error | undefined, ratings?: Ratings) => void),
            callback?: (error: string | null | Error | undefined, ratings?: Ratings) => void,
        ): void => {
            if (typeof update === 'function') {
                callback = update;
                update = false;
            }

            if (update || !this.context.ratings) {
                void this.updateRatings().then(() => SocketCommands._fixCallback(callback, null, this.context.ratings));
            } else {
                SocketCommands._fixCallback(callback, null, this.context.ratings);
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get the current instance name, like "admin.0"
         *
         * @param _socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, namespace?: string) => void`
         */
        this.commands.getCurrentInstance = (
            _socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, namespace: string) => void,
        ): void => {
            SocketCommands._fixCallback(callback, null, this.adapter.namespace);
        };

        /**
         * #DOCUMENTATION admin
         * Decrypts text with the system secret key.
         *
         * @param socket - WebSocket client instance
         * @param encryptedText - Encrypted text
         * @param callback - Callback function `(error: string | null, decryptedText?: string) => void`
         */
        this.commands.decrypt = (
            socket: WebSocketClient,
            encryptedText: string,
            callback: (error: string | null | Error | undefined, decryptedText?: string) => void,
        ): void => {
            // `this.secret` is shared process-wide, so it may only be served from the warm
            // cache to administrators, who could read `system.config` anyway. For everyone
            // else it is resolved through a read that is ACL-checked for *this* caller.
            if (this.secret && SocketCommandsAdmin.#isAdmin(socket)) {
                SocketCommands._fixCallback(callback, null, this.adapter.decrypt(this.secret, encryptedText));
                return;
            }
            try {
                void this.adapter.getForeignObject('system.config', { user: socket._acl?.user }, (error, obj) => {
                    if (obj?.native?.secret) {
                        this.secret = obj.native.secret;
                        SocketCommands._fixCallback(callback, null, this.adapter.decrypt(this.secret, encryptedText));
                    } else {
                        this.adapter.log.error(`No system.config found: ${error}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                });
            } catch (error) {
                this.adapter.log.error(`Cannot decrypt: ${error}`);
                SocketCommands._fixCallback(callback, error);
            }
        };

        /**
         * #DOCUMENTATION admin
         * Encrypts text with the system secret key.
         *
         * @param socket - WebSocket client instance
         * @param plainText - Plain text to encrypt
         * @param callback - Callback function `(error: string | null, encryptedText?: string) => void`
         */
        this.commands.encrypt = (
            socket: WebSocketClient,
            plainText: string,
            callback: (error: string | null | Error | undefined, encryptedText?: string) => void,
        ): void => {
            // See `decrypt`: the shared secret cache may only short-circuit for administrators.
            if (this.secret && SocketCommandsAdmin.#isAdmin(socket)) {
                SocketCommands._fixCallback(callback, null, this.adapter.encrypt(this.secret, plainText));
                return;
            }
            void this.adapter.getForeignObject('system.config', { user: socket._acl?.user }, (error, obj) => {
                if (obj?.native?.secret) {
                    this.secret = obj.native.secret;
                    try {
                        const encrypted = this.adapter.encrypt(this.secret, plainText);
                        SocketCommands._fixCallback(callback, null, encrypted);
                    } catch (error) {
                        this.adapter.log.error(`Cannot encrypt: ${error}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                } else {
                    this.adapter.log.error(`No system.config found: ${error}`);
                    SocketCommands._fixCallback(callback, error);
                }
            });
        };

        /**
         * #DOCUMENTATION admin
         * Get if the admin has easy mode enabled.
         *
         * @param _socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, isEasyModeStrict?: boolean) => void`
         */
        this.commands.getIsEasyModeStrict = (
            _socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, isEasyModeStrict?: boolean) => void,
        ): void => {
            SocketCommands._fixCallback(callback, null, (this.adapter.config as SocketAdapterSettings).accessLimit);
        };

        /**
         * #DOCUMENTATION admin
         * Get easy mode configuration.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, easyModeConfig?: { strict: boolean; configs: InstanceConfig[] }) => void`
         */
        this.commands.getEasyMode = (
            socket: WebSocketClient,
            callback: (
                error: string | null | Error | undefined,
                easyModeConfig?: { strict: boolean; configs: InstanceConfig[] },
            ) => void,
        ): void => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                let user: string;
                if ((this.adapter.config as SocketAdapterSettings).auth) {
                    user = socket._acl?.user || '';
                } else {
                    user = (this.adapter.config as SocketAdapterSettings).defaultUser || socket._acl?.user || '';
                }

                if (!user.startsWith('system.user.')) {
                    user = `system.user.${user}`;
                }

                if ((this.adapter.config as SocketAdapterSettings).accessLimit) {
                    const configs: InstanceConfig[] = [];
                    const promises: Promise<void>[] = [];
                    (this.adapter.config as SocketAdapterSettings).accessAllowedConfigs?.forEach(id =>
                        promises.push(this.#readInstanceConfig(id, user, false, configs)),
                    );
                    (this.adapter.config as SocketAdapterSettings).accessAllowedTabs?.forEach(id =>
                        promises.push(this.#readInstanceConfig(id, user, true, configs)),
                    );

                    void Promise.all(promises).then(() => {
                        SocketCommands._fixCallback(callback, null, {
                            strict: true,
                            configs,
                        });
                    });
                } else {
                    this.adapter.getObjectView(
                        'system',
                        'instance',
                        { startkey: 'system.adapter.', endkey: 'system.adapter.\u9999' },
                        { user },
                        (error, doc) => {
                            const configs: InstanceConfig[] = [];
                            const promises: Promise<void>[] = [];
                            if (!error && doc?.rows?.length) {
                                for (let i = 0; i < doc.rows.length; i++) {
                                    const obj = doc.rows[i].value;
                                    if (obj.common.noConfig && !obj.common.adminTab) {
                                        continue;
                                    }
                                    if (!obj.common.enabled) {
                                        continue;
                                    }
                                    if (!obj.common.noConfig) {
                                        promises.push(
                                            this.#readInstanceConfig(
                                                obj._id.substring('system.adapter.'.length),
                                                user,
                                                false,
                                                configs,
                                            ),
                                        );
                                    }
                                }
                            }
                            void Promise.all(promises).then(() =>
                                SocketCommands._fixCallback(callback, null, {
                                    strict: false,
                                    configs,
                                }),
                            );
                        },
                    );
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get all adapter as objects.
         *
         * @param socket - WebSocket client instance
         * @param adapterName - Optional adapter name
         * @param callback - Callback function `(error: string | null, results?: ioBroker.Object[]) => void`
         */
        this.commands.getAdapters = (
            socket: WebSocketClient,
            adapterName: string,
            callback: (error: string | null | Error | undefined, result?: ioBroker.AdapterObject[]) => void,
        ): void => {
            if (typeof callback === 'function' && this._checkPermissions(socket, 'getObject', callback)) {
                this.adapter.getObjectView(
                    'system',
                    'adapter',
                    {
                        startkey: `system.adapter.${adapterName || ''}`,
                        endkey: `system.adapter.${adapterName || '\u9999'}`,
                    },
                    { user: socket._acl?.user },
                    (error, doc) => {
                        if (error) {
                            callback(error);
                        } else {
                            callback(
                                null,
                                doc?.rows
                                    .filter(obj => obj && (!adapterName || obj.value.common?.name === adapterName))
                                    .map(item => {
                                        const obj = item.value;
                                        if (obj.common) {
                                            delete obj.common.news;
                                            // @ts-expect-error to save the memory
                                            delete obj.native;
                                        }
                                        this.fixAdminUI(obj);
                                        return obj;
                                    }),
                            );
                        }
                    },
                );
            }
        };

        /**
         * #DOCUMENTATION admin
         * Read software licenses (vis, knx, ...) from ioBroker.net cloud for given user
         *
         * @param socket - WebSocket client instance
         * @param login - Cloud login
         * @param password - Cloud password
         * @param callback - Callback function `(error: string | null, results?: License[]) => void`
         */
        this.commands.updateLicenses = (
            socket: WebSocketClient,
            login: string,
            password: string,
            callback: (error: string | null | Error | undefined, result?: License[]) => void,
        ): void => {
            if (this._checkPermissions(socket, 'setObject', callback, login, password)) {
                if (this.adapter.supportsFeature('CONTROLLER_LICENSE_MANAGER')) {
                    let timeout: NodeJS.Timeout | null = setTimeout(() => {
                        if (timeout) {
                            timeout = null;
                            SocketCommands._fixCallback(callback, 'updateLicenses timeout');
                        }
                    }, 7000);

                    if (!this.adapter.common) {
                        throw new Error('"common" is not defined in adapter!');
                    }

                    this._sendToHost(this.adapter.common.host, 'updateLicenses', { login, password }, result => {
                        if (timeout) {
                            clearTimeout(timeout);
                            timeout = null;
                            SocketCommands._fixCallback(callback, result.error, result?.result);
                        }
                    });
                } else {
                    // remove this branch when js-controller 4.x is mainstream
                    this.#updateLicenses(login, password, { user: socket._acl?.user || '' })
                        .then(licenses => SocketCommands._fixCallback(callback, null, licenses))
                        .catch(error => SocketCommands._fixCallback(callback, error));
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get all instances in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { adminTab: boolean; name: string; icon: string; enabled: boolean }>) => void`
         */
        this.commands.getCompactInstances = (
            socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, result?: Record<string, CompactInstanceInfo>) => void,
        ): void => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    this.adapter.getObjectView(
                        'system',
                        'instance',
                        { startkey: `system.adapter.`, endkey: `system.adapter.\u9999` },
                        { user: socket._acl?.user },
                        (error, doc) => {
                            if (error) {
                                SocketCommands._fixCallback(callback, error);
                            } else {
                                // calculate
                                const result: Record<
                                    string,
                                    {
                                        adminTab: AdminTab | undefined;
                                        name: string;
                                        icon: string | undefined;
                                        enabled: boolean;
                                        version: string;
                                    }
                                > = {};

                                doc?.rows.forEach(item => {
                                    const obj = item.value;
                                    result[item.id] = {
                                        adminTab: obj.common.adminTab,
                                        name: obj.common.name,
                                        icon: obj.common.icon,
                                        enabled: obj.common.enabled,
                                        version: obj.common.version,
                                    };
                                });
                                SocketCommands._fixCallback(callback, null, result);
                            }
                        },
                    );
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get all adapters in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { icon: string; v: string; iv: string }>) => void`
         */
        this.commands.getCompactAdapters = (
            socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, result?: Record<string, CompactAdapterInfo>) => void,
        ): void => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    this.adapter.getObjectView(
                        'system',
                        'adapter',
                        { startkey: `system.adapter.`, endkey: `system.adapter.\u9999` },
                        { user: socket._acl?.user },
                        (error, doc) => {
                            if (error) {
                                SocketCommands._fixCallback(callback, error);
                            } else {
                                // calculate
                                const result: Record<string, { icon: string | undefined; v: string; iv?: string }> = {};

                                doc?.rows.forEach(item => {
                                    const obj = item.value;
                                    if (obj?.common?.name) {
                                        result[obj.common.name] = { icon: obj.common.icon, v: obj.common.version };
                                        if (obj.common.ignoreVersion) {
                                            result[obj.common.name].iv = obj.common.ignoreVersion;
                                        }
                                    }
                                });

                                SocketCommands._fixCallback(callback, null, result);
                            }
                        },
                    );
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Count the objects and the objects of every type.
         *
         * Reading all objects only to count them transfers the whole database - tens of megabytes on
         * a grown installation, and it blocks this process while it packs them up. This counts them
         * where they are and answers with numbers. Announced as the feature `OBJECTS_COUNT`.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, result?: ObjectsCount) => void`
         */
        this.commands.getObjectsCount = (
            socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, result?: ObjectsCount) => void,
        ): void => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    this.#countObjects(socket._acl?.user).then(
                        result => SocketCommands._fixCallback(callback, null, result),
                        (error: Error) => {
                            this.adapter.log.warn(`Cannot count the objects: ${error.message}`);
                            SocketCommands._fixCallback(callback, error);
                        },
                    );
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get all installed adapters in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, results?: Record<string, { version: string }>) => void`
         */
        this.commands.getCompactInstalled = (
            socket: WebSocketClient,
            host: string,
            callback: (result?: Record<string, { version: string }>) => void,
        ): void => {
            if (typeof callback === 'function') {
                if (this._checkPermissions(socket, 'sendToHost', callback as SocketCallback)) {
                    this._sendToHost(host, 'getInstalled', null, (data: any) => {
                        const castData: Record<string, tools.AdapterInformation> = data;
                        const result: Record<string, { version: string }> = {};
                        Object.keys(castData).forEach(name => {
                            if (name !== 'hosts') {
                                result[name] = { version: castData[name].version };
                            }
                        });
                        callback(result);
                    });
                }
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get system repositories in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, systemRepositories?: { common: any; native?: { repositories: Record<string, { json: { _repoInfo: any } } } }) => void`
         */
        this.commands.getCompactSystemRepositories = (
            socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, systemRepositories?: CompactSystemRepository) => void,
        ): void => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                void this.adapter.getForeignObject('system.repositories', { user: socket._acl?.user }, (error, obj) => {
                    if (obj?.native?.repositories) {
                        Object.keys(obj.native.repositories).forEach(name => {
                            if (obj.native.repositories[name].json) {
                                // limit information to _repoInfo
                                obj.native.repositories[name].json = {
                                    _repoInfo: obj.native.repositories[name].json._repoInfo,
                                };
                            }
                        });
                    }
                    SocketCommands._fixCallback(callback, error, obj);
                });
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get the repository in a compact form to save bandwidth.
         *
         * Answered from the objects admin holds in memory where possible. Asking the host means
         * several megabytes of repository through the message box for two fields per adapter, which
         * made every start of the GUI wait seconds for it.
         *
         * @param socket - WebSocket client instance
         * @param host - Host name, e.g., `system.host.raspberrypi`
         * @param callback - Callback function `(error: string | null, results?: Record<string, { version: string; icon?: string }>) => void`
         */
        this.commands.getCompactRepository = (
            socket: WebSocketClient,
            host: string,
            callback: (result: Record<string, { version: string; icon?: string }>) => void,
        ): void => {
            if (this._checkPermissions(socket, 'sendToHost', callback as any as SocketCallback)) {
                const fromObjects = this.#compactRepositoryFromObjects();
                if (fromObjects) {
                    // The host is still asked, but later and without anybody waiting for it: the GUI
                    // has what it needs, only the side effects of that command are still wanted
                    this.#triggerRepositorySideEffects(host);
                    callback(fromObjects);
                    return;
                }

                this.#askHostForRepository(host, callback);
            }
        };

        /**
         * #DOCUMENTATION admin
         * Get all hosts in a compact form to save bandwidth.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, results?: Record<string, { common: { name: string; icon: string; color: string; installedVersion: string }; native: { hardware: { networkInterfaces: any[] } } }>) => void`
         */
        this.commands.getCompactHosts = (
            socket: WebSocketClient,
            callback: (error: string | null | Error | undefined, hosts?: CompactHost[]) => void,
        ): void => {
            if (this._checkPermissions(socket, 'getObject', callback)) {
                this.adapter.getObjectView(
                    'system',
                    'host',
                    { startkey: 'system.host.', endkey: 'system.host.\u9999' },
                    { user: socket._acl?.user },
                    (error, doc) => {
                        if (error) {
                            SocketCommands._fixCallback(callback, error);
                        } else {
                            const result: {
                                _id: string;
                                common: {
                                    name: string;
                                    icon: string | undefined;
                                    color: string | undefined;
                                    installedVersion: string;
                                };
                                native: {
                                    hardware: {
                                        networkInterfaces: ReturnType<(typeof os)['networkInterfaces']> | undefined;
                                    };
                                };
                            }[] = [];
                            doc?.rows.map(item => {
                                const host = item.value;
                                if (host) {
                                    host.common ||= {} as ioBroker.HostCommon;
                                    result.push({
                                        _id: host._id,
                                        common: {
                                            name: host.common.name,
                                            icon: host.common.icon,
                                            color: host.common.color,
                                            installedVersion: host.common.installedVersion,
                                        },
                                        native: {
                                            hardware: {
                                                networkInterfaces:
                                                    host.native?.hardware?.networkInterfaces || undefined,
                                            },
                                        },
                                    });
                                }
                            });
                            SocketCommands._fixCallback(callback, null, result);
                        }
                    },
                );
            }
        };
    }

    protected _initCommandsCommon(): void {
        super._initCommandsCommon();

        this._initCommandsAdmin();
        this._initCommandsUser();
    }

    protected _initCommandsFiles(): void {
        super._initCommandsFiles();

        /**
         * #DOCUMENTATION files
         * Write the file into ioBroker DB as base64 string.
         *
         * @param socket - WebSocket client instance
         * @param adapter - Instance name, e.g., `vis.0`
         * @param fileName - File name, e.g., `main/vis-views.json`
         * @param data64 - File content as base64 string
         * @param options - Optional settings, e.g., `{mode: 0x0644}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.writeFile = (
            socket: WebSocketClient,
            adapter: string,
            fileName: string,
            data64: string,
            options?: { mode?: number } | ((error: null | undefined | Error | string) => void),
            callback?: (error: null | undefined | Error | string) => void,
        ): void => {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (this._checkPermissions(socket, 'writeFile', callback, fileName)) {
                let _options: { mode?: number; user: string | undefined };
                if (!options || options.mode === undefined) {
                    _options = { user: socket._acl?.user };
                } else {
                    _options = { user: socket._acl?.user, mode: options.mode };
                }

                try {
                    const buffer = Buffer.from(data64, 'base64');
                    this.adapter.writeFile(adapter, fileName, buffer, _options, (error, ...args): void =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[writeFile] Cannot convert data: ${error.toString()}`);
                    if (callback) {
                        callback(`Cannot convert data: ${error.toString()}`);
                    }
                }
            }
        };
    }

    _initCommandsObjects(): void {
        super._initCommandsObjects();

        /**
         * #DOCUMENTATION objects
         * Read absolutely all objects.
         *
         * @param socket - WebSocket client instance
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getAllObjects = (
            socket: WebSocketClient,
            callback: (error: null | undefined | Error | string, result?: Record<string, ioBroker.Object>) => void,
        ): void => {
            return this.#getAllObjects(socket, callback);
        };

        /**
         * #DOCUMENTATION objects
         * Read absolutely all objects. Same as `getAllObjects`.
         *
         * @param socket - WebSocket client instance
         * @param list - optional list of IDs.
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getObjects = (
            socket: WebSocketClient,
            list:
                | string[]
                | ((error: null | undefined | Error | string, result?: Record<string, ioBroker.Object>) => void)
                | null,
            callback?: (error: null | undefined | Error | string, result?: Record<string, ioBroker.Object>) => void,
        ): void => {
            if (typeof list === 'function') {
                callback = list;
                list = null;
            }
            if (typeof callback !== 'function') {
                this.adapter.log.warn('[getObjects] Invalid callback');
            } else if (list && !list.length) {
                SocketCommands._fixCallback(callback, null, {});
            } else if (list?.length) {
                if (this._checkPermissions(socket, 'getObject', callback)) {
                    try {
                        this.adapter.getForeignObjects(list, { user: socket._acl?.user }, (error, objs) =>
                            SocketCommands._fixCallback(callback, error, objs),
                        );
                    } catch (error) {
                        this.adapter.log.error(`[getObjects] ERROR: ${error.toString()}`);
                        SocketCommands._fixCallback(callback, error);
                    }
                }
            } else {
                this.#getAllObjects(socket, callback);
            }
        };

        /**
         * #DOCUMENTATION objects
         * Extend the existing object.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID
         * @param obj - New parts of the object, e.g., `{common: {name: 'new name'}}`
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.extendObject = (
            socket: WebSocketClient,
            id: string,
            obj: Partial<ioBroker.Object>,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (this._checkPermissions(socket, 'extendObject', callback, id)) {
                try {
                    this.adapter.extendForeignObject(id, obj, { user: socket._acl?.user }, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION objects
         * Read objects by pattern.
         *
         * @param socket - WebSocket client instance
         * @param pattern - Pattern like `system.adapter.admin.0.*`
         * @param type - Type of objects to delete, like `state`, `channel`, `device`, `host`, `adapter`. Default - `state`
         * @param callback - Callback function `(error: string | null, objects?: Record<string, ioBroker.Object>) => void`
         */
        this.commands.getForeignObjects = (
            socket: WebSocketClient,
            pattern: string,
            type:
                | ioBroker.ObjectType
                | undefined
                | ((error: string | null | Error | undefined, objects?: Record<string, ioBroker.Object>) => void),
            callback?: (error: string | null | Error | undefined, objects?: Record<string, ioBroker.Object>) => void,
        ): void => {
            if (this._checkPermissions(socket, 'getObjects', callback)) {
                if (typeof type === 'function') {
                    callback = type;
                    type = undefined;
                }

                if (typeof callback === 'function') {
                    if (type) {
                        try {
                            this.adapter.getForeignObjects(
                                pattern,
                                type,
                                { user: socket._acl?.user },
                                (error, ...args) => SocketCommands._fixCallback(callback, error, ...args),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    } else {
                        try {
                            this.adapter.getForeignObjects(pattern, { user: socket._acl?.user }, (error, ...args) =>
                                SocketCommands._fixCallback(callback, error, ...args),
                            );
                        } catch (error) {
                            this.adapter.log.error(`[extendObject] ERROR: ${error}`);
                            SocketCommands._fixCallback(callback, error);
                        }
                    }
                } else {
                    this.adapter.log.warn('[getObjects] Invalid callback');
                }
            }
        };

        /**
         * #DOCUMENTATION objects
         * Delete an object or objects recursively.
         * Objects with `dontDelete` cannot be deleted.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID, like 'adapterName.0.channel'
         * @param options - Options for deletion.
         * @param options.recursive - Delete all sub objects in this branch
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delObject = (
            socket: WebSocketClient,
            id: string,
            options?: ioBroker.DelObjectOptions | ((error: string | null | Error | undefined) => void),
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (this._checkPermissions(socket, 'delObject', callback, id)) {
                let _options: { recursive?: boolean; user: string | undefined };
                if (!options) {
                    _options = { user: socket._acl?.user };
                } else if (options?.recursive) {
                    _options = { user: socket._acl?.user, recursive: true };
                } else {
                    _options = { user: socket._acl?.user };
                }

                try {
                    // options.recursive = true; // the only difference between delObject and delObjects is this line
                    this.adapter.delForeignObject(id, _options, (error, ...args): void =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[delObject] ERROR: ${error}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };

        /**
         * #DOCUMENTATION objects
         * Delete an object or objects recursively.
         * Objects with `dontDelete` cannot be deleted.
         * Same as `delObject` but with `recursive: true`.
         *
         * @param socket - WebSocket client instance
         * @param id - Object ID, like 'adapterName.0.channel'
         * @param options - Options for deletion.
         * @param options.recursive - Delete all sub objects in this branch
         * @param callback - Callback function `(error: string | null) => void`
         */
        this.commands.delObjects = (
            socket: WebSocketClient,
            id: string,
            options?: ioBroker.DelObjectOptions | ((error: string | null | Error | undefined) => void) | null,
            callback?: (error: string | null | Error | undefined) => void,
        ): void => {
            if (typeof options === 'function') {
                callback = options;
                options = undefined;
            }
            if (this._checkPermissions(socket, 'delObject', callback, id)) {
                let _options: { recursive?: boolean; user: string | undefined };
                if (!options) {
                    _options = { user: socket._acl?.user, recursive: true };
                } else if (options?.recursive) {
                    _options = { user: socket._acl?.user, recursive: true };
                } else {
                    _options = { user: socket._acl?.user, recursive: true };
                }

                try {
                    this.adapter.delForeignObject(id, _options, (error, ...args) =>
                        SocketCommands._fixCallback(callback, error, ...args),
                    );
                } catch (error) {
                    this.adapter.log.error(`[delObjects] ERROR: ${error}`);
                    SocketCommands._fixCallback(callback, error);
                }
            }
        };
    }

    stateChange(id: string, state: ioBroker.State | null | undefined): void {
        if (this.states) {
            if (!state) {
                if (this.states[id]) {
                    delete this.states[id];
                }
            } else {
                this.states[id] = state;
            }
        }

        if (!this.eventsThreshold.active) {
            this.eventsThreshold.count++;
        }
    }

    sendCommand(obj: ioBroker.Message): true | undefined {
        if (obj.message && this.cmdSessions[obj.message.id]) {
            if (obj.command === 'cmdExit') {
                delete this.cmdSessions[obj.message.id];
            }
            return true;
        }
    }

    destroy(): void {
        if (this.thresholdInterval) {
            clearInterval(this.thresholdInterval);
            this.thresholdInterval = null;
        }

        if (this.cacheGB) {
            clearInterval(this.cacheGB);
            this.cacheGB = null;
        }

        for (const host of Object.keys(this.repoSideEffectTimers)) {
            clearTimeout(this.repoSideEffectTimers[host]);
            delete this.repoSideEffectTimers[host];
        }

        super.destroy();
    }
}
