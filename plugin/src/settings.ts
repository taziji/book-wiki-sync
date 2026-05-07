import { App, PluginSettingTab, Setting } from "obsidian";
import type { R2Settings } from "./types";
import type ChapterReadMarkerPlugin from "../main";

export class R2SettingsTab extends PluginSettingTab {
	private plugin: ChapterReadMarkerPlugin;

	constructor(app: App, plugin: ChapterReadMarkerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "R2 Sync Settings" });

		new Setting(containerEl)
			.setName("Endpoint URL")
			.setDesc("Jurisdiction-specific endpoint, e.g. https://<account-id>.r2.cloudflarestorage.com")
			.addText((text) =>
				text
					.setPlaceholder("https://<account-id>.r2.cloudflarestorage.com")
					.setValue(this.plugin.settings.endpoint)
					.onChange(async (value) => {
						this.plugin.settings.endpoint = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Access Key ID")
			.setDesc("R2 API access key ID")
			.addText((text) =>
				text
					.setPlaceholder("Enter access key ID")
					.setValue(this.plugin.settings.accessKeyId)
					.onChange(async (value) => {
						this.plugin.settings.accessKeyId = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Secret Access Key")
			.setDesc("R2 API secret access key")
			.addText((text) =>
				text
					.setPlaceholder("Enter secret access key")
					.setValue(this.plugin.settings.secretAccessKey)
					.onChange(async (value) => {
						this.plugin.settings.secretAccessKey = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bucket Name")
			.setDesc("R2 bucket to sync with")
			.addText((text) =>
				text
					.setPlaceholder("Enter bucket name")
					.setValue(this.plugin.settings.bucketName)
					.onChange(async (value) => {
						this.plugin.settings.bucketName = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-sync")
			.setDesc("Automatically sync when files change")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto-sync debounce")
			.setDesc("Seconds to wait after a change before syncing")
			.addSlider((slider) =>
				slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.debounceSeconds)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.debounceSeconds = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h2", { text: "Book Wiki Worker" });

		new Setting(containerEl)
			.setName("Worker URL")
			.setDesc("Book wiki worker service URL")
			.addText((text) =>
				text
					.setPlaceholder("https://book-wiki-worker.your-subdomain.workers.dev")
					.setValue(this.plugin.settings.workerUrl)
					.onChange(async (value) => {
						this.plugin.settings.workerUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("LLM API Endpoint")
			.setDesc("OpenAI-compatible chat completion endpoint")
			.addText((text) =>
				text
					.setPlaceholder("https://open.bigmodel.cn/api/paas/v4/chat/completions")
					.setValue(this.plugin.settings.llmEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.llmEndpoint = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("LLM API Key")
			.setDesc("API key for the LLM service")
			.addText((text) =>
				text
					.setPlaceholder("Enter API key")
					.setValue(this.plugin.settings.llmKey)
					.onChange(async (value) => {
						this.plugin.settings.llmKey = value;
						await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("LLM Model")
			.setDesc("Model name sent to the OpenAI-compatible API")
			.addText((text) =>
				text
					.setPlaceholder("glm-5 or deepseek-v4-flash")
					.setValue(this.plugin.settings.llmModel)
					.onChange(async (value) => {
						this.plugin.settings.llmModel = value || "glm-5";
						await this.plugin.saveSettings();
					})
			);

		if (this.plugin.lastSyncTime) {
			new Setting(containerEl)
				.setName("Last synced")
				.setDesc(new Date(this.plugin.lastSyncTime).toLocaleString());
		}
	}
}
