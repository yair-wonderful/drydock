export { default as compileTree } from "./compileTree";
export { default as mountPrototype } from "./mountPrototype";
export { default as getSharedRuntime, getSharedExportCounts } from "./getSharedRuntime";
export { EXTERNALS } from "./externals";
export { default as checkUtilityClasses } from "./checkUtilityClasses";
export type { UtilityCheck } from "./checkUtilityClasses";
export { default as getKnownClasses } from "./getKnownClasses";
export { default as getPrototypeStyles, setPrototypeStyles } from "./prototypeStyleSheet";
export { default as getStyleCoverage } from "./getStyleCoverage";
export type { StyleCoverage } from "./getStyleCoverage";
export type {
	CompileMessage,
	CompileResult,
	PrototypeTree,
	SourceMapEntry,
	WfSourceMap,
} from "./types";
