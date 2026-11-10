# API Bicho Royale

`POST /entries/groups`: `{roundId,mode,selection,points,key,positions?}`. Modalidades grupo/cabeca/cercado; 1 a 25 animais distintos. Pontos por animal. Retorna um comprovante por animal. Registro e débitos em uma única transação, com idempotência do conjunto; saldo insuficiente não registra nenhum bilhete.

Base `/api`. JSON. POST exige Content-Type application/json e Origin correspondente ao Host da requisição. Sessão via cookie HttpOnly, SameSite Strict. Respostas privadas: no-store. Erros: `{ "error": "mensagem" }`.

| Método | Rota                    | Acesso                                       | Operação                                                                                  |
| ------ | ----------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| GET    | /bootstrap              | Público, dados pessoais somente autenticados | Animais, modalidades, configurações, rodadas e perfil                                     |
| POST   | /auth/register          | Público com quota                            | name, email, password (mínimo 10)                                                         |
| POST   | /auth/login             | Público com quota                            | email, password                                                                           |
| POST   | /auth/logout            | Cookie atual                                 | Revoga sessão e cookie                                                                    |
| POST   | /entries                | Usuário                                      | roundId, mode, selection[], points, key UUID                                              |
| POST   | /check                  | Usuário                                      | mode, selection[], numbers[] (cinco milhares)                                             |
| GET    | /verify/:id             | Público                                      | Semente e verificação de rodada publicada                                                 |
| GET    | /events                 | Usuário                                      | SSE com atualização a cada três segundos                                                  |
| GET    | /stats                  | Público                                      | Frequências de grupos e dezenas                                                           |
| POST   | /preferences            | Usuário                                      | sound, accessible, theme, locale, favorites[], tutorial                                   |
| POST   | /notifications/read     | Usuário                                      | Marca somente notificações próprias                                                       |
| POST   | /points/reset           | Usuário, 1/24h                               | Restaura 1.000 pontos fictícios                                                           |
| GET    | /admin                  | ADMIN                                        | Indicadores, usuários, rodadas e auditoria                                                |
| POST   | /admin/users            | ADMIN                                        | id, role, blocked                                                                         |
| GET    | /admin/user-history?id= | ADMIN                                        | Participações, transações e logs do usuário                                               |
| POST   | /admin/rounds           | ADMIN                                        | schedule, cancel ou lock                                                                  |
| GET    | /admin/participants?id= | ADMIN                                        | Participantes da rodada                                                                   |
| POST   | /admin/settings         | ADMIN                                        | Nome, logo, cor, banner, idioma inicial, sons, animações, duração, pausa e regras futuras |
| POST   | /admin/content          | ADMIN                                        | slug, title, body (texto simples)                                                         |

Estatísticas: `from=YYYY-MM-DD`, `to=YYYY-MM-DD`, `type=ROULETTE|TRADITIONAL`; `format=csv` exporta CSV UTF-8. Dezena considera somente extrações, pois a roleta não sorteia dezenas.

Agendamento: `{action:"schedule",type:"ROULETTE",opensAt:"ISO-8601 UTC futuro",seconds:90}`. Cancelamento: `{action:"cancel",id:"UUID"}` — somente SCHEDULED. Encerramento: `{action:"lock",id:"UUID"}` — somente OPEN; resultado vem da semente original. Não existe endpoint para alterar ou escolher resultado.

Exemplo de participação:

```json
{
  "roundId": "UUID da rodada",
  "mode": "grupo",
  "selection": ["16"],
  "points": 10,
  "key": "UUID único da operação"
}
```

Repetir a mesma chave e payload retorna o mesmo comprovante, sem novo débito. Alterar payload com a mesma chave retorna 409. Estados fechados, saldos insuficientes e tipos de modalidade incompatíveis são rejeitados.

Status: 400 validação/regra, 401 sessão inválida, 403 origem/RBAC, 404 inexistente, 409 conflito, 415 formato, 429 quota, 500 falha interna sem detalhe sensível.

## Endpoints da expansão tradicional

- `POST /entries`: aceita `positions` opcional; retorna comprovante serializado com extração, regras e resultado.
- `GET /tickets`: bilhetes da conta autenticada.
- `GET /tickets/:id`: comprovante privado; 404 para ID inexistente ou pertencente a outra conta.
- `POST /check`: `{mode,selection,positions?,numbers? (cinco milhares),roundId?}`; um `roundId` deve identificar extração tradicional publicada. Sem débito.
- `GET /admin/modes`: configurações por modalidade.
- `POST /admin/modes`: `{mode,enabled,positions,passeSecond}`; autenticação ADMIN, validação e auditoria. Válido para novas extrações.
