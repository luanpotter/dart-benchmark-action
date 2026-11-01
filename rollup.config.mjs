import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import license from 'rollup-plugin-license';

export default {
	input: 'src/index.ts',
	output: {
		file: 'dist/index.js',
		format: 'es',
		sourcemap: true,
	},
	plugins: [
		typescript({ tsconfig: './tsconfig.json' }),
		nodeResolve({ preferBuiltins: true }),
		// also convert require() inside try blocks, as it does not exist in ESM
		commonjs({ ignoreTryCatch: false }),
		license({ thirdParty: { output: 'dist/licenses.txt' } }), // codespell:ignore
	],
};
