# md-payments

TypeScript SDKs for Moldovan payment providers:

- **maib Checkout:** create a checkout, read its status, refund, and verify callbacks.
- **Victoriabank e-commerce:** sign requests, authorize and complete, reverse, and check statuses.

They're typed, have no dependencies beyond the platform's `fetch` and Web Crypto, and run on Node, Bun, Deno and Cloudflare Workers.

These are unofficial and not affiliated with maib or Victoriabank.

**Status:** being extracted from a production app that takes payments through both banks. The code and the first releases are coming.

## License

MIT
