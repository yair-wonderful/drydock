import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getModel, getOpenAiClientOptions } from "./openaiClient.ts";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
	for (const key of Object.keys(process.env)) {
		delete process.env[key];
	}
	Object.assign(process.env, ORIGINAL_ENV);
});

describe("model client configuration", () => {
	it("passes an optional local adapter base URL into the client", () => {
		process.env.OPENAI_API_KEY = "local-adapter-placeholder";
		process.env.OPENAI_BASE_URL = " http://127.0.0.1:5399/v1 ";

		const options = getOpenAiClientOptions();

		assert.equal(options.apiKey, "local-adapter-placeholder");
		assert.equal(options.timeout, 120_000);
		assert.equal(options.baseURL, "http://127.0.0.1:5399/v1");
	});

	it("omits the base URL when it is not configured", () => {
		process.env.OPENAI_API_KEY = "live-key-placeholder";
		process.env.OPENAI_BASE_URL = "   ";

		assert.equal(getOpenAiClientOptions().baseURL, undefined);
	});

	it("keeps the model configurable by environment", () => {
		process.env.OPENAI_MODEL = "drydock-local-model";

		assert.equal(getModel(), "drydock-local-model");
	});
});
