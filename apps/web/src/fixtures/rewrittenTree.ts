import type { PrototypeTree } from "../drydock/types";
import prototypeTree from "./prototypeTree";

/**
 * The same prototype after an agent rewrote it — the event comment anchoring
 * has to survive.
 *
 * Three edits, chosen because each breaks a different kind of anchor:
 *
 *  1. **A metric card is inserted.** Everything after it shifts, in layout AND
 *     in source line. A positional pin now points at the wrong card; a
 *     line-based id is stale. The surviving evidence is the element's own
 *     identity.
 *  2. **A row is renamed** ("Outbound sales" → "Outbound sales (EMEA)"). The
 *     element is still there and still in the same place. Only its text moved,
 *     which is precisely the case where silently keeping the comment attached
 *     would be a lie — the thread may no longer be about what it says.
 *  3. **A row is removed** ("After-hours triage"). There is no honest answer
 *     except to say so.
 *
 * Deliberately NOT a contrived diff: an inserted card, a renamed item and a
 * dropped item are the three most ordinary things "make this look better" does.
 */

const DASHBOARD = prototypeTree["src/Dashboard.tsx"];

const withInsertedCard = DASHBOARD.replace(
	`\t\t\t\t<MetricCard label="Median latency" value="640ms" delta="-52ms" />`,
	`\t\t\t\t<MetricCard label="Escalations" value="312" delta="-18" />\n` +
		`\t\t\t\t<MetricCard label="Median latency" value="640ms" delta="-52ms" />`,
);

if (withInsertedCard === DASHBOARD) {
	throw new Error("rewrittenTree: the MetricCard anchor no longer matches prototypeTree.");
}

const rewrittenAgents = [
	{ name: "Appointment reminders", status: "Live", tone: "green", calls: 4210, resolved: 91 },
	// Renamed — same element, different text.
	{ name: "Outbound sales (EMEA)", status: "Live", tone: "green", calls: 3180, resolved: 78 },
	{ name: "Billing support", status: "Paused", tone: "orange", calls: 2640, resolved: 88 },
	// "After-hours triage" removed entirely.
];

const rewrittenTree: PrototypeTree = {
	...prototypeTree,
	"src/Dashboard.tsx": withInsertedCard,
	"src/agents.json": JSON.stringify(rewrittenAgents, null, 2),
};

export default rewrittenTree;
