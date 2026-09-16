#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HOST = process.env.DRYDOCK_LLM_ADAPTER_HOST ?? "127.0.0.1";
const PORT = Number(process.env.DRYDOCK_LLM_ADAPTER_PORT ?? 5399);
const FUNCTION_PATH = process.env.DRYDOCK_LLM_FUNCTION_PATH ?? "/api/v1/functions/drydock-llm-completion";
const REQUEST_TIMEOUT_MS = Number(process.env.DRYDOCK_LLM_ADAPTER_TIMEOUT_MS ?? 180_000);

const readBody = (request) =>
	new Promise((resolve, reject) => {
		let body = "";
		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});

function sendJson(response, status, body) {
	const text = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(text),
	});
	response.end(text);
}

async function callWonderfulFunction(payload) {
	const directory = await mkdtemp(path.join(tmpdir(), "drydock-llm-"));
	const payloadPath = path.join(directory, "payload.json");

	try {
		await writeFile(payloadPath, JSON.stringify(payload), "utf8");
		const { stdout } = await execFileAsync(
			"wful",
			["call", "post", FUNCTION_PATH, "--data-file", payloadPath, "--json"],
			{
				timeout: REQUEST_TIMEOUT_MS,
				maxBuffer: 64 * 1024 * 1024,
			},
		);
		return JSON.parse(stdout);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

function getStructuredOutputSchema(body) {
	return body?.response_format?.json_schema?.schema;
}

function toChatCompletion(body, content) {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: `chatcmpl-drydock-${now}`,
		object: "chat.completion",
		created: now,
		model: body.model || "drydock-wonderful-function",
		choices: [
			{
				index: 0,
				finish_reason: "stop",
				message: {
					role: "assistant",
					content,
				},
			},
		],
	};
}

const server = http.createServer(async (request, response) => {
	try {
		if (request.method === "GET" && request.url === "/v1/models") {
			sendJson(response, 200, {
				object: "list",
				data: [{ id: "drydock-wonderful-function", object: "model" }],
			});
			return;
		}

		if (request.method === "POST" && request.url === "/v1/chat/completions") {
			const body = JSON.parse((await readBody(request)) || "{}");
			const schema = getStructuredOutputSchema(body);

			if (!schema) {
				sendJson(response, 400, {
					error: { message: "response_format.json_schema.schema is required" },
				});
				return;
			}

			const functionResult = await callWonderfulFunction({
				messages: JSON.stringify(body.messages || []),
				schema: JSON.stringify(schema),
			});

			if (functionResult.error) {
				sendJson(response, 502, { error: { message: functionResult.error } });
				return;
			}

			sendJson(response, 200, toChatCompletion(body, functionResult.content ?? ""));
			return;
		}

		sendJson(response, 404, { error: { message: "not found" } });
	} catch (error) {
		sendJson(response, 500, {
			error: { message: error instanceof Error ? error.message : String(error) },
		});
	}
});

server.listen(PORT, HOST, () => {
	console.log(`Drydock Wonderful LLM adapter listening on http://${HOST}:${PORT}/v1`);
	console.log(`Forwarding structured completions to ${FUNCTION_PATH}`);
});