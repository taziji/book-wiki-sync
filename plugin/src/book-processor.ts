import { App, Notice, TFile } from "obsidian";

interface JobStatus {
	status: "queued" | "processing" | "complete" | "partial" | "failed";
	progress: number;
	totalSteps: number;
	currentStep: string;
	outputPath: string;
	outputFiles: string[];
	errors: string[];
}

export class BookProcessor {
	private app: App;
	private workerUrl: string;
	private llmEndpoint: string;
	private llmKey: string;
	private llmModel: string;
	private r2Endpoint: string;
	private r2AccessKeyId: string;
	private r2SecretAccessKey: string;
	private r2BucketName: string;

	constructor(
		app: App,
		workerUrl: string,
		llmEndpoint: string,
		llmKey: string,
		llmModel: string,
		r2Endpoint: string,
		r2AccessKeyId: string,
		r2SecretAccessKey: string,
		r2BucketName: string
	) {
		this.app = app;
		this.workerUrl = workerUrl;
		this.llmEndpoint = llmEndpoint;
		this.llmKey = llmKey;
		this.llmModel = llmModel || "glm-5";
		this.r2Endpoint = r2Endpoint;
		this.r2AccessKeyId = r2AccessKeyId;
		this.r2SecretAccessKey = r2SecretAccessKey;
		this.r2BucketName = r2BucketName;
	}

	async processBook(file: TFile): Promise<void> {
		if (!this.workerUrl || !this.llmEndpoint || !this.llmKey) {
			new Notice("请先在插件设置中配置 Worker URL、LLM API Endpoint 和 LLM API Key");
			return;
		}

		const ext = file.extension.toLowerCase();
		if (ext !== "pdf") {
			new Notice("只支持 PDF 文件");
			return;
		}

		new Notice(`正在上传 ${file.name}...`);
		let jobId = "";

		try {
			const content = await this.app.vault.readBinary(file);
			jobId = await this.uploadFile(file.name, content);
			new Notice(`已提交处理任务，任务ID: ${jobId.slice(0, 8)}...`);

			await this.pollUntilDone(jobId);

			const status = await this.getStatus(jobId);
			if (status.status === "failed") {
				new Notice(`处理失败: ${status.errors.join(", ")}`);
				return;
			}

			new Notice(`正在下载处理结果...`);
			const fileCount = await this.downloadResults(status);

			new Notice(`完成！已创建 ${fileCount} 个文件`);
		} catch (err) {
			if (jobId && err instanceof Error && err.message.startsWith("Status check failed")) {
				new Notice(`状态检查中断，后台可能仍在处理。任务ID: ${jobId.slice(0, 8)}...`);
				return;
			}
			new Notice(`处理出错: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private async uploadFile(filename: string, content: ArrayBuffer): Promise<string> {
		const formData = new FormData();
		formData.append("file", new Blob([content]), filename);
		formData.append("filename", filename);
		formData.append("llmEndpoint", this.llmEndpoint);
		formData.append("llmKey", this.llmKey);
		formData.append("llmModel", this.llmModel);

		const resp = await fetch(`${this.workerUrl}/upload`, {
			method: "POST",
			body: formData,
		});

		if (!resp.ok) {
			const text = await resp.text();
			throw new Error(`Upload failed: ${resp.status} ${text}`);
		}

		const data = (await resp.json()) as { jobId: string };
		return data.jobId;
	}

	private async pollUntilDone(jobId: string): Promise<void> {
		let statusFailures = 0;
		while (true) {
			await new Promise((r) => setTimeout(r, 5000));
			let status: JobStatus;
			try {
				status = await this.getStatus(jobId);
				statusFailures = 0;
			} catch (err) {
				statusFailures++;
				new Notice(`状态检查失败，后台仍可能在处理 (${statusFailures}/12)`, 3000);
				if (statusFailures >= 12) throw err;
				continue;
			}

			if (status.status === "complete" || status.status === "partial" || status.status === "failed") {
				return;
			}

			new Notice(`处理中: ${status.currentStep} (${status.progress}/${status.totalSteps})`, 3000);
		}
	}

	private async getStatus(jobId: string): Promise<JobStatus> {
		const resp = await fetch(`${this.workerUrl}/status/${jobId}`);
		if (!resp.ok) throw new Error(`Status check failed: ${resp.status}`);
		return resp.json() as Promise<JobStatus>;
	}

	private async downloadResults(status: JobStatus): Promise<number> {
		let count = 0;
		for (const filePath of status.outputFiles) {
			try {
				const url = `${this.r2Endpoint}/${this.r2BucketName}/${filePath}`;
				const resp = await fetch(url, {
					headers: {
						Authorization: `AWS ${this.r2AccessKeyId}:${this.r2SecretAccessKey}`,
					},
				});

				if (!resp.ok) continue;

				const text = await resp.text();

				const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : "";
				if (dir) {
					await this.ensureFolder(dir);
				}

				const existing = this.app.vault.getAbstractFileByPath(filePath);
				if (existing) {
					await this.app.vault.modify(existing as TFile, text);
				} else {
					await this.app.vault.create(filePath, text);
				}
				count++;
			} catch (err) {
				console.error(`Failed to download ${filePath}:`, err);
			}
		}
		return count;
	}

	private async ensureFolder(path: string): Promise<void> {
		const parts = path.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (!existing) {
				await this.app.vault.createFolder(current);
			}
		}
	}
}
