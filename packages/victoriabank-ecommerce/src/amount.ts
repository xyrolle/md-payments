/** Minor units as the gateway writes an amount: 22500 is "225.00". */
export function gatewayAmount(amount: number): string {
	if (!Number.isSafeInteger(amount) || amount <= 0)
		throw new RangeError(
			`An amount is a positive integer of minor units (bani), got ${amount}.`,
		);
	const cents = String(amount % 100).padStart(2, "0");
	return `${Math.floor(amount / 100)}.${cents}`;
}

/**
 * The gateway's amount ("225.00" or "225") in minor units. Anything else, a
 * third decimal among them, is undefined: an amount is never rounded.
 */
export function minorUnits(value: string | undefined): number | undefined {
	const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value ?? "");
	if (!match) return undefined;
	return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}
