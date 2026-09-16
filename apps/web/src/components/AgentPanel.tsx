import { useCallback, useState, type ChangeEvent } from "react";
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
		</div>
	);
}
