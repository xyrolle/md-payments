import { describe, expect, it, vi } from "vitest";
import { Victoriabank, VictoriabankError } from "../src/index.ts";
import { fakeGateway, htmlForm } from "./fake-gateway.ts";
import {
	bankPublicKey,
	merchantPkcs1Key,
	merchantPrivateKey,
	signedByBank,
	signedByMerchant,
} from "./keys.ts";

const gateway = fakeGateway();

const options = {
	gatewayUrl: gateway.url,
	merchantId: "498000000000001",
	terminalId: "49800001",
	merchantName: "Example Shop",
	merchantUrl: "https://shop.example",
	merchantAddress: "Chisinau, Moldova",
	privateKey: merchantPrivateKey,
	bankPublicKey,
};
const vb = new Victoriabank(options);

/** The bank's approval of an authorization, as it posts it to the callback URL. */
const approved = {
	TERMINAL: "49800001",
	TRTYPE: "0",
	ORDER: "001044",
	AMOUNT: "225.00",
	CURRENCY: "MDL",
	ACTION: "0",
	RC: "00",
	APPROVAL: "123456",
	RRN: "628510496640",
	INT_REF: "A1B2C3D4E5F6",
	TIMESTAMP: "20261012093100",
	NONCE: "0011223344556677",
	TEXT: "Approved",
};

const callback = (fields: Record<string, string>) =>
	new Request("https://shop.example/victoriabank/callback", {
		method: "POST",
		body: new URLSearchParams(fields),
	});

const transaction = {
	order: "001044",
	amount: 22_500,
	currency: "MDL",
	rrn: "628510496640",
	intRef: "A1B2C3D4E5F6",
} as const;

const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => expect.fail("expected a VictoriabankError"),
		(error: unknown) => {
			expect(error).toBeInstanceOf(VictoriabankError);
			return error;
		},
	);

describe("authorizationForm", () => {
	it("is the signed TRTYPE 0 form the payer's browser posts", async () => {
		vi.useFakeTimers({
			now: new Date("2026-10-12T09:30:05Z"),
			toFake: ["Date"],
		});
		const form = await vb.authorizationForm({
			order: "001044",
			amount: 22_500,
			currency: "MDL",
			description: "Order 1044",
			returnUrl: "https://shop.example/orders/1044",
			language: "ro",
		});
		vi.useRealTimers();
		const { NONCE, P_SIGN, ...fields } = form.fields;
		expect(form.action).toBe(gateway.url);
		expect(fields).toEqual({
			AMOUNT: "225.00",
			CURRENCY: "MDL",
			ORDER: "001044",
			DESC: "Order 1044",
			EMAIL: "",
			BACKREF: "https://shop.example/orders/1044",
			LANG: "ro",
			TRTYPE: "0",
			MERCHANT: "498000000000001",
			TERMINAL: "49800001",
			MERCH_NAME: "Example Shop",
			MERCH_URL: "https://shop.example",
			MERCH_ADDRESS: "Chisinau, Moldova",
			COUNTRY: "md",
			MERCH_GMT: "+3",
			TIMESTAMP: "20261012093005",
		});
		expect(NONCE).toMatch(/^[0-9a-f]{64}$/);
		expect(P_SIGN).toMatch(/^[0-9A-F]{512}$/);
		expect(signedByMerchant(form.fields)).toBe(true);
	});

	it("refuses an order id shorter than the gateway's six characters", async () => {
		await expect(
			vb.authorizationForm({
				order: "1044",
				amount: 22_500,
				currency: "MDL",
				description: "Order 1044",
				returnUrl: "https://shop.example/orders/1044",
				language: "ro",
			}),
		).rejects.toThrow(RangeError);
	});

	it("refuses a PKCS#1 private key, saying how to convert it", async () => {
		const pkcs1 = new Victoriabank({
			...options,
			privateKey: merchantPkcs1Key,
		});
		await expect(
			pkcs1.authorizationForm({
				order: "001044",
				amount: 22_500,
				currency: "MDL",
				description: "Order 1044",
				returnUrl: "https://shop.example/orders/1044",
				language: "ro",
			}),
		).rejects.toThrow(/openssl pkcs8 -topk8 -nocrypt/);
	});
});

