import { describe, expect, it } from "vitest";
import { mac } from "../src/signature.ts";

describe("the MAC", () => {
	it("is the specification's own example", () => {
		// e-Gateway Merchant CGI 2.1, Appendix A.
		const fields = {
			ORDER: "100001",
			NONCE: "11111111000000011111",
			TIMESTAMP: "20110627060100",
			TRTYPE: "0",
			AMOUNT: "34.99",
		};
		expect(
			mac(fields, ["ORDER", "NONCE", "TIMESTAMP", "TRTYPE", "AMOUNT"]),
		).toBe("61000012011111111000000011111142011062706010010534.99");
	});

	it("writes the empty RRN of a failed callback as a bare dash", () => {
		// The callback in the bank's FAQ: ACTION=3&RC=-17&RRN=&ORDER=100000&AMOUNT=34.99.
		const fields = {
			ACTION: "3",
			RC: "-17",
			RRN: "",
			ORDER: "100000",
			AMOUNT: "34.99",
		};
		expect(mac(fields, ["ACTION", "RC", "RRN", "ORDER", "AMOUNT"])).toBe(
			"133-17-6100000534.99",
		);
	});
});
