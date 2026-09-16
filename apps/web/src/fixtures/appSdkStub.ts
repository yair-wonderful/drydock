/**
 * Stand-in for `@wonderful/app-sdk`. A prototype is mock-data-only by design
 * (the data decision for this tool), so the spike only has to prove the
 * specifier RESOLVES — a real Drydock would swap this for the fixture-backed
 * SDK that serves curated anonymized data.
 */
export interface WonderfulContext {
	workspaceId: string;
	user?: { id: string; name: string };
}

export function useWonderfulContext(): WonderfulContext {
	return { workspaceId: "prototype", user: { id: "u_1", name: "Prototype viewer" } };
}
