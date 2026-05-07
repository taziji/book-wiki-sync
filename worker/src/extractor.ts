import type { ExtractedChapter } from "./types";

interface PdfLine {
	text: string;
	x: number;
	y: number;
	fontSize: number;
	page: number;
}

export async function extractMarkdownFromPDF(data: ArrayBuffer): Promise<string> {
	ensurePdfJsPolyfills();
	const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
	(globalThis as any).pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(data),
		disableWorker: true,
		disableFontFace: true,
		isEvalSupported: false,
		useSystemFonts: true,
	} as any);
	const pdf = await loadingTask.promise;
	const pages: string[] = [];

	for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
		const page = await pdf.getPage(pageNum);
		const textContent = await page.getTextContent({ includeMarkedContent: false });
		const lines = buildPageLines(textContent.items as any[], pageNum);
		const markdown = pageLinesToMarkdown(lines);
		if (markdown.trim()) {
			pages.push(`<!-- page: ${pageNum} -->\n\n${markdown}`);
		}
	}

	const markdown = cleanupMarkdown(pages.join("\n\n---\n\n"));
	if (!markdown || looksLikeGarbage(markdown)) {
		throw new Error("PDF text extraction produced unreadable Markdown. This may be a scanned PDF. Try a selectable-text PDF or OCR first.");
	}
	return markdown;
}

function buildPageLines(items: any[], pageNum: number): PdfLine[] {
	const grouped: PdfLine[] = [];
	let current: PdfLine | null = null;

	const textItems = items
		.filter((item) => typeof item.str === "string" && item.str.trim())
		.map((item) => {
			const transform = item.transform as number[];
			return {
				text: item.str,
				x: transform[4] || 0,
				y: transform[5] || 0,
				fontSize: Math.abs(transform[3] || transform[0] || 0),
				page: pageNum,
			};
		})
		.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);

	for (const item of textItems) {
		if (!current || Math.abs(item.y - current.y) > 3) {
			if (current) grouped.push(current);
			current = { ...item, text: item.text.trim() };
			continue;
		}

		const needsSpace = current.text.length > 0 && item.x - (current.x + current.text.length * current.fontSize * 0.45) > current.fontSize * 0.6;
		current.text += `${needsSpace ? " " : ""}${item.text.trim()}`;
		current.fontSize = Math.max(current.fontSize, item.fontSize);
	}

	if (current) grouped.push(current);
	return grouped.filter((line) => line.text.length > 0);
}

function pageLinesToMarkdown(lines: PdfLine[]): string {
	const output: string[] = [];
	const bodyFontSize = median(lines.map((line) => line.fontSize).filter((size) => size > 0)) || 10;
	let lastY: number | null = null;

	for (const line of lines) {
		const text = normalizeLineText(line.text);
		if (!text || isLikelyPageNoise(text)) continue;

		const gap = lastY === null ? 0 : Math.abs(lastY - line.y);
		const heading = isLikelyHeading(text, line.fontSize, bodyFontSize);

		if (heading) {
			output.push("", `## ${text}`, "");
		} else if (gap > bodyFontSize * 1.8) {
			output.push("", text);
		} else {
			output.push(text);
		}

		lastY = line.y;
	}

	return output.join("\n");
}

