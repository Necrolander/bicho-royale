# Regras da simulação

Cada modalidade usa um critério didático específico. Não são regras oficiais ou promessa de equivalência com qualquer tradição regional. A configuração da rodada é congelada na criação, registrada no banco e exposta na API.

## Modalidades

| Modalidade       |              Seleções | Critério                                                  |
| ---------------- | --------------------: | --------------------------------------------------------- |
| Grupo            |               1 grupo | Encontrado em qualquer posição configurada                |
| Dezena           | 1 número de 2 dígitos | Final de qualquer prêmio analisado                        |
| Centena          | 1 número de 3 dígitos | Últimos três dígitos de qualquer prêmio                   |
| Milhar           | 1 número de 4 dígitos | Igualdade exata de quatro dígitos                         |
| Milhar invertida |              1 milhar | Qualquer permutação, preservando repetições               |
| Grupo na cabeça  |               1 grupo | Exclusivamente primeiro prêmio                            |
| Grupo cercado    |               1 grupo | Qualquer posição configurada; um acerto booleano          |
| Duque de grupo   |    2 grupos distintos | Presença em posições distintas, sem ordem                 |
| Duque de dezena  |   2 dezenas distintas | Presença em posições distintas, sem ordem                 |
| Terno de grupo   |    3 grupos distintos | Presença em posições distintas, sem ordem                 |
| Terno de dezena  |   3 dezenas distintas | Presença em posições distintas, sem ordem                 |
| Passe            |    2 grupos distintos | Primeiro grupo no prêmio 1, segundo no prêmio configurado |
| Passe invertido  |    2 grupos distintos | Mesmas posições do passe, em qualquer ordem               |

Por padrão, analisam-se cinco prêmios; passe usa 1º e 2º. O administrador pode ajustar posições entre 1 e 5 e a segunda posição do passe entre 2 e 5, apenas para novas rodadas. Duques e ternos exigem elementos diferentes e não podem usar um mesmo prêmio para satisfazer duas seleções.

## Mapeamento

`dezena = Number(milhar) % 100`. Se a dezena for 0, grupo 25; caso contrário, `ceil(dezena / 4)`. Exemplos: `4837 → Coelho`, `7264 → Leão`, `1052 → Galo`, `8831 → Camelo`, `2900 → Vaca`. O exemplo original associava 1052 a Gato, mas a tabela fornecida define 49–52 como Galo e 53–56 como Gato.

Zeros são preservados para comparar números: 0037 não é igual a 4837. Inversão de 1123 aceita 3211, mas rejeita 3221. Elementos repetidos são rejeitados antes de qualquer débito.

Na roleta, há um único grupo uniforme entre 1 e 25; somente Grupo, Cabeça e Cercado são aceitos. Dezenas, centenas, milhares e combinações pertencem às extrações de cinco milhares independentes, de 0000 a 9999. Milhares podem repetir numa extração: os prêmios são independentes.

## Pontos

Saldo inicial: 1.000. Participações: 1–100 pontos inteiros. O débito gera um lançamento e um comprovante na mesma transação. Não há multiplicadores, pagamentos ou crédito por vitória; acertos são métricas didáticas. Restauração para 1.000 pontos disponível uma vez por 24 horas. Pontos não são transferíveis e não têm valor econômico.

## Verificação pública

Compromisso: `SHA256("bicho-royale:v1:" + roundId + ":" + seed)`.

Blocos: `SHA256("bicho-royale:draw:v1:" + roundId + ":" + seed + ":" + counter)`, com counter iniciado em 0. Cada bloco produz oito inteiros uint32 big endian. Para domínio de tamanho M, descartar valores a partir de `floor(2^32/M)*M`; os restantes produzem `value % M`. Roleta: M=25, somar 1. Extração: M=10000, cinco valores, completar com zeros à esquerda.

O compromisso aparece antes da abertura; a semente só é devolvida após publicação. `scripts/verify.ts` permite verificação independente, sem confiar na resposta de `/api/verify`. A auditoria é encadeada em SHA-256 e os resultados publicados têm triggers de imutabilidade. Quem possui o arquivo físico do banco pode remover triggers e reescrever a cadeia; para evidência externa, guarde compromissos e cabeçalhos da auditoria fora do servidor.
