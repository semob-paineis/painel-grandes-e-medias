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

Como rodar:

```
python3 a_etl_vs_planilha.py <planilha.xlsx> dados.json
node b_dump_js.js <pasta do painel> /tmp/js_dump.json
python3 c_comparar.py dados.json /tmp/js_dump.json
node d_dom.js <pasta do painel>
node e_csv_radar.js <pasta do painel>
```

Divergência esperada e inofensiva: `a_etl_vs_planilha.py` acusa 3 diferenças de
texto em empreendimentos que contêm espaço não separável na planilha — o ETL o
converte em espaço comum.
