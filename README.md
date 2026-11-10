# Bichos Vegas

Plataforma Bichos Vegas em Next.js 16, React 19 e TypeScript. A roletinha demonstrativa funciona com pontos fictícios. Há também sorteios por transmissão externa do YouTube, com link por rodada e cinco milhares publicados pelo administrador. O módulo Pix da Efí possui configuração criptografada, criação de cobrança e consulta de confirmação, mas a emissão real fica desabilitada até a validação da operação e a configuração da conta.

## Iniciar no Windows

Requer Node.js **24 ou superior** e npm. Nenhuma conta externa ou Docker é necessário para a demonstração.

```powershell
cd "C:\Users\PC MILIONÁRIO\Desktop\bicho-royale"
npm ci
npm run db:seed
npm run dev
```

Abra http://127.0.0.1:3010. Uma conta demonstrativa recebe 1.000 pontos. O seed gera 12 rodadas explicitamente simuladas, além de criar o administrador; **a senha aleatória é exibida no terminal apenas na primeira execução**. Guarde-a. A execução posterior preserva contas e resultados.

Para definir suas próprias credenciais antes do primeiro seed:

```powershell
$env:ADMIN_EMAIL="seu-email@example.com"
$env:ADMIN_PASSWORD="sua-senha-longa-e-exclusiva"
npm run db:seed
Remove-Item Env:ADMIN_PASSWORD
```

Não existe senha administrativa fixa no produto. A credencial literal usada em E2E pertence exclusivamente ao banco descartável de testes.

## Demonstração completa

1. Explore os animais e escolha um grupo; o final **00 é Vaca**.
2. Registre uma participação com 10 pontos na roleta, ou escolha qualquer modalidade no Simulador para a extração.
3. Cada rodada abre por 90 segundos por padrão. Depois, o servidor publica o resultado e a roleta o revela em 7 segundos.
4. Abra **Meu histórico** para conferir o comprovante e o critério utilizado.
5. Em **Resultados**, clique em **Verificar integridade** para reproduzir compromisso e resultado. **Rever último giro publicado** reproduz uma rodada passada; não realiza um novo sorteio.
6. Em **Minha conta**, entre com o administrador. O menu Administração permite agendar, pausar, cancelar rodadas antes da abertura, encerrar rodadas abertas, gerir usuários, conteúdo e regras.
7. O encerramento administrativo não permite escolher ou alterar o resultado.

O demonstrador mantém saldos e histórico após reiniciar o servidor. Contas sem cadastro ficam associadas ao cookie do dispositivo por sete dias; para uma conta duradoura, registre-se.

## Qualidade

```powershell
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

E2E usa servidor isolado em 3011 e banco próprio por execução. Testes cobrem desktop e celular; não alteram os dados da demonstração. Capturas de revisão em `artifacts/`. A opção `npm run start` inicia a compilação de produção na porta 3010.

## Estrutura

- `lib/game.ts`: tabela, regras, normalização, conferência e ângulo da roleta.
- `lib/fairness.ts`: semente, SHA-256 e rejection sampling.
- `lib/db.ts`: esquema, índices, triggers e transações SQLite.
- `lib/rounds.ts`: estados, agenda, participação e publicação.
- `lib/auth.ts`: scrypt, sessões, rate limiting e permissões.
- `app/api/[...path]/route.ts`: API, SSE e operações administrativas.
- `components/`: experiência de jogo, retratos, gráficos e administração.

## Decisões e limites da entrega

O ambiente local e o Docker Compose usam SQLite com volume persistente. A produção em [bichos-vegas.vercel.app](https://bichos-vegas.vercel.app) usa PostgreSQL no Supabase por conexão privada do backend, com funções Vercel em São Paulo e avanço periódico por `pg_cron`. O arquivo Prisma documenta uma evolução possível; o adaptador PostgreSQL ativo está em `lib/db.ts` e `lib/pg-worker.mjs`.

A roleta usa Canvas 2D com perspectiva, volume e luz simulados, não uma cena WebGL. Português é o idioma completo do conteúdo; navegação, cabeçalhos e identidade de entrada possuem traduções estruturadas em português, inglês e espanhol. Não há alegação de certificação de jogos, extração oficial ou previsão estatística.

Mais detalhes: [Arquitetura](ARCHITECTURE.md), [Regras](GAME_RULES.md), [Banco](DATABASE.md), [API](API.md), [Segurança](SECURITY.md), [Publicação](DEPLOYMENT.md).
## Expansão da plataforma tradicional

Rotas de produto: `/dashboard`, `/roleta`, `/modalidades` e páginas próprias das 13 modalidades, `/extracoes`, `/resultados`, `/conferidor`, `/animais`, `/meus-bilhetes`, `/estatisticas`, `/perfil` e `/admin`. Os atalhos antigos por fragmento encaminham para as novas páginas. A roleta ocupa sua própria tela; o dashboard apresenta modalidades, extrações, bilhetes recentes e favoritos.

Os bilhetes tradicionais usam seletores específicos, pontos fictícios e posições validadas no backend. O comprovante guarda regras e posições; a conferência automática usa esse registro. Consulta por ID exige a conta proprietária. O conferidor independente permite escolher extração publicada ou informar cinco milhares, sem débito.

A administração configura modalidades para novas extrações, preservando as rodadas existentes. A migração `002_ticket_rules.sql` é aditiva e aplicada pelo inicializador SQLite. Consulte `IMPLEMENTATION_AUDIT.md` para o diagnóstico anterior à expansão.
