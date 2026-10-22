# victoriabank-ecommerce

An unofficial TypeScript client for Victoriabank's e-Commerce Gateway (the CGI merchant interface): signed authorization forms, completions, reversals, status checks, and verification of the bank's signed callbacks.

It is not affiliated with Victoriabank. It needs nothing beyond `fetch` and Web Crypto, so it runs on Node 24, Bun, Deno and Cloudflare Workers.

## Install

```sh
pnpm add victoriabank-ecommerce
```

The first release is not on npm yet.

## Usage

```ts
import { Victoriabank } from "victoriabank-ecommerce";

const vb = new Victoriabank({
  gatewayUrl: "https://ecomt.victoriabank.md/cgi-bin/cgi_link",
  merchantId: "your 15-digit merchant id",
  terminalId: "your 8-digit terminal id",
  merchantName: "Example Shop",
  merchantUrl: "https://shop.example",
  merchantAddress: "Chisinau, Moldova",
  privateKey: "-----BEGIN PRIVATE KEY-----\n…",
  bankPublicKey: "-----BEGIN PUBLIC KEY-----\n…",
});

// 225 MDL for order 001044. Render form.fields as hidden inputs of a form
// that posts to form.action, HTML-escaping each value.
const form = await vb.authorizationForm({
  order: "001044",
  amount: 22_500,
  currency: "MDL",
  description: "Order 1044",
  returnUrl: "https://shop.example/orders/1044",
  language: "ro",
});

// The callback route: the bank posts its signed answer here.
export async function handleCallback(request: Request): Promise<Response> {
  const answer = await vb.verifyCallback(request);
  if (answer.outcome === "approved" && answer.rrn && answer.intRef) {
    // Find the order by answer.order and check answer.amount. The money is
    // held on the card until the payment is completed:
    await vb.complete({
      order: answer.order,
      amount: answer.amount,
      currency: "MDL",
      rrn: answer.rrn,
      intRef: answer.intRef,
    });
  }
  return new Response(null, { status: 200 });
}

// Where an order stands, when no callback came.
const { outcome } = await vb.status("001044", "authorization");
```

## API

Amounts are integers in minor units (bani: 1 MDL is 100). An order id is 6 to 32 characters.

`new Victoriabank(options)` takes the gateway's address and what the bank assigned the merchant: `merchantId`, `terminalId`, `merchantName`, `merchantUrl`, `merchantAddress`, the merchant's `privateKey` and the bank's `bankPublicKey`. `gatewayUrl` is `https://vb059.vb.md/cgi-bin/cgi_link` in production and `https://ecomt.victoriabank.md/cgi-bin/cgi_link` for tests.

| Method | TRTYPE | Returns |
| --- | --- | --- |
| `authorizationForm(payment)` | 0, posted by the payer's browser | `PaymentForm`: `{ action, fields }` |
| `verifyCallback(request)` | the bank's answer to 0 | `Transaction` |
| `complete(transaction)` | 21 | `Transaction` |
| `reverse(transaction)` | 24 | `Transaction` |
| `status(order, "authorization" \| "completion")` | 90 | `TransactionStatus` |

`complete` and `reverse` take `{ order, amount, currency, rrn, intRef }`. The rrn and intRef are named by the bank's approval of the authorization.

Every answer carries the gateway's `action` and `rc` and an `outcome`:

| ACTION | Gateway's meaning | `outcome` |
| --- | --- | --- |
| 0 | Transaction successfully completed | `approved` |
| 2 | Transaction declined | `declined` |
| 1 | Duplicate transaction detected | `unknown` |
| 3 | Transaction processing fault | `unknown` |
| anything else | | `unknown` |

A `Transaction` is read only once the bank's signature over ACTION, RC, RRN, ORDER and AMOUNT checks out. The answer to `complete` or `reverse` must also be signed for the order and amount asked.

Failures throw a `VictoriabankError` whose `kind` is one of these:

- `unavailable`: no answer came (a network failure, a 30 s timeout or an HTTP error).
- `malformed`: an answer without the fields the gateway documents.
- `untrusted`: an answer without the bank's valid signature, or signed for another order, amount or terminal.

A bad amount, order id or description throws a `RangeError` before anything is sent. A key in the wrong format throws a `TypeError` that says how to convert it.

## Limitations

- **The status check is not in the bank's published specification.** Its answer is an unsigned HTML table, read in the order the open-source WooCommerce plugin reads it (ACTION, RC, TEXT). It hasn't been confirmed against a recorded answer, and it says nothing about reversals.
- **TRTYPE and TERMINAL are not signed.**
  - `verifyCallback` reads a callback only as the answer to an authorization; one naming another TRTYPE is `unknown`.
  - The terminal check only stops another terminal's answer sent by mistake.
  - The bank signs every merchant's answers with one key, so compare the order and amount with your own before acting.
- **Which INT_REF a reversal after a completion takes is unconfirmed.** The specification says the authorization's; the completion answers with its own. The client sends the one you pass.
- **Retries:** the gateway answers a repeated completion or reversal as a duplicate, so sending one again after `unavailable` is safe. The bank's FAQ allows one reversal per transaction.
- **Keys:** the merchant's private key must be PKCS#8 PEM and the bank's public key SPKI PEM. Encrypted keys aren't supported, since Web Crypto takes no passphrase. Convert with `openssl pkcs8 -topk8 -nocrypt -in key.pem`.
- **Moldova only.** The currency is MDL, and the form sends COUNTRY `md` and Moldova's offset from GMT as MERCH_GMT.
- **Testing:** the suite pins the MAC to the specification's example and to the failed callback in the bank's FAQ. Signatures use key pairs made for the tests and are checked independently with `node:crypto`. Answers come from a local stand-in for the gateway. `test/sandbox.test.ts` asks the test gateway for a status only when `VICTORIABANK_TEST_TERMINAL_ID` is set, and it never runs in CI.

## License

MIT
