# Integração — ativos e horímetro

Consulta somente leitura para outro sistema. Devolve o cadastro de equipamentos (`tipo EQUIPAMENTO`) com o último horímetro válido registrado no abastecimento pela melosa.

## Endpoint

`GET /v1/integracao/ativos`

Base local: `http://localhost:3001`  
Produção: mesma URL pública da API (o container escuta na porta `3010`).

## Autenticação

Header obrigatório:

```http
X-Api-Key: <INTEGRACAO_API_KEY>
```

A chave fica no `.env` da API (`INTEGRACAO_API_KEY`). Sem a variável, a rota responde `503`. Chave ausente ou errada responde `401`.

Não usa login de usuário.

## Parâmetros (query)

| Nome | Obrigatório | Descrição |
| --- | --- | --- |
| `ativo` | não | Filtro exato do patrimônio (ignora maiúsculas e espaços nas pontas). |
| `q` | não | Busca parcial em ativo ou nome. |
| `limit` | não | Página. Padrão `500`, máximo `2000`. |
| `offset` | não | Deslocamento. Padrão `0`. |

## Resposta `200`

```json
{
  "itens": [
    {
      "ativo": "EQ-1042",
      "nome": "Retroescavadeira",
      "horimetro": 1520.5,
      "horimetro_texto": "1520,5 h",
      "unidade": "h",
      "horimetro_em": "2026-09-20T14:32:00.000Z"
    }
  ],
  "total": 1,
  "limit": 500,
  "offset": 0
}
```

| Campo | Significado |
| --- | --- |
| `ativo` | Patrimônio do equipamento. |
| `nome` | Nome cadastrado. Se o ativo só existir no abastecimento, usa o nome gravado naquele movimento. |
| `horimetro` | Último valor numérico válido. `null` se ainda não houver leitura. |
| `horimetro_texto` | Texto original informado no abastecimento. |
| `unidade` | `h` (horas) ou `km`. Inferida do texto; se não vier unidade, assume `h`. |
| `horimetro_em` | Data/hora do abastecimento dessa leitura (ISO). |

Leituras `quebrado` e `inexistente` são ignoradas. O horímetro é o da última retirada de melosa válida daquele ativo, em qualquer obra.

## Exemplos

Listar:

```bash
curl -s "http://localhost:3001/v1/integracao/ativos" \
  -H "X-Api-Key: SUA_CHAVE"
```

Um ativo:

```bash
curl -s "http://localhost:3001/v1/integracao/ativos?ativo=EQ-1042" \
  -H "X-Api-Key: SUA_CHAVE"
```

## Erros

| HTTP | Corpo |
| --- | --- |
| `401` | `{ "error": "API key inválida." }` |
| `503` | `{ "error": "Integração não configurada (INTEGRACAO_API_KEY)." }` |
| `500` | `{ "error": "..." }` |
