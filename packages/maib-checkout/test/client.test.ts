import { describe, expect, it } from "vitest";
import { MaibCheckout, MaibError } from "../src/index.ts";
import { fakeMaib } from "./fake-maib.ts";

const maib = fakeMaib();

const client = () =>
	new MaibCheckout({
		baseUrl: maib.baseUrl,
		clientId: "test-client-id",
		clientSecret: "test-client-secret",
		signatureKey: "test-signature-key",
	});

const newCheckout = {
	amount: 125_050,
	currency: "MDL",
	orderId: "order-42",
	description: "Order 42",
	callbackUrl: "https://shop.example/maib/callback",
	successUrl: "https://shop.example/paid",
	failUrl: "https://shop.example/not-paid",
} as const;

/** `GET /v2/checkouts/{id}` as maib's documentation shows it, without the payer. */
const completedCheckout = {
	result: {
		id: "37193a81-a24f-4336-9f0e-5a2f544e0e8c",
		createdAt: "2026-02-05T16:47:44.049+00:00",
		status: "Completed",
		amount: 3.0,
		currency: "MDL",
		order: { id: "some-order-id", description: "My awesome order" },
		payment: {
			paymentId: "373827c5-6644-4ee3-a241-60de7c7af116",
			executedAt: "2026-02-05T16:47:52.522+00:00",
			status: "Executed",
			amount: 3.0,
			currency: "MDL",
			referenceNumber: "603616098154",
			refundedAmount: 0.0,
			paymentMethod: "Card",
			approvalCode: "929776",
		},
	},
	ok: true,
	errors: null,
};

const checkoutIn = (status: string) => ({
	body: {
		result: { id: "c-1", status, amount: 3, currency: "MDL", payment: null },
		ok: true,
	},
});

const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => expect.fail("expected a MaibError"),
		(error: unknown) => {
			expect(error).toBeInstanceOf(MaibError);
			return error;
		},
	);

describe("createCheckout", () => {
	it("registers a checkout with a bearer token, the amount in major units", async () => {
		maib.answer = () => ({
			body: {
				result: {
					checkoutId: "f6d0812a-50ee-47ec-bb3f-d3b3a4dda40d",
					checkoutUrl: "https://checkout.maib.md/f6d0812a",
				},
				ok: true,
				errors: null,
			},
		});
		const created = await client().createCheckout(newCheckout);
		expect(created).toEqual({
			checkoutId: "f6d0812a-50ee-47ec-bb3f-d3b3a4dda40d",
			checkoutUrl: "https://checkout.maib.md/f6d0812a",
		});
		expect(maib.received).toEqual([
			{
				method: "POST",
				path: "/v2/auth/token",
				authorization: undefined,
				body: {
					clientId: "test-client-id",
					clientSecret: "test-client-secret",
				},
			},
			{
				method: "POST",
				path: "/v2/checkouts",
				authorization: "Bearer token-1",
				body: {
					amount: 1250.5,
					currency: "MDL",
					orderInfo: { id: "order-42", description: "Order 42" },
					callbackUrl: "https://shop.example/maib/callback",
					successUrl: "https://shop.example/paid",
					failUrl: "https://shop.example/not-paid",
				},
			},
		]);
	});

	it("refuses an amount that is not a positive integer of minor units", async () => {
		await expect(
			client().createCheckout({ ...newCheckout, amount: 12.5 }),
		).rejects.toThrow(RangeError);
		expect(maib.received).toEqual([]);
	});

	it("throws maib's refusal with its code", async () => {
		maib.answer = () => ({
			status: 400,
			body: {
				ok: false,
				errors: [
					{
						errorCode: "maib.merchant.payments-42001",
						errorMessage: "Amount must be greater than zero.",
					},
				],
			},
		});
		expect(await failure(client().createCheckout(newCheckout))).toMatchObject({
			kind: "refused",
			code: "maib.merchant.payments-42001",
			message:
				"maib refused POST /v2/checkouts: Amount must be greater than zero. (maib.merchant.payments-42001).",
		});
	});

	it("reports a server error as unavailable and an answer outside maib's envelope as malformed", async () => {
		maib.answer = () => ({ status: 503, body: {} });
		expect(await failure(client().createCheckout(newCheckout))).toMatchObject({
			kind: "unavailable",
		});
		maib.answer = () => ({ body: { result: { checkoutId: "c-1" } } });
		expect(await failure(client().createCheckout(newCheckout))).toMatchObject({
			kind: "malformed",
		});
	});
});

