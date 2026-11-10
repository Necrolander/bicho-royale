# Arquitetura e registro de execução

## Fase 1 — inspeção concluída

Em 09/10/2026, o Desktop não continha um repositório identificado como Bicho Royale. Node 24 e npm estão disponíveis; Docker não foi encontrado. Projeto isolado em `bicho-royale`, sem modificar projetos existentes.

## Decisões

Next.js App Router, React e TypeScript. API Node com Zod, cookies de sessão e RBAC. SQLite nativo do Node para a demonstração local persistente; esquema PostgreSQL e Compose separados. Sem pagamentos ou qualquer equivalência monetária.

O motor puro centraliza os 25 animais e 13 modalidades. Sorteios usam compromisso SHA-256 de uma semente criptográfica criada antes da abertura. Derivação com rejection sampling; o resultado é registrado antes da animação. Transações SQLite `BEGIN IMMEDIATE` e restrições UNIQUE protegem execução e participação idempotentes. Auditoria encadeada por hashes.

Canvas 2D com projeção, iluminação e transformações CSS fornece a roleta com aparência tridimensional, sem dependência de GPU/WebGL em celulares. A geometria de 25 setores é determinística; o ângulo final usa o resultado da API. Nenhuma aleatoriedade de resultado no cliente.

SSE transmite alterações; agendamento avança pelo servidor em intervalos e pelas requisições. Em produção, o processo deve permanecer ativo. PostgreSQL não deve ser anunciado como ativo até a implementação do adaptador e execução das migrations.

## Registro das fases

| Fase | Entrega real                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------- |
| 1    | Ambiente inspecionado; projeto novo e isolado                                                           |
| 2    | 15 entidades, índices, restrições, triggers e esquema SQLite; seed idempotente                          |
| 3    | Cadastro, login, modo sem cadastro, scrypt, sessões, RBAC e bloqueio                                    |
| 4    | Semente criptográfica, compromisso, rejection sampling, máquina de estados e transações                 |
| 5    | Identidade escura/dourada, componentes, retratos SVG originais e preferências                           |
| 6    | Roleta de 25 setores com volume visual, aceleração/desaceleração, áudio, revelação e movimento reduzido |
| 7    | 13 modalidades, normalização, conferência, critérios regionais configuráveis e exemplos                 |
| 8    | Créditos, histórico filtrável, métricas pessoais, gráficos Recharts, favoritos e notificações           |
| 9    | Administração de usuários, agenda, regras, identidade, logo, banner, sons, conteúdo e auditoria         |
| 10   | SSE e agendamento no servidor com recuperação de rodadas após reinício                                  |
| 11   | 160 testes Vitest e 10 cenários Playwright (desktop/celular), typecheck, lint e build                   |
| 12   | README, arquitetura, regras, banco, API, segurança e deployment documentados                            |

Capturas reais em `artifacts/desktop.png` e `artifacts/mobile.png`. PostgreSQL/Prisma permanece desenho de evolução; Docker preparado, não executado. Conteúdo didático completo em português, navegação estruturada em três idiomas. A entrega demonstrativa é local; publicação externa depende de um host Node e volume durável.
