import type { PrototypeTree } from "../drydock/types";

/**
 * The spike's test prototype: a small multi-file React + TypeScript tree of
 * exactly the shape an agent would emit — an entry, two components, a data
 * module, and a relative-import graph between them.
 *
 * It deliberately exercises the things that could break in-browser compilation:
 *   - `@wonderful/ui-base` as a bare EXTERNAL (resolved by the host import map)
 *   - relative imports across files, including an extensionless one
 *   - a `.json` data module
 *   - a `.map(...)` render, so the anchor pass emits loop/iterable flags
 *   - design tokens through the design system rather than hand-rolled colour
 */
const prototypeTree: PrototypeTree = {
	"src/index.tsx": `import Dashboard from "./Dashboard";

export default function Prototype() {
	return <Dashboard />;
}
`,

	"src/Dashboard.tsx": `import { Card, Layout, Text, Button, Tag } from "@wonderful/ui-base";
import MetricCard from "./MetricCard";
import agents from "./agents.json";

interface Agent {
	name: string;
	status: string;
	tone: "default" | "green" | "orange";
	calls: number;
	resolved: number;
}

export default function Dashboard() {
	const list = agents as Agent[];

	return (
		<Layout.Stack gap="lg" className="p-8">
			<Layout.Row split valign="center">
				<Layout.Stack gap="xs">
					<Text variant="heading-1">Voice agents</Text>
					<Text variant="body" color="secondary">
						Last 24 hours across every workspace
					</Text>
				</Layout.Stack>
				<Button>New agent</Button>
			</Layout.Row>

			<Layout.Grid idealColumns={3} gap="md">
				<MetricCard label="Calls handled" value="12,480" delta="+8.2%" />
				<MetricCard label="Resolved without transfer" value="87%" delta="+1.4%" />
				<MetricCard label="Median latency" value="640ms" delta="-52ms" />
			</Layout.Grid>

			<Card>
				<Card.Header title={<Card.Title>Agents</Card.Title>} />
				<Card.Body>
					<Layout.Stack gap="sm">
						{list.map((agent) => (
							<Layout.Row key={agent.name} split valign="center">
								<Layout.Stack gap="xs">
									<Text variant="label">{agent.name}</Text>
									<Text variant="body-sm" color="secondary">
										{agent.calls} calls · {agent.resolved}% resolved
									</Text>
								</Layout.Stack>
								<Tag color={agent.tone} text={agent.status} />
							</Layout.Row>
						))}
					</Layout.Stack>
				</Card.Body>
			</Card>
		</Layout.Stack>
	);
}
`,

	"src/MetricCard.tsx": `import { Card, Layout, Text } from "@wonderful/ui-base";

export interface MetricCardProps {
	label: string;
	value: string;
	delta: string;
}

export default function MetricCard({ label, value, delta }: MetricCardProps) {
	return (
		<Card>
			<Card.Body>
				<Layout.Stack gap="xs">
					<Text variant="label-sm" color="secondary">
						{label}
					</Text>
					<Text variant="heading-1">{value}</Text>
					<Text variant="caption" color="tertiary">
						{delta} vs yesterday
					</Text>
				</Layout.Stack>
			</Card.Body>
		</Card>
	);
}
`,

	"src/agents.json": JSON.stringify(
		[
			{ name: "Appointment reminders", status: "Live", tone: "green", calls: 4210, resolved: 91 },
			{ name: "Outbound sales", status: "Live", tone: "green", calls: 3180, resolved: 78 },
			{ name: "Billing support", status: "Paused", tone: "orange", calls: 2640, resolved: 88 },
			{ name: "After-hours triage", status: "Draft", tone: "default", calls: 2450, resolved: 84 },
		],
		null,
		2,
	),
};

export default prototypeTree;