export async function extractChaptersFromText(fullText: string): Promise<ExtractedChapter[]> {
	const normalized = fullText
		.replace(/\r\n/g, "\n")
		.replace(/\r/g, "\n")
		.replace(/(^|\n)(#{1,6}\s*)?(第[零一二三四五六七八九十百千万\d]+[章节回卷]\b)/g, "$1$2$3")
		.replace(/(^|\n)(#{1,6}\s*)?(Chapter\s+\d+\b)/gi, "$1$2$3")
		.replace(/\n{3,}/g, "\n\n");
	const lines = normalized.split("\n");
	const chapters: ExtractedChapter[] = [];
	let currentTitle = "前言";
	let currentContent: string[] = [];

	for (const line of lines) {
		const trimmed = line.trim().replace(/^#+\s*/, "");
		const isChapter = isChapterHeading(line);

		if (isChapter && trimmed.length < 100) {
			if (currentContent.length > 0 || currentTitle !== "前言") {
				chapters.push({
					title: currentTitle,
					content: currentContent.join("\n").trim(),
				});
			}
			currentTitle = trimmed;
			currentContent = [];
		} else {
			currentContent.push(line);
		}
	}

	if (currentContent.length > 0) {
		chapters.push({
			title: currentTitle,
			content: currentContent.join("\n").trim(),
		});
	}

	const filtered = chapters.filter((ch) => ch.content.length > 50);
	if (shouldChunkInstead(normalized, filtered)) {
		return chunkLargeText(normalized);
	}
	return filtered;
}

function isChapterHeading(line: string): boolean {
	const raw = line.trim();
	const hasMarkdownHeading = /^#{1,6}\s+/.test(raw);
	const text = raw.replace(/^#+\s*/, "");
	if (text.length === 0 || text.length >= 100) return false;

	if (/^(序言|序章|引言|前言|尾声|后记|附录|結語|结语)$/i.test(text)) return true;
	if (/^(PROLOGUE|EPILOGUE)$/i.test(text)) return true;
	if (/^(Chapter\s+\d+|Part\s+\d+|BOOK\s+[IVXLCDM\d]+)\b/i.test(text)) return true;
	if (/^第[零一二三四五六七八九十百千万\d]+[章节回卷](\s|$|[：:、.-])/.test(text)) return true;

	// 部/篇 are common inside prose, e.g. “第一部小说” or “第五篇。回顾过去”.
	// Only treat them as structural headings when PDF.js already marked the line as a heading
	// and the text looks like a standalone title.
	if (hasMarkdownHeading && /^第[零一二三四五六七八九十百千万\d]+[部篇](\s|$|[：:、.-])/.test(text)) return true;
	return false;
}

function shouldChunkInstead(text: string, chapters: ExtractedChapter[]): boolean {
	if (text.length <= 12000) return false;
	if (chapters.length <= 1) return true;
	const averageChapterSize = text.length / chapters.length;
	const largestChapterSize = Math.max(...chapters.map((ch) => ch.content.length));
	return chapters.length <= 3 && (averageChapterSize > 12000 || largestChapterSize > 16000);
}

function chunkLargeText(text: string): ExtractedChapter[] {
	const chunks: ExtractedChapter[] = [];
	const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
	let current: string[] = [];
	let size = 0;
	const targetSize = 6500;

	for (const paragraph of paragraphs) {
		current.push(paragraph);
		size += paragraph.length;
		if (size >= targetSize) {
			chunks.push({
				title: `第${String(chunks.length + 1).padStart(2, "0")}章`,
				content: current.join("\n\n"),
			});
			current = [];
			size = 0;
		}
	}

	if (current.length > 0) {
		chunks.push({
			title: `第${String(chunks.length + 1).padStart(2, "0")}章`,
			content: current.join("\n\n"),
		});
	}

	return chunks;
}

function normalizeLineText(text: string): string {
	return text
		.replace(/[ \t]{2,}/g, " ")
		.replace(/\s+([，。！？；：、,.!?;:])/g, "$1")
		.trim();
}

function isLikelyHeading(text: string, fontSize: number, bodyFontSize: number): boolean {
	if (/^(第[零一二三四五六七八九十百千万\d]+[章节回卷](\s|$|[：:、.-])|Chapter\s+\d+|Part\s+\d+|BOOK\s+[IVXLCDM\d]+|PROLOGUE|EPILOGUE|序言|序章|引言|前言|尾声|后记|附录|結語|结语)/i.test(text)) {
		return text.length < 100;
	}
	if (/^第[零一二三四五六七八九十百千万\d]+[部篇](\s|$|[：:、.-])/.test(text)) {
		return text.length < 50 && fontSize >= bodyFontSize * 1.2;
	}
	return text.length <= 40 && fontSize >= bodyFontSize * 1.25 && !/[。！？.!?]$/.test(text);
}

function isLikelyPageNoise(text: string): boolean {
	if (/^\d{1,4}$/.test(text)) return true;
	if (/^[-–—_\s]+$/.test(text)) return true;
	return false;
}

function cleanupMarkdown(markdown: string): string {
	return markdown
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\n\s+\n/g, "\n\n")
		.replace(/[ \t]+\n/g, "\n")
		.trim();
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function looksLikeGarbage(text: string): boolean {
	const sample = text.slice(0, 2000);
	const readable = (sample.match(/[\u4e00-\u9fffA-Za-z0-9]/g) || []).length;
	const controls = (sample.match(/[\x00-\x08\x0E-\x1F\uFFFD]/g) || []).length;
	return sample.length > 100 && (readable / sample.length < 0.25 || controls > 10);
}

function ensurePdfJsPolyfills(): void {
	const g = globalThis as any;
	if (!g.DOMMatrix) {
		g.DOMMatrix = class DOMMatrix {
			a = 1;
			b = 0;
			c = 0;
			d = 1;
			e = 0;
			f = 0;
			constructor(init?: number[]) {
				if (Array.isArray(init)) {
					[this.a, this.b, this.c, this.d, this.e, this.f] = init;
				}
			}
			multiply() { return this; }
			translate() { return this; }
			scale() { return this; }
			rotate() { return this; }
			inverse() { return this; }
		};
	}
	if (!g.ImageData) {
		g.ImageData = class ImageData {
			constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
		};
	}
	if (!g.Path2D) {
		g.Path2D = class Path2D {};
	}
}
