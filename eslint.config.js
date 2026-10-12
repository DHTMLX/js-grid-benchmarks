import js        from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals    from 'globals';

const STYLE = {
    '@stylistic/no-multi-spaces':       'off',
    '@stylistic/key-spacing':           ['error', { beforeColon: false, afterColon: true, mode: 'minimum' }],
    '@stylistic/indent':                ['error', 4, { SwitchCase: 1, ignoredNodes: ['ConditionalExpression'] }],
    '@stylistic/quotes':                ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
    '@stylistic/semi':                  ['error', 'always'],
    '@stylistic/comma-dangle':          ['error', 'always-multiline'],
    '@stylistic/eol-last':              ['error', 'always'],
    '@stylistic/no-trailing-spaces':    'error',
    '@stylistic/space-before-blocks':   'error',
    '@stylistic/keyword-spacing':       'error',
    '@stylistic/arrow-spacing':         'error',
    '@stylistic/comma-spacing':         'error',
    '@stylistic/object-curly-spacing':  ['error', 'always'],
};

const CORRECTNESS = {
    eqeqeq:                   ['error', 'always', { null: 'ignore' }],
    'no-unused-vars':         ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-var':                 'error',
    'prefer-const':           ['error', { destructuring: 'all' }],
    'no-return-await':        'error',
    'no-empty':               ['error', { allowEmptyCatch: true }],
    'require-atomic-updates': 'off',

    'no-restricted-globals': ['error',
        { name: '__filename', message: 'Not defined in ESM. Derive it from import.meta.url.' },
        { name: '__dirname',  message: 'Not defined in ESM. Derive it from import.meta.url.' },
    ],
};

export default [
    {
        ignores: [
            'node_modules/**',
            'vendor/**',
            'results/**',
            'src/data/datasets/**',
            'src/viewer/node_modules/**',
            'spec/**',
        ],
    },

    js.configs.recommended,

    {
        files:   ['**/*.js', '**/*.mjs'],
        plugins: { '@stylistic': stylistic },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType:  'module',
        },
        rules: { ...STYLE, ...CORRECTNESS },
    },

    // Node: runner, matrix, data server, report generator, scripts, tests.
    {
        files: [
            'bin/**/*.{js,mjs}',
            'src/bench/**/*.{js,mjs}',
            'src/core/**/*.{js,mjs}',
            'src/data/**/*.{js,mjs}',
            'src/report/**/*.{js,mjs}',
            'scripts/**/*.{js,mjs}',
            'tests/**/*.{js,mjs}',
            'src/viewer/vite.config.js',
            'eslint.config.js',
        ],
        ignores: ['src/report/template/page.js'],
        languageOptions: { globals: { ...globals.node } },
    },

    {
        files: ['src/bench/runner.js', 'src/bench/environment.js'],
        languageOptions: { globals: { ...globals.node, ...globals.browser } },
    },

    {
        files: [
            'src/viewer/host.js',
            'src/adapters/**/*.js',
            'src/report/template/page.js',
        ],
        languageOptions: {
            globals: {
                ...globals.browser,
                // Substituted by vite.config.js from src/core/ports.js.
                __DATA_SERVER_URL__: 'readonly',
                // Grid libraries, injected as <script> by host.js before the adapter runs.
                dhx:         'readonly',
                agGrid:      'readonly',
                kendo:       'readonly',
                jQuery:      'readonly',
                $:           'readonly',
                DevExpress:  'readonly',
                bryntum:     'readonly',
            },
        },
    },
    {
        files: ['src/bench/measure.js'],
        languageOptions: { globals: { ...globals.browser } },
    },
];
