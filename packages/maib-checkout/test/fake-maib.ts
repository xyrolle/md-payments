import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach } from "vitest";

/** A request the fake maib received. */
export type Received = {
	method: string;
	path: string;
	authorization: string | undefined;
	body: unknown;
};

export type Answer = { status?: number; body: unknown };

/**
 * A stand-in for maib's API on 127.0.0.1:4736, over real HTTP. It issues a
 * token for every `/v2/auth/token` request and answers every other request
 * with `answer`, which a test sets. Every request is kept in `received`.
 */
export function fakeMaib() {
	const fake = {
		baseUrl: "http://127.0.0.1:4736",
		received: [] as Received[],
		answer: (_request: Received): Answer => ({ status: 404, body: {} }),
		tokensIssued: 0,
	};
	let server: Server;

	beforeAll(async () => {
		server = createServer(async (incoming, outgoing) => {
			let text = "";
			for await (const chunk of incoming) text += chunk;
			const request: Received = {
				method: incoming.method ?? "",
				path: incoming.url ?? "",
				authorization: incoming.headers.authorization,
				body: text ? JSON.parse(text) : undefined,
			};
			fake.received.push(request);
			const { status = 200, body } =
				request.path === "/v2/auth/token"
					? issueToken(++fake.tokensIssued)
					: fake.answer(request);
			outgoing.writeHead(status, { "content-type": "application/json" });
			outgoing.end(JSON.stringify(body));
		});
		await new Promise<void>((listening) =>
			server.listen(4736, "127.0.0.1", listening),
		);
	});
	beforeEach(() => {
		fake.received.length = 0;
		fake.tokensIssued = 0;
	});
	afterAll(() => new Promise<void>((closed) => server.close(() => closed())));

	return fake;
}

const issueToken = (n: number): Answer => ({
	body: {
		result: { accessToken: `token-${n}`, expiresIn: 300, tokenType: "Bearer" },
		ok: true,
	},
});
