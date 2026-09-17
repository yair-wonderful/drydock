import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { ApiError, request } from "./httpClient.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("httpClient", () => {
	it("turns an unreachable API into a useful local-dev message", async () => {
		globalThis.fetch = async () => {
			throw new TypeError("connection refused");
		};

		await assert.rejects(
			request("/api/agent/generate", { method: "POST", body: { prompt: "x" } }),
			(error) =>
				error instanceof ApiError &&
				error.code === "api_unreachable" &&
				error.message.includes("pnpm run dev") &&
				error.message.includes("web-only"),
		);
	});

	it("preserves server-provided error messages", async () => {
		globalThis.fetch = async () =>
			new Response(
				JSON.stringify({
					error: {
						code: "model_request_failed",
						message: "generation could not complete the model request",
					},
				}),
				{ status: 502, headers: { "content-type": "application/json" } },
			);

		await assert.rejects(
			request("/api/agent/generate", { method: "POST", body: { prompt: "x" } }),
			(error) =>
				error instanceof ApiError &&
				error.status === 502 &&
				error.code === "model_request_failed" &&
				error.message === "generation could not complete the model request",
		);
	});
});
