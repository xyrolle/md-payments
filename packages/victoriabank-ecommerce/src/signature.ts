// P_SIGN, the gateway's message signature (its merchant interface
// specification, Appendix A): RSA PKCS#1 v1.5 with SHA-256 over a MAC
// string, written in hex. The merchant signs its requests with its private
// key; the bank signs its answers with its own.

export type Fields = Record<string, string>;

const ALGORITHM: RsaHashedImportParams = {
	name: "RSASSA-PKCS1-v1_5",
	hash: "SHA-256",
};
const encoder = new TextEncoder();

/** What the merchant signs, in this order. */
const MERCHANT_FIELDS = ["ORDER", "NONCE", "TIMESTAMP", "TRTYPE", "AMOUNT"];
/** What the bank signs, in this order. */
const BANK_FIELDS = ["ACTION", "RC", "RRN", "ORDER", "AMOUNT"];

/**
 * The MAC: each field's length in bytes, then the field. An empty field is a
 * bare "-": the bank's verification sample writes "-" so, and its FAQ says a
 * failed transaction's callback carries an empty RRN.
 */
export function mac(fields: Partial<Fields>, names: readonly string[]): string {
	return names
		.map((name) => {
			const value = fields[name] ?? "";
			return value === "" || value === "-"
				? "-"
				: `${encoder.encode(value).length}${value}`;
		})
		.join("");
}

/** The merchant's P_SIGN of `fields`. */
export async function sign(key: CryptoKey, fields: Fields): Promise<string> {
	const signature = await crypto.subtle.sign(
		ALGORITHM,
		key,
		encoder.encode(mac(fields, MERCHANT_FIELDS)),
	);
	return Array.from(new Uint8Array(signature), (byte) =>
		byte.toString(16).padStart(2, "0"),
	)
		.join("")
		.toUpperCase();
}

/** Whether `fields` carry the bank's P_SIGN over its own fields. */
export async function signedByBank(
	key: CryptoKey,
	fields: Fields,
): Promise<boolean> {
	const signature = fields.P_SIGN ?? "";
	if (!/^(?:[0-9a-fA-F]{2})+$/.test(signature)) return false;
	return crypto.subtle.verify(
		ALGORITHM,
		key,
		Uint8Array.from(signature.match(/../g) ?? [], (pair) =>
			Number.parseInt(pair, 16),
		),
		encoder.encode(mac(fields, BANK_FIELDS)),
	);
}

/** The gateway's TIMESTAMP: now in GMT, as YYYYMMDDHHMMSS. */
export function timestamp(): string {
	return new Date().toISOString().replace(/\D/g, "").slice(0, 14);
}

/** The gateway's NONCE: 32 unpredictable bytes in hex. */
export function nonce(): string {
	return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

/** The merchant's private key, from PEM in PKCS#8 ("BEGIN PRIVATE KEY"). */
export function importPrivateKey(pem: string): Promise<CryptoKey> {
	return importKey(
		pem,
		"PRIVATE KEY",
		"pkcs8",
		"sign",
		"privateKey must be a PKCS#8 PEM key (BEGIN PRIVATE KEY). Convert an RSA PRIVATE KEY with `openssl pkcs8 -topk8 -nocrypt -in key.pem`.",
	);
}

/** The bank's public key, from PEM in SPKI ("BEGIN PUBLIC KEY"). */
export function importPublicKey(pem: string): Promise<CryptoKey> {
	return importKey(
		pem,
		"PUBLIC KEY",
		"spki",
		"verify",
		"bankPublicKey must be a PEM public key (BEGIN PUBLIC KEY). Take it out of a certificate with `openssl x509 -pubkey -noout -in bank.crt`.",
	);
}

async function importKey(
	pem: string,
	label: string,
	format: "pkcs8" | "spki",
	use: "sign" | "verify",
	help: string,
): Promise<CryptoKey> {
	const base64 = new RegExp(
		`-----BEGIN ${label}-----([A-Za-z0-9+/=\\s]+)-----END ${label}-----`,
	).exec(pem)?.[1];
	if (!base64) throw new TypeError(help);
	try {
		const der = Uint8Array.from(atob(base64.replace(/\s/g, "")), (char) =>
			char.charCodeAt(0),
		);
		return await crypto.subtle.importKey(format, der, ALGORITHM, false, [use]);
	} catch (cause) {
		throw new TypeError(help, { cause });
	}
}
