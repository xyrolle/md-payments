import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaibCheckout, MaibError } from "../src/index.ts";

// The signed example in maib's documentation, "Callback Notifications":
// https://docs.maibmerchants.md/checkout/api-reference/callback-notifications
const documented = {
	signatureKey: "67be8e54-ac28-485d-9369-27f6d3c55a27",
	timestamp: "1761032516817",
	signature: "sha256=mtFkCMxfwj9t2wvY/7JASHLw+K/du4mY8azf1lV0ttg=",
	body: '{"checkoutId": "5a4d27a4-79f5-426b-9403-cccdeee81747","terminalId": "T1234567","amount": 1234.56,"currency": "MDL","completedAt": "2024-11-23T19:35:00.6772285+02:00","payerName": "John","payerEmail": "Smith","payerPhone": "37368473653","payerIp": "192.175.12.22","orderId": "ORDER-2025-0001","orderDescription": "Online purchase of electronics","orderDeliveryAmount": 50.00,"orderDeliveryCurrency": "MDL","paymentId": "379b31a3-8283-43d4-8a7b-eef8c0736a32","paymentAmount": 1234.56,"paymentCurrency": "MDL","paymentStatus": "Executed","paymentExecutedAt": "2025-05-05T23:38:07.2760698+03:00","senderIban": "NL43RABO1438227787","senderName": "Steven","senderCardNumber": "444433******1111","retrievalReferenceNumber": "ABC324353245","processingStatus": "OK","processingStatusCode": "00","approvalCode": "123456","threeDsResult": "Y","threeDsReason": null,"paymentMethod": "Card"}',
};

const maib = new MaibCheckout({
	baseUrl: "https://sandbox.maibmerchants.md",
	clientId: "unused",
	clientSecret: "unused",
	signatureKey: documented.signatureKey,
});

const callback = (body: string, headers: Record<string, string>) =>
	new Request("https://shop.example/maib/callback", {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body,
	});

/** A callback signed the way maib signs one, at the documented timestamp. */
const signed = (
	body: string,
	{
		key = documented.signatureKey,
		encoding = "base64" as "base64" | "hex",
	} = {},
) =>
	callback(body, {
		"x-signature-timestamp": documented.timestamp,
		"x-signature": `sha256=${createHmac("sha256", key).update(`${body}.${documented.timestamp}`).digest(encoding)}`,
	});

const untrusted = async (request: Request) => {
	const error = await maib.verifyCallback(request).catch((e: unknown) => e);
	expect(error).toBeInstanceOf(MaibError);
	expect(error).toMatchObject({ kind: "untrusted" });
};

beforeEach(() => {
	vi.useFakeTimers({ now: Number(documented.timestamp), toFake: ["Date"] });
});
afterEach(() => {
	vi.useRealTimers();
});

describe("verifyCallback", () => {
	it("accepts the signed example from maib's documentation", async () => {
		const notice = await maib.verifyCallback(
			callback(documented.body, {
				"X-Signature": documented.signature,
				"X-Signature-Timestamp": documented.timestamp,
			}),
		);
		expect(notice).toEqual({
			checkoutId: "5a4d27a4-79f5-426b-9403-cccdeee81747",
			orderId: "ORDER-2025-0001",
			paymentId: "379b31a3-8283-43d4-8a7b-eef8c0736a32",
			paymentStatus: "Executed",
			outcome: "paid",
			amount: 123_456,
			currency: "MDL",
			rrn: "ABC324353245",
			approvalCode: "123456",
			paymentMethod: "Card",
		});
	});

	it("accepts a signature written in lowercase hex, as maib's docs allow", async () => {
		const notice = await maib.verifyCallback(
			signed(documented.body, { encoding: "hex" }),
		);
		expect(notice.outcome).toBe("paid");
	});

	it("refuses a signature in uppercase hex, which maib's docs do not allow", async () => {
		const hex = createHmac("sha256", documented.signatureKey)
			.update(`${documented.body}.${documented.timestamp}`)
			.digest("hex");
		await untrusted(
			callback(documented.body, {
				"x-signature-timestamp": documented.timestamp,
				"x-signature": `sha256=${hex.toUpperCase()}`,
			}),
		);
	});

	it("refuses a body changed after signing", async () => {
		await untrusted(
			callback(documented.body.replace("1234.56", "1.56"), {
				"x-signature": documented.signature,
				"x-signature-timestamp": documented.timestamp,
			}),
		);
	});

	it("refuses a callback signed with another key", async () => {
		await untrusted(signed(documented.body, { key: "another-key" }));
	});

	it("refuses a callback signed more than 15 minutes ago", async () => {
		vi.setSystemTime(Number(documented.timestamp) + 16 * 60_000);
		await untrusted(signed(documented.body));
	});

	it("refuses a callback without a signature", async () => {
		await untrusted(
			callback(documented.body, {
				"x-signature-timestamp": documented.timestamp,
			}),
		);
	});

	it("reads a failed payment as failed, and a status maib does not document as unknown", async () => {
		const failed = documented.body.replace('"Executed"', '"Failed"');
		expect((await maib.verifyCallback(signed(failed))).outcome).toBe("failed");
		const pending = documented.body.replace('"Executed"', '"Pending"');
		expect((await maib.verifyCallback(signed(pending))).outcome).toBe(
			"unknown",
		);
	});
});
