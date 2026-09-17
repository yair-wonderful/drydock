declare module "@babel/generator" {
	export interface GeneratorOptions {
		comments?: boolean;
		retainLines?: boolean;
	}

	export function generate(
		ast: unknown,
		options?: GeneratorOptions,
		code?: string,
	): { code: string };
}
