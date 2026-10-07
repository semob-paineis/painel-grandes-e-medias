# Auditoria de rastreabilidade

Scripts que conferem, de ponta a ponta, se os números do painel batem com a
planilha de origem. Rodar depois de cada atualização da base.

Requisitos: Python 3 com openpyxl; Node com playwright (Chromium).

| Script | O que verifica |
|---|---|
| `a_etl_vs_planilha.py` | Planilha → `dados.json`: campo a campo de cada registro, entregas de cada empreendimento, tipologia e cobertura. |
| `b_dump_js.js` | Roda o painel no navegador e despeja o cálculo de todas as combinações de filtros. |
| `c_comparar.py` | Compara esse despejo com um cálculo independente: totais, funil, dimensões, entregas e migrados. |
| `d_dom.js` | Confere o que está desenhado na tela (cartões, abas, funil, tabelas) e a soma de cada lista de detalhe. |
| `e_csv_radar.js` | CSV exportado (colunas e somas) e integridade do Radar de Propostas. |
| `f_assistente.py` (+ `f_assistente_runner.js`) | Assistente: gera ~9.000 perguntas com resposta conhecida — valores, contagens, entregas, funil, rankings (por proposta, empreendimento, proponente, município, UF, região, ano, tipologia, situação, estágio, modalidade, fonte e agente, por valor, por nº de propostas e por entrega) e a ficha de cada proposta da base, pelo número, pelo ID Governa e pela linha. Confere cada número contra um cálculo independente em Python. |
| `h_responsivo.js` | Overflow horizontal e responsividade: em 10 larguras (320 a 1600), nos dois temas, com os blocos e menus abertos, mede se a página rola para o lado e lista todo elemento que ultrapassa a tela ou recorta conteúdo. |
| `i_unidade_bi.js` | Unidade dos valores: varre o texto visível do painel, do Radar, das dicas e das respostas do assistente atrás de qualquer valor em R$ que não esteja em bilhões. |
| `g_assistente_ui.js` | Assistente pela interface: abre a janela, pergunta, clica nos botões e confere se a tela (cartões, lista de empreendimentos, Propostas desta seleção) mostra os números da resposta — inclusive se o ranking de propostas é a mesma lista, na mesma ordem, da tabela “Propostas desta seleção”. |

Como rodar:

```
python3 a_etl_vs_planilha.py <planilha.xlsx> dados.json
node b_dump_js.js <pasta do painel> /tmp/js_dump.json
python3 c_comparar.py dados.json /tmp/js_dump.json
node d_dom.js <pasta do painel>
node e_csv_radar.js <pasta do painel>
python3 f_assistente.py <pasta do painel>
node g_assistente_ui.js <pasta do painel>
node h_responsivo.js <pasta do painel> index.html,propostas.html
node i_unidade_bi.js <pasta do painel>
```

Divergência esperada e inofensiva: `a_etl_vs_planilha.py` acusa 3 diferenças de
texto em empreendimentos que contêm espaço não separável na planilha — o ETL o
converte em espaço comum.

## Assistente do painel

O assistente (`assets/js/componentes/assistente.js`) roda inteiro no navegador,
sem IA externa. Os números vêm de `Dados.calcular`, `Dados.totalizar`,
`Dados.agregarEntregas` e, nas listas de propostas, de
`PG.Painel.agregarPropostasSelecao` — a mesma função que monta a tabela
“Propostas desta seleção”, para a lista do assistente e a da tela nunca
divergirem. As explicações vêm da lista `BASE_CONCEITOS` no próprio arquivo.

Para ensinar um tema novo, acrescente um item a `BASE_CONCEITOS` (`id`, `titulo`,
`chaves` = frases sem acento que evocam o tema, `html`, e opcionalmente `acoes` e
`sugestoes`). Para uma dimensão nova de ranking, acrescente uma entrada em
`DIMENSOES`, `NOME_DIMENSAO` e `CHAVE_DIMENSAO` — e a mesma chave em `CHAVE_DIM`,
no `f_assistente.py`, para a auditoria conferir.

A ficha de um empreendimento (`respostaFicha`) é uma consulta à base inteira,
independente dos filtros da tela: localiza o registro pelo número da proposta,
pelo contrato, pelo ID Governa, pela linha da base ou pelo nome, e diz inclusive
quando a proposta não entra nos números do painel.

Rode `f_assistente.py` e `g_assistente_ui.js` depois de qualquer mudança nele ou
nas regras de cálculo.

## Responsividade

`h_responsivo.js` falha se a página inteira rolar para o lado ou se algum
elemento recortar conteúdo. A rolagem horizontal é permitida só dentro das
caixas listadas em `ROLAVEIS_OK` (tabelas, abas segmentadas, gráficos, mapa e
o histórico do assistente) — é a diferença entre rolar uma tabela larga e
rolar a página inteira.

Variáveis de ambiente: `LARGURAS` e `TEMAS` restringem a varredura
(`LARGURAS=320,375 TEMAS=claro node h_responsivo.js ...`).

A causa mais comum de estouro é um item flex sem `min-width: 0`: por padrão
ele não encolhe abaixo da largura do próprio conteúdo e passa a mandar na
largura da página. Ao criar um bloco novo com `display: flex`, declare
`min-width: 0` nos filhos que recebem texto longo.
