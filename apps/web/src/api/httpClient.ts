/**
 * The transport layer: one function that knows how to talk to the Drydock
 * server, and nothing about what a prototype is. Everything above this reads
 * as ordinary async functions returning typed data — the fetch, the JSON
 * parsing, and the server's `{error: {code, message}}` shape are handled once,
 * here, rather than duplicated at every call site.
 */

const getApiBaseUrl = (): string => {
	// import.meta.env.VITE_* is Vite's compile-time env convention. Defaulting
	// to the server's own default port means a developer running both with no
	// config gets a working app; anything else has to be configured on purpose.
	// The optional access keeps this file importable from Node unit tests too.
	const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
	const configured = viteEnv?.VITE_DRYDOCK_API_URL;
	return configured?.trim() || "http://127.0.0.1:5299";
};

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly detail?: unknown;

	constructor(status: number, code: string, message: string, detail?: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.code = code;
		this.detail = detail;
	}
}

type RequestOptions = {
	method?: "GET" | "POST" | "PUT" | "DELETE";
	body?: unknown;
};

/**
 * One JSON request/response round trip.
 *
 * A non-2xx response is thrown as `ApiError` rather than returned, so a caller
 * that forgets to check `response.ok` cannot silently treat a 404 body as
 * data — the mistake `fetch`'s own contract makes easy.
 */
export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
	const apiBaseUrl = getApiBaseUrl();
	let response: Response;
	try {
		response = await fetch(`${apiBaseUrl}${path}`, {
			method: options.method ?? "GET",
			headers: options.body === undefined ? {} : { "content-type": "application/json" },
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
		});
	} catch {
		throw new ApiError(
			0,
			"api_unreachable",
			`Drydock API is not reachable at ${apiBaseUrl}. Start Drydock with \`pnpm run dev\` instead of the web-only server.`,
		);
	}

	const text = await response.text();
	let parsed: unknown;
	try {
		parsed = text === "" ? undefined : (JSON.parse(text) as unknown);
	} catch {
		throw new ApiError(
			response.status,
			"invalid_api_response",
			"Drydock API returned an unreadable response. Check the API line in the dev terminal.",
		);
	}

	if (!response.ok) {
		const errorBody = (parsed as { error?: { code?: string; message?: string; detail?: unknown } } | undefined)
			?.error;
		throw new ApiError(
			response.status,
			errorBody?.code ?? "unknown_error",
			errorBody?.message ?? `request failed with status ${response.status}`,
			errorBody?.detail,
		);
	}

	return parsed as T;
};
