import { createSign, createVerify, generateKeyPairSync } from "node:crypto";

// Key pairs made for the tests: one stands for the merchant's, one for the
// bank's. The MAC here is written out from the specification's Appendix A,
// apart from the client's own.

const pair = () => generateKeyPairSync("rsa", { modulusLength: 2048 });
const merchant = pair();
const bank = pair();

export const merchantPrivateKey = merchant.privateKey
	.export({ type: "pkcs8", format: "pem" })
	.toString();
export const merchantPkcs1Key = merchant.privateKey
	.export({ type: "pkcs1", format: "pem" })
	.toString();
export const bankPublicKey = bank.publicKey
	.export({ type: "spki", format: "pem" })
	.toString();

const macOf = (fields: Record<string, string>, names: string[]) =>
	names
		.map((name) => {
			const value = fields[name] ?? "";
			return value === "" ? "-" : `${Buffer.byteLength(value)}${value}`;
		})
		.join("");

/** `fields` with the bank's P_SIGN over ACTION, RC, RRN, ORDER and AMOUNT. */
export const signedByBank = (fields: Record<string, string>) => ({
	...fields,
	P_SIGN: createSign("RSA-SHA256")
		.update(macOf(fields, ["ACTION", "RC", "RRN", "ORDER", "AMOUNT"]))
		.sign(bank.privateKey, "hex")
		.toUpperCase(),
});

/** Whether `fields` carry the merchant's P_SIGN over ORDER, NONCE, TIMESTAMP, TRTYPE and AMOUNT. */
export const signedByMerchant = (fields: Record<string, string>) =>
	createVerify("RSA-SHA256")
		.update(macOf(fields, ["ORDER", "NONCE", "TIMESTAMP", "TRTYPE", "AMOUNT"]))
		.verify(merchant.publicKey, fields.P_SIGN ?? "", "hex");
