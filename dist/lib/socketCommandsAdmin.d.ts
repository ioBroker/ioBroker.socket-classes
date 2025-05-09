import { type Socket as WebSocketClient } from '@iobroker/ws-server';
import { type Ratings, SocketCommands, type SocketDataContext } from './socketCommands';
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
    json: {
        _repoInfo: {
            stable?: boolean;
            name?: ioBroker.StringOrTranslated;
        };
    } | null | undefined;
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
export declare class SocketCommandsAdmin extends SocketCommands {
    #private;
    static ALLOW_CACHE: string[];
    readonly states: Record<string, ioBroker.State> | undefined;
    private readonly objects;
    private thresholdInterval;
    private readonly cmdSessions;
    private eventsThreshold;
    private readonly cache;
    private cacheGB;
    private onThresholdChanged;
    private secret;
    constructor(adapter: ioBroker.Adapter, updateSession?: (socket: WebSocketClient) => boolean, context?: SocketDataContext, objects?: Record<string, ioBroker.Object>, states?: Record<string, ioBroker.State>);
    start(onThresholdChanged: ((on: boolean) => void) | null): void;
    /**
     * Read a file with ratings from server
     *
     * @param uuid Unique ioBroker system identification
     * @param _isAutoUpdate not implemented
     */
    updateRatings(uuid?: string, _isAutoUpdate?: boolean): Promise<Ratings | null>;
    protected _sendToHost: (host: string, command: string, message: any, callback: (result: {
        error?: string;
        result?: any;
    }) => void) => void;
    disableEventThreshold(): void;
    _initCommandsUser(): void;
    _initCommandsAdmin(): void;
    protected _initCommandsCommon(): void;
    protected _initCommandsFiles(): void;
    _initCommandsObjects(): void;
    stateChange(id: string, state: ioBroker.State | null | undefined): void;
    sendCommand(obj: ioBroker.Message): true | undefined;
    destroy(): void;
}
