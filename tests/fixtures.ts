// Synthetic examples following the official Xero JSON response shape.
export const tenantId = "70784a63-d24b-46a9-a4db-0e70a274b056";
export const otherTenantId = "e0da6937-de07-4a14-adee-37abfac298ce";
export const invoiceId = "f0ec0d8c-6fce-4330-bb3b-8306278c6fd8";
export const contactId = "fe61ead1-8afc-4f0b-beda-066620227aad";
export const credentials = {
	"xero-oauth": { secret_accessToken: "synthetic-xero-access-token" },
};
export const connection = {
	id: "e1eede29-f875-4a5d-8470-17f6a29a88b1",
	tenantId,
	tenantType: "ORGANISATION",
	tenantName: "Synthetic Agency Pty Ltd",
	createdDateUtc: "2026-10-01T00:00:00Z",
	updatedDateUtc: "2026-10-01T00:00:00Z",
};
export const contact = {
	ContactID: contactId,
	Name: "Synthetic Customer",
	ContactStatus: "ACTIVE",
	EmailAddress: "accounts@example.invalid",
	IsCustomer: true,
	Addresses: [
		{
			AddressType: "POBOX",
			City: "Brisbane",
			PostalCode: "4000",
			Country: "Australia",
		},
	],
	BankAccountDetails: "excluded-bank-details",
};
export const invoice = {
	InvoiceID: invoiceId,
	Type: "ACCREC",
	Status: "AUTHORISED",
	InvoiceNumber: "INV-0042",
	Reference: "Harvest 1050 / Project WEB-7",
	Contact: { ContactID: contactId, Name: "Synthetic Customer" },
	DateString: "2026-10-15T00:00:00",
	DueDateString: "2026-10-30T00:00:00",
	CurrencyCode: "AUD",
	LineAmountTypes: "Exclusive",
	SubTotal: 200,
	TotalTax: 20,
	Total: 220,
	AmountDue: 220,
	AmountPaid: 0,
	HasAttachments: true,
	LineItems: [
		{
			Description: "Website support",
			Quantity: 2,
			UnitAmount: 100,
			TaxAmount: 20,
			LineAmount: 200,
			AccountCode: "200",
			TaxType: "OUTPUT",
		},
	],
	OnlineInvoiceUrl: "excluded-public-invoice-access-url",
};
export const attachment = {
	AttachmentID: "9808ad7f-c8d4-41cf-995e-bc29cb76fd2c",
	FileName: "job-report.pdf",
	MimeType: "application/pdf",
	ContentLength: 4000,
	Url: "https://unexpected.example.invalid/private",
	IncludeOnline: false,
};
