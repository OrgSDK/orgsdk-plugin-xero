import type { PluginContext, SafeFunction } from "@orgsdk/plugins";
import { z } from "zod";
import { type Client, createClient } from "./client";
import { parseConfig } from "./config";
import { invoiceListInput, pageFields, xeroDate } from "./inputs";
import {
	attachmentSchema,
	contactSchema,
	declarations,
	invoiceSchema,
} from "./models";
import type { Fetch } from "./transport";

type Parameters = NonNullable<SafeFunction["parameters"]>;
const pageParameters: Parameters = [
	{
		name: "page",
		type: "number",
		optional: true,
		description: "1..10000; one page is fetched per call.",
	},
	{
		name: "pageSize",
		type: "number",
		optional: true,
		description: "1..100; defaults to 50.",
	},
];
export function createFunctions(
	store: PluginContext["stores"]["config"],
	fetcher?: Fetch,
): SafeFunction[] {
	function tool<Input, Output>(
		name: string,
		description: string,
		schema: z.ZodType<Input>,
		parameters: Parameters,
		result: string,
		operation: (client: Client, input: Input) => Promise<Output>,
	): SafeFunction {
		return {
			name,
			description,
			parameters,
			returnType: `Promise<${result}>`,
			typeDeclarations: declarations,
			requiredCredentials: ["xero-oauth"],
			metadata: {
				category: "accounting",
				readonly: true,
				tags: ["readonly", "invoice-readiness"],
			},
			handler: async (credentials: unknown, input: unknown = {}) => {
				const parsed = schema.safeParse(input);
				if (!parsed.success)
					throw new Error(
						"Invalid Xero arguments; use the documented named fields and bounds.",
					);
				const row = await store.get("plugin:xero");
				const config = parseConfig(row?.value ?? {});
				return operation(
					createClient(config, credentials, fetcher),
					parsed.data,
				);
			},
		};
	}
	return [
		tool(
			"verifyConnection",
			"Verify the configured tenant against Xero's authorised connections; return only that organisation.",
			z.strictObject({}),
			[],
			"XeroConnection",
			(client) => client.verifyConnection(),
		),
		tool(
			"listInvoices",
			"Read one page of sales invoices or bills with line items in a date range of at most 366 days. No provider changes.",
			invoiceListInput,
			[
				{
					name: "from",
					type: "string",
					description: "Inclusive invoice date YYYY-MM-DD.",
				},
				{
					name: "to",
					type: "string",
					description: "Inclusive invoice date YYYY-MM-DD.",
				},
				{
					name: "status",
					type: '"DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED"',
					optional: true,
				},
				{ name: "type", type: '"ACCREC" | "ACCPAY"', optional: true },
				{ name: "contactId", type: "string", optional: true },
				...pageParameters,
			],
			"{ invoices: XeroInvoice[]; page: number; pageSize: number; nextPage: number | null; mayHaveMore: boolean }",
			async (client, input) => {
				const filters = [
					`Date>=${xeroDate(input.from)}`,
					`Date<=${xeroDate(input.to)}`,
				];
				if (input.status) filters.push(`Status=="${input.status}"`);
				if (input.type) filters.push(`Type=="${input.type}"`);
				const response = await client.get(
					"/api.xro/2.0/Invoices",
					z.object({ Invoices: z.array(invoiceSchema).max(input.pageSize) }),
					{
						where: filters.join(" AND "),
						ContactIDs: input.contactId,
						page: input.page,
						pageSize: input.pageSize,
						summaryOnly: "false",
						order: "Date ASC",
					},
				);
				const mayHaveMore = response.Invoices.length === input.pageSize;
				return {
					invoices: response.Invoices,
					page: input.page,
					pageSize: input.pageSize,
					nextPage: mayHaveMore && input.page < 10_000 ? input.page + 1 : null,
					mayHaveMore,
				};
			},
		),
		tool(
			"getInvoice",
			"Read one invoice or bill, including reference, totals, status and line items.",
			z.strictObject({ invoiceId: z.uuid() }),
			[{ name: "invoiceId", type: "string" }],
			"XeroInvoice",
			async (client, input) => {
				const response = await client.get(
					`/api.xro/2.0/Invoices/${input.invoiceId}`,
					z.object({ Invoices: z.array(invoiceSchema).length(1) }),
				);
				const invoice = response.Invoices[0];
				if (invoice.InvoiceID.toLowerCase() !== input.invoiceId.toLowerCase())
					throw new Error("Xero returned a different invoice.");
				return invoice;
			},
		),
		tool(
			"listContacts",
			"Read one page of customer/supplier contact and billing identity data.",
			z.strictObject(pageFields),
			pageParameters,
			"{ contacts: XeroContact[]; page: number; pageSize: number; nextPage: number | null; mayHaveMore: boolean }",
			async (client, input) => {
				const response = await client.get(
					"/api.xro/2.0/Contacts",
					z.object({ Contacts: z.array(contactSchema).max(input.pageSize) }),
					{ page: input.page, pageSize: input.pageSize, order: "Name ASC" },
				);
				const mayHaveMore = response.Contacts.length === input.pageSize;
				return {
					contacts: response.Contacts,
					page: input.page,
					pageSize: input.pageSize,
					nextPage: mayHaveMore && input.page < 10_000 ? input.page + 1 : null,
					mayHaveMore,
				};
			},
		),
		tool(
			"getContact",
			"Read one contact's billing identity and addresses.",
			z.strictObject({ contactId: z.uuid() }),
			[{ name: "contactId", type: "string" }],
			"XeroContact",
			async (client, input) => {
				const response = await client.get(
					`/api.xro/2.0/Contacts/${input.contactId}`,
					z.object({ Contacts: z.array(contactSchema).length(1) }),
				);
				const contact = response.Contacts[0];
				if (contact.ContactID.toLowerCase() !== input.contactId.toLowerCase())
					throw new Error("Xero returned a different contact.");
				return contact;
			},
		),
		tool(
			"listInvoiceAttachments",
			"Read attachment metadata for one invoice. Files and provider URLs are not downloaded or exposed.",
			z.strictObject({ invoiceId: z.uuid() }),
			[{ name: "invoiceId", type: "string" }],
			"{ invoiceId: string; attachments: XeroAttachment[] }",
			async (client, input) => {
				const response = await client.get(
					`/api.xro/2.0/Invoices/${input.invoiceId}/Attachments`,
					z.object({ Attachments: z.array(attachmentSchema).max(100) }),
				);
				return {
					invoiceId: input.invoiceId,
					attachments: response.Attachments,
				};
			},
		),
	];
}
