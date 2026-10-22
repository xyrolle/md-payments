import { describe, expect, it } from "vitest";
import { Victoriabank } from "../src/index.ts";

// Runs against the bank's test gateway only when a test terminal is set, and
// never in CI. Authorizing needs a payer's browser, so it asks a status.
const { VICTORIABANK_TEST_TERMINAL_ID } = process.env;

describe.skipIf(!VICTORIABANK_TEST_TERMINAL_ID)(
	"Victoriabank's test gateway",
	() => {
		it("answers a status check about an order it never saw", async () => {
			const vb = new Victoriabank({
				gatewayUrl: "https://ecomt.victoriabank.md/cgi-bin/cgi_link",
				merchantId: "unused",
				terminalId: VICTORIABANK_TEST_TERMINAL_ID ?? "",
				merchantName: "unused",
				merchantUrl: "unused",
				merchantAddress: "unused",
				privateKey: "unused",
				bankPublicKey: "unused",
			});
			const status = await vb.status(`${Date.now()}`, "authorization");
			expect(status.outcome).not.toBe("approved");
		});
	},
);
