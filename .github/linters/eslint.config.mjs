import js from '@eslint/js';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jest from 'eslint-plugin-jest';
import globals from 'globals';

export default [
	{
		ignores: ['dist/', 'lib/', 'node_modules/', 'coverage/'],
	},
	{
		...js.configs.recommended,
		languageOptions: {
			globals: {
				...globals.node,
				Atomics: 'readonly',
				SharedArrayBuffer: 'readonly',
			},
		},
		rules: {
			...js.configs.recommended.rules,
			camelcase: 'off',
			'no-console': 'off',
			semi: 'error',
		},
	},
	...tsEslint.configs['flat/recommended-type-checked'].map(config => ({
		...config,
		files: ['**/*.ts'],
	})),
	{
		...jest.configs['flat/recommended'],
		files: ['__tests__/**/*.ts'],
		rules: {
			...jest.configs['flat/recommended'].rules,
			'jest/expect-expect': [
				'warn',
				{ assertFunctionNames: ['expect', 'expectExec'] },
			],
		},
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2023,
				sourceType: 'module',
				project: ['./.github/linters/tsconfig.json', './tsconfig.json'],
			},
		},
		rules: {
			'@typescript-eslint/array-type': 'error',
			'@typescript-eslint/consistent-type-assertions': 'error',
			'@typescript-eslint/explicit-member-accessibility': [
				'error',
				{ accessibility: 'no-public' },
			],
			'@typescript-eslint/explicit-function-return-type': [
				'error',
				{ allowExpressions: true },
			],
			'@typescript-eslint/no-extraneous-class': 'error',
			'@typescript-eslint/no-inferrable-types': 'error',
			'@typescript-eslint/no-non-null-assertion': 'warn',
			'@typescript-eslint/no-unnecessary-qualifier': 'error',
			'@typescript-eslint/no-useless-constructor': 'error',
			'@typescript-eslint/prefer-for-of': 'warn',
			'@typescript-eslint/prefer-function-type': 'warn',
			'@typescript-eslint/prefer-includes': 'error',
			'@typescript-eslint/prefer-string-starts-ends-with': 'error',
			'@typescript-eslint/promise-function-async': 'error',
			'@typescript-eslint/require-array-sort-compare': 'error',
		},
	},
];
