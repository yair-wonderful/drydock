import { forwardRef, memo } from "react";

export type ViewportName = "mobile" | "tablet" | "desktop";

export const VIEWPORTS: Record<ViewportName, number> = {
	mobile: 390,
	tablet: 834,
	desktop: 1280,
};

export interface PrototypeStageProps {
	className?: string;
	viewport: ViewportName;
	isCompiling: boolean;
	/** The compile failed, so what is mounted is the last version that worked. */
	isStale?: boolean;
}

/**
 * The surface the compiled prototype is mounted into. It owns only its own
 * framing and the width it hands its child — never what gets rendered inside,
 * which arrives imperatively as a shadow root.
 */
const PrototypeStage = forwardRef<HTMLDivElement, PrototypeStageProps>(
	function PrototypeStage({ className, viewport, isCompiling, isStale }, ref) {
		return (
			<div className={className} data-testid="prototype-stage">
				{isStale && (
					<p className="stage-stale" data-testid="stage-stale">
						last good render — the current source did not compile
					</p>
				)}
				<div
					className="stage-frame"
					style={{ width: VIEWPORTS[viewport], opacity: isCompiling ? 0.55 : 1 }}
					data-stale={isStale ? "true" : undefined}
				>
					<div ref={ref} className="stage-mount" data-testid="prototype-mount" />
				</div>
			</div>
		);
	},
);

export default memo(PrototypeStage);
