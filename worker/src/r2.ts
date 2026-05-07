import { R2Bucket } from "@cloudflare/workers-types";

export async function putFile(bucket: R2Bucket, key: string, data: string | ArrayBuffer | Uint8Array): Promise<void> {
	await bucket.put(key, data);
}

export async function putJson<T>(bucket: R2Bucket, key: string, data: T): Promise<void> {
	await bucket.put(key, JSON.stringify(data));
}

export async function getJson<T>(bucket: R2Bucket, key: string): Promise<T | null> {
	const obj = await bucket.get(key);
	if (!obj) return null;
	return obj.json<T>();
}

export async function getFile(bucket: R2Bucket, key: string): Promise<ArrayBuffer | null> {
	const obj = await bucket.get(key);
	if (!obj) return null;
	return obj.arrayBuffer();
}

export async function listPrefix(bucket: R2Bucket, prefix: string): Promise<string[]> {
	const listed = await bucket.list({ prefix });
	return listed.objects.map((obj) => obj.key);
}

export async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
	const listed = await bucket.list({ prefix });
	for (const obj of listed.objects) {
		await bucket.delete(obj.key);
	}
}
