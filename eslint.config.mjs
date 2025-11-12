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
			'**/rollup.config.js',
			'commitlint.config.js',
			'eslint.config.mjs',
			'release.config.mjs',
			'test.ts',
			'tsconfig.json'
		]
	}
];