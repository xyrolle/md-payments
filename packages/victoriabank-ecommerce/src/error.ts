/**
 * Why a call gave nothing to act on:
 * - `unavailable`: no answer came (a network failure, a timeout or an HTTP error).
 * - `malformed`: an answer without the fields the gateway documents.
 * - `untrusted`: an answer without the bank's valid signature, or signed for
 *   another order, amount or terminal.
 *
 * After any of them a completion or reversal may still have been made.
 * Sending it again is safe: the gateway answers a repeat as a duplicate.
 */
export type VictoriabankErrorKind = "unavailable" | "malformed" | "untrusted";

export class VictoriabankError extends Error {
	override readonly name = "VictoriabankError";
	readonly kind: VictoriabankErrorKind;

	constructor(
		kind: VictoriabankErrorKind,
		message: string,
		options: { cause?: unknown } = {},
	) {
		super(message, options);
		this.kind = kind;
	}
}
