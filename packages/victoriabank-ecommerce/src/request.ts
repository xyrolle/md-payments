// The fields of each request the merchant sends, as the gateway's merchant
// interface specification lists them (Tables 2, 3, 6 and 7), unsigned.

import { gatewayAmount } from "./amount.ts";
import type { VictoriabankOptions } from "./client.ts";
import { type Fields, nonce, timestamp } from "./signature.ts";

export type NewAuthorization = {
	/** Your order's id, 6 to 32 characters. Every answer about it echoes it. */
	order: string;
	/** In minor units (bani). */
	amount: number;
	currency: "MDL";
	/** Shown to the payer, 1 to 50 characters. */
	description: string;
	/** BACKREF: where the gateway sends the payer back. */
	returnUrl: string;
	language: "ro" | "ru" | "en";
};

/** A transaction the bank authorized, named as its signed answer named it. */
export type TransactionRef = {
	order: string;
	/** In minor units: the authorized amount to complete, or what goes back in a reversal. */
	amount: number;
	currency: "MDL";
	rrn: string;
	intRef: string;
};

/** An authorization (TRTYPE 0), which the payer's browser posts. */
export function authorizationFields(
	options: VictoriabankOptions,
	payment: NewAuthorization,
): Fields {
	checkOrder(payment.order);
	const { description } = payment;
	if (description.length < 1 || description.length > 50)
		throw new RangeError(
			`A description is 1 to 50 characters, got ${description.length}.`,
		);
	return {
		AMOUNT: gatewayAmount(payment.amount),
		CURRENCY: payment.currency,
		ORDER: payment.order,
		DESC: description,
		// The gateway asks for the payer's e-mail but takes it empty.
		EMAIL: "",
		BACKREF: payment.returnUrl,
		LANG: payment.language,
		TRTYPE: "0",
		MERCHANT: options.merchantId,
		TERMINAL: options.terminalId,
		MERCH_NAME: options.merchantName,
		MERCH_URL: options.merchantUrl,
		MERCH_ADDRESS: options.merchantAddress,
		// Optional for a merchant in the gateway's country and time zone,
		// and sent as the bank's test gateway accepted them.
		COUNTRY: "md",
		MERCH_GMT: moldovaOffset(new Date()),
		TIMESTAMP: timestamp(),
		NONCE: nonce(),
	};
}

/** A completion (TRTYPE 21) or a reversal (24) of an authorized transaction. */
export function transactionFields(
	terminalId: string,
	trtype: "21" | "24",
	transaction: TransactionRef,
): Fields {
	checkOrder(transaction.order);
	return {
		ORDER: transaction.order,
		AMOUNT: gatewayAmount(transaction.amount),
		CURRENCY: transaction.currency,
		RRN: transaction.rrn,
		INT_REF: transaction.intRef,
		TRTYPE: trtype,
		TERMINAL: terminalId,
		TIMESTAMP: timestamp(),
		NONCE: nonce(),
	};
}

/** A status check (TRTYPE 90) of an order's authorization (0) or completion (21). */
export function statusFields(
	terminalId: string,
	order: string,
	operation: "authorization" | "completion",
): Fields {
	checkOrder(order);
	return {
		TRTYPE: "90",
		TERMINAL: terminalId,
		ORDER: order,
		TRAN_TRTYPE: operation === "authorization" ? "0" : "21",
	};
}

function checkOrder(order: string): void {
	if (order.length < 6 || order.length > 32)
		throw new RangeError(
			`An order id is 6 to 32 characters (pad a number with zeros), got "${order}".`,
		);
}

/** MERCH_GMT: Moldova's offset from GMT in whole hours, "+2" in winter and "+3" in summer. */
function moldovaOffset(at: Date): string {
	const zone = new Intl.DateTimeFormat("en-US", {
		timeZone: "Europe/Chisinau",
		timeZoneName: "shortOffset",
	})
		.formatToParts(at)
		.find((part) => part.type === "timeZoneName")?.value;
	return zone?.replace("GMT", "") || "+0";
}
