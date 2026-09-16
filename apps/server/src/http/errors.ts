import { InvalidTreeError, PrototypeNotFoundError, VersionNotFoundError } from "../prototypes/store.ts";

/** One HTTP-shaped failure. Thrown by a route handler and caught in one place
 * (see `respond.ts`) so no handler hand-rolls a status code. */
export class HttpError extends Error {
	readonly status: number;
	readonly code: string;
	readonly detail?: unknown;

	constructor(status: number, code: string, message: string, detail?: unknown) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.code = code;
		this.detail = detail;
	}
}

/**
 * Maps a store-layer error to its HTTP shape.
 *
 * This is the ONLY place that decision is made. A handler that itself decided
 * "not found means 404" per-call would drift the moment one handler used 400 by
 * mistake — routing every store error through here keeps the mapping in one
 * spot to get right and one spot to audit.
 */
export const getHttpError = (error: unknown): HttpError => {
	if (error instanceof HttpError) {
		return error;
	}
	if (error instanceof InvalidTreeError) {
		return new HttpError(400, error.detail.code, error.message, { path: error.detail.path });
	}
	if (error instanceof PrototypeNotFoundError) {
		return new HttpError(404, "prototype_not_found", error.message);
	}
	if (error instanceof VersionNotFoundError) {
		return new HttpError(404, "version_not_found", error.message);
	}
	// An unrecognised error is a bug, not a client mistake — it must not leak as
	// a 400/404 that tells the caller their request was somehow their fault.
	return new HttpError(500, "internal_error", "internal error");
};
