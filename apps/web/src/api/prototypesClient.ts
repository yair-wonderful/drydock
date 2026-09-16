import type { PrototypeFile } from "@drydock/prototype";
import { request } from "./httpClient.ts";

export type PrototypeSummary = {
	id: string;
	name: string;
	summary: string;
	author: string;
	activeVersionId: string | null;
	forkedFromPrototypeId: string | null;
	forkedFromVersionId: string | null;
	isArchived: boolean;
	createdAt: string;
	updatedAt: string;
};

export type VersionSummary = {
	id: string;
	prototypeId: string;
	versionNumber: number;
	entryPoint: string;
	fileCount: number;
	totalBytes: number;
	label: string;
	createdBy: string;
	createdAt: string;
};

export type Version = VersionSummary & { files: PrototypeFile[] };

export type PrototypeWithActiveVersion = PrototypeSummary & { activeVersion: Version | null };

export const listPrototypes = (includeArchived = false): Promise<{ prototypes: PrototypeSummary[] }> =>
	request(`/api/prototypes${includeArchived ? "?includeArchived=true" : ""}`);

export const getPrototype = (id: string): Promise<PrototypeWithActiveVersion> =>
	request(`/api/prototypes/${id}`);

export type CreatePrototypeInput = {
	name: string;
	author: string;
	files: PrototypeFile[];
	summary?: string;
	entryPoint?: string;
	label?: string;
};

export const createPrototype = (input: CreatePrototypeInput): Promise<PrototypeWithActiveVersion> =>
	request("/api/prototypes", { method: "POST", body: input });

export type PublishVersionInput = {
	author: string;
	files: PrototypeFile[];
	entryPoint?: string;
	label?: string;
};

export const publishVersion = (prototypeId: string, input: PublishVersionInput): Promise<Version> =>
	request(`/api/prototypes/${prototypeId}/versions`, {
		method: "POST",
		body: input,
	});

export type ForkPrototypeInput = {
	author: string;
	name?: string;
	versionId?: string;
};

export const forkPrototype = (
	prototypeId: string,
	input: ForkPrototypeInput,
): Promise<PrototypeWithActiveVersion> =>
	request(`/api/prototypes/${prototypeId}/fork`, { method: "POST", body: input });

export const listVersions = (prototypeId: string): Promise<{ versions: VersionSummary[] }> =>
	request(`/api/prototypes/${prototypeId}/versions`);

export const getVersion = (prototypeId: string, versionId: string): Promise<Version> =>
	request(`/api/prototypes/${prototypeId}/versions/${versionId}`);

export type UpdatePrototypeInput = {
	name?: string;
	summary?: string;
	isArchived?: boolean;
};

export const updatePrototype = (id: string, input: UpdatePrototypeInput): Promise<PrototypeSummary> =>
	request(`/api/prototypes/${id}`, { method: "PUT", body: input });

export const deletePrototype = (id: string): Promise<void> =>
	request(`/api/prototypes/${id}`, { method: "DELETE" });
