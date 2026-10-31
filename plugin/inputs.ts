import { z } from "zod";
export const pageFields = {
	page: z.number().int().min(1).max(10_000).default(1),
	pageSize: z.number().int().min(1).max(100).default(50),
};
export const date = z.iso.date();
export function validRange(input: { from: string; to: string }) {
	const days = (Date.parse(input.to) - Date.parse(input.from)) / 86_400_000;
	return days >= 0 && days <= 365;
}
export const invoiceListInput = z
	.strictObject({
		...pageFields,
		from: date,
		to: date,
		status: z
			.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "PAID", "VOIDED", "DELETED"])
			.optional(),
		type: z.enum(["ACCREC", "ACCPAY"]).optional(),
		contactId: z.uuid().optional(),
	})
	.refine(
		validRange,
		"Date range must be ordered and cover no more than 366 calendar days.",
	);
export function xeroDate(date: string) {
	const [year, month, day] = date.split("-").map(Number);
	return `DateTime(${year},${month},${day})`;
}
