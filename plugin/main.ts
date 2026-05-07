import { ItemView, Menu, Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { BookProcessor } from "./src/book-processor";
import { R2SettingsTab } from "./src/settings";
import { SyncEngine } from "./src/sync-engine";
import { DEFAULT_SETTINGS, R2Settings, SyncState } from "./src/types";

const VIEW_TYPE = "book-wiki-sync-view";
const READ_SUFFIX = " ✅";

class BookWikiSyncView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE;
	}

	getDisplayText() {
		return "Book Wiki Sync";
	}

	getIcon() {
		return "checkmark";
	}

	async onOpen() {
		this.draw();
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.draw())
		);
	}

	draw() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.classList.add("book-wiki-sync-view");

		const file = this.app.workspace.getActiveFile();

		if (!file || !file.extension.startsWith("md")) {
			container.createEl("p", {
				text: "No active markdown file.",
				cls: "crm-status",
			});
			return;
		}

		const basename = file.basename;
		const isRead = basename.endsWith(READ_SUFFIX);
		const displayBasename = isRead
			? basename.slice(0, -READ_SUFFIX.length)
			: basename;

		const nameEl = container.createEl("div", { cls: "crm-file-name" });
		nameEl.createEl("span", { text: displayBasename });
		if (isRead) {
			nameEl.createEl("span", {
				text: " " + READ_SUFFIX,
				cls: "crm-prefix",
			});
		}

		const buttons = container.createEl("div", { cls: "crm-buttons" });

		const readBtn = buttons.createEl("button", {
			text: "Mark as read",
			cls: "mod-cta",
		});
		readBtn.disabled = isRead;
		readBtn.onClickEvent(() => this.markAs(file, true));

		const unreadBtn = buttons.createEl("button", {
			text: "Mark as unread",
		});
		unreadBtn.disabled = !isRead;
		unreadBtn.onClickEvent(() => this.markAs(file, false));

		container.createEl("div", {
			text: isRead ? "Status: Read ✓" : "Status: Unread",
			cls: "crm-status",
		});
	}

	private async markAs(file: any, read: boolean) {
		const basename: string = file.basename;
		const ext: string = file.extension;
		let newBasename: string;

		if (read) {
			if (basename.endsWith(READ_SUFFIX)) return;
			newBasename = basename + READ_SUFFIX;
		} else {
			if (!basename.endsWith(READ_SUFFIX)) return;
			newBasename = basename.slice(0, -READ_SUFFIX.length);
		}

		const newName = newBasename + "." + ext;
		const newPath = file.parent
			? file.parent.path + "/" + newName
			: newName;

		await this.app.fileManager.renameFile(file, newPath);
		this.draw();
	}
}

export default class BookWikiSyncPlugin extends Plugin {
	settings: R2Settings = DEFAULT_SETTINGS;
	syncState: SyncState = {};
	lastSyncTime: number = 0;
	private syncTimer: ReturnType<typeof setTimeout> | null = null;
	private isSyncing = false;

