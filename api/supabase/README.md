# Supabase — setup do zero

Scripts SQL usados pela API, web e mobile. Use esta ordem em um **projeto novo** no SQL Editor do Supabase.

## Ordem de execução (projeto novo)

| # | Arquivo | Obrigatório |
|---|---------|-------------|
| 1 | `schema.sql` | Sim |
| 2 | `storage-buckets.sql` | Sim (após o 1) |

**Não execute** em projeto novo (só migram bancos antigos):

- `migration_placa_fornecedor_tanque.sql` — referencia coluna `ativo_texto`, que não existe no schema atual
- `migration_remover_horimetro_e_legado.sql` — só remove colunas legadas de instalações antigas

## O que cada script cria

### `schema.sql`

- Extensão `pgcrypto`
- Tabelas: `obras`, `movimentacoes`, `profiles`, `melosa_movimentacoes`
- Enum `movimentacao_tipo`
- Seed das obras (229, 232, 242–249)
- Funções: `is_admin()`, `profiles_set_updated_at()`
- RLS e políticas em `obras`, `movimentacoes`, `melosa_movimentacoes`, `profiles`
- Grants para role `authenticated`

### `storage-buckets.sql`

Buckets privados (nomes usados pelo app):

| Bucket ID | Uso |
|-----------|-----|
| `cnh` | Foto da CNH no cadastro (mobile) |
| `notas` | Foto da nota — tanque obra (mobile) |
| `melosa_comprovantes` | Comprovante Melosa (mobile) |
| `melosa_tanques` | Foto do tanque Melosa (mobile / API) |

Políticas RLS em `storage.objects`: cada usuário só acessa arquivos em pasta `{seu_user_id}/...`; admin lê tudo via `is_admin()`.

Variáveis opcionais na API (`api/.env`): `CNH_BUCKET=cnh`, `NOTAS_BUCKET=notas` (já são os defaults).

## Dashboard Supabase (não é SQL)

1. **Authentication → Providers → Email** — habilitado
2. **Authentication → URL Configuration** — em dev, pode usar `http://localhost` se o Supabase exigir Site URL
3. **Project Settings → API** — copiar `URL`, `anon` e `service_role` para os `.env` do projeto

## Variáveis de ambiente (conectar apps)

| App | Arquivo | Variáveis |
|-----|---------|-----------|
| API | `api/.env` | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORT` |
| Web | `web/.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` |
| Mobile | `mobile/.env` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` |

Use as chaves do **mesmo** projeto Supabase em todos.

## Primeiro usuário admin (depois do SQL)

O SQL não cria usuário de login. Na pasta `api`:

```bash
npm install
# opcional no api/.env: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_CPF
npm run seed:admin
```

Isso cria usuário no Auth e linha em `profiles` com `role = admin`. Admin ignora checagem de `active = false`.

Motoristas novos ficam com `active = false` até um admin ativar pela web (`/usuarios`).

## Checklist rápido

- [ ] Projeto criado no Supabase
- [ ] `schema.sql` executado sem erro
- [ ] `storage-buckets.sql` executado sem erro
- [ ] `.env` da API, web e mobile com URL e chaves do projeto novo
- [ ] `npm run seed:admin` na API
- [ ] API no ar (`npm run dev`) e healthcheck `GET /health`
- [ ] Login web/mobile com o admin seed

## Erros comuns

| Erro | Causa |
|------|--------|
| `relation "public.profiles" does not exist` | Rodou `storage-buckets.sql` antes de `schema.sql` |
| `function public.is_admin() does not exist` | Mesmo: storage antes do schema |
| `column ativo_texto does not exist` | Rodou `migration_placa_fornecedor_tanque.sql` em banco novo — não rode |
| Upload CNH/nota falha | Buckets não criados ou RLS sem `storage-buckets.sql` |
| `Perfil inativo` na API | Usuário com `active = false`; admin ativa na web |
| `Invalid API key` | `.env` ainda aponta para o projeto antigo |
