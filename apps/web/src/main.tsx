import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setPrototypeStyles } from "./drydock";
import prototypeStyles from "./prototypeStyles.css?inline";
import "./harness.css";

// The host owns the design system's CSS; the engine only consumes the text.
setPrototypeStyles(prototypeStyles);

const container = document.getElementById("root");
if (!container) {
	throw new Error("No #root element.");
}

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
