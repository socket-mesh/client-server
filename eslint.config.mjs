import eslint from '@secure-data-systems/eslint-config';

export default [
	...eslint.configs.flat,
	{
		rules: {
			'@typescript-eslint/no-empty-object-type': 'off'
		}
	},
	{
		ignores: [
			'**/dist/*',
			'**/build/*',
			'**/bundle/*',
			'**/lib/*',
			'**/turbo/*',
			'**/scripts/*',
			'**/*-dbschema.js',
			'commitlint.config.js',
			'eslint.config.mjs',
			'release.config.mjs',
			'rollup.config.js',
			'test.ts',
			'tsconfig.json'
		]
	}
];