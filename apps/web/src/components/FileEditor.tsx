import { memo, useCallback } from "react";
import type { PrototypeTree } from "../drydock";

export interface FileEditorProps {
	className?: string;
	tree: PrototypeTree;
	activeFile: string;
	onSelectFile: (file: string) => void;
	onChangeFile: (file: string, contents: string) => void;
}

/** The prototype's source tree, editable. Editing here is what stands in for
 *  the agent writing files — same input to Drydock either way. */
function FileEditor({
	className,
	tree,
	activeFile,
	onSelectFile,
	onChangeFile,
}: FileEditorProps) {
	const handleChange = useCallback(
		(event: React.ChangeEvent<HTMLTextAreaElement>) => {
			onChangeFile(activeFile, event.target.value);
		},
		[activeFile, onChangeFile],
	);

	return (
		<div className={className} data-testid="file-editor">
			<div className="tabs">
				{Object.keys(tree).map((file) => (
					<FileTab
						key={file}
						file={file}
						isActive={file === activeFile}
						onSelect={onSelectFile}
					/>
				))}
			</div>
			<textarea
				spellCheck={false}
				value={tree[activeFile] ?? ""}
				onChange={handleChange}
				data-testid="file-source"
			/>
		</div>
	);
}

interface FileTabProps {
	file: string;
	isActive: boolean;
	onSelect: (file: string) => void;
}

/** An intermediate row so the per-item handler is memoized rather than
 *  re-created for every file on every render. */
const FileTab = memo(function FileTab({ file, isActive, onSelect }: FileTabProps) {
	const handleClick = useCallback(() => onSelect(file), [file, onSelect]);
	return (
		<button type="button" className={isActive ? "tab active" : "tab"} onClick={handleClick}>
			{file.replace(/^src\//, "")}
		</button>
	);
});

export default memo(FileEditor);
