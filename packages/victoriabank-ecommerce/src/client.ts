import {
	formFields,
	outcomeOf,
	readTransaction,
	type Transaction,
	type TransactionStatus,
	tableValues,
} from "./answer.ts";
import { VictoriabankError } from "./error.ts";
import {
	authorizationFields,
	type NewAuthorization,
	statusFields,
	type TransactionRef,
	transactionFields,
} from "./request.ts";
import {
	type Fields,
	importPrivateKey,
	importPublicKey,
	sign,
	signedByBank,
} from "./signature.ts";

const REQUEST_TIMEOUT_MS = 30_000;

export type VictoriabankOptions = {
	/** `https://vb059.vb.md/cgi-bin/cgi_link` in production, `https://ecomt.victoriabank.md/cgi-bin/cgi_link` for tests. */
	gatewayUrl: string;
	/** MERCHANT: the 15-digit merchant id the bank assigned. */
	merchantId: string;
	/** TERMINAL: the 8-digit terminal id the bank assigned. */
	terminalId: string;
	/** MERCH_NAME, as the payer knows the merchant. */
	merchantName: string;
	/** MERCH_URL, the merchant's website. */
	merchantUrl: string;
	/** MERCH_ADDRESS, the merchant's registered office. */
	merchantAddress: string;
	/** The merchant's RSA private key, PEM in PKCS#8 ("BEGIN PRIVATE KEY"). */
	privateKey: string;
	/** The bank's RSA public key, PEM ("BEGIN PUBLIC KEY"). */
	bankPublicKey: string;
};

/** A form the payer's browser posts to the gateway: `fields` as hidden inputs, posted to `action`. */
export type PaymentForm = { action: string; fields: Fields };

/**
 * A client for Victoriabank's e-Commerce Gateway. The payer's browser posts
 * a signed authorization (TRTYPE 0) to the bank; the bank answers to the
 * merchant's callback URL. Completions (21), reversals (24) and status checks
 * (90) are posted by the merchant's server.
 */
export class Victoriabank {
	readonly #options: VictoriabankOptions;
	#privateKey: Promise<CryptoKey> | undefined;
	#bankKey: Promise<CryptoKey> | undefined;

	constructor(options: VictoriabankOptions) {
		this.#options = options;
	}

	/** The signed authorization (TRTYPE 0) for the payer's browser to post. */
	async authorizationForm(payment: NewAuthorization): Promise<PaymentForm> {
		const fields = authorizationFields(this.#options, payment);
		fields.P_SIGN = await sign(await this.#signingKey(), fields);
		return { action: this.#options.gatewayUrl, fields };
	}

	/** Completes an authorized payment (TRTYPE 21): the money moves to the merchant. */
	complete(transaction: TransactionRef): Promise<Transaction> {
		return this.#transact("21", transaction);
	}

	/** Reverses an authorized or completed payment (TRTYPE 24), whole or in part. */
	reverse(transaction: TransactionRef): Promise<Transaction> {
		return this.#transact("24", transaction);
	}

	/**
	 * Where an order's authorization or completion stands (TRTYPE 90). The
	 * answer is unsigned. Ask about the authorization until a completion was
	 * sent: the gateway finds no completion that was never made.
	 */
	async status(
		order: string,
		operation: "authorization" | "completion",
	): Promise<TransactionStatus> {
		const [action, rc = "", text] = tableValues(
			await this.#post(
				statusFields(this.#options.terminalId, order, operation),
			),
		);
		if (!action)
			throw new VictoriabankError(
				"malformed",
				"The gateway's status answer has no table of values.",
			);
		return { outcome: outcomeOf(action), action, rc, text };
	}

	/**
	 * Checks that `request` is the bank's signed answer to an authorization,
	 * posted to the callback URL, and reads it. The bank does not sign TRTYPE,
	 * so a callback naming another operation is `unknown`.
	 */
	async verifyCallback(request: Request): Promise<Transaction> {
		const fields = Object.fromEntries(
			new URLSearchParams(await request.text()),
		);
		const transaction = await this.#trusted(fields);
		return fields.TRTYPE === "0"
			? transaction
			: { ...transaction, outcome: "unknown" };
	}

	async #transact(
		trtype: "21" | "24",
		transaction: TransactionRef,
	): Promise<Transaction> {
		const fields = transactionFields(
			this.#options.terminalId,
			trtype,
			transaction,
		);
		fields.P_SIGN = await sign(await this.#signingKey(), fields);
		const answer = formFields(await this.#post(fields));
		if (Object.keys(answer).length === 0)
			throw new VictoriabankError(
				"malformed",
				`The gateway's answer to TRTYPE ${trtype} has no fields. It may have refused the request: check the private key and the transaction's RRN and INT_REF.`,
			);
		const answered = await this.#trusted(answer);
		if (
			answered.order !== transaction.order ||
			answered.amount !== transaction.amount
		)
			throw new VictoriabankError(
				"untrusted",
				`The bank's answer to TRTYPE ${trtype} is signed for another order or amount.`,
			);
		return answered;
	}

	/** `fields` as a transaction, once they carry the bank's signature and this terminal. */
	async #trusted(fields: Fields): Promise<Transaction> {
		if (!(await signedByBank(await this.#verifyingKey(), fields)))
			throw new VictoriabankError(
				"untrusted",
				"The answer does not carry the bank's signature (check bankPublicKey).",
			);
		// The bank signs every merchant's answers with one key, and TERMINAL is
		// not signed: this only turns away another terminal's answer by mistake.
		if (fields.TERMINAL && fields.TERMINAL !== this.#options.terminalId)
			throw new VictoriabankError(
				"untrusted",
				`The answer is for terminal ${fields.TERMINAL}, not this one.`,
			);
		return readTransaction(fields);
	}

	async #post(fields: Fields): Promise<string> {
		const request = `TRTYPE ${fields.TRTYPE}`;
		let response: Response;
		try {
			response = await fetch(this.#options.gatewayUrl, {
				method: "POST",
				body: new URLSearchParams(fields),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});
		} catch (cause) {
			throw new VictoriabankError(
				"unavailable",
				`The gateway did not answer ${request}.`,
				{ cause },
			);
		}
		if (!response.ok)
			throw new VictoriabankError(
				"unavailable",
				`The gateway answered ${request} with HTTP ${response.status}.`,
			);
		return response.text();
	}

	#signingKey(): Promise<CryptoKey> {
		this.#privateKey ??= importPrivateKey(this.#options.privateKey);
		return this.#privateKey;
	}

	#verifyingKey(): Promise<CryptoKey> {
		this.#bankKey ??= importPublicKey(this.#options.bankPublicKey);
		return this.#bankKey;
	}
}
