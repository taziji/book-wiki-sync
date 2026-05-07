import { Hono } from "hono";
import { processBookMessage } from "./queue";
import type { JobPayload, JobStatus } from "./types";

interface Env {
	BOOK_BUCKET: R2Bucket;
	STATUS_KV: KVNamespace;
	BOOK_QUEUE: Queue<JobPayload>;
	VAULT_R2_ENDPOINT?: string;
	VAULT_R2_ACCESS_KEY_ID?: string;
	VAULT_R2_SECRET_ACCESS_KEY?: string;
	VAULT_R2_BUCKET?: string;
	VAULT_R2_PREFIX?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.post("/upload", async (c) => {
	const formData = await c.req.parseBody();
	const file = formData["file"];
	const filename = formData["filename"] as string;
	const llmEndpoint = formData["llmEndpoint"] as string;
	const llmKey = formData["llmKey"] as string;
	const llmModel = (formData["llmModel"] as string) || "glm-5";

	if (!file || !filename || !llmEndpoint || !llmKey) {
		return c.json({ error: "Missing required fields: file, filename, llmEndpoint, llmKey" }, 400);
	}

	if (!filename.toLowerCase().endsWith(".pdf")) {
		return c.json({ error: "Only PDF uploads are supported" }, 400);
	}

	const jobId = crypto.randomUUID();

	const fileData = file instanceof File ? await file.arrayBuffer() : file;
	await c.env.BOOK_BUCKET.put(`raw/${jobId}/${filename}`, fileData);

	const initialStatus: JobStatus = {
		status: "queued",
		progress: 0,
		totalSteps: 0,
		currentStep: "queued",
		completedChapters: 0,
		totalChapters: 0,
		completedWikiPages: 0,
		outputPath: "",
		outputFiles: [],
		errors: [],
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};
	await c.env.STATUS_KV.put(jobId, JSON.stringify(initialStatus), { expirationTtl: 86400 });

	await c.env.BOOK_QUEUE.send({ type: "extract", jobId, filename, llmEndpoint, llmKey, llmModel });

	return c.json({ jobId, status: "queued" });
});

app.get("/status/:jobId", async (c) => {
	const jobId = c.req.param("jobId");
	const status = await c.env.STATUS_KV.get<JobStatus>(jobId, "json");

	if (!status) {
		return c.json({ error: "Job not found" }, 404);
	}

	return c.json(status);
});

app.get("/output/:jobId", async (c) => {
	const jobId = c.req.param("jobId");
	const status = await c.env.STATUS_KV.get<JobStatus>(jobId, "json");

	if (!status || (status.status !== "complete" && status.status !== "partial")) {
		return c.json({ error: "Job not complete" }, 400);
	}

	return c.json({ outputPath: status.outputPath, files: status.outputFiles });
});

app.get("/jobs", async (c) => {
	const listed = await c.env.STATUS_KV.list({ limit: 20 });
	const jobs = await Promise.all(
		listed.keys.map(async (key) => {
			const status = await c.env.STATUS_KV.get<JobStatus>(key.name, "json");
			return { jobId: key.name, ...status };
		})
	);
	jobs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
	return c.json({ jobs });
});

app.get("/", (c) => c.json({ service: "book-wiki-worker", version: "1.0.0" }));

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<JobPayload>, env: Env): Promise<void> {
		for (const message of batch.messages) {
			await processBookMessage(message, env, {
				endpoint: env.VAULT_R2_ENDPOINT,
				accessKeyId: env.VAULT_R2_ACCESS_KEY_ID,
				secretAccessKey: env.VAULT_R2_SECRET_ACCESS_KEY,
				bucket: env.VAULT_R2_BUCKET,
				prefix: env.VAULT_R2_PREFIX,
			});
			message.ack();
		}
	},
};
