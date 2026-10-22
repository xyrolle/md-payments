# md-payments

TypeScript SDKs for Moldovan payment providers:

- **[maib-checkout](packages/maib-checkout):** create a checkout, read its status, refund, and verify callbacks.
- **[victoriabank-ecommerce](packages/victoriabank-ecommerce):** sign requests, authorize and complete, reverse, and check statuses.

They're typed, have no dependencies beyond the platform's `fetch` and Web Crypto, and run on Node, Bun, Deno and Cloudflare Workers.

These are unofficial and not affiliated with maib or Victoriabank.

**Status:** extracted from a production app that takes payments through both banks. Nothing is on npm yet.

## Development

```sh
pnpm install
pnpm check      # Biome
pnpm typecheck  # TypeScript 7
pnpm test       # Vitest
```

## License

MIT
