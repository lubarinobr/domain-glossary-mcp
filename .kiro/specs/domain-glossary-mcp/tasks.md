# Tasks - Domain Glossary MCP

Implementar em TDD. Correr os testes depois de cada task.

- [x] 1. Criar o skeleton do pacote npm
  - `package.json` com `bin`, `files`, `engines: node >= 22.13`
  - Dependencias em versao exata: `@modelcontextprotocol/sdk`, `env-paths`
  - TypeScript com `tsconfig.json`, target moderno, output em `dist/`
  - Runner `node:test` via `node --test`
  - Teste trivial que passa, para provar que o runner funciona
  - _Demo: `npm run build && npm test` verde_

- [x] 2. Implementar a camada de acesso ao SQLite
  - `db.ts` resolve o path, cria o diretorio, ativa WAL, aplica o schema
  - Idempotente em chamadas repetidas
  - _Testes: resolve `GLOSSARY_DB_PATH`; usa o fallback do `env-paths`;
    cria o schema num path temporario; segunda chamada nao falha;
    erro claro quando o diretorio nao tem permissao de escrita_
  - _Demo: apontar `GLOSSARY_DB_PATH` para `/tmp` e ver a tabela criada_

- [x] 3. Implementar `lookup_term`
  - Consulta com criacao do placeholder NULL
  - _Testes: termo com descricao devolve o texto; termo inexistente devolve
    "undocumented" e grava a linha NULL; termo já NULL nao duplica;
    `Order` e `order` resolvem para a mesma entry; o mesmo termo em projetos
    diferentes sao entries independentes; nome vazio e rejeitado_
  - _Demo: chamar a funcao e ver a linha NULL no SQLite_

- [x] 4. Implementar `save_term`
  - Upsert que preenche uma entry NULL ou sobrescreve uma existente
  - Atualiza `updated_at`
  - _Testes: grava termo novo; preenche placeholder NULL; sobrescreve
    descricao existente; `updated_at` muda; descricao vazia e rejeitada_
  - _Demo: lookup devolve "undocumented", save, lookup devolve a definicao_

- [x] 5. Implementar `list_missing_terms`
  - Lista as entries com `description IS NULL`, filtro opcional por projeto
  - _Testes: lista vazia num DB limpo; lista so os NULL; filtro por projeto;
    ordenacao estavel_
  - _Demo: criar 3 lacunas, preencher 1, listar as 2 restantes_

- [x] 6. Ligar tudo no servidor MCP
  - Registar os 3 tools no SDK com schemas de input
  - Transporte stdio, logs em stderr
  - Descricoes dos tools orientam o agent a usar so termos de dominio
  - _Teste: integracao com `tools/list` e um `tools/call` de cada tool_
  - _Demo: `npx domain-glossary-mcp` com um `tools/call` manual_

- [x] 7. Documentar instalacao e registo
  - README com `npm install` e a entrada no `.mcp.json`
  - `.gitignore` com `*.db`, `*.db-wal`, `*.db-shm`
  - _Demo: no repo real, o agent consulta o glossario e registra a lacuna_
  - _Pendente: a validacao no repo real fica em aberto. O
    `production-data-pipeline` nao esta neste disco._
