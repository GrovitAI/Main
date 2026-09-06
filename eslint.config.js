// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', 'scratch/*', '.expo/*', 'coverage/*', 'supabase/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'api/**/*.ts'],
    rules: {
      // AGENTS.md rule 1: TypeScript strict — no any, no non-null assertions.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      // AGENTS.md rule 7: no next/* imports.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react-native', importNames: ['TouchableOpacity'], message: 'Use Pressable (AGENTS.md component rules).' },
          ],
          patterns: [
            { group: ['next', 'next/*'], message: 'next/* imports are not allowed in this Expo app.' },
            { group: ['**/tenant-context'], importNames: ['TENANT_ID', 'BRANCH_ID'], message: 'Use getTenantContext(); the constants are deprecated.' },
          ],
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Server-side code runs in Node: console output is the log sink.
    files: ['api/**/*.ts', 'src/lib/server/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
]);
