# Banco e persistência

Banco ativo: SQLite nativo de Node 24. Arquivo padrão `data/bicho-royale.sqlite`. WAL, chaves estrangeiras e busy timeout de 5 segundos habilitados. Inicialização idempotente pelo seed ou primeira chamada da API.

| Entidade                 | Tabela        | Integridade                                                            |
| ------------------------ | ------------- | ---------------------------------------------------------------------- |
| Users                    | users         | E-mail único, role FK, saldo não negativo                              |
| Roles                    | roles         | USER e ADMIN                                                           |
| UserSessions             | sessions      | Token armazenado como SHA-256, usuário FK, expiração                   |
| AnimalGroups             | animals       | ID entre 1 e 25, dezenas centralizadas                                 |
| GameModes                | modes         | Identificador único, definição JSON                                    |
| DemoRounds               | rounds        | Tipo e estado restritos, semente, compromisso, horários e regras       |
| DrawResults              | draw_results  | Uma linha por rodada, FK, resultado imutável                           |
| DemoEntries              | entries       | FK para usuário/rodada/modalidade, chave idempotente única por usuário |
| VirtualPointTransactions | transactions  | FK, um lançamento por participação, saldo final não negativo           |
| Notifications            | notifications | FK para usuário, estado lido                                           |
| UserPreferences          | preferences   | Uma configuração JSON por usuário                                      |
| AdminSettings            | settings      | Chave única, JSON validado na API                                      |
| AuditLogs                | audit_logs    | Sequência crescente, hash anterior e hash atual, imutável na aplicação |
| ContentPages             | content_pages | Slug único, texto simples                                              |

`rate_limits` persiste quotas de autenticação, participações e restauração. Índices: estado/horário de rodada, histórico do usuário, participantes da rodada, sessões e notificações. Datas são UTC em ISO-8601; exibição em português no fuso de São Paulo.

## Migração

`migrations/001_initial.sql` corresponde ao esquema inicial SQLite. A aplicação executa esse esquema idempotentemente em `lib/db.ts`; o seed popula os 25 animais e 13 modalidades. Não usa `db push` ou reescrita destrutiva. Mudanças futuras devem adicionar migrations numeradas e executar backup antes da atualização.

## Transações críticas

- Participação: conferir chave, usuário, rodada, saldo e regra; debitar saldo; inserir comprovante e lançamento; anexar auditoria; commit.
- Sorteio: verificar estado LOCKED; DRAWING; derivar resultado; inserir resultado; conferir participações e notificar; PUBLISHED; auditoria; commit.
- Configuração e usuários: operação administrativa e auditoria numa única transação.

`BEGIN IMMEDIATE` serializa escritores. Chamadas duplicadas do mesmo sorteio retornam o resultado publicado. Chaves idempotentes reutilizadas com payload diferente retornam 409.

## Backup e recuperação

Pare o servidor antes de copiar o SQLite, ou use a API de backup SQLite para backup consistente enquanto ativo. Não copie apenas o arquivo principal ignorando WAL quando houver escrita. O backup contém dados pessoais, hashes de senha e sementes ainda não reveladas: acesso restrito.

`prisma/schema.prisma` é um desenho de entidades para PostgreSQL. O código ativo usa SQL síncrono SQLite; configurar `DATABASE_URL` não muda o adaptador. Uma migração para PostgreSQL precisa de implementação assíncrona, transações/locks equivalentes e repetição dos testes de concorrência. Docker/PostgreSQL não foram executados neste computador.

## Migração aditiva 002

`entry_rules(entry_id,positions,rules)` preserva o contexto dos novos bilhetes sem alterar a estrutura ou IDs de `entries`. Triggers impedem alterar/remover o registro de regras. Bilhetes anteriores usam as regras imutáveis da rodada original. Configurações futuras de modalidades ficam em `settings.modeRules`; `rounds.rules` recebe uma cópia na criação da extração. Nenhum seed destrutivo é necessário.
