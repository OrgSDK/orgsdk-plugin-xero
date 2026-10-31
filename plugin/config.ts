import { z } from "zod";
export const configSchema = z.strictObject({
	tenantId: z
		.uuid()
		.describe(
			"Exact Xero organisation tenant ID obtained using trusted authorised /connections setup tooling. Configure it explicitly.",
		),
	timeoutMs: z.number().int().min(1000).max(30_000).default(15_000).optional(),
});
export function parseConfig(input: unknown) {
	const parsed = configSchema.safeParse(input);
	if (!parsed.success)
		throw new Error(
			"Invalid Xero configuration; set the explicit account identifier and a timeout between 1000 and 30000ms.",
		);
	return { ...parsed.data, timeoutMs: parsed.data.timeoutMs ?? 15_000 };
}
export type Config = ReturnType<typeof parseConfig>;
export function accessToken(credentials: unknown): string {
	const parsed = z
		.object({
			"xero-oauth": z.object({
				secret_accessToken: z
					.string()
					.min(1)
					.max(8192)
					.regex(/^[\x21-\x7e]+$/),
			}),
		})
		.safeParse(credentials);
	if (!parsed.success)
		throw new Error(
			"Attach a xero-oauth credential containing secret_accessToken.",
		);
	return parsed.data["xero-oauth"].secret_accessToken;
}
