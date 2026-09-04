/* ============================================================================
   COMPONENTE / TABELAS — tabelas de apoio do painel
   ----------------------------------------------------------------------------
   Uma função genérica desenha qualquer tabela a partir de uma definição de
   colunas. Acrescentar coluna, mudar formatação ou incluir uma tabela nova é
   descrever colunas — não escrever HTML.

   Definição de coluna:
     titulo    cabeçalho
     obter     (linha) -> conteúdo formatado
     numerica  alinha à direita e usa numerais tabulares
     total     (linhas) -> conteúdo do rodapé (opcional)
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta, Dica = PG.Dica;

  var Tabelas = {

    /**
     * @param {Element} container
     * @param {Array}   linhas
     * @param {Array}   colunas
     * @param {Object}  opcoes {marcaCor: (linha) -> cor, dica: (linha) -> conteúdo}
     */
    desenhar: function (container, linhas, colunas, opcoes) {
      if (!container) return;
      opcoes = opcoes || {};
      container.innerHTML = '';

      if (!linhas.length) {
        container.appendChild(Util.el('div', {
          'class': 'sem-resultado',
          html: '<strong>Sem dados no recorte atual</strong>' +
                'Ajuste os filtros para ver resultados.'
        }));
        return;
      }

      var thead = Util.el('thead', {}, [
        Util.el('tr', {}, colunas.map(function (c) {
          return Util.el('th', { 'class': c.numerica ? 'n' : '', texto: c.titulo });
        }))
      ]);

      var tbody = Util.el('tbody', {}, linhas.map(function (linha) {
        var tr = Util.el('tr', {}, colunas.map(function (c, i) {
          var conteudo = c.obter(linha);
          var celula = Util.el('td', { 'class': c.numerica ? 'n' : '' });

          // A primeira coluna pode carregar a marca de cor da categoria.
          if (i === 0 && opcoes.marcaCor) {
            celula.appendChild(Util.el('span', {
              'class': 'legenda__marca',
              estilo: {
                background: opcoes.marcaCor(linha),
                display: 'inline-block', marginRight: '6px',
                verticalAlign: 'baseline'
              }
            }));
          }
          celula.appendChild(document.createTextNode(conteudo));
          return celula;
        }));

        if (opcoes.dica) {
          Dica.ligar(tr, function () { return opcoes.dica(linha); });
        }
        return tr;
      }));

      var partes = [thead, tbody];

      var temTotal = colunas.some(function (c) { return c.total; });
      if (temTotal) {
        partes.push(Util.el('tfoot', {}, [
          Util.el('tr', {}, colunas.map(function (c) {
            return Util.el('td', {
              'class': c.numerica ? 'n' : '',
              texto: c.total ? c.total(linhas) : ''
            });
          }))
        ]));
      }

      var tabela = Util.el('table', { 'class': 'tabela' }, partes);
      container.appendChild(Util.el('div', { 'class': 'tabela-envolucro' }, [tabela]));
    },


    /* --- Definições prontas usadas pelo painel --------------------------- */

    colunasDimensao: function (rotuloDimensao, rotuloValor) {
      return [
        { titulo: rotuloDimensao, obter: function (l) { return l.chave; },
          total: function () { return 'Total'; } },
        { titulo: 'Propostas', numerica: true,
          obter: function (l) { return F.inteiro(l.propostas); },
          total: function (ls) {
            return F.inteiro(Util.soma(ls, function (l) { return l.propostas; }));
          } },
        { titulo: rotuloValor, numerica: true,
          obter: function (l) { return F.moedaCurta(l.valor); },
          total: function (ls) {
            return F.moedaCurta(Util.soma(ls, function (l) { return l.valor; }));
          } },
        { titulo: 'Part.', numerica: true,
          obter: function (l) { return F.percentual(l.participacao, 1); },
          total: function () { return '100,0%'; } }
      ];
    },

    dicaDimensao: function (rotulo, filtros) {
      return function (linha) {
        var itens = [
          ['Propostas', F.inteiro(linha.propostas)],
          ['Investimento', F.moeda(linha.valor)],
          ['Participação', F.percentual(linha.participacao, 1)]
        ];
        if (linha.km > 0) itens.push(['Extensão', F.km(linha.km)]);
        if (linha.unidades > 0) itens.push(['Unidades', F.inteiro(linha.unidades) + ' un.']);
        if (linha.propostas) {
          itens.push(['Valor médio', F.moedaCurta(linha.valor / linha.propostas)]);
        }
        return {
          titulo: rotulo + ': ' + linha.chave,
          linhas: itens,
          nota: 'Visão ' + (filtros.visao === 'selecionado' ? 'de propostas selecionadas'
                                                           : 'de contratos assinados') + '.'
        };
      };
    },


    /* --- Exportação em CSV ------------------------------------------------
       Separador ponto e vírgula e BOM: o arquivo abre corretamente no Excel
       em português sem passo de importação.                                */

    exportarCSV: function (nomeArquivo, cabecalhos, linhas) {
      var esc = function (v) {
        var s = String(v == null ? '' : v).replace(/"/g, '""');
        return '"' + s + '"';
      };
      var conteudo = '\uFEFF' +
        cabecalhos.map(esc).join(';') + '\r\n' +
        linhas.map(function (l) { return l.map(esc).join(';'); }).join('\r\n');

      Util.baixarArquivo(conteudo, nomeArquivo, 'text/csv;charset=utf-8');
    }
  };

  PG.Tabelas = Tabelas;

})(window.PG);
