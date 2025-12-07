/* .eslintrc.cjs */
module.exports = {
	parser: 'vue-eslint-parser',
	parserOptions: {
		parser: '@typescript-eslint/parser',
		ecmaVersion: 2024,
		sourceType: 'module',
		extraFileExtensions: ['.vue'],
		ecmaFeatures: { jsx: true },
	},
	plugins: ['vue', '@typescript-eslint'],
	extends: [
		'@dataport/eslint-config-geodev',
		'plugin:vue/vue3-recommended',
		'plugin:@typescript-eslint/recommended',
	],
	overrides: [
		{
			files: ['*.vue'],
			parser: 'vue-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser',
				extraFileExtensions: ['.vue'],
			},
		},
		{
			files: ['*.ts', '*.tsx'],
			parser: '@typescript-eslint/parser',
			parserOptions: {
				project: './tsconfig.json',
			},
		},
	],
}
