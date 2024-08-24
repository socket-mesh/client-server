import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { dts } from "rollup-plugin-dts";
import { del } from '@kineticcafe/rollup-plugin-delete';

/** @type {import('rollup').RollupOptions} */
export default [
	{
		input: 'src/index.ts',
		output: {
			file: './bundle/socket-mesh-client.js',
			format: 'es'
		},
		plugins: [
			typescript({
				tsconfig: './tsconfig.build.json'
			}),
			commonjs(),
			nodeResolve({
				preferBuiltins: false,
				browser: true
			}),
			//terser()
		]
	},
	{
		input: "./bundle/dist/index.d.ts",
		output: [{ file: "bundle/socket-mesh-client.d.ts", format: "es" }],
		plugins: [
			dts(),
			del({
				targets: 'bundle/dist',
				hook: 'writeBundle'
			})
		]
	}
];