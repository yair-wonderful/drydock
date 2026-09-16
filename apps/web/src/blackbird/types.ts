/** One file in a Blackbird prototype package, ready for `UPLOAD_BUNDLE`. */
export interface PackageFile {
	path: string;
	contents: string;
	mime: string;
}

/** A `canvas-manifest.json` screen entry (spec/canvas-manifest.schema.json). */
export interface ManifestScreen {
	sid: string;
	title: string;
}

export interface PackageOptions {
	title: string;
	screens?: ManifestScreen[];
	/**
	 * Where the canvas serves the shared runtime modules the prototype imports
	 * by bare specifier. In a Vite dev canvas these are source URLs the service
	 * worker deliberately passes through; a deployed canvas points them at its
	 * built `/__shared/*.js` chunks instead.
	 */
	vendorBaseUrl?: string;
	/**
	 * Inject Vite's react-refresh preamble into the package's HTML.
	 *
	 * Only needed when the shared modules are served by a Vite DEV server: the
	 * transformed design-system sources carry refresh calls and abort with
	 * "@vitejs/plugin-react can't detect preamble" unless the runtime is
	 * installed first. Built chunks carry no refresh code, so a deployed canvas
	 * leaves this off.
	 */
	reactRefreshPreamble?: boolean;
}
