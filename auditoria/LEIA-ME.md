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
| `f_assistente.py` (+ `f_assistente_runner.js`) | Assistente: gera ~4.700 perguntas com recorte conhecido (UF, região, ano, tipologia, município, modalidade, visão), roda o assistente no navegador e confere cada número citado contra um cálculo independente em Python. |
| `g_assistente_ui.js` | Assistente pela interface: abre a janela, pergunta, clica nos botões e confere se a tela (cartões, lista de empreendimentos, Propostas desta seleção) mostra os números da resposta. |

Como rodar:

```
python3 a_etl_vs_planilha.py <planilha.xlsx> dados.json
node b_dump_js.js <pasta do painel> /tmp/js_dump.json
python3 c_comparar.py dados.json /tmp/js_dump.json
node d_dom.js <pasta do painel>
node e_csv_radar.js <pasta do painel>
python3 f_assistente.py <pasta do painel>
node g_assistente_ui.js <pasta do painel>
```

Divergência esperada e inofensiva: `a_etl_vs_planilha.py` acusa 3 diferenças de
texto em empreendimentos que contêm espaço não separável na planilha — o ETL o
converte em espaço comum.

## Assistente do painel

O assistente (`assets/js/componentes/assistente.js`) roda inteiro no navegador,
sem IA externa. Os números vêm de `Dados.calcular`, `Dados.totalizar` e
`Dados.agregarEntregas`; as explicações vêm da lista `BASE_CONCEITOS` no próprio
arquivo. Para ensinar um tema novo, acrescente um item a essa lista (`id`,
`titulo`, `chaves` = frases sem acento que evocam o tema, `html`, e opcionalmente
`acoes` e `sugestoes`). Rode `f_assistente.py` e `g_assistente_ui.js` depois de
qualquer mudança nele ou nas regras de cálculo.
