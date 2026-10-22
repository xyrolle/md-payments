# Follow-ups

## maib-checkout

- **Confirm the ending checkout statuses.** `Expired`, `Abandoned`, `Cancelled` and `Failed` are read as `failed` from the documentation's descriptions alone. Done when each is seen ending a checkout on the sandbox, or maib confirms them, and the README's limitation is gone.
- **Pay and refund a checkout in the sandbox.** The sandbox test only registers a checkout and reads it back, because paying needs a browser. Done when a paid checkout's callback, its `getCheckout` and an accepted refund are recorded from the sandbox and the stand-in's answers match them.

## victoriabank-ecommerce

- **Record a status answer.** The TRTYPE 90 answer isn't in the bank's specification, and the client reads its table in the WooCommerce plugin's order. Done when answers for a held, a completed and an unknown order are recorded from the test gateway, the stand-in serves them, and the README's limitation is gone.
- **Confirm the INT_REF of a reversal after a completion.** The specification names the authorization's; the completion answers with its own. Done when a reversal after a completion is made on the test gateway and the README says which INT_REF it took.