describe("verifyCallback", () => {
	it("reads the bank's signed approval of an authorization", async () => {
		expect(await vb.verifyCallback(callback(signedByBank(approved)))).toEqual({
			outcome: "approved",
			action: "0",
			rc: "00",
			text: "Approved",
			order: "001044",
			amount: 22_500,
			currency: "MDL",
			rrn: "628510496640",
			intRef: "A1B2C3D4E5F6",
			approval: "123456",
		});
	});

	it("reads a declined callback whose RRN is empty", async () => {
		const declined = signedByBank({
			...approved,
			ACTION: "2",
			RC: "05",
			RRN: "",
			INT_REF: "",
			APPROVAL: "",
			TEXT: "Declined",
		});
		expect(await vb.verifyCallback(callback(declined))).toMatchObject({
			outcome: "declined",
			rc: "05",
			rrn: undefined,
			intRef: undefined,
		});
	});

	it("refuses a callback changed after the bank signed it", async () => {
		const changed = { ...signedByBank(approved), AMOUNT: "2.25" };
		expect(await failure(vb.verifyCallback(callback(changed)))).toMatchObject({
			kind: "untrusted",
		});
	});

	it("refuses another terminal's callback", async () => {
		const elsewhere = signedByBank({ ...approved, TERMINAL: "49800002" });
		expect(await failure(vb.verifyCallback(callback(elsewhere)))).toMatchObject(
			{
				kind: "untrusted",
			},
		);
	});

	it("reads a callback naming another operation as unknown, since TRTYPE is not signed", async () => {
		const renamed = signedByBank({ ...approved, TRTYPE: "21" });
		expect((await vb.verifyCallback(callback(renamed))).outcome).toBe(
			"unknown",
		);
	});
});

describe("complete and reverse", () => {
	it("completes a payment with a signed TRTYPE 21 naming its RRN and INT_REF", async () => {
		gateway.answer = () => ({
			html: htmlForm(
				signedByBank({ ...approved, TRTYPE: "21", INT_REF: "C0MPLETED" }),
			),
		});
		expect(await vb.complete(transaction)).toMatchObject({
			outcome: "approved",
			amount: 22_500,
			intRef: "C0MPLETED",
		});
		const [posted] = gateway.received;
		const fields = Object.fromEntries(posted ?? []);
		expect(fields).toMatchObject({
			ORDER: "001044",
			AMOUNT: "225.00",
			CURRENCY: "MDL",
			RRN: "628510496640",
			INT_REF: "A1B2C3D4E5F6",
			TRTYPE: "21",
			TERMINAL: "49800001",
		});
		expect(signedByMerchant(fields)).toBe(true);
	});

	it("reports a duplicate as unknown, never as declined", async () => {
		gateway.answer = () => ({
			html: htmlForm(
				signedByBank({ ...approved, TRTYPE: "21", ACTION: "1", RC: "-21" }),
			),
		});
		expect((await vb.complete(transaction)).outcome).toBe("unknown");
	});

	it("refuses a reversal answer signed for another amount", async () => {
		gateway.answer = () => ({
			html: htmlForm(
				signedByBank({ ...approved, TRTYPE: "24", AMOUNT: "1.00" }),
			),
		});
		expect(
			await failure(vb.reverse({ ...transaction, amount: 4_500 })),
		).toMatchObject({ kind: "untrusted" });
	});

	it("reports a page without fields as malformed and an HTTP error as unavailable", async () => {
		gateway.answer = () => ({
			html: "<html><body>Access denied</body></html>",
		});
		expect(await failure(vb.complete(transaction))).toMatchObject({
			kind: "malformed",
		});
		gateway.answer = () => ({ status: 502, html: "" });
		expect(await failure(vb.complete(transaction))).toMatchObject({
			kind: "unavailable",
		});
	});
});

describe("status", () => {
	// Shaped as the WooCommerce plugin reads the gateway's table (ACTION, RC,
	// TEXT in order); the labels are the test's own.
	const table = (action: string, rc: string, text: string) => ({
		html: `<table><tr><td>Action</td><td>${action}</td></tr><tr><td>Response code</td><td>${rc}</td></tr><tr><td>Text</td><td>${text}</td></tr></table>`,
	});

	it("asks about an order's completion and reads the table in order", async () => {
		gateway.answer = () => table("2", "05", "Declined");
		expect(await vb.status("001044", "completion")).toEqual({
			outcome: "declined",
			action: "2",
			rc: "05",
			text: "Declined",
		});
		expect(Object.fromEntries(gateway.received[0] ?? [])).toEqual({
			TRTYPE: "90",
			TERMINAL: "49800001",
			ORDER: "001044",
			TRAN_TRTYPE: "21",
		});
	});

	it("reads a transaction the gateway cannot find as unknown", async () => {
		gateway.answer = () => table("3", "-", "Transaction not found");
		expect((await vb.status("001044", "authorization")).outcome).toBe(
			"unknown",
		);
		expect(gateway.received[0]?.get("TRAN_TRTYPE")).toBe("0");
	});
});
