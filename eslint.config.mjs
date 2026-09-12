import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scratch de las herramientas, no codigo del proyecto. Va aqui porque
    // .claude/worktrees/ alberga worktrees de git: copias completas del repo,
    // node_modules incluido. Sin esta linea, `npm run lint` entra en ellas y
    // devuelve decenas de miles de problemas ajenos que tapan los propios
    // (medido: 22785 en una sola). Y la trampa es que solo aparecen cuando
    // alguien tiene un worktree abierto, asi que el lint pasa o falla segun
    // quien este trabajando en paralelo.
    ".claude/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
