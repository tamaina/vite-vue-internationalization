import misskey from '@misskey-dev/eslint-plugin';

export default [
	{
		ignores: [
			'dist/**',
			'examples/*/dist/**',
			'node_modules/**',
			'src/volar.cjs',
		],
	},
	...misskey.configs.recommended,
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.eslint.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		rules: {
			'import/no-default-export': 'off',
		},
	},
];
