import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import eslintNextPlugin from '@next/eslint-plugin-next'
import eslintReact from '@eslint-react/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y-x'

const eslintReactConfig = eslintReact.configs['recommended-typescript']

const eslintConfig = defineConfig([
    tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': 'warn',
            '@typescript-eslint/no-unused-expressions': 'warn',
        },
    },
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        extends: [
            eslintNextPlugin.configs['core-web-vitals'],
            eslintReactConfig,
            reactHooks.configs.flat.recommended,
        ],
        plugins: {
            'jsx-a11y-x': jsxA11y,
        },
        settings: {
            next: {
                rootDir: 'packages/ui/',
            },
        },
        rules: {
            // Hooks are checked by the official plugin, not by the @eslint-react ports
            ...Object.fromEntries(Object.keys(reactHooks.configs.flat.recommended.rules)
                .map((rule) => rule.replace('react-hooks/', '@eslint-react/'))
                .filter((rule) => rule in eslintReactConfig.rules)
                .map((rule) => [rule, 'off'])),
            // Accessibility rules of eslint-config-next
            'jsx-a11y-x/alt-text': ['warn', { elements: ['img'], img: ['Image'] }],
            'jsx-a11y-x/aria-props': 'warn',
            'jsx-a11y-x/aria-proptypes': 'warn',
            'jsx-a11y-x/aria-unsupported-elements': 'warn',
            'jsx-a11y-x/role-has-required-aria-props': 'warn',
            'jsx-a11y-x/role-supports-aria-props': 'warn',
        },
    },
    globalIgnores([
        // Default ignores of eslint-config-next:
        'dist/**',
        'build/**',
        'packages/*/dist/**',
        'packages/*/build/**',
        'packages/*/.next/**',
        'packages/*/next-env.d.ts',
        'types/**',
    ]),
])

export default eslintConfig
