import { describe, expect, it } from "vitest";
import { MaibCheckout } from "../src/index.ts";

// Runs against maib's sandbox only when its credentials are set, and never in
// CI. Paying the checkout needs a browser, so it stops at reading it back.
const { MAIB_SANDBOX_CLIENT_ID, MAIB_SANDBOX_CLIENT_SECRET } = process.env;

describe.skipIf(!MAIB_SANDBOX_CLIENT_ID || !MAIB_SANDBOX_CLIENT_SECRET)(
	"maib's sandbox",
	() => {
		it("registers a checkout and reads it back as pending", async () => {
			const maib = new MaibCheckout({
				baseUrl: "https://sandbox.maibmerchants.md",
				clientId: MAIB_SANDBOX_CLIENT_ID ?? "",
				clientSecret: MAIB_SANDBOX_CLIENT_SECRET ?? "",
				signatureKey: "unused",
			});
			const { checkoutId } = await maib.createCheckout({
				amount: 1000,
				currency: "MDL",
				orderId: `md-payments-${Date.now()}`,
				description: "md-payments sandbox test",
				callbackUrl: "https://example.com/callback",
				successUrl: "https://example.com/paid",
				failUrl: "https://example.com/not-paid",
			});
			const checkout = await maib.getCheckout(checkoutId);
			expect(checkout).toMatchObject({
				status: "WaitingForInit",
				outcome: "pending",
				amount: 1000,
			});
		});
	},
);
