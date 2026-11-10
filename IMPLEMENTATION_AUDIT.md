# Auditoria de implementação — 09/10/2026

Escopo: expansão do projeto existente, preservando contas, saldo, bilhetes e sorteios em SQLite.

## Implementado antes da correção

- Autenticação, sessões, permissões administrativas e validação da API.
- Cadastro dos 25 animais e mapeamento das 100 dezenas, incluindo 00 na Vaca.
- Motor de 13 modalidades, normalização e conferência; extrações tradicionais com cinco prêmios.
- Sorteios no backend com semente comprometida antes da abertura, publicação imutável e auditoria encadeada.
- Participações persistidas com débito transacional e idempotência.
- Roleta animada, animais, resultados, estatísticas, perfil e administração de usuários/configuração/conteúdo.

## Incompleto antes da correção

- Navegação por fragmentos (#), sem as rotas de produto solicitadas.
- Modalidades concentradas em um formulário genérico, sem seletores próprios.
- Dashboard dominado pela roleta; pouca descoberta dos recursos tradicionais.
- Histórico com comprovante mínimo, sem área explícita de Meus Bilhetes nem busca privada por ID.
- Conferência manual dentro do simulador, sem página independente ou escolha de extração publicada.
- Animais encaminhavam somente à roleta.
- Agenda existente no administrador, mas sem área própria de extrações para o participante.
- Administração sem catálogo explícito de modalidades/configurações e resultados históricos separados.

## Não desenvolvido antes da correção

- Seleção explícita de posições nos bilhetes, com regra preservada para a conferência posterior.
- Comprovante completo com extração, regras, posições e resultado consultável por ID.
- Rotas individuais de grupo, dezena, centena, milhar, invertida, duques, ternos e passes.

## Controles encontrados

Os controles das telas existentes possuem handlers; o problema principal é a ausência dos fluxos solicitados, não botões decorativos. A publicação não permite escolher o número sorteado. O banco não será removido nem recriado. Novas estruturas devem ser aditivas.

## Validação prevista

TypeScript, lint, testes do motor/transações e navegação desktop/mobile. Registrar resultados efetivamente executados ao concluir. Esta auditoria descreve o estado inicial, não afirma que a correção já foi entregue.

## Expansão entregue e arquivos principais

- `lib/navigation.ts` e `app/[...screen]/page.tsx`: rotas do produto e das 13 modalidades; URLs desconhecidas retornam 404.
- `components/Traditional.tsx`: catálogo, seletores específicos, posições, permutações, extrações, bilhetes, conferidor, dashboard e configurações administrativas.
- `components/Royale.tsx`: navegação integrada, roleta em tela própria, animais abrindo grupo e Meus Bilhetes.
- `lib/game.ts`: conferência de posições e convenções por modalidade.
- `lib/rounds.ts`: regras copiadas na criação da extração e posições preservadas no bilhete; conferência automática no backend.
- `lib/tickets.ts` e API: comprovantes privados por ID e conferência independente sem débito.
- `lib/db.ts` e `migrations/002_ticket_rules.sql`: estrutura aditiva, sem recriar o banco, protegida contra alteração das regras registradas.
- `components/Admin.tsx`: agendamentos, resultados e configuração persistente/auditada de modalidades para novas extrações.

## Verificação da entrega

TypeScript, ESLint e build de produção passaram. 165 testes do motor/backend passaram. As seis jornadas principais passaram em desktop e celular (12 testes); a jornada adicional de configuração administrativa passou nos dois tamanhos (2 testes). Total: 14 cenários E2E distintos, em duas execuções.

A versão compilada foi capturada em seis páginas nos dois tamanhos, sem erros JavaScript ou rolagem horizontal. Antes de iniciar a versão expandida no banco real foi criado um snapshot SQLite consistente: `data/before-traditional-expansion-2026-10-09T19-01-53-597Z.sqlite`; a integridade retornou `ok`. Aplicação atualizada na porta 3010. O escopo continua sendo simulação com pontos fictícios.

`node scripts/verify-preservation.mjs` comparou os IDs originais com o banco atualizado: zero registros ausentes em usuários, rodadas, entradas e transações; integridade `ok` e nova estrutura de bilhetes presente.
