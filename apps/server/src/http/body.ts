import { HttpError } from "./errors.ts";

/**
 * Body parsing helpers shared by every route.
 *
 * Deliberately narrow: each one asks for exactly the shape it needs and throws
 * a 400 the moment the body does not have it, rather than letting `undefined`
 * flow into the store layer and surface as a confusing constraint violation
 * three calls later.
 */

export const asRecord = (body: unknown): Record<string, unknown> => {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		throw new HttpError(400, "invalid_body", "request body must be a JSON object");
	}
	return body as Record<string, unknown>;
};

export const getRequiredString = (body: Record<string, unknown>, field: string): string => {
	const value = body[field];
	if (typeof value !== "string" || value.trim() === "") {
		throw new HttpError(400, "missing_field", `"${field}" is required`);
	}
	return value;
};

export const getOptionalString = (body: Record<string, unknown>, field: string): string | undefined => {
	const value = body[field];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new HttpError(400, "invalid_field", `"${field}" must be a string`);
	}
	return value;
};

export const getOptionalBoolean = (body: Record<string, unknown>, field: string): boolean | undefined => {
	const value = body[field];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "boolean") {
		throw new HttpError(400, "invalid_field", `"${field}" must be a boolean`);
	}
	return value;
};

/**
 * Files arrive as a plain JSON array of {path, contents}. Shape-checked here,
 * one level up from `validateFileTree`'s own checks, so a malformed request
 * (a missing `contents`, a number where a path belongs) reports "invalid_field"
 * rather than crashing deeper in the store layer trying to read `.path` off a
 * non-object.
 */
export const getRequiredFiles = (
	body: Record<string, unknown>,
): { path: string; contents: string }[] => {
	const value = body.files;
	if (!Array.isArray(value)) {
		throw new HttpError(400, "missing_field", '"files" is required and must be an array');
	}
	return value.map((entry, index) => {
		if (
			typeof entry !== "object" ||
			entry === null ||
			typeof (entry as Record<string, unknown>).path !== "string" ||
			typeof (entry as Record<string, unknown>).contents !== "string"
		) {
			throw new HttpError(
				400,
				"invalid_field",
				`files[${index}] must be an object with string "path" and "contents"`,
			);
		}
		return entry as { path: string; contents: string };
	});
};
