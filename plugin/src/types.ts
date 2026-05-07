export const DEFAULT_AUTO_SYNC = true;
export const DEFAULT_DEBOUNCE_SECONDS = 5;

export interface R2Settings {
	endpoint: string;
	accessKeyId: string;
	secretAccessKey: string;
	bucketName: string;
	autoSync: boolean;
	debounceSeconds: number;
	workerUrl: string;
	llmEndpoint: string;
	llmKey: string;
	llmModel: string;
}

export const DEFAULT_SETTINGS: R2Settings = {
	endpoint: "",
	accessKeyId: "",
	secretAccessKey: "",
	bucketName: "",
	autoSync: DEFAULT_AUTO_SYNC,
	debounceSeconds: DEFAULT_DEBOUNCE_SECONDS,
	workerUrl: "",
	llmEndpoint: "",
	llmKey: "",
	llmModel: "glm-5",
};

export interface SyncStateEntry {
	lastSync: number;
	hash: string;
}

export interface SyncState {
	[path: string]: SyncStateEntry;
}
