import { minorUnits } from "./amount.ts";
import { VictoriabankError } from "./error.ts";
import type { Fields } from "./signature.ts";

/** The bank's signed answer about a transaction. */
export type Transaction = {
	/**
	 * `approved` (ACTION 0) or `declined` (ACTION 2). A duplicate (1), a
	 * processing fault (3) or anything else is `unknown`.
	 */
	outcome: TransactionOutcome;
	/** The gateway's ACTION code. */
	action: string;
	/** The card system's response code (RC). */
	rc: string;
	/** The gateway's words for the result (TEXT). */
	text: string | undefined;
	order: string;
	/** In minor units. */
	amount: number;
	currency: string | undefined;
	/** The retrieval reference number: a completion or reversal names it. */
	rrn: string | undefined;
	/** The gateway's internal reference: a completion or reversal names it. */
	intRef: string | undefined;
	/** The card issuer's approval code. */
	approval: string | undefined;
};

export type TransactionOutcome = "approved" | "declined" | "unknown";

/** The gateway's unsigned answer to a status check. */
export type TransactionStatus = Pick<
	Transaction,
	"outcome" | "action" | "rc" | "text"
>;

export function outcomeOf(action: string): TransactionOutcome {
	if (action === "0") return "approved";
	if (action === "2") return "declined";
	return "unknown";
}

/** A field the gateway filled in: it writes an empty one as "" or "-". */
const filled = (value: string | undefined) =>
	value === undefined || value === "" || value === "-" ? undefined : value;

export function readTransaction(fields: Fields): Transaction {
	const action = filled(fields.ACTION);
	const order = filled(fields.ORDER);
	const amount = minorUnits(fields.AMOUNT);
	if (!action || !order || amount === undefined)
		throw new VictoriabankError(
			"malformed",
			"The bank's signed answer lacks its ACTION, ORDER or AMOUNT.",
		);
	return {
		outcome: outcomeOf(action),
		action,
		rc: fields.RC ?? "",
		text: filled(fields.TEXT),
		order,
		amount,
		currency: filled(fields.CURRENCY),
		rrn: filled(fields.RRN),
		intRef: filled(fields.INT_REF),
		approval: filled(fields.APPROVAL),
	};
}

/** The gateway's answer to a completion or reversal: an HTML form of hidden inputs. */
export function formFields(html: string): Fields {
	const fields: Fields = {};
	for (const [, name = "", value = ""] of html.matchAll(
		/<input[^>]*?name=["'](\w+)["'][^>]*?value=["']([^"']*)["']/gi,
	))
		fields[name] = decode(value);
	return fields;
}

/**
 * The gateway's answer to a status check: an HTML table of label and value
 * cells. Its values are read in order, as the WooCommerce plugin reads them.
 */
export function tableValues(html: string): string[] {
	return Array.from(
		html.matchAll(/<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/gi),
		([, , value = ""]) => decode(value.replace(/<[^>]*>/g, "")),
	);
}

const ENTITIES = new Map([
	["amp", "&"],
	["lt", "<"],
	["gt", ">"],
	["quot", '"'],
	["apos", "'"],
]);

function decode(html: string): string {
	return html
		.replace(/&#(\d+);/g, (_, code: string) =>
			String.fromCodePoint(Number(code)),
		)
		.replace(/&(\w+);/g, (entity, name: string) => ENTITIES.get(name) ?? entity)
		.trim();
}
