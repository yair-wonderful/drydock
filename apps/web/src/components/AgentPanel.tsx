import { useCallback, useState, type ChangeEvent } from "react";
import type { CritiqueFinding, DesignReview, DesignReviewRubric } from "@drydock/prototype";
import { generatePrototype, rewritePrototype } from "../api/agentClient";
import { ApiError } from "../api/httpClient";
import type { PrototypeTree } from "../drydock";
import { getFilesFromTree, getTreeFromFiles, HARNESS_ENTRY_POINT } from "../prototype/convertTree";

export interface AgentPanelProps {
	className?: string;
	/** The editor's current tree — what a rewrite instruction applies to. */
	tree: PrototypeTree;
	/** Replaces the editor's whole tree, from either a generation or a rewrite. */
	onApplyTree: (tree: PrototypeTree) => void;
}

type AgentStatus = { state: "idle" } | { state: "running" } | { state: "error"; message: string };

/**
 * The agent loop, as a control: describe a prototype and get one, or
 * describe a change and get the CURRENT tree rewritten. Generation and
 * rewriting are otherwise unrelated server calls, but they share one status
 * line because a person only ever wants one running at a time — the buttons
 * disable each other while either is in flight, matching that.
 */
export default function AgentPanel({ className, tree, onApplyTree }: AgentPanelProps) {
	const [prompt, setPrompt] = useState("");
	const [instruction, setInstruction] = useState("");
	const [status, setStatus] = useState<AgentStatus>({ state: "idle" });
	const [review, setReview] = useState<DesignReview | null>(null);

	const handleChangePrompt = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setPrompt(event.target.value),
		[],
	);
	const handleChangeInstruction = useCallback(
		(event: ChangeEvent<HTMLTextAreaElement>) => setInstruction(event.target.value),
		[],
	);

	const handleGenerate = useCallback(async () => {
		const trimmed = prompt.trim();
		if (!trimmed) return;
		setStatus({ state: "running" });
		try {
			const result = await generatePrototype(trimmed, HARNESS_ENTRY_POINT);
			onApplyTree(getTreeFromFiles(result.files));
			setReview(result.review);
			setStatus({ state: "idle" });
		} catch (error) {
			setStatus({ state: "error", message: error instanceof ApiError ? error.message : "generation failed" });
		}
	}, [prompt, onApplyTree]);

	const handleRewrite = useCallback(async () => {
		const trimmed = instruction.trim();
		if (!trimmed) return;
		setStatus({ state: "running" });
		try {
			const files = getFilesFromTree(tree);
			const result = await rewritePrototype(files, HARNESS_ENTRY_POINT, trimmed);
			onApplyTree(getTreeFromFiles(result.files));
			setReview(result.review);
			setStatus({ state: "idle" });
			setInstruction("");
		} catch (error) {
			setStatus({ state: "error", message: error instanceof ApiError ? error.message : "rewrite failed" });
		}
	}, [instruction, tree, onApplyTree]);

	const isRunning = status.state === "running";

	return (
		<div className={className} data-testid="agent-panel">
			<div className="agent-row">
				<textarea
					data-testid="agent-prompt"
					value={prompt}
					onChange={handleChangePrompt}
					placeholder="Describe a prototype to generate…"
					rows={2}
				/>
				<button
					type="button"
					data-testid="agent-generate"
					onClick={handleGenerate}
					disabled={isRunning || !prompt.trim()}
				>
					{isRunning ? "Working…" : "Generate"}
				</button>
			</div>
			<div className="agent-row">
				<textarea
					data-testid="agent-instruction"
					value={instruction}
					onChange={handleChangeInstruction}
					placeholder="Describe a change to make…"
					rows={2}
				/>
				<button
					type="button"
					data-testid="agent-rewrite"
					onClick={handleRewrite}
					disabled={isRunning || !instruction.trim()}
				>
					{isRunning ? "Working…" : "Rewrite"}
				</button>
			</div>
			{status.state === "error" && (
				<p className="agent-error" role="alert" data-testid="agent-error">
					{status.message}
				</p>
			)}
			{review && <DesignReviewPanel review={review} />}
		</div>
	);
}

/** One self-critique finding: what's there, what's wrong, what to change. */
function CritiqueRow({ finding }: { finding: CritiqueFinding }) {
	return (
		<li className={`critique-row critique-${finding.severity}`}>
			<span className="critique-dimension">{finding.dimension}</span> {finding.problem}
			<div className="muted">{finding.fix}</div>
		</li>
	);
}

/**
 * The five rated axes, in the order a reviewer scans them — which is
 * roughly how often each one is the actual problem, per the review corpus
 * at apps/server/src/agent/designReviewCorpus.ts.
 */
const RUBRIC_AXES = [
	{ key: "contrastLadder", label: "contrast" },
	{ key: "spacingRhythm", label: "spacing" },
	{ key: "affordanceClarity", label: "affordance" },
	{ key: "containerDepth", label: "nesting" },
	{ key: "componentProvenance", label: "provenance" },
] as const satisfies readonly { key: keyof DesignReviewRubric; label: string }[];

/**
 * Wonderful Design Guardrails' rubric layer, shown alongside every
 * generation. Server-side critique findings have already triggered one
 * mandatory repair pass before this review is returned; any findings still
 * shown here are the remaining review agenda.
 */
function DesignReviewPanel({ review }: { review: DesignReview }) {
	return (
		<div className="design-review" data-testid="design-review">
			<h3>design self-review</h3>
			<dl>
				<dt>purpose</dt>
				<dd>{review.purpose}</dd>
				<dt>primary action</dt>
				<dd>{review.primaryAction}</dd>
				<dt>components used</dt>
				<dd>{review.componentsUsed.join(", ") || "none"}</dd>
				<dt>mock data</dt>
				<dd>{review.mockData}</dd>
				<dt>known gaps</dt>
				<dd>{review.knownGaps.length > 0 ? review.knownGaps.join("; ") : "none"}</dd>
			</dl>
			<div className="design-review-rubric">
				{RUBRIC_AXES.map(({ key, label }) => (
					<span key={key} className={`rubric-pill rubric-${review.rubric[key]}`}>
						{label}: {review.rubric[key]}
					</span>
				))}
			</div>
			<p className="muted">{review.rubric.agentLineage}</p>
			<p className="muted">{review.rubric.stateCoverage}</p>
			{review.rubric.critique.length > 0 && (
				<div className="design-review-flagged" data-testid="design-review-critique">
					<h4>self-critique</h4>
					<ul>
						{review.rubric.critique.map((finding) => (
							<CritiqueRow key={`${finding.dimension}-${finding.problem}`} finding={finding} />
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
