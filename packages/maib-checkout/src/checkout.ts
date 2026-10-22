import { MaibError } from "./error.ts";
import { isObject, type JsonObject, minorUnits, text } from "./json.ts";
import {
	type CheckoutOutcome,
	checkoutOutcome,
	type RefundOutcome,
	refundOutcome,
} from "./outcome.ts";

export type NewCheckout = {
	/** In minor units (bani). */
	amount: number;
	currency: "MDL";
	/** Your order's id: maib echoes it in the checkout and the callback. */
	orderId: string;
	/** Shown on maib's page, at most 125 characters. */
	description: string;
	/** Where maib posts the signed payment notice. */
	callbackUrl: string;
	successUrl: string;
	failUrl: string;
};

export type NewRefund = {
	/** In minor units of the payment's currency, at most what was paid and not yet given back. */
	amount: number;
	/** Why the money goes back, at most 500 characters. */
	reason: string;
};

/** A checkout as maib reports it. */
export type Checkout = {
	checkoutId: string;
	/** maib's own word, such as `Initialized`, `Completed` or `Expired`. */
	status: string;
	outcome: CheckoutOutcome;
	/** In minor units. */
	amount: number;
	currency: string;
	/** Your order's id, as given to `createCheckout`. */
	orderId: string | undefined;
	/** The payment that completed the checkout, once there is one. */
	payment: CheckoutPayment | undefined;
};

export type CheckoutPayment = {
	paymentId: string;
	/** maib's own word, such as `Executed`, `PartiallyRefunded` or `Failed`. */
	status: string;
	/** In minor units. */
	amount: number;
	/** What was given back so far, in minor units. */
	refundedAmount: number;
	currency: string;
	/** The card network's retrieval reference number. */
	rrn: string | undefined;
	approvalCode: string | undefined;
	/** How the payer paid, such as `Card` or `MiaQr`. */
	paymentMethod: string | undefined;
};

/** A refund as maib reports it. */
export type Refund = {
	refundId: string;
	paymentId: string;
	/** maib's own word, such as `Created`, `Accepted` or `Rejected`. */
	status: string;
	outcome: RefundOutcome;
	/** In minor units. */
	amount: number;
	currency: string;
};

const malformed = (answer: string, field: string) =>
	new MaibError("malformed", `maib's ${answer} has no valid ${field}.`);

export function readCheckout(result: JsonObject): Checkout {
	const checkoutId = text(result.id);
	const status = text(result.status);
	const amount = minorUnits(result.amount);
	const currency = text(result.currency);
	if (!checkoutId) throw malformed("checkout", "id");
	if (!status) throw malformed("checkout", "status");
	if (amount === undefined) throw malformed("checkout", "amount");
	if (!currency) throw malformed("checkout", "currency");
	const payment = isObject(result.payment)
		? readPayment(result.payment)
		: undefined;
	return {
		checkoutId,
		status,
		outcome: checkoutOutcome(status, payment?.status),
		amount,
		currency,
		orderId: isObject(result.order) ? text(result.order.id) : undefined,
		payment,
	};
}

function readPayment(payment: JsonObject): CheckoutPayment {
	const paymentId = text(payment.paymentId);
	const status = text(payment.status);
	const amount = minorUnits(payment.amount);
	const refundedAmount = minorUnits(payment.refundedAmount);
	const currency = text(payment.currency);
	if (!paymentId) throw malformed("payment", "paymentId");
	if (!status) throw malformed("payment", "status");
	if (amount === undefined) throw malformed("payment", "amount");
	if (refundedAmount === undefined)
		throw malformed("payment", "refundedAmount");
	if (!currency) throw malformed("payment", "currency");
	return {
		paymentId,
		status,
		amount,
		refundedAmount,
		currency,
		rrn: text(payment.referenceNumber),
		approvalCode: text(payment.approvalCode),
		paymentMethod: text(payment.paymentMethod),
	};
}

export function readRefund(result: JsonObject): Refund {
	const refundId = text(result.id);
	const paymentId = text(result.paymentId);
	const status = text(result.status);
	const amount = minorUnits(result.amount);
	const currency = text(result.currency);
	if (!refundId) throw malformed("refund", "id");
	if (!paymentId) throw malformed("refund", "paymentId");
	if (!status) throw malformed("refund", "status");
	if (amount === undefined) throw malformed("refund", "amount");
	if (!currency) throw malformed("refund", "currency");
	return {
		refundId,
		paymentId,
		status,
		outcome: refundOutcome(status),
		amount,
		currency,
	};
}
