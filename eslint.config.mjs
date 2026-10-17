import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";

export default [
  ...next,
  ...ts,
  { ignores: [".next/**", "node_modules/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
