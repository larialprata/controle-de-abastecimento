# Web — Dashboard e BI

Frontend React + Vite + Tailwind.

## Comandos

```bash
npm install
cp .env.example .env
npm run dev
npm run build
```

## Estrutura `src/`

| Pasta | Conteúdo |
|-------|----------|
| `pages/` | Rotas: login, dashboard, BI tanque/melosa, usuários, dados |
| `components/bi/` | Tabelas BI, mapa, tickets, fotos storage |
| `components/dashboard/` | Layout, cards, resumo melosa |
| `lib/` | API, Supabase, agregações, Excel Descarbonize |
| `state/` | Auth e tema |

Planilha modelo Excel: `public/templates/planilha-melosa-descarbonize.xlsx`.

Documentação geral: [`../README.md`](../README.md).
