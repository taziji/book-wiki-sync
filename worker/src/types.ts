export type EntityType = "characters" | "themes" | "places";

export type JobPayload =
	| BasePayload & { type: "extract" }
	| BasePayload & { type: "detect-title" }
	| BasePayload & { type: "process-chapter"; chapterIndex: number }
	| BasePayload & { type: "extract-entities"; entityType: EntityType }
	| BasePayload & { type: "generate-entity-page"; entityType: EntityType; entityIndex: number }
	| BasePayload & { type: "extract-parts" }
	| BasePayload & { type: "generate-part-page"; partIndex: number }
	| BasePayload & { type: "generate-index" }
	| BasePayload & { type: "finalize" };

export interface BasePayload {
	jobId: string;
	filename: string;
	llmEndpoint: string;
	llmKey: string;
	llmModel: string;
}

export interface JobStatus {
	status: "queued" | "processing" | "complete" | "partial" | "failed";
	progress: number;
	totalSteps: number;
	currentStep: string;
	completedChapters: number;
	totalChapters: number;
	completedWikiPages: number;
	activeTask?: string;
	lastTaskDurationMs?: number;
	outputPath: string;
	outputFiles: string[];
	errors: string[];
	createdAt: number;
	updatedAt: number;
}

export interface LLMMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ExtractedChapter {
	title: string;
	content: string;
}

export interface WikiFile {
	path: string;
	content: string;
}

export interface JobMeta {
	bookTitle: string;
	filename: string;
	translated: boolean;
}
