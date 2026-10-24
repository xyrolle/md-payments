import { type PaymentNotice, verifyNotice } from "./callback.ts";
import {
	type Checkout,
	type NewCheckout,
	type NewRefund,
	type Refund,
	readCheckout,
	readRefund,
} from "./checkout.ts";
import { MaibError } from "./error.ts";
import { type JsonObject, majorUnits, readEnvelope, text } from "./json.ts";
import { type RefundOutcome, refundOutcome } from "./outcome.ts";

const REQUEST_TIMEOUT_MS = 30_000;
/** A token is renewed this long before maib says it ends (it lives 300 s). */
const TOKEN_MARGIN_MS = 30_000;

export type MaibCheckoutOptions = {
	/** `https://api.maibmerchants.md` in production, `https://sandbox.maibmerchants.md` for tests. */
	baseUrl: string;
	clientId: string;
	clientSecret: string;
	/** The Signature Key that callbacks are checked with. */
	signatureKey: string;
};

/**
 * A client for maib e-Commerce Checkout. It gets an access token from the
 * client id and secret and renews it as needed. maib documents no idempotency
 * key, so nothing is sent twice: only a request maib answered 401 is sent again,
 * once, with a new token.
 */
export class MaibCheckout {
	readonly #options: MaibCheckoutOptions;
	#token: { header: string; expiresAt: number } | undefined;

	constructor(options: MaibCheckoutOptions) {
		this.#options = options;
	}

	/** Registers a hosted checkout. Send the payer to `checkoutUrl`. */
	async createCheckout(
		checkout: NewCheckout,
	): Promise<{ checkoutId: string; checkoutUrl: string }> {
		const result = await this.#call("POST", "/v2/checkouts", {
			amount: majorUnits(checkout.amount),
			currency: checkout.currency,
			orderInfo: { id: checkout.orderId, description: checkout.description },
			callbackUrl: checkout.callbackUrl,
			successUrl: checkout.successUrl,
			failUrl: checkout.failUrl,
		});
		const checkoutId = text(result.checkoutId);
		const checkoutUrl = text(result.checkoutUrl);
		if (!checkoutId || !checkoutUrl?.startsWith("https://"))
			throw new MaibError(
				"malformed",
				"maib's new checkout has no checkoutId or https checkoutUrl.",
			);
		return { checkoutId, checkoutUrl };
	}

	/** Where a checkout stands, with the payment that completed it. */
	async getCheckout(checkoutId: string): Promise<Checkout> {
		return readCheckout(
			await this.#call(
				"GET",
				`/v2/checkouts/${encodeURIComponent(checkoutId)}`,
			),
		);
	}

	/** Ends a checkout that is not completed: it is `Cancelled` and cannot be resumed. */
	async cancelCheckout(checkoutId: string): Promise<void> {
		const result = await this.#call(
			"POST",
			`/v2/checkouts/${encodeURIComponent(checkoutId)}/cancel`,
		);
		if (text(result.status) !== "Cancelled")
			throw new MaibError(
				"malformed",
				"maib answered the cancellation without the Cancelled status. Read the checkout with getCheckout to see where it stands.",
			);
	}

	/** Asks maib to give back part or all of a payment. maib answers `Created`; `getRefund` tells the rest. */
	async refund(
		paymentId: string,
		refund: NewRefund,
	): Promise<{ refundId: string; status: string; outcome: RefundOutcome }> {
		const result = await this.#call(
			"POST",
			`/v2/payments/${encodeURIComponent(paymentId)}/refund`,
			{ amount: majorUnits(refund.amount), reason: refund.reason },
		);
		const refundId = text(result.refundId);
		const status = text(result.status);
		if (!refundId || !status)
			throw new MaibError(
				"malformed",
				"maib answered the refund without its refundId or status. It may still be made: check the payment's refundedAmount before refunding again.",
			);
		return { refundId, status, outcome: refundOutcome(status) };
	}

	/** Where a refund stands. */
	async getRefund(refundId: string): Promise<Refund> {
		return readRefund(
			await this.#call(
				"GET",
				`/v2/payments/refunds/${encodeURIComponent(refundId)}`,
			),
		);
	}

	/** Checks that `request` is maib's signed callback and reads it; throws `untrusted` when it is not. */
	verifyCallback(request: Request): Promise<PaymentNotice> {
		return verifyNotice(request, this.#options.signatureKey);
	}

	async #call(
		method: "GET" | "POST",
		path: string,
		body?: JsonObject,
	): Promise<JsonObject> {
		let response = await this.#send(method, path, body, await this.#bearer());
		if (response.status === 401) {
			// maib ended the token early. A 401 was never processed, so it is safe to send again.
			this.#token = undefined;
			response = await this.#send(method, path, body, await this.#bearer());
		}
		return readEnvelope(response, `${method} ${path}`);
	}

	async #bearer(): Promise<string> {
		if (this.#token && this.#token.expiresAt > Date.now())
			return this.#token.header;
		const { clientId, clientSecret } = this.#options;
		const result = await readEnvelope(
			await this.#send("POST", "/v2/auth/token", { clientId, clientSecret }),
			"POST /v2/auth/token",
		);
		const accessToken = text(result.accessToken);
		const expiresIn = result.expiresIn;
		if (!accessToken || typeof expiresIn !== "number")
			throw new MaibError(
				"malformed",
				"maib's token answer has no accessToken or expiresIn.",
			);
		const header = `${text(result.tokenType) ?? "Bearer"} ${accessToken}`;
		this.#token = {
			header,
			expiresAt: Date.now() + expiresIn * 1000 - TOKEN_MARGIN_MS,
		};
		return header;
	}

	async #send(
		method: "GET" | "POST",
		path: string,
		body: JsonObject | undefined,
		authorization?: string,
	): Promise<Response> {
		const headers = new Headers({ accept: "application/json" });
		if (body) headers.set("content-type", "application/json");
		if (authorization) headers.set("authorization", authorization);
		try {
			return await fetch(new URL(path, this.#options.baseUrl), {
				method,
				headers,
				body: body ? JSON.stringify(body) : null,
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (cause) {
			throw new MaibError(
				"unavailable",
				`maib did not answer ${method} ${path}.`,
				{ cause },
			);
		}
	}
}
