import { MaibError } from "./error.ts";
import { minorUnits, parseObject, text } from "./json.ts";
import { type PaymentOutcome, paymentOutcome } from "./outcome.ts";

/**
 * How far a callback's timestamp may be from now. maib's docs ask for "N
 * minutes" without naming N; 15 leaves room for clock drift and maib's
 * retries while an old signed callback cannot be replayed for long.
 */
const CALLBACK_WINDOW_MS = 15 * 60_000;

/** What maib's signed callback says about a checkout's payment. */
export type PaymentNotice = {
	checkoutId: string;
	/** Your order's id, as given to `createCheckout`. */
	orderId: string | undefined;
	paymentId: string;
	/** maib's own word for the payment, such as `Executed` or `Failed`. */
	paymentStatus: string;
	outcome: PaymentOutcome;
	/** The amount paid, in minor units. */
	amount: number;
	currency: string;
	/** The card network's retrieval reference number. */
	rrn: string | undefined;
	approvalCode: string | undefined;
	/** How the payer paid, such as `Card` or `MiaQr`. */
	paymentMethod: string | undefined;
};

/** Checks `request` is maib's signed callback and reads it. */
export async function verifyNotice(
	request: Request,
	signatureKey: string,
): Promise<PaymentNotice> {
	const body = await request.text();
	await checkSignature(
		body,
		request.headers.get("x-signature-timestamp") ?? "",
		request.headers.get("x-signature") ?? "",
		signatureKey,
	);
	return readNotice(body);
}

const untrusted = (why: string) =>
	new MaibError("untrusted", `The callback is not maib's: ${why}.`);

/**
 * maib signs `{raw body}.{X-Signature-Timestamp}` with HMAC-SHA256 under the
 * Signature Key and sends it as `X-Signature: sha256=<base64 or hex>`. The
 * body is checked exactly as received: maib's own example is not compact JSON.
 */
async function checkSignature(
	body: string,
	timestamp: string,
	header: string,
	signatureKey: string,
): Promise<void> {
	if (!/^\d{1,16}$/.test(timestamp))
		throw untrusted("its X-Signature-Timestamp header is missing");
	if (Math.abs(Date.now() - Number(timestamp)) > CALLBACK_WINDOW_MS)
		throw untrusted(
			"its timestamp is more than 15 minutes from now (check this server's clock)",
		);
	const signature = header.startsWith("sha256=")
		? signatureBytes(header.slice("sha256=".length))
		: undefined;
	if (!signature)
		throw untrusted("its X-Signature header is not sha256=<signature>");
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(signatureKey),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify"],
	);
	// Web Crypto's verify compares in constant time.
	const valid = await crypto.subtle.verify(
		"HMAC",
		key,
		signature,
		encoder.encode(`${body}.${timestamp}`),
	);
	if (!valid)
		throw untrusted(
			"its signature does not match (check the Signature Key, and pass the body exactly as received)",
		);
}

/**
 * The 32 bytes of an HMAC-SHA256 in the two encodings maib's "Callback
 * Notifications" page allows: "Encode the resulting binary hash as lowercase
 * hex or Base64."
 */
function signatureBytes(written: string): Uint8Array<ArrayBuffer> | undefined {
	if (/^[0-9a-f]{64}$/.test(written))
		return Uint8Array.from(written.match(/../g) ?? [], (pair) =>
			Number.parseInt(pair, 16),
		);
	try {
		const bytes = Uint8Array.from(atob(written), (char) => char.charCodeAt(0));
		return bytes.length === 32 ? bytes : undefined;
	} catch {
		return undefined;
	}
}

function readNotice(body: string): PaymentNotice {
	const fields = parseObject(body) ?? {};
	const checkoutId = text(fields.checkoutId);
	const paymentId = text(fields.paymentId);
	const paymentStatus = text(fields.paymentStatus);
	const amount = minorUnits(fields.paymentAmount);
	const currency = text(fields.paymentCurrency);
	if (
		!checkoutId ||
		!paymentId ||
		!paymentStatus ||
		amount === undefined ||
		!currency
	)
		throw new MaibError(
			"malformed",
			"maib's callback is signed but lacks its checkoutId, paymentId, paymentStatus, paymentAmount or paymentCurrency.",
		);
	return {
		checkoutId,
		orderId: text(fields.orderId),
		paymentId,
		paymentStatus,
		outcome: paymentOutcome(paymentStatus),
		amount,
		currency,
		rrn: text(fields.retrievalReferenceNumber),
		approvalCode: text(fields.approvalCode),
		paymentMethod: text(fields.paymentMethod),
	};
}