	async onload() {
		await this.loadSettings();
		this.syncState = SyncEngine.loadState(this.app);

		this.registerView(VIEW_TYPE, (leaf) => new BookWikiSyncView(leaf));

		this.addRibbonIcon("checkmark", "Open Book Wiki Sync", () => {
			this.activateView();
		});

		this.addRibbonIcon("cloud", "Sync vault to R2", () => {
			this.runFullSync();
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile) || !file.extension.startsWith("md")) return;
				const isRead = file.basename.endsWith(READ_SUFFIX);
				menu.addItem((item) => {
					item.setTitle(isRead ? "Mark as unread" : "Mark as read")
						.setIcon(isRead ? "cross" : "checkmark")
						.onClick(() => this.toggleFileReadStatus(file));
				});
			})
		);

		this.addCommand({
			id: "toggle-chapter-read-status",
			name: "Toggle chapter read status",
			callback: () => this.toggleReadStatus(),
		});

		this.addCommand({
			id: "open-book-wiki-sync",
			name: "Open Book Wiki Sync panel",
			callback: () => this.activateView(),
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;
				const ext = file.extension.toLowerCase();
				if (ext !== "pdf") return;
				menu.addItem((item) => {
					item.setTitle("Process as book wiki")
						.setIcon("book-open")
						.onClick(() => this.processBook(file));
				});
			})
		);

		this.addCommand({
			id: "sync-vault-to-r2",
			name: "Sync vault to R2",
			callback: () => this.runFullSync(),
		});

		this.addCommand({
			id: "upload-current-file-to-r2",
			name: "Upload current file to R2",
			callback: () => this.uploadCurrentFile(),
		});

		this.addCommand({
			id: "process-current-book",
			name: "Process current file as book wiki",
			callback: () => {
				const file = this.app.workspace.getActiveFile();
				if (!file) {
					new Notice("No active file.");
					return;
				}
				this.processBook(file);
			},
		});

		this.addSettingTab(new R2SettingsTab(this.app, this));

		this.registerAutoSync();
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE);
		if (this.syncTimer) {
			clearTimeout(this.syncTimer);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private registerAutoSync() {
		if (!this.settings.autoSync) return;

		const debounce = () => {
			if (this.syncTimer) clearTimeout(this.syncTimer);
			this.syncTimer = setTimeout(() => {
				this.runFullSync();
			}, this.settings.debounceSeconds * 1000);
		};

		this.registerEvent(this.app.vault.on("create", () => debounce()));
		this.registerEvent(this.app.vault.on("modify", () => debounce()));
		this.registerEvent(this.app.vault.on("delete", () => debounce()));
		this.registerEvent(this.app.vault.on("rename", () => debounce()));
	}

	private isConfigured(): boolean {
		const s = this.settings;
		return !!(s.endpoint && s.accessKeyId && s.secretAccessKey && s.bucketName);
	}

	async runFullSync() {
		if (!this.isConfigured()) {
			new Notice("R2 sync not configured. Open plugin settings.");
			return;
		}
		if (this.isSyncing) {
			new Notice("Sync already in progress.");
			return;
		}

		this.isSyncing = true;
		new Notice("Syncing vault to R2...");

		try {
			const engine = new SyncEngine(this.app, this.settings, this.syncState);
			engine.setOnProgress((current, total) => {
				new Notice(`Syncing... ${current}/${total}`, 2000);
			});
			const result = await engine.sync();
			this.syncState = engine.getState();
			this.lastSyncTime = Date.now();
			new Notice(
				`Sync complete. ↑${result.uploaded} ↓${result.downloaded} ✗${result.deleted}`
			);
		} catch (err) {
			new Notice(`Sync failed: ${err}`);
		} finally {
			this.isSyncing = false;
		}
	}

	private async uploadCurrentFile() {
		if (!this.isConfigured()) {
			new Notice("R2 sync not configured. Open plugin settings.");
			return;
		}

		const file = this.app.workspace.getActiveFile();
		if (!file) {
			new Notice("No active file.");
			return;
		}

		try {
			const engine = new SyncEngine(this.app, this.settings, this.syncState);
			await engine.syncSingleFile(file);
			this.syncState = engine.getState();
			new Notice(`Uploaded ${file.path} to R2.`);
		} catch (err) {
			new Notice(`Upload failed: ${err}`);
		}
	}

	private async activateView() {
		const existing =
			this.app.workspace.getLeavesOfType(VIEW_TYPE);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		if (rightLeaf) {
			await rightLeaf.setViewState({
				type: VIEW_TYPE,
				active: true,
			});
			this.app.workspace.revealLeaf(rightLeaf);
		}
	}

	private async toggleFileReadStatus(file: TFile) {
		const isRead = file.basename.endsWith(READ_SUFFIX);
		const newBasename = isRead
			? file.basename.slice(0, -READ_SUFFIX.length)
			: file.basename + READ_SUFFIX;

		const newName = newBasename + "." + file.extension;

		const newPath = file.parent
			? file.parent.path + "/" + newName
			: newName;

		await this.app.fileManager.renameFile(file, newPath);

		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if ((view as any).draw) {
				(view as BookWikiSyncView).draw();
			}
		}
	}

	private async toggleReadStatus() {
		const file = this.app.workspace.getActiveFile();
		if (!file || !file.extension.startsWith("md")) return;
		await this.toggleFileReadStatus(file);
	}

	private async processBook(file: TFile) {
		const processor = new BookProcessor(
			this.app,
			this.settings.workerUrl,
			this.settings.llmEndpoint,
			this.settings.llmKey,
			this.settings.llmModel,
			this.settings.endpoint,
			this.settings.accessKeyId,
			this.settings.secretAccessKey,
			this.settings.bucketName
		);
		await processor.processBook(file);
	}
}
