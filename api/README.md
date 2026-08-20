# API — Controle de Abastecimento

Backend REST (Express) com Supabase Auth/Postgres. Fotos: Supabase Storage ou **SharePoint** (`STORAGE_PROVIDER=sharepoint` + vars `SHAREPOINT_*` em `.env.example`). Upload mobile: `POST /v1/media/upload`.

## Comandos

```bash
npm install
cp .env.example .env   # preencher chaves do Supabase
npm run dev            # http://localhost:3002
npm run seed:admin     # primeiro usuário admin
```

## Estrutura

```
src/
├── index.ts           # bootstrap Express
├── config.ts          # variáveis de ambiente
├── lib/               # Supabase, storage (SharePoint/Supabase), domínio
├── middleware/        # auth e admin
├── routes/            # endpoints /v1
└── scripts/           # seed admin, confirmar e-mail
supabase/              # SQL (schema, buckets, migrações)
```

Documentação do banco: [`supabase/README.md`](supabase/README.md).
