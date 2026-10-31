import { z } from "zod";

const text = z.string().max(100_000);
const maybeText = text.nullish();
const amount = z
	.union([
		z.number().finite(),
		z
			.string()
			.max(64)
			.regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/)
			.transform(Number)
			.pipe(z.number().finite()),
	])
	.nullish();
export const contactSchema = z.object({
	ContactID: z.uuid(),
	Name: text,
	ContactStatus: maybeText,
	AccountNumber: maybeText,
	ContactNumber: maybeText,
	FirstName: maybeText,
	LastName: maybeText,
	EmailAddress: maybeText,
	IsSupplier: z.boolean().optional(),
	IsCustomer: z.boolean().optional(),
	DefaultCurrency: maybeText,
	TaxNumber: maybeText,
	Addresses: z
		.array(
			z.object({
				AddressType: maybeText,
				AddressLine1: maybeText,
				AddressLine2: maybeText,
				AddressLine3: maybeText,
				AddressLine4: maybeText,
				City: maybeText,
				Region: maybeText,
				PostalCode: maybeText,
				Country: maybeText,
			}),
		)
		.max(20)
		.optional(),
});
const lineSchema = z.object({
	LineItemID: z.uuid().optional(),
	Description: maybeText,
	Quantity: amount,
	UnitAmount: amount,
	LineAmount: amount,
	TaxAmount: amount,
	TaxType: maybeText,
	AccountCode: maybeText,
	AccountID: z.uuid().nullish(),
	ItemCode: maybeText,
	DiscountRate: amount,
	Tracking: z
		.array(z.object({ Name: maybeText, Option: maybeText }))
		.max(20)
		.optional(),
});
export const invoiceSchema = z.object({
	InvoiceID: z.uuid(),
	Type: z.enum(["ACCREC", "ACCPAY"]),
	Status: text,
	InvoiceNumber: maybeText,
	Reference: maybeText,
	Contact: z.object({ ContactID: z.uuid(), Name: maybeText }).optional(),
	Date: maybeText,
	DateString: maybeText,
	DueDate: maybeText,
	DueDateString: maybeText,
	CurrencyCode: maybeText,
	LineAmountTypes: maybeText,
	SubTotal: amount,
	TotalTax: amount,
	Total: amount,
	AmountDue: amount,
	AmountPaid: amount,
	AmountCredited: amount,
	FullyPaidOnDate: maybeText,
	UpdatedDateUTC: maybeText,
	SentToContact: z.boolean().optional(),
	HasAttachments: z.boolean().optional(),
	LineItems: z.array(lineSchema).max(2000).optional(),
});
export const attachmentSchema = z.object({
	AttachmentID: z.uuid(),
	FileName: text,
	MimeType: maybeText,
	ContentLength: z.number().int().nonnegative().optional(),
	IncludeOnline: z.boolean().optional(),
});
export const connectionSchema = z.object({
	id: z.uuid(),
	tenantId: z.uuid(),
	tenantType: z.string(),
	tenantName: maybeText,
	createdDateUtc: maybeText,
	updatedDateUtc: maybeText,
});

export const declarations = `
interface XeroContact {
 ContactID: string; Name: string; ContactStatus?: string | null;
 AccountNumber?: string | null; ContactNumber?: string | null; FirstName?: string | null;
 LastName?: string | null; EmailAddress?: string | null; IsSupplier?: boolean;
 IsCustomer?: boolean; DefaultCurrency?: string | null; TaxNumber?: string | null;
 Addresses?: { AddressType?: string | null; AddressLine1?: string | null; AddressLine2?: string | null;
 AddressLine3?: string | null; AddressLine4?: string | null; City?: string | null;
 Region?: string | null; PostalCode?: string | null; Country?: string | null }[];
}
interface XeroInvoice {
 InvoiceID: string; Type: "ACCREC" | "ACCPAY"; Status: string;
 InvoiceNumber?: string | null; Reference?: string | null;
 Contact?: { ContactID: string; Name?: string | null };
 Date?: string | null; DateString?: string | null; DueDate?: string | null; DueDateString?: string | null;
 CurrencyCode?: string | null; LineAmountTypes?: string | null; SubTotal?: number | null;
 TotalTax?: number | null; Total?: number | null; AmountDue?: number | null;
 AmountPaid?: number | null; AmountCredited?: number | null; FullyPaidOnDate?: string | null;
 UpdatedDateUTC?: string | null; SentToContact?: boolean; HasAttachments?: boolean;
 LineItems?: { LineItemID?: string; Description?: string | null; Quantity?: number | null;
 UnitAmount?: number | null; LineAmount?: number | null; TaxAmount?: number | null;
 TaxType?: string | null; AccountCode?: string | null; AccountID?: string | null;
 ItemCode?: string | null; DiscountRate?: number | null;
 Tracking?: { Name?: string | null; Option?: string | null }[] }[];
}
interface XeroAttachment {
 AttachmentID: string; FileName: string; MimeType?: string | null; ContentLength?: number; IncludeOnline?: boolean;
}
interface XeroConnection {
 id: string; tenantId: string; tenantType: string; tenantName?: string | null;
 createdDateUtc?: string | null; updatedDateUtc?: string | null;
}
`;
