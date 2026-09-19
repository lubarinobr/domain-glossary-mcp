# Requirements - Domain Glossary MCP

## Problema

O coding agent precisa da definicao de negocio de um termo de dominio (Order, Shipment)
sem carregar javadoc ou README inteiros no context window. A resposta deve ter 2-3 linhas
e chegar sob demanda.

## Requisitos funcionais

1. O sistema expoe um servidor MCP sobre transporte stdio.
2. O sistema distribui-se por `npm install` e expoe um binario executavel.
3. O sistema guarda os dados em SQLite, num unico ficheiro central compartilhado
   entre projetos.
4. O tool `lookup_term` recebe `project` e `term` e devolve a `description`.
5. Quando o termo nao existe, `lookup_term` cria a entry com `description = NULL`
   e devolve "undocumented". A lacuna fica registada.
6. O tool `save_term` recebe `project`, `term` e `description` e faz upsert.
7. O tool `list_missing_terms` lista as entries com `description IS NULL`.
   O filtro por `project` e opcional.
8. A comparacao de `project` e `term` e case-insensitive. O sistema guarda a
   grafia original.
9. O sistema rejeita input vazio ou so com whitespace.
10. O sistema rejeita termos com sufixos que nao sao termos de dominio:
    `DTO`, `Request`, `Response`, `Mapper`, `Config`.

## Requisitos nao funcionais

1. Zero dependencias nativas. O `npm install` nunca compila codigo C++.
2. Logs estruturados em stderr. O stdout pertence ao transporte MCP.
3. Node >= 22.13, porque `node:sqlite` precisa dessa versao para correr sem flag.
4. Dependencias fixadas em versao exata.

## Fora de escopo

Estes pontos ficam fora por decisao explicita:

- Allowlist de entities num ficheiro `entities.json`
- Gate de CI para entries NULL
- Versionamento do ficheiro `.db` no git
- Fonte de verdade em ficheiros texto com build do DB
- Fase de seed manual de aggregate roots
