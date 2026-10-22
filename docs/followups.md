# Follow-ups

## maib-checkout

- **Confirm the ending checkout statuses.** `Expired`, `Abandoned`, `Cancelled` and `Failed` are read as `failed` from the documentation's descriptions alone. Done when each is seen ending a checkout on the sandbox, or maib confirms them, and the README's limitation is gone.
- **Pay and refund a checkout in the sandbox.** The sandbox test only registers a checkout and reads it back, because paying needs a browser. Done when a paid checkout's callback, its `getCheckout` and an accepted refund are recorded from the sandbox and the stand-in's answers match them.
