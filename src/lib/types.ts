// Data structures of the speedtest.vodafone.de API (api.speedtest.vodafone.anw.net)

export interface DualStackList {
    dualstack: string[];
    ipv6: string[];
}

export interface DualStackUrl {
    dualstack: string;
    ipv6: string;
}

/** Answer of GET /v0/config/ */
export interface SpeedtestConfig {
    data: {
        version?: string;
        remotePortDetectionUrl?: string;
        ipDetectionUrl?: {
            ipv4: string;
            ipv6: string;
        };
        download: {
            numStreams: number;
            /** seconds */
            duration: number;
            /** seconds */
            interval: number;
        };
        upload: {
            /** seconds */
            duration: number;
            /** seconds */
            interval: number;
            maxBytes: number;
        };
        ping: {
            /** seconds */
            duration: number;
            /** seconds */
            interval: number;
        };
        cpuBenchmark?: boolean;
        webBenchmark?: boolean;
        tcpRetrans?: boolean;
        connection?: {
            ip: string;
            ipVersion: string;
        };
    };
}

export interface SpeedtestModem {
    vendor: string | null;
    code?: string | null;
    name?: string | null;
    type?: string | null;
    /** kbit/s */
    provisionedDownloadSpeed: number;
    /** kbit/s */
    provisionedUploadSpeed: number;
    /** Mbit/s */
    bookedDownloadSpeedMax: number;
    /** Mbit/s */
    bookedUploadSpeedMax: number;
}

export interface SpeedtestConnection {
    isCustomer: boolean;
    isp: string;
    ip: string;
    ipCountry: string;
}

/** Answer of POST /v0/init/ */
export interface SpeedtestInit {
    data: {
        speedtest: {
            id: string;
            servers: {
                downloadServers: DualStackList;
                uploadServer: DualStackUrl;
                pingServer: DualStackUrl;
                wsPingServer?: DualStackUrl;
            };
        };
        /** Not present in the built-in defaults, always delivered by the API */
        modem?: SpeedtestModem;
        /** Not present in the built-in defaults, always delivered by the API */
        connection?: SpeedtestConnection;
    };
}

/** Answer of PUT /v0/calc/(download|upload)/ */
export interface SpeedtestCalcResult {
    data: {
        /** kbit/s */
        value: number | string;
    };
}

/** Answer of GET https://rpd.speedtest.vodafone-ip.de/ */
export interface RemotePortResult {
    port: number;
}

export type TransferType = 'download' | 'upload';
export type TestType = TransferType | 'ping';

export interface TestResult {
    download_raw: number[];
    upload_raw: number[];
    overall_time: { ping: number; download?: number; upload?: number };
    overall_bytes: { download: number; upload: number };
    /** kbit/s */
    download: number;
    /** kbit/s */
    upload: number;
    ping: {
        min: string;
        max: string;
        avg: string;
        packetLoss: string;
    };
}
