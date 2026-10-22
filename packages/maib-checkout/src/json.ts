import { MaibError } from "./error.ts";

// Readers for maib's JSON: every answer is checked field by field, never
// trusted to have the documented shape.

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The object `text` holds as JSON, or undefined for anything else. */
export function parseObject(text: string): JsonObject | undefined {
	try {
		const parsed: unknown = JSON.parse(text);
		return isObject(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

/** A non-empty string, or undefined. */
export function text(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

/**
 * Minor units from maib's amount, a JSON number in major units (1234.56 is
 * 123456). Anything else, a third decimal or a negative number among them, is
 * undefined: an amount is never rounded.
 */
export function minorUnits(value: unknown): number | undefined {
	if (typeof value !== "number") return undefined;
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
	if (!match) return undefined;
	return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** maib's major units from minor units (125050 is 1250.5). */
export function majorUnits(amount: number): number {
	if (!Number.isSafeInteger(amount) || amount <= 0)
		throw new RangeError(
			`An amount is a positive integer of minor units (bani), got ${amount}.`,
		);
	return amount / 100;
}

/**
 * maib's answer: its `result` when it said `ok`, a refusal when it named an
 * error code. Anything else says nothing of what became of the request.
 */
export async function readEnvelope(
	response: Response,
	request: string,
): Promise<JsonObject> {
	if (response.status >= 500 || response.status === 429)
		throw new MaibError(
			"unavailable",
			`maib answered ${request} with HTTP ${response.status}.`,
		);
	let envelope: JsonObject | undefined;
	try {
		envelope = parseObject(await response.text());
	} catch (cause) {
		throw new MaibError(
			"unavailable",
			`maib's answer to ${request} broke off.`,
			{ cause },
		);
	}
	const errors = Array.isArray(envelope?.errors) ? envelope.errors : [];
	const error = errors.find(isObject) ?? {};
	const code = text(error.errorCode);
	if (envelope?.ok === false && code)
		throw new MaibError(
			"refused",
			`maib refused ${request}: ${text(error.errorMessage) ?? "no reason given"} (${code}).`,
			{ code },
		);
	if (response.ok && envelope?.ok === true && isObject(envelope.result))
		return envelope.result;
	throw new MaibError(
		"malformed",
		`maib answered ${request} with HTTP ${response.status} outside its documented format.`,
	);
}
