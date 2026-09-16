import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import FileEditor from "./components/FileEditor";
import PrototypeStage, { type ViewportName } from "./components/PrototypeStage";
import ReportPanel from "./components/ReportPanel";
import {
	compileTree,
	type CompileResult,
	getSharedExportCounts,
	getStyleCoverage,
	mountPrototype,
	type PrototypeTree,
	type StyleCoverage,
} from "./drydock";
import initialTree from "./fixtures/prototypeTree";
import { HARNESS_ENTRY_POINT } from "./prototype/convertTree";
import { type SaveStatus, usePersistedPrototype } from "./prototype/usePersistedPrototype";

type Mode = "light" | "dark";

/**
 * The spike harness: edit a file, and the tree recompiles in this tab and
 * remounts. No sandbox is provisioned, no bundle is uploaded, and nothing is
 * built on a server — which is the entire hypothesis under test.
 */
export default function App() {
	const [tree, setTree] = useState<PrototypeTree>(initialTree);
	const [activeFile, setActiveFile] = useState<string>("src/Dashboard.tsx");
	const [mode, setMode] = useState<Mode>("light");
	const [viewport, setViewport] = useState<ViewportName>("desktop");
	const [result, setResult] = useState<CompileResult | null>(null);
	const [coverage, setCoverage] = useState<StyleCoverage | null>(null);
	const [runtimeError, setRuntimeError] = useState<Error | null>(null);
	const [sharedExports, setSharedExports] = useState<Record<string, number>>({});
	const [isCompiling, setIsCompiling] = useState(true);

	const mountRef = useRef<HTMLDivElement>(null);
	// The live mount is a handle we dispose, not render state.
	const mountedRef = useRef<{ unmount: () => void } | null>(null);
	const runRef = useRef(0);

	const persistence = usePersistedPrototype();

	// Hydrates the editor from a fetched prototype exactly once. `loadedTree`
	// is a load-once value by the hook's own contract (see its doc comment), so
	// a plain effect keyed on it needs no extra re-entry guard here.
	useEffect(() => {
		if (!persistence.loadedTree) return;
		const { tree: fetchedTree } = persistence.loadedTree;
		setTree(fetchedTree);
		setActiveFile(HARNESS_ENTRY_POINT in fetchedTree ? HARNESS_ENTRY_POINT : Object.keys(fetchedTree)[0]);
	}, [persistence.loadedTree]);

	const handleChangeFile = useCallback((file: string, contents: string) => {
		setTree((current) => ({ ...current, [file]: contents }));
	}, []);

	// Depending on the specific functions rather than `persistence` itself: the
	// hook returns a fresh object every render, so a dependency on the whole
	// object would recreate these callbacks every render regardless of whether
	// `setName`/`save` actually changed.
	const { setName: setPersistedName, save: savePrototype } = persistence;

	const handleChangeName = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => setPersistedName(event.target.value),
		[setPersistedName],
	);

	const handleSave = useCallback(() => {
		void savePrototype(tree);
	}, [savePrototype, tree]);

	const handleRuntimeError = useCallback((error: Error) => {
		setRuntimeError(error);
	}, []);

	const handleToggleMode = useCallback(() => {
		setMode((current) => {
			const next = current === "light" ? "dark" : "light";
			document.documentElement.setAttribute("data-theme-mode", next);
			return next;
		});
	}, []);

	useEffect(() => {
		const run = ++runRef.current;
		let cancelled = false;
		setIsCompiling(true);
		setRuntimeError(null);

		// Debounced so typing recompiles once the edit settles.
		const timer = setTimeout(async () => {
			const compiled = await compileTree(tree);
			if (cancelled || run !== runRef.current) return;

			setResult(compiled);
			setCoverage(getStyleCoverage(compiled.classNames));

			// A failed compile keeps the LAST GOOD render on screen. Unmounting on
			// every rejection would mean losing the page you are working on to a
			// typo, which is the opposite of what a prototyping tool is for — and
			// it is also what lets the report be read against the thing it
			// describes, rather than against a blank rectangle.
			if (compiled.code && mountRef.current) {
				mountedRef.current?.unmount();
				mountedRef.current = null;
				try {
					mountedRef.current = await mountPrototype({
						container: mountRef.current,
						code: compiled.code,
						sourceMap: compiled.sourceMap,
						mode,
						onRuntimeError: handleRuntimeError,
					});
				} catch (error) {
					if (!cancelled) setRuntimeError(error as Error);
				}
			}
			if (!cancelled) {
				setSharedExports(getSharedExportCounts());
				setIsCompiling(false);
			}
		}, 250);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [tree, mode, handleRuntimeError]);

	const isStale = (result?.errors.length ?? 0) > 0 && mountedRef.current !== null;

	const anchorSample = useMemo(() => {
		if (!result) return [];
		return Object.entries(result.sourceMap).slice(0, 4);
	}, [result]);

	if (persistence.isLoading) {
		return (
			<main className="app app-loading">
				<p>Loading prototype…</p>
			</main>
		);
	}

	return (
		<main className="app">
			<header className="app-header">
				<h1>Drydock</h1>
				<p className="muted">
					Multi-file TSX compiled in this tab, mounted on the Wonderful app runtime.
					No VM, no server build.
				</p>
				{persistence.loadError && (
					<p className="error-banner" role="alert">
						Could not load this prototype ({persistence.loadError}) — showing the default
						fixture instead.
					</p>
				)}
				<div className="controls">
					<input
						type="text"
						className="prototype-name"
						value={persistence.name}
						onChange={handleChangeName}
						placeholder="Untitled prototype"
						aria-label="Prototype name"
					/>
					<button type="button" onClick={handleSave} disabled={persistence.saveStatus.state === "saving"}>
						{persistence.saveStatus.state === "saving" ? "Saving…" : "Save"}
					</button>
					<SaveStatusLabel status={persistence.saveStatus} />
					<button type="button" onClick={handleToggleMode} data-testid="toggle-mode">
						{mode === "light" ? "☾ dark" : "☀ light"}
					</button>
					{(["mobile", "tablet", "desktop"] as const).map((name) => (
						<ViewportButton
							key={name}
							name={name}
							isActive={viewport === name}
							onSelect={setViewport}
						/>
					))}
				</div>
			</header>

			<FileEditor
				className="pane editor"
				tree={tree}
				activeFile={activeFile}
				onSelectFile={setActiveFile}
				onChangeFile={handleChangeFile}
			/>

			<PrototypeStage
				ref={mountRef}
				className="pane stage"
				viewport={viewport}
				isCompiling={isCompiling}
				isStale={isStale}
			/>

			<ReportPanel
				className="pane report"
				result={result}
				coverage={coverage}
				runtimeError={runtimeError}
				sharedExports={sharedExports}
			/>

			{anchorSample.length > 0 && (
				<section className="pane anchors">
					<h3>source anchors (sample)</h3>
					<pre data-testid="anchor-sample">
						{anchorSample
							.map(([id, entry]) =>
								`${id}  ${entry.name}  ${entry.file}:${entry.line}${entry.loop ? `  loop(${entry.iterable ?? "?"})` : ""}`,
							)
							.join("\n")}
					</pre>
				</section>
			)}
		</main>
	);
}

interface ViewportButtonProps {
	name: ViewportName;
	isActive: boolean;
	onSelect: (name: ViewportName) => void;
}

function ViewportButton({ name, isActive, onSelect }: ViewportButtonProps) {
	const handleClick = useCallback(() => onSelect(name), [name, onSelect]);
	return (
		<button type="button" className={isActive ? "active" : undefined} onClick={handleClick}>
			{name}
		</button>
	);
}

/** Renders nothing for the idle state, so a prototype that has never been
 * saved does not show a stale-looking blank status. */
function SaveStatusLabel({ status }: { status: SaveStatus }) {
	switch (status.state) {
		case "saved":
			return <span className="save-status save-status-ok">saved · v{status.versionNumber}</span>;
		case "error":
			return (
				<span className="save-status save-status-error" role="alert">
					{status.message}
				</span>
			);
		default:
			return null;
	}
}
