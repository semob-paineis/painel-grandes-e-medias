# Painel de Monitoramento — Grandes e Médias Cidades (Novo PAC)

Ministério das Cidades · Secretaria Nacional de Mobilidade (SEMOB)
Versão 1.0 — protótipo para validação interna.

Painel de acompanhamento das propostas de infraestrutura de transporte público
do subeixo **Mobilidade Grandes e Médias Cidades** do Novo PAC. Diferente do
Painel REFROTA, cujo foco era a frota de ônibus, aqui a pergunta central é
**quanto de metrô, VLT, trem, BRT e corredor cada real contratado entrega**.

---

## 1. Estrutura do projeto

```
painel-gmc/
├── index.html                   Painel principal
├── propostas.html               Radar de Propostas (listagem detalhada)
│
├── dados.json                   Base do painel      (gerada)
├── propostas.json               Base do radar       (gerada)
│
├── gerar_dados.py               Excel → dados.json
├── gerar_propostas.py           Excel → propostas.json
│
├── README.md
├── NOTAS-DE-VERSAO.md           Decisões que precisam de validação
│
├── dados/
│   └── teste_grandes_e_medias.xlsx      Planilha de origem
│
└── assets/
    ├── css/
    │   ├── tokens.css           Cores, tipografia, espaçamento, tema escuro
    │   └── painel.css           Layout e componentes
    ├── js/
    │   ├── nucleo/
    │   │   ├── formato.js       Formatação (R$, km, %), paleta, utilitários
    │   │   ├── dados.js         Carregamento, estado dos filtros, agregações
    │   │   └── dica.js          Sistema único de tooltip
    │   ├── componentes/
    │   │   ├── indicadores.js   Cartões do topo
    │   │   ├── funil.js         Funil de conversão
    │   │   ├── infraestrutura.js  Entrega por modo (componente central)
    │   │   ├── graficos.js      Camada sobre o Chart.js
    │   │   ├── mapa.js          Coroplético por UF
    │   │   ├── tabelas.js       Tabelas genéricas + exportação CSV
    │   │   └── exportar.js      PNG, PDF e CSV
    │   ├── vendor/              Bibliotecas de terceiros (cópia local)
    │   ├── geo-uf.js            Malha das UFs (ativo de dados)
    │   ├── dados-embutido.js    Espelho de dados.json      (gerado)
    │   ├── propostas-embutido.js  Espelho de propostas.json (gerado)
    │   ├── painel.js            Orquestração do index.html
    │   └── propostas.js         Orquestração do propostas.html
    └── img/
```

**Princípio de organização.** Dados, estado, cálculo, renderização e interação
são camadas separadas. Nenhum componente lê a planilha ou a base diretamente:
todos recebem o resultado de `PG.Dados.calcular()`. Isso é o que permite
acrescentar um filtro novo e vê-lo se propagar a todos os componentes sem
alterar componente nenhum.

---

## 2. Como executar

### Opção A — duplo clique (mais simples)

Abra `index.html` no navegador. Funciona porque os scripts gravam uma cópia da
base em `assets/js/*-embutido.js`, contornando a restrição de `fetch()` em
`file://`.

### Opção B — servidor local (recomendado)

```bash
cd painel-gmc
python -m http.server 8000
```

Depois acesse `http://localhost:8000`. Nessa modalidade o painel lê
`dados.json` diretamente, sempre a versão mais recente.

Não há dependência de internet: as bibliotecas de gráficos e exportação estão
em `assets/js/vendor/`.

---

## 3. Como atualizar os dados

```bash
pip install openpyxl

python gerar_dados.py
python gerar_propostas.py
```

Os dois scripts leem `dados/teste_grandes_e_medias.xlsx` por padrão. Para
apontar para outro arquivo:

```bash
python gerar_dados.py --planilha dados/Dados_GMC_2026.xlsx
python gerar_propostas.py --planilha dados/Dados_GMC_2026.xlsx
```

Cada execução imprime um bloco de conferência com os totais de fechamento, para
comparação direta com a aba "Dados para Painel", e lista os registros com
inconsistências. `gerar_propostas.py` ainda compara a listagem com a versão
anterior e informa o que entrou, o que saiu e o que mudou de situação — apoio à
conferência semanal.

---

## 4. Da planilha ao painel

```
Excel (aba BASEDEDADOS)          Excel (aba Lista de Projetos)
        │                                    │
   gerar_dados.py                   gerar_propostas.py
        │                                    │
   dados.json  +  dados-embutido.js    propostas.json  +  propostas-embutido.js
        │                                    │
    index.html                        propostas.html
```

