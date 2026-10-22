# maib-checkout

An unofficial TypeScript client for [maib e-Commerce Checkout](https://docs.maibmerchants.md/checkout): register a hosted checkout, read where it stands, refund a payment, and verify maib's signed callbacks.

It is not affiliated with maib. It needs nothing beyond `fetch` and Web Crypto, so it runs on Node 24, Bun, Deno and Cloudflare Workers.

## Install

```sh
pnpm add maib-checkout
```

The first release is not on npm yet.

## Usage

```ts
import { MaibCheckout } from "maib-checkout";

const maib = new MaibCheckout({
	baseUrl: "https://sandbox.maibmerchants.md",
	clientId: "your client id",
	clientSecret: "your client secret",
	signatureKey: "your signature key",
});

// 1250.50 MDL for order 42. Keep checkoutId with the order, then send the payer to checkoutUrl.
const { checkoutId, checkoutUrl } = await maib.createCheckout({
	amount: 125_050,
	currency: "MDL",
	orderId: "42",
	description: "Order 42",
	callbackUrl: "https://shop.example/maib/callback",
	successUrl: "https://shop.example/orders/42",
	failUrl: "https://shop.example/orders/42",
});

// The callback route: maib posts here after a successful payment.
export async function handleCallback(request: Request): Promise<Response> {
	const notice = await maib.verifyCallback(request);
	if (notice.outcome === "paid") {
		// Find the order by notice.orderId, check notice.amount, then fulfil it.
	}
	return new Response(null, { status: 204 });
}

// Where it stands, for a payer who came back before the callback did.
const { outcome, payment } = await maib.getCheckout(checkoutId);

// Give 100 MDL back.
if (payment) {
	await maib.refund(payment.paymentId, {
		amount: 10_000,
		currency: "MDL",
		reason: "Returned",
	});
}
```

## API

Amounts are integers in minor units (bani: 1 MDL is 100), always paired with a currency.

`new MaibCheckout({ baseUrl, clientId, clientSecret, signatureKey })` takes the credentials from maibmerchants.md. `baseUrl` is `https://api.maibmerchants.md` in production and `https://sandbox.maibmerchants.md` for tests. The client gets an access token and renews it when it runs out.

| Method                                            | maib endpoint                    | Returns                                  |
| ------------------------------------------------- | -------------------------------- | ---------------------------------------- |
| `createCheckout(checkout)`                        | `POST /v2/checkouts`             | `{ checkoutId, checkoutUrl }`            |
| `getCheckout(checkoutId)`                         | `GET /v2/checkouts/{id}`         | `Checkout`, with its `payment` once paid |
| `refund(paymentId, { amount, currency, reason })` | `POST /v2/payments/{id}/refund`  | `Refund`, `Created` at first             |
| `getRefund(refundId)`                             | `GET /v2/payments/refunds/{id}`  | `Refund`                                 |
| `verifyCallback(request)`                         | maib's callback to `callbackUrl` | `PaymentNotice`                          |

Every answer carries maib's own `status` word and an `outcome`. maib's documentation decides the outcome, and a status it does not document is `unknown`, never `failed`:

| Outcome    | Checkout status                                          | Payment status                              | Refund status                    |
| ---------- | -------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| `pending`  | `WaitingForInit`, `Initialized`, `PaymentMethodSelected` |                                             | `Created`, `Requested`, `Manual` |
| `paid`     | `Completed`, by its payment                              | `Executed`, `PartiallyRefunded`, `Refunded` |                                  |
| `refunded` |                                                          |                                             | `Accepted`                       |
| `failed`   | `Expired`, `Abandoned`, `Cancelled`, `Failed`            | `Failed`                                    | `Rejected`                       |
| `unknown`  | any other                                                | any other                                   | any other                        |

A refunded payment was still paid: what went back is the payment's `refundedAmount`.

`verifyCallback` checks the HMAC-SHA256 signature over the body exactly as received, and that the timestamp is within 15 minutes of now. Read nothing from the request before passing it in.

Failures throw a `MaibError` whose `kind` says what to do next:

| `kind`        | Meaning                                                        | Next                               |
| ------------- | -------------------------------------------------------------- | ---------------------------------- |
| `refused`     | maib declined the request; its error code is in `code`.        | Nothing was done. Fix the request. |
| `unavailable` | No answer: a network failure, a 30 s timeout, HTTP 5xx or 429. | The request may have taken effect. |
| `malformed`   | An answer outside maib's documented format.                    | The request may have taken effect. |
| `untrusted`   | A callback whose signature or timestamp does not check out.    | Ignore it.                         |

A malformed amount (a negative number or a third decimal) is never rounded: it makes the answer `malformed`.

## Limitations

- **There is no idempotency key.** maib documents none, so the client never sends a request twice, except once more with a new token after a 401, which maib never processed.
  - After `unavailable` or `malformed` from `createCheckout`, a checkout may exist, but nobody has its address. Creating another one is safe.
  - After `unavailable` or `malformed` from `refund`, the refund may exist. Read the payment's `refundedAmount` with `getCheckout` before refunding again.
- **The ending checkout statuses come from the documentation's descriptions.** `Expired`, `Abandoned`, `Cancelled` and `Failed` haven't been confirmed on the sandbox.
- **maib sends callbacks after successful payments.** A failed or abandoned checkout is found with `getCheckout`.
- **Only MDL.** maib's documentation says the API uses MDL.
- **Not wrapped:** cancelling a checkout, the list endpoints, and the optional payer, language and item fields.
- **The access token belongs to one client instance.** Calls that start together before it exists each get a token.
- **Testing:** the test suite runs against maib's documented examples and a local stand-in for its API. `test/sandbox.test.ts` calls the real sandbox only when `MAIB_SANDBOX_CLIENT_ID` and `MAIB_SANDBOX_CLIENT_SECRET` are set, and it never runs in CI.

## License

MIT
