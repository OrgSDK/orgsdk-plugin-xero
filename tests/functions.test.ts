import { describe, expect, it } from "bun:test";
import { z } from "zod";
import manifest from "../plugin/.plugin.json";
import { createClient } from "../plugin/client";
import { parseConfig } from "../plugin/config";
import { createFunctions } from "../plugin/functions";
import createPlugin from "../plugin/index";
import type { Fetch } from "../plugin/transport";
import { testContext } from "./context";
import {
	attachment,
	connection,
	contact,
	contactId,
	credentials,
	invoice,
	invoiceId,
	otherTenantId,
	tenantId,
} from "./fixtures";

function harness(
	response: unknown,
	config: Record<string, unknown> = { tenantId },
) {
	const requests: { url: URL; options: RequestInit }[] = [];
	const fetcher: Fetch = async (url, options) => {
		const parsedUrl = new URL(url);
		requests.push({ url: parsedUrl, options });
		return Response.json(
			parsedUrl.pathname === "/connections" ? [connection] : response,
		);
	};
	const functions = createFunctions(testContext(config).stores.config, fetcher);
	const call = async (
		name: string,
		input: unknown = {},
		credential: unknown = credentials,
	) => {
		const tool = functions.find((fn) => fn.name === name);
		if (!tool) throw new Error("Missing tool");
		return tool.handler(credential, input);
	};
	return { requests, call, functions };
}
describe("Xero named read tools", () => {
	it("verifies only the explicitly configured connected organisation", async () => {
		const { call, requests } = harness(null);
		expect(await call("verifyConnection")).toEqual(connection);
		expect(requests).toHaveLength(1);
		expect(requests[0].url.href).toBe("https://api.xero.com/connections");
		expect(new Headers(requests[0].options.headers).has("Xero-tenant-id")).toBe(
			false,
		);
	});
	it("accepts unrelated non-organisation connections with null names without exposing them", async () => {
		const fetcher: Fetch = async () =>
			Response.json([
				connection,
				{
					...connection,
					tenantId: otherTenantId,
					tenantName: null,
					tenantType: "PRACTICEMANAGER",
				},
			]);
		expect(
			await createClient(
				parseConfig({ tenantId }),
				credentials,
				fetcher,
			).verifyConnection(),
		).toEqual(connection);
	});
	it("fails before accounting reads when the tenant is unconnected", async () => {
		const { call, requests } = harness(
			{ Invoices: [invoice] },
			{ tenantId: otherTenantId },
		);
		await expect(call("getInvoice", { invoiceId })).rejects.toThrow(
			"not an authorised organisation",
		);
		expect(requests).toHaveLength(1);
	});
	it("does not treat a Practice Manager tenant as an accounting organisation", async () => {
		const client = createClient(
			parseConfig({ tenantId }),
			credentials,
			async () =>
				Response.json([{ ...connection, tenantType: "PRACTICEMANAGER" }]),
		);
		await expect(client.verifyConnection()).rejects.toThrow(
			"not an authorised organisation",
		);
	});
	it("lists bounded invoices, retains line items and filters with encoded values", async () => {
		const { call, requests } = harness({ Invoices: [invoice] });
		const result = await call("listInvoices", {
			from: "2026-10-01",
			to: "2026-10-30",
			contactId,
			status: "AUTHORISED",
			type: "ACCREC",
			pageSize: 1,
		});
		expect(result).toMatchObject({
			invoices: [
				{
					Reference: invoice.Reference,
					Total: 220,
					LineItems: invoice.LineItems,
				},
			],
			page: 1,
			pageSize: 1,
			nextPage: 2,
			mayHaveMore: true,
		});
		const request = requests[1];
		expect(request.url.searchParams.get("where")).toBe(
			'Date>=DateTime(2026,10,1) AND Date<=DateTime(2026,10,30) AND Status=="AUTHORISED" AND Type=="ACCREC"',
		);
		expect(request.url.searchParams.get("ContactIDs")).toBe(contactId);
		expect(request.url.searchParams.get("pageSize")).toBe("1");
		expect(request.url.searchParams.get("summaryOnly")).toBe("false");
		expect(new Headers(request.options.headers).get("Xero-tenant-id")).toBe(
			tenantId,
		);
		expect(new Headers(request.options.headers).get("Authorization")).toBe(
			"Bearer synthetic-xero-access-token",
		);
	});
	it("reads a single invoice without exposing unselected provider fields", async () => {
		const { call } = harness({ Invoices: [invoice] });
		const result = await call("getInvoice", { invoiceId });
		expect(result).toMatchObject({
			InvoiceID: invoiceId,
			InvoiceNumber: "INV-0042",
		});
		expect(result).not.toHaveProperty("OnlineInvoiceUrl");
	});
	it("normalizes documented Xero numeric-string amounts without accepting arbitrary coercion", async () => {
		const numeric = {
			...invoice,
			Total: "220.00",
			LineItems: [
				{ ...invoice.LineItems[0], Quantity: "2.0000", UnitAmount: "100.00" },
			],
		};
		expect(
			await harness({ Invoices: [numeric] }).call("getInvoice", { invoiceId }),
		).toMatchObject({
			Total: 220,
			LineItems: [{ Quantity: 2, UnitAmount: 100 }],
		});
		for (const Total of ["", "NaN", "Infinity", "220junk"]) {
			await expect(
				harness({ Invoices: [{ ...invoice, Total }] }).call("getInvoice", {
					invoiceId,
				}),
			).rejects.toThrow("unexpected response shape");
		}
	});

	it("reads contact identity and billing addresses without bank details", async () => {
		const { call } = harness({ Contacts: [contact] });
		const result = await call("getContact", { contactId });
		expect(result).toMatchObject({
			ContactID: contactId,
			Addresses: contact.Addresses,
		});
		expect(result).not.toHaveProperty("BankAccountDetails");
		expect(await call("listContacts", { pageSize: 5 })).toMatchObject({
			contacts: [{ ContactID: contactId }],
			nextPage: null,
			mayHaveMore: false,
		});
	});
	it("returns attachment metadata without following provider URLs", async () => {
		const { call, requests } = harness({ Attachments: [attachment] });
		const result = await call("listInvoiceAttachments", { invoiceId });
		expect(result).toMatchObject({
			invoiceId,
			attachments: [
				{
					AttachmentID: attachment.AttachmentID,
					FileName: "job-report.pdf",
					ContentLength: 4000,
				},
			],
		});
		expect(JSON.stringify(result)).not.toContain("unexpected.example");
		expect(requests).toHaveLength(2);
	});
	it("revalidates tenant access for each call", async () => {
		const { call, requests } = harness({ Contacts: [contact] });
		await call("getContact", { contactId });
		await call("getContact", { contactId });
		expect(
			requests.filter((request) => request.url.pathname === "/connections"),
		).toHaveLength(2);
	});
	it("rejects unsupported endpoints and arbitrary URLs", async () => {
		const client = createClient(
			parseConfig({ tenantId }),
			credentials,
			async () => Response.json([connection]),
		);
		await expect(
			client.get("https://evil.invalid/Invoices", z.unknown()),
		).rejects.toThrow("Unsupported");
		await expect(
			client.get("/api.xro/2.0/Invoices/anything/Email", z.unknown()),
		).rejects.toThrow("Unsupported");
	});
	it("rejects mismatched IDs and oversized result pages", async () => {
		const { call } = harness({
			Invoices: [{ ...invoice, InvoiceID: contactId }],
		});
		await expect(call("getInvoice", { invoiceId })).rejects.toThrow(
			"different invoice",
		);
		const oversized = harness({ Invoices: [invoice, invoice] });
		await expect(
			oversized.call("listInvoices", {
				from: "2026-10-01",
				to: "2026-10-30",
				pageSize: 1,
			}),
		).rejects.toThrow("unexpected response shape");
	});
	for (const input of [
		{ invoiceId, tenantId: otherTenantId },
		{ invoiceId: "../Contacts" },
		{ invoiceId, url: "https://evil.invalid" },
		{ invoiceId, method: "POST" },
	]) {
		it("rejects input overrides before requesting provider data", async () => {
			const { call, requests } = harness(null);
			await expect(call("getInvoice", input)).rejects.toThrow(
				"Invalid Xero arguments",
			);
			expect(requests).toHaveLength(0);
		});
	}
	for (const input of [
		{ from: "2026-10-30", to: "2026-10-01" },
		{ from: "2025-01-01", to: "2026-10-30" },
		{ from: "2026-02-30", to: "2026-03-01" },
		{ from: "2026-10-01", to: "2026-10-30", pageSize: 101 },
		{ from: "2026-10-01", to: "2026-10-30", status: 'AUTHORISED" OR true' },
		{},
	]) {
		it("rejects invalid ranges and bounds before requesting provider data", async () => {
			const { call, requests } = harness(null);
			await expect(call("listInvoices", input)).rejects.toThrow(
				"Invalid Xero arguments",
			);
			expect(requests).toHaveLength(0);
		});
	}
	it("requires attached credentials and explicit config; never uses ambient secrets", async () => {
		const { call, requests } = harness(null);
		for (const value of [
			{},
			{ "xero-oauth": { secret_accessToken: "unsafe\r\nvalue" } },
			{ "xero-oauth": { secret_apiKey: "synthetic" } },
		]) {
			await expect(call("verifyConnection", {}, value)).rejects.toThrow(
				"Attach a xero-oauth credential",
			);
		}
		await expect(harness(null, {}).call("verifyConnection")).rejects.toThrow(
			"Invalid Xero configuration",
		);
		expect(requests).toHaveLength(0);
	});
	it("publishes only the current factory contract, exact provider and read methods", async () => {
		const plugin = await createPlugin(testContext({ tenantId }));
		expect(plugin.config?.schema.safeParse({ tenantId }).success).toBe(true);
		expect(plugin).not.toHaveProperty("authProvider");
		expect(plugin).not.toHaveProperty("httpEndpoints");
		expect(plugin.safeFunctions?.map((fn) => fn.name)).toEqual([
			"verifyConnection",
			"listInvoices",
			"getInvoice",
			"listContacts",
			"getContact",
			"listInvoiceAttachments",
		]);
		for (const tool of plugin.safeFunctions ?? []) {
			expect(tool.requiredCredentials).toEqual(["xero-oauth"]);
			expect(tool.metadata?.readonly).toBe(true);
			expect(tool.typeDeclarations).toContain("XeroInvoice");
		}
		expect(manifest.auth.scopes).toEqual([
			"offline_access",
			"accounting.invoices.read",
			"accounting.contacts.read",
			"accounting.attachments.read",
		]);
	});
});
