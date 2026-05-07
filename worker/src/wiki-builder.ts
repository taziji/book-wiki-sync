import { LLMClient } from "./llm";
import type { EntityType, ExtractedChapter, WikiFile } from "./types";

const SYSTEM_PROMPT = `你是一位精通文学分析、中文编辑、翻译和 Obsidian 知识图谱的专家。你的任务是把书籍内容做成 Obsidian 风格的中文 Karpathy-style LLM Wiki。

总体要求：
1. 中文为主。
2. 如果原文是英文或其他非中文语言，翻译成自然、文学化的简体中文 Markdown，不要机械直译。
3. 如果原文已经是中文，保持原文表达，不要改写成翻译腔，只清理格式并整理成 Markdown。
4. 保留人名、地名、机构名等专有名词的原文形式，除非原书已有固定中文译名。
5. 为重要人物、地点、组织、主题和关键事件加入 Obsidian [[双链]]。
6. 所有总结、人物页、主题页必须基于原文章节内容，不要写空泛概念。
7. 输出必须是可直接放入 Obsidian 的 Markdown。`;

export async function buildWikiFiles(
	chapters: ExtractedChapter[],
	bookTitle: string,
	llm: LLMClient
): Promise<WikiFile[]> {
	const files: WikiFile[] = [];

	const chapterFiles = await processChapters(chapters, llm);
	files.push(...chapterFiles);

	const characters = await extractEntities(chapters, "characters", bookTitle, llm);
	for (const char of characters) {
		const page = await generateCharacterPage(char, chapters, llm);
		files.push({ path: `wiki/characters/${safeFileName(char)}.md`, content: page });
	}

	const themes = await extractEntities(chapters, "themes", bookTitle, llm);
	for (const theme of themes) {
		const page = await generateThemePage(theme, chapters, llm);
		files.push({ path: `wiki/themes/${safeFileName(theme)}.md`, content: page });
	}

	const places = await extractEntities(chapters, "places", bookTitle, llm);
	for (const place of places) {
		const page = await generatePlacePage(place, chapters, llm);
		files.push({ path: `wiki/places/${safeFileName(place)}.md`, content: page });
	}

	const parts = await extractParts(chapters, llm);
	for (const part of parts) {
		const page = await generatePartPage(part, chapters, llm);
		const safeName = safeFileName(part);
		files.push({ path: `wiki/parts/${safeName}.md`, content: page });
	}

	const index = await generateIndex(bookTitle, characters, themes, places, parts, llm);
	files.push({ path: `wiki/index.md`, content: index });

	return files;
}

