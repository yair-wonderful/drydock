import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/httpClient.ts";
import {
	createPrototype,
	getPrototype,
	publishVersion,
	type PrototypeWithActiveVersion,
} from "../api/prototypesClient.ts";
import type { PrototypeTree } from "../drydock";
import { getFilesFromTree, getTreeFromFiles, HARNESS_ENTRY_POINT } from "./convertTree.ts";

export type SaveStatus =
	| { state: "idle" }
	| { state: "saving" }
	| { state: "saved"; versionNumber: number }
	| { state: "error"; message: string };

const PROTOTYPE_ID_PARAM = "prototype";

const getPrototypeIdFromUrl = (): string | null =>
	new URLSearchParams(window.location.search).get(PROTOTYPE_ID_PARAM);

/**
 * Writes the prototype id into the URL without a navigation or a reload — the
 * point of a stable id in the URL is that reloading OR sharing the link
 * reopens the same prototype, and a `history.pushState` would instead grow the
 * back button by one entry per save.
 */
const setPrototypeIdInUrl = (id: string): void => {
	const url = new URL(window.location.href);
	url.searchParams.set(PROTOTYPE_ID_PARAM, id);
	window.history.replaceState(null, "", url);
};

/**
 * There is no auth layer yet (see `apps/server/src/prototypes/routes.ts`), so
 * this is the same kind of claim the server accepts at face value: a name the
 * app remembers on this browser, not a verified identity. Good enough for one
 * company's internal tool used from a known network; a real gap the moment
 * this is exposed further.
 */
const AUTHOR_STORAGE_KEY = "drydock:author";

const getAuthor = (): string => {
	const stored = window.localStorage.getItem(AUTHOR_STORAGE_KEY);
	if (stored) {
		return stored;
	}
	const name = window.prompt("Your name, for the prototype library") || "anonymous";
	window.localStorage.setItem(AUTHOR_STORAGE_KEY, name);
	return name;
};

export type UsePersistedPrototypeResult = {
	/** Only set once, the moment a fetched prototype's source is available to
	 * hydrate the editor with. Never fires again for the same id, so it is
	 * safe to use as a one-time "load into the tree" signal rather than
	 * something a component has to guard against re-running on every render. */
	loadedTree: { tree: PrototypeTree; name: string } | null;
	isLoading: boolean;
	loadError: string | null;
	prototypeId: string | null;
	name: string;
	setName: (name: string) => void;
	saveStatus: SaveStatus;
	/** Creates the prototype if none exists yet for this session, or publishes
	 * a new version if one does. The caller does not have to know which. */
	save: (tree: PrototypeTree) => Promise<void>;
};

/**
 * Owns loading a prototype named by the URL and saving edits back to it —
 * the harness's only points of contact with the server. A component reads
 * `loadedTree` once to hydrate its own editing state and calls `save` when the
 * author asks to save; everything about whether that means POST or a new
 * version lives here.
 */
export const usePersistedPrototype = (): UsePersistedPrototypeResult => {
	const [prototypeId, setPrototypeId] = useState<string | null>(getPrototypeIdFromUrl);
	const [name, setName] = useState("Untitled prototype");
	const [loadedTree, setLoadedTree] = useState<{ tree: PrototypeTree; name: string } | null>(null);
	const [isLoading, setIsLoading] = useState(prototypeId !== null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: "idle" });

	// Guards against loading twice under React 18/19 Strict Mode's deliberate
	// double-invoke of effects in development.
	const hasLoadedRef = useRef(false);

	useEffect(() => {
		if (!prototypeId || hasLoadedRef.current) {
			return;
		}
		hasLoadedRef.current = true;

		let cancelled = false;
		getPrototype(prototypeId)
			.then((prototype: PrototypeWithActiveVersion) => {
				if (cancelled) return;
				if (!prototype.activeVersion) {
					setLoadError("this prototype has no published version");
					return;
				}
				setName(prototype.name);
				setLoadedTree({
					tree: getTreeFromFiles(prototype.activeVersion.files),
					name: prototype.name,
				});
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setLoadError(error instanceof ApiError ? error.message : "failed to load prototype");
			})
			.finally(() => {
				if (!cancelled) setIsLoading(false);
			});

		return () => {
			cancelled = true;
		};
	}, [prototypeId]);

	const save = useCallback(
		async (tree: PrototypeTree) => {
			setSaveStatus({ state: "saving" });
			try {
				const files = getFilesFromTree(tree);
				const author = getAuthor();

				if (!prototypeId) {
					const created = await createPrototype({
						name,
						author,
						files,
						entryPoint: HARNESS_ENTRY_POINT,
					});
					setPrototypeId(created.id);
					setPrototypeIdInUrl(created.id);
					setSaveStatus({ state: "saved", versionNumber: created.activeVersion?.versionNumber ?? 1 });
					return;
				}

				const version = await publishVersion(prototypeId, {
					author,
					files,
					entryPoint: HARNESS_ENTRY_POINT,
				});
				setSaveStatus({ state: "saved", versionNumber: version.versionNumber });
			} catch (error) {
				setSaveStatus({
					state: "error",
					message: error instanceof ApiError ? error.message : "save failed",
				});
			}
		},
		[prototypeId, name],
	);

	return { loadedTree, isLoading, loadError, prototypeId, name, setName, saveStatus, save };
};
