// maib's statuses, read only as far as its documentation states them. A
// status it does not document is `unknown`, never `failed`: an answer nobody
// can place must not end a payment that may still go through.

/** Whether a checkout was paid: `unknown` for any status maib does not document. */
export type CheckoutOutcome = "pending" | "paid" | "failed" | "unknown";
/** Whether a payment went through: `unknown` for any status maib does not document. */
export type PaymentOutcome = "paid" | "failed" | "unknown";
/** Whether a refund was given back: `unknown` for any status maib does not document. */
export type RefundOutcome = "pending" | "refunded" | "failed" | "unknown";

/** Checkout statuses, from `GET /v2/checkouts/{id}`. A `Completed` one is decided by its payment. */
const CHECKOUT = new Map<string, CheckoutOutcome>([
	["WaitingForInit", "pending"],
	["Initialized", "pending"],
	["PaymentMethodSelected", "pending"],
	["Expired", "failed"],
	["Abandoned", "failed"],
	["Cancelled", "failed"],
	["Failed", "failed"],
]);

/** Payment statuses, from `GET /v2/payments/{id}`. A refunded payment was still paid. */
const PAYMENT = new Map<string, PaymentOutcome>([
	["Executed", "paid"],
	["PartiallyRefunded", "paid"],
	["Refunded", "paid"],
	["Failed", "failed"],
]);

/** Refund statuses, from `GET /v2/payments/refunds/{id}`. `Manual` is still maib's to process. */
const REFUND = new Map<string, RefundOutcome>([
	["Created", "pending"],
	["Requested", "pending"],
	["Manual", "pending"],
	["Accepted", "refunded"],
	["Rejected", "failed"],
]);

export function paymentOutcome(status: string): PaymentOutcome {
	return PAYMENT.get(status) ?? "unknown";
}

export function checkoutOutcome(
	status: string,
	paymentStatus: string | undefined,
): CheckoutOutcome {
	if (status !== "Completed") return CHECKOUT.get(status) ?? "unknown";
	return paymentStatus === undefined
		? "unknown"
		: paymentOutcome(paymentStatus);
}

export function refundOutcome(status: string): RefundOutcome {
	return REFUND.get(status) ?? "unknown";
}
