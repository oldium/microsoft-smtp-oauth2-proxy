import { defineConfig, globalIgnores } from 'eslint/config'
import eslintNextPlugin from '@next/eslint-plugin-next'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
    {
        files: ['**/*.{js,jsx,ts,tsx}'],
        plugins: {
            next: eslintNextPlugin,
        },
        settings: {
            next: {
                rootDir: 'packages/ui/',
            },
        },
    },
    ...nextTs,
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
