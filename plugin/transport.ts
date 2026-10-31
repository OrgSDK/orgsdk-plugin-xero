import type { z } from "zod";
export type Fetch = (url: string, options: RequestInit) => Promise<Response>;
const MAX_BYTES = 2 * 1024 * 1024;
export class ProviderError extends Error {}

async function readBody(response: Response): Promise<string> {
	const declaredLength = Number(response.headers.get("content-length") ?? 0);
	if (declaredLength > MAX_BYTES) {
		await response.body?.cancel();
		throw new ProviderError(
			"Xero response exceeded the 2 MiB limit; narrow the request.",
		);
	}
	if (!response.body)
		throw new ProviderError("Xero returned an empty response.");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > MAX_BYTES) {
				await reader.cancel();
				throw new ProviderError(
					"Xero response exceeded the 2 MiB limit; narrow the request.",
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.length;
	}
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function requestJson<T>(
	url: URL,
	headers: Record<string, string>,
	timeoutMs: number,
	schema: z.ZodType<T>,
	fetcher: Fetch = (url, options) => fetch(url, options),
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetcher(url.href, {
			method: "GET",
			headers: { ...headers, Accept: "application/json" },
			redirect: "error",
			signal: controller.signal,
		});
		if (!response.ok) {
			await response.body?.cancel();
			throw new ProviderError(
				`Xero request failed (HTTP ${response.status}); check the connection and permissions, or retry later for 429/5xx.`,
			);
		}
		if (
			!response.headers
				.get("content-type")
				?.toLowerCase()
				.includes("application/json")
		) {
			await response.body?.cancel();
			throw new ProviderError("Xero returned an unexpected content type.");
		}
		const parsed = schema.safeParse(JSON.parse(await readBody(response)));
		if (!parsed.success)
			throw new ProviderError("Xero returned an unexpected response shape.");
		return parsed.data;
	} catch (error) {
		if (error instanceof ProviderError) throw error;
		if (controller.signal.aborted)
			throw new ProviderError("Xero request timed out.");
		throw new ProviderError(
			"Xero request failed; check connectivity and the connection. Provider details were withheld.",
		);
	} finally {
		clearTimeout(timer);
	}
}
