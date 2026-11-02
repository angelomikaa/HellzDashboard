# Hellz — Painel Geral (NeoFoot)

Painel web de estatísticas para uma guilda de Ragnarok Origin. Membros enviam
os status do personagem por screenshots (OCR no cliente + correção manual
obrigatória); o painel guarda tudo de forma append-only, calcula pontos por
stat e um OVR por classe+função, mostra cards por tier, rankings, escalação de
guerra e ferramentas de auditoria para oficiais.

O número que importa: **cada jogador vê onde está em relação à própria classe e
o que precisa melhorar**. Todo cálculo de rank vive no Postgres; toda
autorização vive em RLS/RPCs `SECURITY DEFINER` — nunca só na UI.

## Stack

- TypeScript + React 19 + Vite + Tailwind CSS v4
- Supabase (Postgres + RLS + Edge Functions + Storage)
- OCR: Tesseract.js no cliente (regiões, whitelist de dígitos, pré-processamento)
- Testes: Vitest (unit) + harness de OCR + smoke scripts contra o projeto live

## Começando

```bash
npm ci
cp .env.example .env      # preencha as chaves abaixo
npm run dev
```

Variáveis necessárias (`.env` local ou escopo Production/Preview na Vercel):

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | chave pública (vai no bundle — RLS é a proteção) |
| `SUPABASE_ACCESS_TOKEN` | só scripts locais (apply-seed / verify-schema); nunca no bundle |
| `SUPABASE_PROJECT_REF` | opcional; inferido da URL |

`SUPABASE_URL` / `SUPABASE_ANON_KEY` também são aceitos (integração Vercel).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite em modo desenvolvimento (copia assets do OCR antes) |
| `npm run build` | `tsc -b` + build de produção (falha sem as envs) |
| `npm run lint` | Oxlint |
| `npm test` | **Unit suite** (`src/**` + smoke-config) — ~40 s |
| `npm run test:ocr` | Harness exaustivo de OCR (amostras reais, ~7 min) |
| `npm run test:all` | Unit + OCR (gate de fase) |
| `npm run migrations:check` | Manifesto de migrations atualizado? |
| `npm run verify:schema` | Drift repo↔live (precisa do token) |
| `node scripts/verify-schema.mjs --offline` | Só a metade offline (CI) |
| `node scripts/apply-seed.mjs <arquivo.sql>` | Aplica SQL no projeto live |
| `npm run verify:deploy` | Gate pós-deploy (headers, bundle, functions) |

## Banco e migrations

`supabase/migrations/manifest.json` é a **ordem canônica** de aplicação e a
lista de arquivos **aposentados** (que existem por histórico e nunca devem ser
reaplicados). Gere/valide com:

```bash
npm run migrations:manifest   # reescreve o manifesto a partir do disco
npm run migrations:check      # falha se o manifesto estiver desatualizado
```

Aplique migrations **por caminho**, na ordem do manifesto:

```bash
node scripts/apply-seed.mjs supabase/migrations/0066_login_key_uniqueness.sql
```

Regras:

- Migrations são **append-only**: nunca edite uma já aplicada; crie a próxima.
- Seeds ficam em `supabase/seeds/` e não entram no manifesto.
- `verify:schema` confere bookkeeping, migrations aposentadas, `search_path`
  de toda função `SECURITY DEFINER`, os gates críticos e se o showcase anônimo
  está vazando valores.

## Testes

- `src/**` — unitários/puros (node env, sem DOM) e contratos de migration.
- `scripts/ocr-*.test.mjs` — harness de OCR com as amostras locais
  (`.secrets/ocr-samples/`), fora do loop padrão por custo.
- `scripts/smoke-*.mjs` — baterias contra o projeto **live**; exigem
  `scripts/smoke-config.mjs` e credenciais próprias.

CI (`.github/workflows/ci.yml`) roda lint → tipos → manifesto → guards offline
→ unit → build em todo push/PR. O harness de OCR fica manual/nightly.

## Release gate

Antes de liberar para membros reais:

1. `npm run test:all`, `npm run build`, `npm run verify:schema`.
2. Purga dos fixtures smoke e dummies (ver `STATE.md` — gates SEED-02).
3. `npm run verify:deploy` depois do deploy na Vercel.

O `verify:deploy` afirma headers de hardening, ausência de segredos no bundle,
functions alcançáveis e nenhum `.env` versionado. **Um FAIL bloqueia o release**
— não enfraqueça o gate para passar.

## Estrutura

```
src/features/   auth, dashboard, submit (OCR), admin, rank, lineup, highlights, export
src/lib/        api.ts (REST/RPC), http.ts (deadline), classLabels, rankMath (espelho de teste)
supabase/       functions/ (Edge), migrations/, seeds/
scripts/        apply-seed, smoke-*, harnesses de render/OCR, verify-schema
.planning/      GSD: PROJECT, ROADMAP, STATE, REQUIREMENTS, fases
```

## Planejamento

O projeto usa GSD: estado em `.planning/STATE.md`, fases em `.planning/ROADMAP.md`,
requisitos com REQ-IDs em `.planning/REQUIREMENTS.md`. Leia o `STATE.md` no
início de cada sessão.
