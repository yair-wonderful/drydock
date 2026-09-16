import { memo } from "react";
import type { CompileResult, StyleCoverage } from "../drydock";

export interface ReportPanelProps {
	className?: string;
	result: CompileResult | null;
	coverage: StyleCoverage | null;
	runtimeError: Error | null;
	sharedExports: Record<string, number>;
}

/**
 * The report half of the Drydock contract — "a report that includes compile and
 * runtime failures, so that the agent can inspect and interact with the running
 * result". Rendered for a human here; in the real thing this same object is
 * what the agent reads back after every edit.
 */
function ReportPanel({
	className,
	result,
	coverage,
	runtimeError,
	sharedExports,
}: ReportPanelProps) {
	if (!result) {
		return (
			<div className={className}>
				<p className="muted">Compiling…</p>
			</div>
		);
	}

	const anchorCount = Object.keys(result.sourceMap).length;
	const loopAnchors = Object.values(result.sourceMap).filter((entry) => entry.loop).length;

	return (
		<div className={className} data-testid="report-panel">
			<dl className="stats">
				<Stat label="compile" value={`${result.durationMs.toFixed(0)}ms`} />
				<Stat label="module" value={result.code ? `${(result.code.length / 1024).toFixed(1)}kb` : "—"} />
				<Stat label="anchors" value={`${anchorCount} (${loopAnchors} in loops)`} />
				<Stat
					label="classes covered"
					value={coverage ? `${coverage.covered.length}/${coverage.covered.length + coverage.missing.length}` : "—"}
				/>
			</dl>

			{result.errors.length > 0 && (
				<section data-testid="compile-errors">
					<h3 className="bad">compile errors</h3>
					{result.errors.map((message) => (
						<pre key={`${message.file}:${message.line}:${message.text}`} className="bad">
							{message.file ? `${message.file}:${message.line}:${message.column} ` : ""}
							{message.text}
						</pre>
					))}
				</section>
			)}

			{runtimeError && (
				<section>
					<h3 className="bad">runtime error</h3>
					<pre className="bad">{runtimeError.message}</pre>
				</section>
			)}

			{result.errors.length === 0 && !runtimeError && (
				<p className="good" data-testid="report-ok">no failures</p>
			)}

			{result.warnings.length > 0 && (
				<section data-testid="compile-warnings">
					<h3 className="warn">warnings</h3>
					{result.warnings.map((message) => (
						<pre key={`${message.file}:${message.line}:${message.text}`} className="warn">
							{message.file ? `${message.file}:${message.line} ` : ""}
							{message.text}
						</pre>
					))}
				</section>
			)}

			<section>
				<h3>host-provided externals</h3>
				<pre data-testid="shared-exports">
					{Object.entries(sharedExports)
						.map(([specifier, count]) => `${specifier}  ${count} exports`)
						.join("\n")}
				</pre>
			</section>
		</div>
	);
}

const Stat = memo(function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="stat">
			<dt>{label}</dt>
			<dd>{value}</dd>
		</div>
	);
});

export default memo(ReportPanel);
