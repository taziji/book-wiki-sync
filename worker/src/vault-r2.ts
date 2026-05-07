import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface VaultR2Config {
	endpoint?: string;
	accessKeyId?: string;
	secretAccessKey?: string;
	bucket?: string;
	prefix?: string;
}

export function isVaultR2Configured(config: VaultR2Config): boolean {
	return !!(
		config.endpoint &&
		config.accessKeyId &&
		config.secretAccessKey &&
		config.bucket
	);
}

export class VaultR2Writer {
	private client: S3Client;
	private bucket: string;
	private prefix: string;

	constructor(config: Required<Omit<VaultR2Config, "prefix">> & { prefix?: string }) {
		this.client = new S3Client({
			region: "auto",
			endpoint: config.endpoint,
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
		});
		this.bucket = config.bucket;
		this.prefix = normalizePrefix(config.prefix || "");
	}

	async putMarkdown(path: string, content: string): Promise<void> {
		await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: `${this.prefix}${path}`,
				Body: content,
				ContentType: "text/markdown; charset=utf-8",
			})
		);
	}
}

function normalizePrefix(prefix: string): string {
	const trimmed = prefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
	return trimmed ? `${trimmed}/` : "";
}
