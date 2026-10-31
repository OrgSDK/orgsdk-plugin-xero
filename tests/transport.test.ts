import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { type Fetch, requestJson } from "../plugin/transport";

const endpoint = new URL("https://api.xero.com/connections");
const schema = z.object({ ok: z.boolean() });
const headers = { Authorization: "Bearer synthetic-secret-do-not-echo" };
function read(fetcher: Fetch, timeout = 1000) {
	return requestJson(endpoint, headers, timeout, schema, fetcher);
}

describe("bounded read transport", () => {
	it("uses GET, JSON negotiation, a deadline and rejected redirects", async () => {
		const result = await read(async (url, options) => {
			expect(url).toBe(endpoint.href);
			expect(options.method).toBe("GET");
			expect(options.redirect).toBe("error");
			expect(options.signal).toBeInstanceOf(AbortSignal);
			expect(new Headers(options.headers).get("Accept")).toBe(
				"application/json",
			);
			expect(new Headers(options.headers).get("Authorization")).toBe(
				headers.Authorization,
			);
			expect(options.body).toBeUndefined();
			return Response.json({ ok: true, ignored: "extra provider data" });
		});
		expect(result).toEqual({ ok: true });
	});
	for (const status of [302, 401, 403, 404, 429, 500]) {
		it(`withholds raw provider failures for HTTP ${status}`, async () => {
			const result = read(
				async () => new Response("synthetic-secret-do-not-echo", { status }),
			);
			await expect(result).rejects.toThrow(`HTTP ${status}`);
			await result.catch((error: Error) =>
				expect(error.message).not.toContain("synthetic-secret-do-not-echo"),
			);
		});
	}
	it("withholds raw network errors", async () => {
		await expect(
			read(async () => {
				throw new Error(headers.Authorization);
			}),
		).rejects.toThrow("Provider details were withheld");
	});
	it("rejects HTML and malformed JSON", async () => {
		await expect(
			read(
				async () =>
					new Response("<html>private</html>", {
						headers: { "Content-Type": "text/html" },
					}),
			),
		).rejects.toThrow("content type");
		await expect(
			read(
				async () =>
					new Response("synthetic-secret-do-not-echo", {
						headers: { "Content-Type": "application/json" },
					}),
			),
		).rejects.toThrow("Provider details were withheld");
	});
	it("rejects unexpected response shapes without serializing values", async () => {
		await expect(
			read(async () => Response.json({ ok: headers.Authorization })),
		).rejects.toThrow("unexpected response shape");
	});
	it("rejects oversized declared and streamed bodies", async () => {
		await expect(
			read(
				async () =>
					new Response("{}", {
						headers: {
							"Content-Type": "application/json",
							"Content-Length": "3000000",
						},
					}),
			),
		).rejects.toThrow("2 MiB");
		let cancelled = false;
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(new Uint8Array(2 * 1024 * 1024));
				controller.enqueue(new Uint8Array(1));
			},
			cancel() {
				cancelled = true;
			},
		});
		await expect(
			read(
				async () =>
					new Response(stream, {
						headers: { "Content-Type": "application/json" },
					}),
			),
		).rejects.toThrow("2 MiB");
		expect(cancelled).toBe(true);
	});
	it("aborts a slow request and hides its error", async () => {
		const waiting: Fetch = async (_url, options) =>
			new Promise((_resolve, reject) => {
				options.signal?.addEventListener(
					"abort",
					() => reject(new Error(headers.Authorization)),
					{ once: true },
				);
			});
		await expect(read(waiting, 5)).rejects.toThrow("timed out");
	});
	it("keeps its deadline active while consuming the response body", async () => {
		const waiting: Fetch = async (_url, options) =>
			new Response(
				new ReadableStream({
					start(controller) {
						options.signal?.addEventListener(
							"abort",
							() => controller.error(new Error(headers.Authorization)),
							{ once: true },
						);
					},
				}),
				{ headers: { "Content-Type": "application/json" } },
			);
		await expect(read(waiting, 5)).rejects.toThrow("timed out");
	});
});