**Duas abas, dois papéis.** `BASEDEDADOS` é a base analítica — uma linha por
proposta, com modo de transporte, extensão e quantidades. É ela que alimenta os
indicadores. `Lista de Projetos` é a listagem curada pela equipe, revisada para
divulgação, e alimenta o Radar. O painel mede; o radar lista.

### Onde mexer quando a planilha mudar

Em cada script existe um único bloco a ajustar, no topo do arquivo:

| Script | Bloco | O que controla |
|---|---|---|
| `gerar_dados.py` | `1. MAPEAMENTO DA PLANILHA` | Nome da aba, linha de cabeçalho, nome de cada coluna |
| `gerar_dados.py` | `2. REGRAS DE NEGÓCIO` | Escopo do consolidado, situação → etapa do funil |
| `gerar_dados.py` | `3. TEXTOS INSTITUCIONAIS` | Título, subtítulo, resumo executivo, rodapé |
| `gerar_propostas.py` | `1. MAPEAMENTO DA PLANILHA` | Colunas lidas e colunas exibidas na tabela |
| `gerar_propostas.py` | `2. REGRAS DE NEGÓCIO` | Agrupamento de situações e legenda |

Os títulos de coluna são comparados sem acento, sem caixa e sem espaços extras
— pequenas variações de digitação na planilha não quebram a leitura. Coluna não
encontrada gera aviso; coluna obrigatória ausente interrompe com mensagem clara.

**Para incluir uma coluna nova no Radar**, basta acrescentá-la em `COLUNAS` e um
item em `COLUNAS_TABELA` de `gerar_propostas.py`. Cabeçalho, ordenação, filtro
por coluna, busca e exportação passam a considerá-la automaticamente, sem
alteração de HTML.

---

## 5. Dados fictícios (mock)

O projeto tem dois mecanismos de mock, ambos claramente identificados:

1. **`python gerar_dados.py --mock`** — gera `dados.json` com base sintética,
   marcada com `"mock": true`. O painel exibe uma tarja de aviso no topo.
2. **`Dados.baseDemonstracao()`** em `assets/js/nucleo/dados.js` — base mínima
   que só entra em cena se `dados.json` e `dados-embutido.js` falharem, para
   evitar tela em branco.

Nenhum dos dois se mistura com a lógica de produção. **Na versão atual o painel
está carregado com os dados reais da planilha**, não com mock.

---

## 6. Componentes

| Componente | Arquivo | Observações |
|---|---|---|
| Cartões de indicador | `indicadores.js` | Definidos em uma lista; incluir indicador é acrescentar um item |
| Entrega por modo | `infraestrutura.js` | Alterna extensão / unidades / investimento; clique filtra o painel |
| Funil | `funil.js` | Largura proporcional ao quantitativo, com piso de 6% |
| Gráficos | `graficos.js` | Chart.js; atualiza em vez de recriar; avisa se a biblioteca faltar |
| Mapa | `mapa.js` | SVG próprio, sem biblioteca de mapas |
| Tabelas | `tabelas.js` | Uma função genérica dirigida por definição de colunas |
| Tooltip | `nucleo/dica.js` | Um só elemento para todos os componentes, com suporte a teclado |
| Exportação | `exportar.js` | PNG, PDF e CSV do recorte filtrado |

### Filtros

Modalidade (cenário), visão (contratado / selecionado), ano da portaria, região
e modo de transporte. Todos recalculam todos os componentes. O filtro de modo
também é acionado clicando em uma linha do bloco de infraestrutura.

### Tema claro e escuro

Estruturado em variáveis CSS (`tokens.css`), alternável pelo botão do
cabeçalho, com respeito à preferência do sistema e memória entre sessões.

---

## 7. Dependências

**Python** — apenas `openpyxl`:

```bash
pip install openpyxl
```

**Navegador** — nenhuma dependência externa em tempo de execução. As
bibliotecas estão em `assets/js/vendor/` (Chart.js 4.4.1, html2canvas 1.4.1,
jsPDF 2.5.1, todas MIT). Para atualizar versões, ver
`assets/js/vendor/LEIA-ME.txt`.

---

## 8. Conferência da versão 1.0

Os totais produzidos pelo pipeline foram comparados com a aba "Dados para
Painel" da planilha e fecham exatamente:

| Indicador | Painel | Planilha |
|---|---|---|
| Propostas contratadas | 118 | 118 |
| Valor contratado | R$ 18.064.550.706,01 | idem |
| Propostas selecionadas | 139 | 139 |
| Valor selecionado | R$ 34.329.680.981,89 | idem |

Também conferem, linha a linha: distribuição por região, por ano de portaria,
por fonte de recursos, por agente financeiro, por UF e a tabela de
subcategorias por modo de transporte.

As decisões metodológicas que sustentam esses números estão em
`NOTAS-DE-VERSAO.md` e precisam de validação antes de qualquer divulgação.
