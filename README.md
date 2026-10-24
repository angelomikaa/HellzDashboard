# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Production release gate

Run `npm run verify:deploy` after every deploy to `https://hellz-dashboard.vercel.app/`. It asserts:

- the served HTML carries the hardening headers (`x-content-type-options: nosniff`, `x-frame-options: DENY`, CSP report-only with `frame-ancestors 'none'`, etc.),
- the deployed JS bundle contains the Supabase project ref and leaks no secret (`service_role`, `sbp_`, `NEFOOT_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, no `Missing VITE_SUPABASE_URL`),
- the `verify-pin` and `step-up` Edge Functions are reachable and answering,
- no tracked `.env` and no `sbp_` literal in tracked non-markdown files.

A `FAIL` blocks the release — do not weaken the gate to make it pass.
