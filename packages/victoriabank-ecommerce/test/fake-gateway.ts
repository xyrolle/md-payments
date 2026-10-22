import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach } from "vitest";

export type Answer = { status?: number; html: string };

/**
 * A stand-in for the bank's gateway on 127.0.0.1:4737, over real HTTP. It
 * answers every post with `answer`, which a test sets, and keeps what was
 * posted in `received`.
 */
export function fakeGateway() {
	const received: URLSearchParams[] = [];
	const fake = {
		url: "http://127.0.0.1:4737/cgi-bin/cgi_link",
		received,
		answer: (_posted: URLSearchParams): Answer => ({ status: 404, html: "" }),
	};
	let server: Server;

	beforeAll(async () => {
		server = createServer(async (incoming, outgoing) => {
			let text = "";
			for await (const chunk of incoming) text += chunk;
			const posted = new URLSearchParams(text);
			received.push(posted);
			const { status = 200, html } = fake.answer(posted);
			outgoing.writeHead(status, { "content-type": "text/html" });
			outgoing.end(html);
		});
		await new Promise<void>((listening) =>
			server.listen(4737, "127.0.0.1", listening),
		);
	});
	beforeEach(() => {
		received.length = 0;
	});
	afterAll(() => new Promise<void>((closed) => server.close(() => closed())));

	return fake;
}

/** The gateway's answer to a completion or reversal: its fields as hidden inputs. */
export const htmlForm = (fields: Record<string, string>) =>
	`<html><body><form>${Object.entries(fields)
		.map(
			([name, value]) =>
				`<input type="hidden" name="${name}" value="${value}" />`,
		)
		.join("\n")}</form></body></html>`;
