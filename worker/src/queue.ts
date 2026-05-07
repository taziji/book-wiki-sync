import { extractChaptersFromText, extractMarkdownFromPDF } from "./extractor";
import { LLMClient } from "./llm";
import { getJson, listPrefix, putFile, putJson } from "./r2";
import type { EntityType, ExtractedChapter, JobMeta, JobPayload, JobStatus, WikiFile } from "./types";
import { isVaultR2Configured, VaultR2Config, VaultR2Writer } from "./vault-r2";
import {
	detectBookTitle,
	extractEntities,
	extractParts,
	generateCharacterPage,
	generateIndex,
	generateLog,
	generatePartPage,
	generatePlacePage,
	generateThemePage,
	processChapter,
} from "./wiki-builder";

const ENTITY_TYPES: EntityType[] = ["characters", "themes", "places"];

export interface QueueEnv {
	BOOK_BUCKET: R2Bucket;
	STATUS_KV: KVNamespace;
	BOOK_QUEUE: Queue<JobPayload>;
}

export async function processBookMessage(
	message: Message<JobPayload>,
	env: QueueEnv,
	vaultR2Config?: VaultR2Config
): Promise<void> {
	const payload = message.body;
	try {
		switch (payload.type) {
			case "extract":
				await processExtract(payload, env);
				break;
			case "detect-title":
				await processDetectTitle(payload, env);
				break;
			case "process-chapter":
				await processChapterJob(payload, env);
				break;
			case "extract-entities":
				await processExtractEntities(payload, env);
				break;
			case "generate-entity-page":
				await processGenerateEntityPage(payload, env);
				break;
			case "extract-parts":
				await processExtractParts(payload, env);
				break;
			case "generate-part-page":
				await processGeneratePartPage(payload, env);
				break;
			case "generate-index":
				await processGenerateIndex(payload, env);
				break;
			case "finalize":
				await processFinalize(payload, env, vaultR2Config);
				break;
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[${payload.jobId}] ${payload.type} failed: ${errorMsg}`);
		await updateStatus(env.STATUS_KV, payload.jobId, {
			status: "failed",
			errors: [errorMsg],
			activeTask: payload.type,
		});
	}
}

async function processExtract(payload: Extract<JobPayload, { type: "extract" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, "extract", async () => {
		await updateStatus(env.STATUS_KV, payload.jobId, {
			status: "processing",
			currentStep: "converting_pdf_to_markdown",
			activeTask: "extract",
			progress: 0,
		});

		console.log(`[${payload.jobId}] Starting extraction: ${payload.filename}`);
		const fileData = await env.BOOK_BUCKET.get(`raw/${payload.jobId}/${payload.filename}`);
		if (!fileData) throw new Error("File not found");

		const sourceMarkdown = await extractMarkdownFromPDF(await fileData.arrayBuffer());
		if (sourceMarkdown.trim().length < 100) throw new Error("Extracted Markdown is too short");

		await putFile(env.BOOK_BUCKET, sourceMarkdownKey(payload.jobId), sourceMarkdown);
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "splitting_chapters", progress: 1 });

		const chapters = await extractChaptersFromText(sourceMarkdown);
		if (chapters.length === 0) throw new Error("No chapters found");

		await putJson(env.BOOK_BUCKET, chaptersKey(payload.jobId), chapters);
		await updateStatus(env.STATUS_KV, payload.jobId, {
			currentStep: "source_markdown_saved",
			progress: 1,
			totalSteps: chapters.length + 8,
			totalChapters: chapters.length,
			completedChapters: 0,
		});
		console.log(`[${payload.jobId}] Extracted ${chapters.length} chapters`);

		await env.BOOK_QUEUE.send({ ...payload, type: "detect-title" });
	});
}

async function processDetectTitle(payload: Extract<JobPayload, { type: "detect-title" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, "detect-title", async () => {
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "detecting_title", activeTask: "detect-title" });
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const detected = await detectBookTitle(chapters, llm);
		const bookTitle = isBadTitle(detected) ? titleFromFilename(payload.filename) : detected;
		const translated = !/[\u4e00-\u9fff]/.test(chapters[0]?.content?.slice(0, 200) || "");
		await putJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId), { bookTitle, filename: payload.filename, translated });
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "processing_chapters", progress: 2, outputPath: `output/${bookTitle}/` });
		console.log(`[${payload.jobId}] Book title: ${bookTitle}`);
		await env.BOOK_QUEUE.send({ ...payload, type: "process-chapter", chapterIndex: 0 });
	});
}

async function processChapterJob(payload: Extract<JobPayload, { type: "process-chapter" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, `chapter-${payload.chapterIndex + 1}`, async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		const chapter = chapters[payload.chapterIndex];
		if (!chapter) throw new Error(`Missing chapter index ${payload.chapterIndex}`);

		await updateStatus(env.STATUS_KV, payload.jobId, {
			currentStep: `processing_chapter_${payload.chapterIndex + 1}_of_${chapters.length}`,
			activeTask: `chapter_${payload.chapterIndex + 1}`,
		});
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const file = await processChapter(chapter, payload.chapterIndex, llm);
		const key = `output/${meta.bookTitle}/${file.path}`;
		await putFile(env.BOOK_BUCKET, key, file.content);

		const completed = payload.chapterIndex + 1;
		await updateStatus(env.STATUS_KV, payload.jobId, {
			progress: 2 + completed,
			completedChapters: completed,
			outputFiles: await listPrefix(env.BOOK_BUCKET, `output/${meta.bookTitle}/`),
		});
		console.log(`[${payload.jobId}] Processed chapter ${completed}/${chapters.length}`);

		if (completed < chapters.length) {
			await env.BOOK_QUEUE.send({ ...payload, chapterIndex: completed });
		} else {
			await env.BOOK_QUEUE.send({ ...payload, type: "extract-entities", entityType: "characters" });
		}
	});
}

async function processExtractEntities(payload: Extract<JobPayload, { type: "extract-entities" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, `extract-${payload.entityType}`, async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: `extracting_${payload.entityType}`, activeTask: `extract_${payload.entityType}` });
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const entities = await extractEntities(chapters, payload.entityType, meta.bookTitle, llm);
		await putJson(env.BOOK_BUCKET, entitiesKey(payload.jobId, payload.entityType), entities);
		console.log(`[${payload.jobId}] Extracted ${entities.length} ${payload.entityType}`);

		if (entities.length > 0) {
			await env.BOOK_QUEUE.send({ ...payload, type: "generate-entity-page", entityIndex: 0 });
		} else {
			await enqueueNextEntityStage(payload, env);
		}
	});
}

async function processGenerateEntityPage(payload: Extract<JobPayload, { type: "generate-entity-page" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, `${payload.entityType}-${payload.entityIndex + 1}`, async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		const entities = await requireJson<string[]>(env.BOOK_BUCKET, entitiesKey(payload.jobId, payload.entityType));
		const name = entities[payload.entityIndex];
		if (!name) throw new Error(`Missing ${payload.entityType} index ${payload.entityIndex}`);

		await updateStatus(env.STATUS_KV, payload.jobId, {
			currentStep: `generating_${payload.entityType}_${payload.entityIndex + 1}_of_${entities.length}`,
			activeTask: `${payload.entityType}_${name}`,
		});
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const content = await generateEntityContent(payload.entityType, name, chapters, llm);
		const dir = payload.entityType === "characters" ? "characters" : payload.entityType === "themes" ? "themes" : "places";
		await putFile(env.BOOK_BUCKET, `output/${meta.bookTitle}/wiki/${dir}/${safeName(name)}.md`, content);
		await incrementWikiPages(env.STATUS_KV, payload.jobId);

		const nextIndex = payload.entityIndex + 1;
		if (nextIndex < entities.length) {
			await env.BOOK_QUEUE.send({ ...payload, entityIndex: nextIndex });
		} else {
			await enqueueNextEntityStage(payload, env);
		}
	});
}

async function processExtractParts(payload: Extract<JobPayload, { type: "extract-parts" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, "extract-parts", async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "extracting_parts", activeTask: "extract_parts" });
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const parts = await extractParts(chapters, llm);
		await putJson(env.BOOK_BUCKET, partsKey(payload.jobId), parts);
		if (parts.length > 0) {
			await env.BOOK_QUEUE.send({ ...payload, type: "generate-part-page", partIndex: 0 });
		} else {
			await env.BOOK_QUEUE.send({ ...payload, type: "generate-index" });
		}
	});
}

async function processGeneratePartPage(payload: Extract<JobPayload, { type: "generate-part-page" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, `part-${payload.partIndex + 1}`, async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		const parts = await requireJson<string[]>(env.BOOK_BUCKET, partsKey(payload.jobId));
		const part = parts[payload.partIndex];
		if (!part) throw new Error(`Missing part index ${payload.partIndex}`);
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: `generating_part_${payload.partIndex + 1}_of_${parts.length}`, activeTask: `part_${part}` });
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const content = await generatePartPage(part, chapters, llm);
		await putFile(env.BOOK_BUCKET, `output/${meta.bookTitle}/wiki/parts/${safeName(part)}.md`, content);
		await incrementWikiPages(env.STATUS_KV, payload.jobId);

		const nextIndex = payload.partIndex + 1;
		if (nextIndex < parts.length) {
			await env.BOOK_QUEUE.send({ ...payload, partIndex: nextIndex });
		} else {
			await env.BOOK_QUEUE.send({ ...payload, type: "generate-index" });
		}
	});
}

async function processGenerateIndex(payload: Extract<JobPayload, { type: "generate-index" }>, env: QueueEnv): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, "generate-index", async () => {
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		const characters = await optionalJson<string[]>(env.BOOK_BUCKET, entitiesKey(payload.jobId, "characters"), []);
		const themes = await optionalJson<string[]>(env.BOOK_BUCKET, entitiesKey(payload.jobId, "themes"), []);
		const places = await optionalJson<string[]>(env.BOOK_BUCKET, entitiesKey(payload.jobId, "places"), []);
		const parts = await optionalJson<string[]>(env.BOOK_BUCKET, partsKey(payload.jobId), []);
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "generating_index", activeTask: "index" });
		const llm = new LLMClient(payload.llmEndpoint, payload.llmKey, payload.llmModel);
		const content = await generateIndex(meta.bookTitle, characters, themes, places, parts, llm);
		await putFile(env.BOOK_BUCKET, `output/${meta.bookTitle}/wiki/index.md`, content);
		await incrementWikiPages(env.STATUS_KV, payload.jobId);
		await env.BOOK_QUEUE.send({ ...payload, type: "finalize" });
	});
}

async function processFinalize(payload: Extract<JobPayload, { type: "finalize" }>, env: QueueEnv, vaultR2Config?: VaultR2Config): Promise<void> {
	await runTimed(env.STATUS_KV, payload.jobId, "finalize", async () => {
		const chapters = await requireJson<ExtractedChapter[]>(env.BOOK_BUCKET, chaptersKey(payload.jobId));
		const meta = await requireJson<JobMeta>(env.BOOK_BUCKET, metaKey(payload.jobId));
		await updateStatus(env.STATUS_KV, payload.jobId, { currentStep: "finalizing", activeTask: "finalize" });
		const sourceMarkdown = await env.BOOK_BUCKET.get(sourceMarkdownKey(payload.jobId));
		if (sourceMarkdown) {
			await putFile(env.BOOK_BUCKET, `output/${meta.bookTitle}/source.md`, await sourceMarkdown.text());
		}

		let outputKeys = await listPrefix(env.BOOK_BUCKET, `output/${meta.bookTitle}/`);
		const wikiFiles: WikiFile[] = outputKeys.map((key) => ({ path: key.replace(`output/${meta.bookTitle}/`, ""), content: "" }));
		const logFile = generateLog(meta.bookTitle, meta.filename, chapters, wikiFiles, meta.translated);
		await putFile(env.BOOK_BUCKET, `output/${meta.bookTitle}/${logFile.path}`, logFile.content);
		outputKeys = await listPrefix(env.BOOK_BUCKET, `output/${meta.bookTitle}/`);

		const vaultWriter = vaultR2Config && isVaultR2Configured(vaultR2Config)
			? new VaultR2Writer(vaultR2Config as Required<Omit<VaultR2Config, "prefix">> & { prefix?: string })
			: null;

		if (vaultWriter) {
			for (const key of outputKeys) {
				const obj = await env.BOOK_BUCKET.get(key);
				if (!obj) continue;
				const vaultPath = key.replace("output/", "");
				await vaultWriter.putMarkdown(vaultPath, await obj.text());
			}
			console.log(`[${payload.jobId}] Copied ${outputKeys.length} files to vault R2 destination`);
		}

		await updateStatus(env.STATUS_KV, payload.jobId, {
			status: "complete",
			currentStep: "done",
			activeTask: "done",
			progress: outputKeys.length,
			outputPath: `output/${meta.bookTitle}/`,
			outputFiles: outputKeys,
		});
		console.log(`[${payload.jobId}] Complete. ${outputKeys.length} files saved to output/${meta.bookTitle}/`);
	});
}

async function enqueueNextEntityStage(payload: { jobId: string; filename: string; llmEndpoint: string; llmKey: string; llmModel: string; entityType: EntityType }, env: QueueEnv): Promise<void> {
	const current = ENTITY_TYPES.indexOf(payload.entityType);
	const next = ENTITY_TYPES[current + 1];
	if (next) {
		await env.BOOK_QUEUE.send({ ...payload, type: "extract-entities", entityType: next });
	} else {
		await env.BOOK_QUEUE.send({ ...payload, type: "extract-parts" });
	}
}

async function generateEntityContent(type: EntityType, name: string, chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	if (type === "characters") return generateCharacterPage(name, chapters, llm);
	if (type === "themes") return generateThemePage(name, chapters, llm);
	return generatePlacePage(name, chapters, llm);
}

async function runTimed(statusKv: KVNamespace, jobId: string, task: string, fn: () => Promise<void>): Promise<void> {
	const start = Date.now();
	console.log(`[${jobId}] ${task} start`);
	try {
		await fn();
		const duration = Date.now() - start;
		console.log(`[${jobId}] ${task} done ${duration}ms`);
		await updateStatus(statusKv, jobId, { lastTaskDurationMs: duration, activeTask: task });
	} catch (err) {
		const duration = Date.now() - start;
		await updateStatus(statusKv, jobId, { lastTaskDurationMs: duration, activeTask: task });
		throw err;
	}
}

async function updateStatus(statusKv: KVNamespace, jobId: string, partial: Partial<JobStatus>): Promise<void> {
	const existing = await statusKv.get<JobStatus>(jobId, "json");
	const current = defaultStatus(existing);
	await statusKv.put(jobId, JSON.stringify({ ...current, ...partial, updatedAt: Date.now() }), { expirationTtl: 86400 });
}

function defaultStatus(existing: JobStatus | null): JobStatus {
	return existing || {
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
}

async function incrementWikiPages(statusKv: KVNamespace, jobId: string): Promise<void> {
	const current = defaultStatus(await statusKv.get<JobStatus>(jobId, "json"));
	await updateStatus(statusKv, jobId, { completedWikiPages: current.completedWikiPages + 1 });
}

async function requireJson<T>(bucket: R2Bucket, key: string): Promise<T> {
	const value = await getJson<T>(bucket, key);
	if (!value) throw new Error(`Missing R2 JSON: ${key}`);
	return value;
}

async function optionalJson<T>(bucket: R2Bucket, key: string, fallback: T): Promise<T> {
	return (await getJson<T>(bucket, key)) || fallback;
}

function chaptersKey(jobId: string): string {
	return `jobs/${jobId}/chapters.json`;
}

function sourceMarkdownKey(jobId: string): string {
	return `jobs/${jobId}/source.md`;
}

function metaKey(jobId: string): string {
	return `jobs/${jobId}/meta.json`;
}

function entitiesKey(jobId: string, type: EntityType): string {
	return `jobs/${jobId}/entities/${type}.json`;
}

function partsKey(jobId: string): string {
	return `jobs/${jobId}/parts.json`;
}

function safeName(name: string): string {
	return name.replace(/[\/\\?%*:|"<>]/g, "-");
}

function isBadTitle(title: string): boolean {
	const trimmed = title.trim();
	return !trimmed || trimmed === "未知" || trimmed.includes("无法识别") || trimmed.includes("乱码");
}

function titleFromFilename(filename: string): string {
	return safeName(filename.replace(/\.[^.]+$/, ""));
}