export async function detectBookTitle(chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	const sample = chapters.slice(0, 3).map((c) => `${c.title}\n${c.content.slice(0, 800)}`).join("\n\n");
	const resp = await llm.chatWithRetry([
		{ role: "system", content: "根据以下书籍内容，识别这本书的书名。只输出书名，不要解释。如果无法可靠识别，输出：未知。" },
		{ role: "user", content: sample },
	]);
	const title = resp.trim().split("\n")[0].replace(/["""'《》]/g, "");
	return safeFileName(title);
}

async function processChapters(chapters: ExtractedChapter[], llm: LLMClient): Promise<WikiFile[]> {
	const files: WikiFile[] = [];

	for (let i = 0; i < chapters.length; i++) {
 		files.push(await processChapter(chapters[i], i, llm));
	}

	return files;
}

export async function processChapter(chapter: ExtractedChapter, chapterIndex: number, llm: LLMClient): Promise<WikiFile> {
	const num = String(chapterIndex + 1).padStart(2, "0");
	const filename = `第${num}章.md`;

	const processed = await llm.chatWithRetry([
		{ role: "system", content: SYSTEM_PROMPT },
		{
			role: "user",
			content: `以下是书籍的一个章节。请按要求处理成 Obsidian 可用的中文 Markdown：

处理要求：
1. 判断原文语言：非中文请翻译成简体中文；中文请保持原文表达，只清理格式。
2. 保留段落结构，删除明显页眉、页脚、页码、乱码和重复导航。
3. 为重要人物、地点、组织、主题、概念和关键事件添加 [[双链]]。
4. 保留专有名词原文形式，除非已有固定中文译名。
5. 不要添加章节标题行，我会自动添加。
6. 不要输出解释、免责声明或处理报告，只输出正文 Markdown。

章节标题：${chapter.title}

正文：
${chapter.content}`,
		},
	]);

	return {
		path: filename,
		content: `# ${chapter.title}\n\n${processed.trim()}`,
	};
}

export async function extractEntities(
	chapters: ExtractedChapter[],
	type: EntityType,
	bookTitle: string,
	llm: LLMClient
): Promise<string[]> {
	const sample = chapters.slice(0, 5).map((c) => `${c.title}\n${c.content.slice(0, 1000)}`).join("\n\n");

	const countHint = type === "characters"
		? "主要人物、作者、重要配角、反复出现的现实人物或思想家（如非小说，也要提取关键人物）"
		: type === "themes"
			? "全书核心主题（5-10个，必须来自原文反复讨论的问题）"
			: "重要地点、国家、城市、机构场所或反复出现的空间（如无明确地点，可输出空）";

	const resp = await llm.chatWithRetry([
		{
			role: "system",
			content: `你是一位文学分析和知识图谱专家。请从《${bookTitle}》的章节内容中提取${countHint}。

规则：
1. 每行只输出一个名称。
2. 不要编号，不要解释，不要 Markdown 列表符号。
3. 不要输出“无”“未知”“无标题”。
4. 人物必须是具体人名、作者、历史人物或书中关键行动者，不要把抽象主题当人物。
5. 主题必须是名词短语，例如“风险转嫁”“权力不对称”“代理问题”。
6. 地点必须是具体地点、国家、城市、机构或场所。`,
		},
		{ role: "user", content: sample },
	]);

	return resp
		.trim()
		.split("\n")
		.map((line) => line.replace(/^[\d\.\-\*\s]+/, "").trim())
		.filter(isValidEntityName)
		.slice(0, type === "themes" ? 10 : 12);
}

export async function extractParts(chapters: ExtractedChapter[], llm: LLMClient): Promise<string[]> {
	const titles = chapters.map((c) => c.title).join("\n");
	const resp = await llm.chatWithRetry([
		{
			role: "system",
			content: `以下是一本书的章节标题列表。如果书中有 Part / 卷 / 部 / 篇 等大结构，请列出它们。
每行一个部分名称。如果没有明显的分卷结构，输出"无"。不要编造不存在的部分。`,
		},
		{ role: "user", content: titles },
	]);

	if (resp.trim().includes("无")) return [];

	return resp
		.trim()
		.split("\n")
		.map((line) => line.replace(/^[\d\.\-\*\s]+/, "").trim())
		.filter((line) => line.length > 0);
}

export async function generateCharacterPage(name: string, chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	const relevant = findRelevantChapters(name, chapters);
	const context = relevant.map((c) => `${c.title}: ${c.content.slice(0, 900)}`).join("\n\n");

	const content = await llm.chatWithRetry([
		{
			role: "system",
			content: `${SYSTEM_PROMPT}\n\n为人物 ${name} 创建 Obsidian 人物页。严格按照模板格式，内容必须基于原文证据。不要写空泛介绍。`,
		},
		{
			role: "user",
			content: `人物：${name}

请使用以下模板输出完整 Markdown：

## 角色简介

## 人物弧线

## 关键关系

## 重要引语

## 主题关联

要求：尽量使用 [[双链]] 连接相关人物、主题、地点和关键事件。如果原文证据不足，请写“原文证据不足”，不要编造。

相关章节内容：
${context}`,
		},
	]);

	const firstAppear = relevant.length > 0 ? relevant[0].title : "未知";

	return `---
tags: [人物]
aliases: []
first_appear: ${firstAppear}
---

# ${name}

${content.trim()}`;
}

export async function generateThemePage(theme: string, chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	const relevant = findRelevantChapters(theme, chapters);
	const context = relevant.map((c) => `${c.title}: ${c.content.slice(0, 700)}`).join("\n\n");

	const content = await llm.chatWithRetry([
		{
			role: "system",
			content: `${SYSTEM_PROMPT}\n\n为主题"${theme}"创建 Obsidian 主题页。严格按照模板格式，内容必须基于原文场景和论述。`,
		},
		{ role: "user", content: `主题：${theme}

请使用以下模板输出完整 Markdown：

## 概述

## 关键场景

## 相关人物

## 与其他主题的关联

要求：尽量使用 [[双链]]。必须引用或概括具体章节内容，不要写泛泛的哲学总结。

相关内容：
${context}` },
	]);

	return `---
tags: [主题]
---

# ${theme}

${content.trim()}`;
}

export async function generatePlacePage(place: string, chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	const relevant = findRelevantChapters(place, chapters);
	const context = relevant.map((c) => `${c.title}: ${c.content.slice(0, 700)}`).join("\n\n");

	const content = await llm.chatWithRetry([
		{
			role: "system",
			content: `${SYSTEM_PROMPT}\n\n为地点"${place}"创建 Obsidian 地点页。严格按照模板格式，内容必须基于原文。`,
		},
		{ role: "user", content: `地点：${place}

请使用以下模板输出完整 Markdown：

## 概述

## 在小说中的角色

## 相关人物

## 相关章节

要求：尽量使用 [[双链]]。如果这是非小说，也请解释该地点/机构/国家在论述中的作用。

相关内容：
${context}` },
	]);

	return `---
tags: [地点]
---

# ${place}

${content.trim()}`;
}

export async function generatePartPage(partName: string, chapters: ExtractedChapter[], llm: LLMClient): Promise<string> {
	const context = chapters.map((c) => `${c.title}`).join("\n");

	const content = await llm.chatWithRetry([
		{
			role: "system",
			content: `${SYSTEM_PROMPT}\n\n为"${partName}"创建部分概览页。必须输出概述、剧情/论述摘要、核心人物、关键事件。`,
		},
		{ role: "user", content: `部分：${partName}\n\n章节列表：\n${context}` },
	]);

	return `---
tags: [部分概览]
---

# ${partName}

${content.trim()}`;
}

export async function generateIndex(
	bookTitle: string,
	characters: string[],
	themes: string[],
	places: string[],
	parts: string[],
	llm: LLMClient
): Promise<string> {
	const charList = characters.map((c) => `- [[${c}]] — `).join("\n");
	const themeList = themes.map((t) => `- [[${t}]] — `).join("\n");
	const placeList = places.map((p) => `- [[${p}]] — `).join("\n");
	const partList = parts.map((p) => {
		const safeName = safeFileName(p);
		return `- [[${safeName}]] — `;
	}).join("\n");

	const content = await llm.chatWithRetry([
		{
			role: "system",
			content: `请为《${bookTitle}》的 wiki/index.md 补充一句话摘要。直接输出补充后的完整索引，不要解释。每行保持 Obsidian 链接格式。`,
		},
		{
			role: "user",
			content: `# ${bookTitle} - Wiki 索引

## 人物
${charList}

## 主题
${themeList}

## 地点
${placeList}

## 部分概览
${partList}`,
		},
	]);

	return content.trim();
}

export function generateLog(
	bookTitle: string,
	filename: string,
	chapters: ExtractedChapter[],
	wikiFiles: WikiFile[],
	translated: boolean
): WikiFile {
	const charCount = wikiFiles.filter((f) => f.path.startsWith("wiki/characters/")).length;
	const themeCount = wikiFiles.filter((f) => f.path.startsWith("wiki/themes/")).length;
	const placeCount = wikiFiles.filter((f) => f.path.startsWith("wiki/places/")).length;
	const partCount = wikiFiles.filter((f) => f.path.startsWith("wiki/parts/")).length;

	return {
		path: "wiki/log.md",
		content: `# 构建日志

- 处理日期：${new Date().toISOString().split("T")[0]}
- 原书文件：${filename}
- 书名：${bookTitle}
- 是否翻译：${translated ? "是" : "否"}
- 章节数量：${chapters.length}
- 人物页数量：${charCount}
- 主题页数量：${themeCount}
- 地点页数量：${placeCount}
- 部分概览页数量：${partCount}
- 总文件数：${wikiFiles.length + 1}
`,
	};
}

function findRelevantChapters(entity: string, chapters: ExtractedChapter[]): ExtractedChapter[] {
	return chapters.filter((ch) => ch.content.includes(entity)).slice(0, 5);
}

function isValidEntityName(name: string): boolean {
	if (name.length === 0 || name.length > 40) return false;
	if (/^(无|未知|无标题|没有|不详|N\/A|null|none)$/i.test(name)) return false;
	if (/^(人物|主题|地点|机构|组织|角色|概念)[:：]?$/i.test(name)) return false;
	if (/^[\p{P}\p{S}\s]+$/u.test(name)) return false;
	if (/[\n\r#\[\]{}]/.test(name)) return false;
	return /[\p{L}\p{N}\u4e00-\u9fff]/u.test(name);
}

function safeFileName(name: string): string {
	return name
		.replace(/[/\\?%*:|"<>]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80) || "未知";
}
