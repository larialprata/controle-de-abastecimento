# Mobile — App de campo (Expo)

Registro de movimentações tanque/melosa com SQLite local, fila `outbox` e sincronização quando houver rede.

## Comandos

```bash
npm install
cp .env.example .env
npm run start
npm run android:win    # Windows — ver docs
```

## Estrutura

```
App.tsx              # telas e formulários
src/
├── db/              # SQLite
├── sync/            # outbox → API
└── types/
scripts/             # build Android no Windows
```

Build Android no Windows (caminhos longos, memória): [`../docs/mobile-android-build.md`](../docs/mobile-android-build.md).

Documentação geral: [`../README.md`](../README.md).
