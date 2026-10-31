import assert from "node:assert/strict";

const tenantId = "70784a63-d24b-46a9-a4db-0e70a274b056";
const invoiceId = "f0ec0d8c-6fce-4330-bb3b-8306278c6fd8";
const contactId = "fe61ead1-8afc-4f0b-beda-066620227aad";
const invoice = {
	InvoiceID: invoiceId,
	Type: "ACCREC",
	Status: "AUTHORISED",
	Reference: "JOB-81",
};
const contact = { ContactID: contactId, Name: "Synthetic client" };
export default async function createFixture() {
	return {
		configuration: { tenantId: "70784a63-d24b-46a9-a4db-0e70a274b056" },
		provider: "xero-oauth",
		secret: { source: "byo", secret_accessToken: "synthetic-xero" },
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://api.xero.com");
			assert.equal(request.method, "GET");
			assert.equal(
				request.headers.get("authorization"),
				"Bearer synthetic-xero",
			);
			if (url.pathname === "/connections")
				return Response.json([
					{
						id: "e1eede29-f875-4a5d-8470-17f6a29a88b1",
						tenantId,
						tenantType: "ORGANISATION",
					},
				]);
			assert.equal(request.headers.get("xero-tenant-id"), tenantId);
			const responses = {
				"/api.xro/2.0/Invoices": { Invoices: [invoice] },
				[`/api.xro/2.0/Invoices/${invoiceId}`]: { Invoices: [invoice] },
				"/api.xro/2.0/Contacts": { Contacts: [contact] },
				[`/api.xro/2.0/Contacts/${contactId}`]: { Contacts: [contact] },
				[`/api.xro/2.0/Invoices/${invoiceId}/Attachments`]: { Attachments: [] },
			};
			assert(Object.hasOwn(responses, url.pathname), url.pathname);
			return Response.json(responses[url.pathname]);
		},
		async run(call) {
			assert.equal((await call("verifyConnection")).tenantId, tenantId);
			assert.equal(
				(await call("listInvoices", { from: "2026-10-01", to: "2026-10-31" }))
					.invoices[0].InvoiceID,
				invoiceId,
			);
			assert.equal(
				(await call("getInvoice", { invoiceId })).InvoiceID,
				invoiceId,
			);
			assert.equal(
				(await call("listContacts")).contacts[0].ContactID,
				contactId,
			);
			assert.equal(
				(await call("getContact", { contactId })).ContactID,
				contactId,
			);
			assert.equal(
				(await call("listInvoiceAttachments", { invoiceId })).attachments
					.length,
				0,
			);
		},
	};
}
