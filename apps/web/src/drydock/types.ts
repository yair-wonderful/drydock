/** A prototype's source: path → file contents. Paths are repo-relative-ish
 *  ("src/App.tsx"), always POSIX, always rooted at the tree itself. */
export type PrototypeTree = Record<string, string>;

/** One anchored JSX element, keyed by its opaque id. Mirrors `SourceMapEntry`
 *  in `common/apptemplate/template/infra/source-anchor-plugin.ts`. */
export interface SourceMapEntry {
	name?: string;
	component?: string;
	loop?: boolean;
	iterable?: string;
	file: string;
	line: number;
}

export type WfSourceMap = Record<string, SourceMapEntry>;

export interface CompileMessage {
	text: string;
	file?: string;
	line?: number;
	column?: number;
}

/** What Drydock hands back for one compile — the running page's code plus the
 *  report the agent reads. Mirrors the contract Harbor describes: "takes a
 *  multi-file React and TypeScript file tree and returns a running page inside
 *  the browser, alongside a report that includes compile and runtime failures". */
export interface CompileResult {
	/** The single ES module, or null when the compile failed. */
	code: string | null;
	sourceMap: WfSourceMap;
	errors: CompileMessage[];
	warnings: CompileMessage[];
	/** Every class name appearing in a `className="..."` literal in the tree. */
	classNames: string[];
	durationMs: number;
}
