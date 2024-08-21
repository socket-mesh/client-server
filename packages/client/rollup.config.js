import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

/** @type {import('rollup').RollupOptions} */
export default {
	input: 'src/index.ts',
	output: {
		file: 'socket-mesh-client.js',
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
};