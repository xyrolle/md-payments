/**
 * Why a call gave nothing to act on:
 * - `refused`: maib declined the request and named why in `code`. Nothing was done.
 * - `unavailable`: no answer came (a network failure, a timeout, HTTP 5xx or 429).
 * - `malformed`: an answer outside maib's documented format.
 * - `untrusted`: a callback whose signature or timestamp does not check out.
 *
 * After `unavailable` or `malformed`, a checkout or refund may still have been
 * made: read it back before sending the request again.
 */
export type MaibErrorKind =
	| "refused"
	| "unavailable"
	| "malformed"
	| "untrusted";

export class MaibError extends Error {
	override readonly name = "MaibError";
	readonly kind: MaibErrorKind;
	/** maib's error code when it refused, such as `maib.merchant.payments-42001`. */
	readonly code: string | undefined;

	constructor(
		kind: MaibErrorKind,
		message: string,
		options: { code?: string; cause?: unknown } = {},
	) {
		super(message, options);
		this.kind = kind;
		this.code = options.code;
	}
}
