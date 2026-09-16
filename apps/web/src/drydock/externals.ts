/**
 * Bare specifiers the HOST provides at render time, never bundled into a
 * prototype.
 *
 * Copied deliberately from `common/apptemplate/template/vite.config.ts` so a
 * prototype compiled here and an app built by the real Vite pipeline see the
 * same module boundary — that parity is what makes "promote this prototype to
 * a real Wonderful App" a no-op rather than a port.
 */
export const EXTERNALS = [
	"react",
	"react-dom",
	"react/jsx-runtime",
	"@wonderful/ui-base",
	"@wonderful/app-sdk",
	"@wonderful/genui-react",
] as const;

export function isExternal(specifier: string): boolean {
	return (EXTERNALS as readonly string[]).includes(specifier);
}
