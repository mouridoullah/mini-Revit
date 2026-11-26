import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/*.md', '**/*.mjs'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tabax/geometry',
              message:
                "Règle d'or #2 (ADR-022) : apps/web ne doit pas importer directement @tabax/geometry. Passez par @tabax/core ou les packages de vue.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/core/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: "Règle d'or #1 (ADR-021) : @tabax/core ne doit pas importer React.",
            },
            {
              name: 'react-dom',
              message: "Règle d'or #1 (ADR-021) : @tabax/core ne doit pas importer react-dom.",
            },
            {
              name: 'three',
              message: "Règle d'or #1 (ADR-021) : @tabax/core ne doit pas importer Three.js.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ai/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas importer React.",
            },
            {
              name: 'react-dom',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas importer react-dom.",
            },
            {
              name: 'three',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas importer Three.js.",
            },
            {
              name: '@tabax/geometry',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai doit passer exclusivement par @tabax/core.",
            },
            {
              name: '@tabax/view-2d',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas importer @tabax/view-2d.",
            },
            {
              name: '@tabax/view-3d',
              message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas importer @tabax/view-3d.",
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas référencer window.",
        },
        {
          name: 'document',
          message: "Règle d'étanchéité (ADR-073) : @tabax/ai ne doit pas référencer document.",
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
