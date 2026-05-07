import { App, Notice, TFile } from "obsidian";
import { R2Client } from "./r2-client";
import { SyncState, R2Settings } from "./types";
import { FileSystemAdapter } from "obsidian";
import * as fs from "fs";
import * as path from "path";

interface SyncAction {
	type: "upload" | "download" | "delete-remote";
	key: string;
	file?: TFile;
}

export class SyncEngine {
	private app: App;
	private client: R2Client;
	private state: SyncState;
	private statePath: string;
	private onProgress?: (current: number, total: number) => void;

	constructor(app: App, settings: R2Settings, state: SyncState) {
		this.app = app;
		this.client = new R2Client(settings);
		this.state = state;
		const adapter = app.vault.adapter as FileSystemAdapter;
		const pluginDir = path.join(adapter.getBasePath(), ".obsidian", "plugins", "book-wiki-sync");
		this.statePath = path.join(pluginDir, "sync-state.json");
	}

	setOnProgress(cb: (current: number, total: number) => void) {
		this.onProgress = cb;
	}

	getState(): SyncState {
		return this.state;
	}

	async sync(): Promise<{ uploaded: number; downloaded: number; deleted: number }> {
		const actions = await this.computeActions();
		let uploaded = 0;
		let downloaded = 0;
		let deleted = 0;
		const total = actions.length;

		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			if (this.onProgress) this.onProgress(i + 1, total);

			try {
				if (action.type === "upload") {
					await this.doUpload(action);
					uploaded++;
				} else if (action.type === "download") {
					await this.doDownload(action);
					downloaded++;
				} else if (action.type === "delete-remote") {
					await this.client.delete(action.key);
					delete this.state[action.key];
					deleted++;
				}
			} catch (err) {
				new Notice(`Sync error on ${action.key}: ${err}`);
			}
		}

		await this.saveState();
		return { uploaded, downloaded, deleted };
	}

	async syncSingleFile(file: TFile): Promise<void> {
		const key = file.path;
		const content = await this.app.vault.readBinary(file);
		const etag = await this.client.upload(key, new Uint8Array(content));
		this.state[key] = {
			lastSync: Date.now(),
			hash: etag,
		};
		await this.saveState();
	}

	private async computeActions(): Promise<SyncAction[]> {
		const vaultFiles = this.app.vault.getFiles();
		const vaultMap = new Map<string, TFile>();
		for (const f of vaultFiles) {
			if (f.path.startsWith(".obsidian/")) continue;
			vaultMap.set(f.path, f);
		}

		const remoteObjects = await this.client.listObjects();
		const actions: SyncAction[] = [];

		for (const [key, file] of vaultMap) {
			const remote = remoteObjects.get(key);
			const stateEntry = this.state[key];

			if (!remote && !stateEntry) {
				actions.push({ type: "upload", key, file });
			} else if (remote && stateEntry) {
				const localChanged = file.stat.mtime > stateEntry.lastSync;
				const remoteChanged = remote.etag !== stateEntry.hash;

				if (localChanged && remoteChanged) {
					if (file.stat.mtime >= remote.lastModified.getTime()) {
						actions.push({ type: "upload", key, file });
					} else {
						actions.push({ type: "download", key, file });
					}
				} else if (localChanged) {
					actions.push({ type: "upload", key, file });
				} else if (remoteChanged) {
					actions.push({ type: "download", key, file });
				}
			} else if (remote && !stateEntry) {
				actions.push({ type: "download", key, file });
			}
		}

		for (const [key] of remoteObjects) {
			if (!vaultMap.has(key)) {
				const stateEntry = this.state[key];
				if (stateEntry) {
					actions.push({ type: "delete-remote", key });
				} else {
					actions.push({ type: "download", key });
				}
			}
		}

		return actions;
	}

	private async doUpload(action: SyncAction): Promise<void> {
		if (!action.file) return;
		const content = await this.app.vault.readBinary(action.file);
		const etag = await this.client.upload(action.key, new Uint8Array(content));
		this.state[action.key] = {
			lastSync: Date.now(),
			hash: etag,
		};
	}

	private async doDownload(action: SyncAction): Promise<void> {
		const data = await this.client.download(action.key);
		const existing = this.app.vault.getAbstractFileByPath(action.key);

		if (existing instanceof TFile) {
			await this.app.vault.modifyBinary(existing, data.buffer as ArrayBuffer);
		} else {
			const dir = action.key.includes("/") ? action.key.substring(0, action.key.lastIndexOf("/")) : "";
			if (dir && !(await this.app.vault.adapter.exists(dir))) {
				await this.app.vault.createFolder(dir);
			}
			await this.app.vault.createBinary(action.key, data.buffer as ArrayBuffer);
		}

		const head = await this.client.head(action.key);
		this.state[action.key] = {
			lastSync: Date.now(),
			hash: head?.etag || "",
		};
	}

	async saveState(): Promise<void> {
		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const pluginDir = path.join(adapter.getBasePath(), ".obsidian", "plugins", "book-wiki-sync");
		if (!fs.existsSync(pluginDir)) {
			fs.mkdirSync(pluginDir, { recursive: true });
		}
		fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf-8");
	}

	static loadState(app: App): SyncState {
		const adapter = app.vault.adapter as FileSystemAdapter;
		const statePath = path.join(
			adapter.getBasePath(),
			".obsidian",
			"plugins",
			"book-wiki-sync",
			"sync-state.json"
		);
		try {
			const data = fs.readFileSync(statePath, "utf-8");
			return JSON.parse(data) as SyncState;
		} catch {
			return {};
		}
	}
}
