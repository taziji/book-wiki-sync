import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	DeleteObjectCommand,
	ListObjectsV2Command,
	HeadObjectCommand,
	S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { R2Settings } from "./types";

export class R2Client {
	private client: S3Client;
	private bucket: string;

	constructor(settings: R2Settings) {
		const config: S3ClientConfig = {
			region: "auto",
			endpoint: settings.endpoint,
			credentials: {
				accessKeyId: settings.accessKeyId,
				secretAccessKey: settings.secretAccessKey,
			},
		};
		this.client = new S3Client(config);
		this.bucket = settings.bucketName;
	}

	async listObjects(): Promise<Map<string, { etag: string; lastModified: Date }>> {
		const result = new Map<string, { etag: string; lastModified: Date }>();
		let continuationToken: string | undefined;

		do {
			const resp = await this.client.send(
				new ListObjectsV2Command({
					Bucket: this.bucket,
					ContinuationToken: continuationToken,
				})
			);

			if (resp.Contents) {
				for (const obj of resp.Contents) {
					if (obj.Key && obj.ETag && obj.LastModified) {
						result.set(obj.Key, {
							etag: obj.ETag.replace(/"/g, ""),
							lastModified: obj.LastModified,
						});
					}
				}
			}

			continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
		} while (continuationToken);

		return result;
	}

	async upload(key: string, data: Uint8Array): Promise<string> {
		const resp = await this.client.send(
			new PutObjectCommand({
				Bucket: this.bucket,
				Key: key,
				Body: data,
			})
		);
		return (resp.ETag || "").replace(/"/g, "");
	}

	async download(key: string): Promise<Uint8Array> {
		const resp = await this.client.send(
			new GetObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
		const bytes = await resp.Body!.transformToByteArray();
		return bytes;
	}

	async delete(key: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: key,
			})
		);
	}

	async head(key: string): Promise<{ etag: string; lastModified: Date } | null> {
		try {
			const resp = await this.client.send(
				new HeadObjectCommand({
					Bucket: this.bucket,
					Key: key,
				})
			);
			return {
				etag: (resp.ETag || "").replace(/"/g, ""),
				lastModified: resp.LastModified!,
			};
		} catch {
			return null;
		}
	}
}
