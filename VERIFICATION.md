# Verificação — 09/10/2026

Seleção múltipla: 167 testes de backend/motor passaram; quatro cenários de seleção de vários animais em grupo e roleta passaram em desktop/celular. Build e lint passaram. Verificados total de pontos, persistência, idempotência e rollback completo por saldo insuficiente.

## Expansão tradicional — validação mais recente

- Build de produção, TypeScript e ESLint passaram.
- `npm test`: **165 testes passaram**.
- `npm run test:e2e`: seis jornadas em desktop/celular, **12 passaram**.
- `npm run test:e2e -- --grep "administração de modalidades"`: **2 passaram**, em desktop/celular. Total: 14 cenários distintos aprovados em duas execuções.
- `node scripts/capture-expansion.mjs`: seis páginas nos dois tamanhos, sem erros JavaScript ou rolagem horizontal; capturas `artifacts/expanded-*.png`.
- Backup SQLite consistente; `PRAGMA integrity_check` retornou `ok`.

Cobertura nova: acesso direto às 13 modalidades, bilhete tradicional após reload, isolamento por conta, publicação/conferência, posições selecionadas, regras preservadas, permissões/configuração administrativa e imutabilidade das regras do bilhete. A roleta também passou na verificação de compromisso e alinhamento final do setor.

Os registros abaixo descrevem a versão anterior à expansão.

## Comandos executados com sucesso

- `npm run typecheck`: sem erros TypeScript.
- `npm run lint`: sem erros ESLint.
- `npm test`: 160 testes passaram, em dois arquivos.
- `npm run test:e2e`: 10 cenários passaram (cinco jornadas em desktop e celular).
- Após o ajuste final para não interromper animação por mudanças de preferência, `npm run test:e2e -- --grep "jornada completa"`: os dois cenários de fluxo completo passaram novamente.
- `npm run build`: compilação de produção passou, sem aviso de rastreamento do diretório de dados.
- `npm audit` e `npm audit --omit=dev`: zero vulnerabilidades reportadas pelo registro consultado.
- `npm run start`: aplicação compilada iniciada em http://127.0.0.1:3010.
- `node scripts/capture.mjs`: revisão na aplicação compilada, desktop 1440×1100 e celular 390×844, sem erros JavaScript ou rolagem horizontal. Imagens em `artifacts/`.

## Jornadas E2E

1. Conta demonstrativa, RBAC, participação, histórico após reload, CSRF, publicação administrativa, compromisso reproduzido independentemente, parada no setor correto, comprovante conferido e inversão manual.
2. Cadastro, acesso à conta e isolamento do saldo/histórico.
3. Administração, configuração persistente, congelamento de regras existentes, agenda/cancelamento e conteúdo publicado na central de ajuda.
4. Busca pelo final 00, favorito persistente e acessibilidade após reload.
5. Oito requisições concorrentes com a mesma chave geram um único comprovante e um único débito.

## Limites da validação

Docker não disponível: Compose preparado, não executado. PostgreSQL/Prisma é desenho de evolução, sem adaptador ativo. SQLite é o banco funcional validado. Não houve publicação externa, teste de carga distribuída, certificação independente ou auditoria de segurança externa. A tradução integral do conteúdo didático está em português; navegação e cabeçalhos oferecem três idiomas.
