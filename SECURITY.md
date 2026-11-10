# Segurança implementada

- Senhas com scrypt, sal aleatório de 128 bits, chave de 64 bytes; comparação timingSafeEqual.
- Sessões de 256 bits; somente SHA-256 do token no banco, cookie HttpOnly e SameSite Strict. Secure em produção com HTTPS.
- Quotas persistentes: oito tentativas por identidade em 15 minutos, quota global de autenticação, 30 participações por minuto por usuário, uma restauração diária. Não confiar em X-Forwarded-For não autenticado.
- Zod valida payloads; o motor valida modalidades, largura, posição e duplicatas. SQL parametrizado.
- Proteção de origem em POST e cookies Strict contra CSRF. O proxy deve preservar Host público.
- RBAC em todas as operações administrativas. Revogação de sessões ao bloquear usuário. Administrador não pode bloquear ou rebaixar a si próprio.
- Dados de usuários e históricos são sempre consultados pelo ID da sessão. Nenhuma senha, hash de senha ou semente de rodada aberta é exposta na API.
- React renderiza texto escapado. Conteúdo administrativo não aceita HTML. Headers nosniff, Referrer-Policy e X-Frame-Options DENY.
- Resultado e débito transacionais; UNIQUE de participação/chave e resultado/rodada. Triggers protegem auditoria e resultados publicados.
- Nenhuma integração financeira, segredo do frontend ou chave externa no repositório.

## Modelo de confiança

O servidor gera e conhece a semente antes da abertura. Compromisso e seed revelada provam consistência pós-compromisso, não impedem um operador malicioso de selecionar sementes antes de publicá-las. O hash encadeado é evidência local; não equivale a um registro externo inviolável. Acesso físico ao banco deve ser restrito. Para garantia mais forte, combine uma fonte externa de entropia e publique os compromissos em um registro independente.

## Operação

HTTPS obrigatório em produção; proxy com Host correto, volume durável, backup consistente, permissões mínimas de arquivo e supervisão do processo. Nenhuma credencial administrativa fixa. Para recuperar um administrador local, use `npm run admin:reset` com e-mail conhecido no host, que gera uma nova senha e revoga sessões; a ação entra na auditoria.

O simulador é adequado para demonstração local. Não passou por auditoria externa, pentest ou teste de carga distribuída. SSE e jobs exigem processo persistente. SQLite é para um host e volume local; não compartilhar arquivo em armazenamento de rede. Antes de exposição pública, avaliar proteção adicional por IP num proxy confiável, CSP compatível com Next e limites de recursos para criação de contas.