describe("the access token", () => {
	it("is reused while it lives, and renewed once when maib answers 401", async () => {
		const maibCheckout = client();
		maib.answer = () => checkoutIn("Initialized");
		await maibCheckout.getCheckout("c-1");
		await maibCheckout.getCheckout("c-1");
		expect(maib.tokensIssued).toBe(1);

		maib.answer = (request) =>
			request.authorization === "Bearer token-1"
				? { status: 401, body: { ok: false, errors: [] } }
				: checkoutIn("Initialized");
		await maibCheckout.getCheckout("c-1");
		expect(maib.tokensIssued).toBe(2);
		expect(maib.received.at(-1)?.authorization).toBe("Bearer token-2");
	});
});

describe("getCheckout", () => {
	it("reads a completed checkout and its payment in minor units", async () => {
		maib.answer = () => ({ body: completedCheckout });
		expect(await client().getCheckout("37193a81")).toEqual({
			checkoutId: "37193a81-a24f-4336-9f0e-5a2f544e0e8c",
			status: "Completed",
			outcome: "paid",
			amount: 300,
			currency: "MDL",
			orderId: "some-order-id",
			payment: {
				paymentId: "373827c5-6644-4ee3-a241-60de7c7af116",
				status: "Executed",
				amount: 300,
				refundedAmount: 0,
				currency: "MDL",
				rrn: "603616098154",
				approvalCode: "929776",
				paymentMethod: "Card",
			},
		});
		expect(maib.received.at(-1)?.path).toBe("/v2/checkouts/37193a81");
	});

	it("is pending while open, failed once ended, and unknown for a status maib does not document", async () => {
		const outcome = async (status: string) => {
			maib.answer = () => checkoutIn(status);
			return (await client().getCheckout("c-1")).outcome;
		};
		expect(await outcome("PaymentMethodSelected")).toBe("pending");
		expect(await outcome("Expired")).toBe("failed");
		expect(await outcome("Reviewing")).toBe("unknown");
		expect(await outcome("Completed")).toBe("unknown");
	});

	it("never rounds an amount with a third decimal", async () => {
		maib.answer = () => ({
			body: {
				result: {
					id: "c-1",
					status: "Completed",
					amount: 1.005,
					currency: "MDL",
				},
				ok: true,
			},
		});
		expect(await failure(client().getCheckout("c-1"))).toMatchObject({
			kind: "malformed",
			message: "maib's checkout has no valid amount.",
		});
	});
});

describe("cancelCheckout", () => {
	it("cancels a checkout that is not completed, sending nothing but its id", async () => {
		maib.answer = () => ({
			body: {
				result: {
					checkoutId: "5d526a22-9354-4721-99da-fa58fb53216e",
					status: "Cancelled",
				},
				ok: true,
				errors: null,
			},
		});
		await client().cancelCheckout("5d526a22-9354-4721-99da-fa58fb53216e");
		expect(maib.received.at(-1)).toEqual({
			method: "POST",
			path: "/v2/checkouts/5d526a22-9354-4721-99da-fa58fb53216e/cancel",
			authorization: "Bearer token-1",
			body: undefined,
		});
	});

	it("reads an answer that does not say Cancelled as malformed", async () => {
		maib.answer = () => ({
			body: { result: { checkoutId: "c-1", status: "Completed" }, ok: true },
		});
		expect(await failure(client().cancelCheckout("c-1"))).toMatchObject({
			kind: "malformed",
		});
	});
});

describe("refunds", () => {
	it("asks for a refund in major units and reads where it stands", async () => {
		const maibCheckout = client();
		maib.answer = () => ({
			body: {
				result: {
					refundId: "123e4567-e89b-12d3-a456-426614174000",
					status: "Created",
				},
				ok: true,
			},
		});
		expect(
			await maibCheckout.refund("ae20c2ae-328b-456d-bed1-52646b5eacab", {
				amount: 5061,
				reason: "Returned",
			}),
		).toEqual({
			refundId: "123e4567-e89b-12d3-a456-426614174000",
			status: "Created",
			outcome: "pending",
		});
		expect(maib.received.at(-1)).toMatchObject({
			method: "POST",
			path: "/v2/payments/ae20c2ae-328b-456d-bed1-52646b5eacab/refund",
			body: { amount: 50.61, reason: "Returned" },
		});

		maib.answer = () => ({
			body: {
				result: {
					id: "123e4567-e89b-12d3-a456-426614174000",
					paymentId: "ae20c2ae-328b-456d-bed1-52646b5eacab",
					refundType: "Partial",
					amount: 50.61,
					currency: "MDL",
					status: "Accepted",
				},
				ok: true,
				errors: null,
			},
		});
		expect(
			await maibCheckout.getRefund("123e4567-e89b-12d3-a456-426614174000"),
		).toMatchObject({ status: "Accepted", outcome: "refunded", amount: 5061 });
	});
});
