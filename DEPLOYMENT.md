# Execução e publicação

## Node persistente

```powershell
npm ci
npm run db:seed
npm run build
npm run start
```

Porta local 3010; o script padrão escuta apenas loopback. Para container ou servidor com proxy, `npx next start --hostname 0.0.0.0 --port 3010`. Nunca colocar a pasta `data/` no Git ou em um diretório público. HTTPS no proxy é obrigatório para o cookie Secure de produção. Preserve Host público; configure o serviço com usuário sem privilégios.

## Docker Compose

`docker compose up --build -d` executa Node 24 com volume SQLite. Seed é executado antes da inicialização e a senha administrativa aleatória aparece no primeiro log. Defina ADMIN_EMAIL/ADMIN_PASSWORD no ambiente externo antes da primeira execução se desejar credenciais próprias. O volume preserva contas, sorteios e auditoria.

Docker não estava disponível no ambiente da implementação; os arquivos foram preparados, mas o container não foi executado e não deve ser apresentado como validado.

## Vercel e Supabase

A produção está em https://bichos-vegas.vercel.app, no projeto Vercel `bicho-royale` da equipe `megatouroonline-6894s-projects`. O banco dedicado é o projeto Supabase `bicho-royale` (`seqsdxnnnelofsaifmfi`), na região de São Paulo. As funções Vercel também executam em `gru1`.

O backend usa PostgreSQL via Transaction Pooler (porta 6543) quando `DATABASE_PASSWORD` ou `DATABASE_URL` está definido. Configure `DATABASE_HOST`, `DATABASE_USER`, `DATABASE_PORT`, `DATABASE_NAME` e `DATABASE_PASSWORD` nas variáveis de Production da Vercel; a senha deve ser Secret. A configuração alternativa é uma única `DATABASE_URL` Secret. O SQL de instalação está em `migrations/003_supabase.sql`. As tabelas têm RLS e nenhum acesso de `anon` ou `authenticated`; o servidor conecta diretamente como `postgres`.

Para publicar atualizações, rode `npx vercel --prod` no diretório vinculado ao projeto. Após configurar o domínio, execute `migrations/004_scheduler.sql` no editor SQL do projeto Supabase. O `pg_cron` chama `/api/health` a cada 30 segundos para avançar e publicar rodadas mesmo sem visitantes. O endpoint não expõe segredos e executa a mesma reconciliação de uma requisição comum. Confira a execução em `cron.job_run_details` e as respostas em `net._http_response`.

Para sorteios por live externa e Pix, aplique `migrations/005_external_draws.sql` e `migrations/006_efi_pix.sql`. A administração agenda a live pelo link do YouTube, encerra inscrições e publica cinco milhares manualmente. Esse resultado é identificado como externo e não é anunciado como gerado pela semente do servidor. A integração Efí exige Client ID, Client Secret, certificado P12 e chave Pix cadastrados no painel administrativo. `EFI_CONFIG_KEY` (32 bytes Base64) deve ser Secret na Vercel; a senha bancária e o certificado ficam cifrados no banco. `EFI_PAYMENTS_ENABLED` deve permanecer ausente ou `false` até liberação operacional. A confirmação consulta a cobrança diretamente na Efí, sem confiar em um comprovante do navegador. Nenhuma cobrança real foi testada sem credenciais da conta.

## Verificações

Antes de publicar: typecheck, lint, Vitest, Playwright e build. Depois: login sob HTTPS, participação, encerramento e verificação pública. Em Node persistente, o timer do processo avança rodadas; na Vercel, o agendador Supabase aciona a reconciliação. Reinícios recuperam SCHEDULED/OPEN/LOCKED; publicação é atômica, portanto DRAWING não fica parcialmente gravado. Programe backups no Supabase conforme a necessidade do projeto.
