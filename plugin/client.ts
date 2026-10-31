import { z } from "zod";
import type { Config } from "./config";
import { accessToken } from "./config";
import { connectionSchema } from "./models";
import { type Fetch, ProviderError, requestJson } from "./transport";

const accountingPath =
	/^\/api\.xro\/2\.0\/(Invoices(?:\/[0-9a-f-]{36}(?:\/Attachments)?)?|Contacts(?:\/[0-9a-f-]{36})?)$/i;
export function createClient(
	config: Config,
	credentials: unknown,
	fetcher?: Fetch,
) {
	const token = accessToken(credentials);
	function request<T>(
		path: string,
		schema: z.ZodType<T>,
		query: Record<string, string | number | undefined> = {},
	) {
		if (path !== "/connections" && !accountingPath.test(path))
			throw new ProviderError("Unsupported Xero read endpoint.");
		const url = new URL(path, "https://api.xero.com");
		for (const [key, value] of Object.entries(query)) {
			if (value !== undefined) url.searchParams.set(key, String(value));
		}
		const headers: Record<string, string> = {
			Authorization: `Bearer ${token}`,
		};
		if (path !== "/connections") headers["Xero-tenant-id"] = config.tenantId;
		return requestJson(url, headers, config.timeoutMs, schema, fetcher);
	}
	async function verifyConnection() {
		const connections = await request(
			"/connections",
			z.array(connectionSchema).max(1000),
		);
		const selected = connections.find(
			(connection) =>
				connection.tenantId.toLowerCase() === config.tenantId.toLowerCase() &&
				connection.tenantType === "ORGANISATION",
		);
		if (!selected)
			throw new ProviderError(
				"The configured Xero tenant is not an authorised organisation; reconnect or correct tenantId.",
			);
		return selected;
	}
	return {
		verifyConnection,
		async get<T>(
			path: string,
			schema: z.ZodType<T>,
			query?: Record<string, string | number | undefined>,
		) {
			await verifyConnection();
			return request(path, schema, query);
		},
	};
}
export type Client = ReturnType<typeof createClient>;
