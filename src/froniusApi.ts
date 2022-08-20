/**
 * Type mappings for JSON returned by fronious Api
 */

export interface FroniusHeader {
    Note: string;
    RequestArguments: [];
    Status: {
        Code: number;
        ErrorDetail: {
            Nodes: [];
        };
        Reason: string;
        UserMessage: string;
    };
    Timestamp: string;
}

/**
 * Top level response type. Not used for all responses!
 * T can be one of EmrsStatus or EmrsConfigStatus
 */
export interface FroniusJson<T> {
    Body: {
        Data: T;
    };
    Head: FroniusHeader;
}

export interface EmrsPinStatus {
    reason: string;
    state: boolean;
}

export interface EmrsStatus {
    emrs: {
        gpios: {
            pin1: EmrsPinStatus;
            pin2: EmrsPinStatus;
            pin3: EmrsPinStatus;
            pin4: EmrsPinStatus;
        };
    };
}

export interface EmrsPinConfig {
    ScheduleOnDone: boolean;
    ScheduleOnTime: string;
    label: string;
    maxTimeOn: number;
    minTimeOn: number;
    mode: string;
    requiredTimeOn: number;
    supply_from_battery: boolean;
    thresholdOff: number;
    thresholdOn: number;
}

export interface EmrsConfig {
    emrs: {
        priorities: {
            batteries: number;
            ios: number;
            ohmpilots: number;
            supply_ohmpilots_from_battery: number;
        };
        rules: {
            pin1: EmrsPinConfig;
            pin2: EmrsPinConfig;
            pin3: EmrsPinConfig;
            pin4: EmrsPinConfig;
        };
    };
}

export interface About {
    txtDaloId: string;
    txtDnsEnum: string;
    txtGateway: string;
    txtHwVersion: string;
    txtLanIp: string;
    txtLanMac: string;
    txtLanNetmask: string;
    txtSwVersion: string;
    txtSystemTime: string;
    txtUptime: string;
    txtWlanIp: string;
    txtWlanMac: string;
    txtWlanNetmask: string;
    leds: {
        power: string;
        localnet: string;
        solarweb: string;
        wlan: string;
    };
}