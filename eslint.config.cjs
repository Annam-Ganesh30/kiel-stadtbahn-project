// eslint.config.cjs  — flat config that correctly supplies parser modules
module.exports = [
    {
        // apply to vue, ts, js files
        files: ['**/*.vue', '**/*.ts', '**/*.js'],
        languageOptions: {
            // use the actual parser module (not the string)
            parser: require('vue-eslint-parser'),
            parserOptions: {
                // for <script> blocks in .vue files, this parser must be the module too
                parser: require('@typescript-eslint/parser'),
                extraFileExtensions: ['.vue'],
                ecmaVersion: 2024,
                sourceType: 'module',
            },
        },
        plugins: {
            // plugin modules (required so rules referencing them don't crash)
            vue: require('eslint-plugin-vue'),
            '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
        },
        rules: {
            // keep empty here — your shared config can be added later if needed
        },
    },
];
