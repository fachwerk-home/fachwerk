import tseslint from "typescript-eslint";

export default tseslint.config(...tseslint.configs.recommended, {
  ignores: [
    "**/node_modules/**",
    "research/**",
    "tools/**",
    "docs/**",
    "_ingest/**",
    "ui/dist/**", // Build-Artefakte (minifiziert) sind kein Prüfgegenstand
  ],
});
