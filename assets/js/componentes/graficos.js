/* ============================================================================
   COMPONENTE / GRÁFICOS — camada fina sobre o Chart.js
   ----------------------------------------------------------------------------
   Objetivos desta camada:
     · manter um registro dos gráficos criados, para atualizar em vez de
       recriar a cada mudança de filtro (evita piscar e vazamento de memória);
     · centralizar tema, grade, fontes e tooltip, de modo que trocar a
       biblioteca de gráficos no futuro afete apenas este arquivo;
     · degradar com elegância se o Chart.js não carregar (rede indisponível).

   Uso:
       PG.Graficos.barras('idCanvas', { rotulos, valores, cores, eixoMoeda });
       PG.Graficos.rosca('idCanvas', { rotulos, valores, cores });
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Paleta = PG.Paleta, Util = PG.Util;
  var registro = {};

  function disponivel() { return typeof window.Chart !== 'undefined'; }

  function avisarIndisponivel(canvas) {
    var pai = canvas.parentElement;
    if (pai.querySelector('.sem-resultado')) return;
    pai.appendChild(Util.el('div', {
      'class': 'sem-resultado',
      html: '<strong>Gráfico indisponível</strong>' +
            'A biblioteca de gráficos não foi carregada. Os mesmos números ' +
            'estão nas tabelas ao lado.'
    }));
  }

  /* --- Opções comuns ------------------------------------------------------ */

  function opcoesBase(config) {
    var corTexto = Paleta.variavel('--texto-suave');
    var corGrade = Paleta.variavel('--grafico-grade');

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: Paleta.variavel('--gov-marinho'),
          padding: 12,
          cornerRadius: 8,
          titleFont: { size: 13, weight: '700' },
          bodyFont: { size: 12 },
          displayColors: true,
          boxWidth: 10,
          boxHeight: 10,
          callbacks: {
            label: function (ctx) {
              var v = ctx.parsed.y !== undefined && ctx.parsed.y !== null
                ? ctx.parsed.y : ctx.parsed;
              return '  ' + (config.rotuloSerie || 'Valor') + ': ' +
                     (config.eixoMoeda ? F.moeda(v) : F.inteiro(v));
            },
            afterLabel: config.aposRotulo || undefined
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: corGrade },
          ticks: { color: corTexto, font: { size: 11 }, maxRotation: 0,
                   autoSkip: false, callback: function (v, i) {
                     var r = this.getLabelForValue(v);
                     return r && r.length > 16 ? r.slice(0, 15) + '…' : r;
                   } }
        },
        y: {
          beginAtZero: true,
          grid: { color: corGrade, drawBorder: false },
          border: { display: false },
          ticks: {
            color: corTexto, font: { size: 11 },
            callback: function (v) {
              return config.eixoMoeda ? F.numeroCurto(v) : F.inteiro(v);
            }
          }
        }
      }
    };
  }

  /** Cria ou atualiza o gráfico associado ao canvas. */
  function desenhar(id, tipo, dados, opcoes) {
    var canvas = document.getElementById(id);
    if (!canvas) return null;
    if (!disponivel()) { avisarIndisponivel(canvas); return null; }

    if (registro[id]) {
      registro[id].data = dados;
      registro[id].options = opcoes;
      registro[id].update();
      return registro[id];
    }
    registro[id] = new window.Chart(canvas.getContext('2d'), {
      type: tipo, data: dados, options: opcoes
    });
    return registro[id];
  }


  var Graficos = {

    /**
     * Barras verticais.
     * @param {Object} cfg {rotulos, valores, cores, eixoMoeda, rotuloSerie,
     *                      horizontal, valoresApoio}
     */
    barras: function (id, cfg) {
      var opcoes = opcoesBase(cfg);
      if (cfg.horizontal) {
        opcoes.indexAxis = 'y';
        var x = opcoes.scales.x, y = opcoes.scales.y;
        opcoes.scales.x = {
          beginAtZero: true,
          grid: { color: y.grid.color, drawBorder: false },
          border: { display: false },
          ticks: { color: x.ticks.color, font: { size: 11 },
                   callback: function (v) {
                     return cfg.eixoMoeda ? F.numeroCurto(v) : F.inteiro(v);
                   } }
        };
        opcoes.scales.y = {
          grid: { display: false },
          border: { display: false },
          ticks: { color: x.ticks.color, font: { size: 11 } }
        };
        opcoes.plugins.tooltip.callbacks.label = function (ctx) {
          var v = ctx.parsed.x;
          var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
          var pct = total ? F.percentual(v / total, 1) : null;
          return '  ' + (cfg.rotuloSerie || 'Valor') + ': ' +
                 (cfg.eixoMoeda ? F.moeda(v) : F.inteiro(v)) +
                 (pct ? '  (' + pct + ')' : '');
        };
      }

      return desenhar(id, 'bar', {
        labels: cfg.rotulos,
        datasets: [{
          label: cfg.rotuloSerie || 'Valor',
          data: cfg.valores,
          backgroundColor: cfg.cores ||
            cfg.valores.map(function (_, i) { return Paleta.sequencia(i); }),
          borderRadius: 4,
          borderSkipped: false,
          maxBarThickness: cfg.horizontal ? 22 : 54
        }]
      }, opcoes);
    },

    /** Barras + linha: quantidade de propostas sobre o valor investido. */
    barrasComLinha: function (id, cfg) {
      var opcoes = opcoesBase(cfg);
      opcoes.scales.y1 = {
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        border: { display: false },
        ticks: { color: Paleta.variavel('--texto-suave'), font: { size: 11 },
                 precision: 0 }
      };
      opcoes.plugins.tooltip.callbacks.label = function (ctx) {
        if (ctx.datasetIndex === 1) {
          return '  Propostas: ' + F.inteiro(ctx.parsed.y);
        }
        return '  Investimento: ' + F.moeda(ctx.parsed.y);
      };

      return desenhar(id, 'bar', {
        labels: cfg.rotulos,
        datasets: [
          {
            label: 'Investimento', data: cfg.valores, order: 2,
            backgroundColor: Paleta.variavel('--gov-azul'),
            borderRadius: 4, borderSkipped: false, maxBarThickness: 54
          },
          {
            label: 'Propostas', data: cfg.valoresApoio, type: 'line',
            yAxisID: 'y1', order: 1,
            borderColor: Paleta.variavel('--gov-laranja'),
            backgroundColor: Paleta.variavel('--gov-laranja'),
            borderWidth: 2, tension: .3,
            pointRadius: 3, pointHoverRadius: 5
          }
        ]
      }, opcoes);
    },

    /** Rosca — composição percentual. */
    rosca: function (id, cfg) {
      var total = cfg.valores.reduce(function (a, b) { return a + b; }, 0);
      var opcoes = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 500 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: Paleta.variavel('--gov-marinho'),
            padding: 12, cornerRadius: 8,
            titleFont: { size: 13, weight: '700' },
            bodyFont: { size: 12 },
            callbacks: {
              label: function (ctx) {
                var v = ctx.parsed;
                return '  ' + F.moeda(v) + '  ·  ' +
                       F.percentual(total ? v / total : 0, 1);
              }
            }
          }
        }
      };

      return desenhar(id, 'doughnut', {
        labels: cfg.rotulos,
        datasets: [{
          data: cfg.valores,
          backgroundColor: cfg.cores ||
            cfg.valores.map(function (_, i) { return Paleta.sequencia(i); }),
          borderColor: Paleta.variavel('--fundo-superficie'),
          borderWidth: 2,
          hoverOffset: 6
        }]
      }, opcoes);
    },

    /** Monta a legenda em HTML — mais legível que a legenda nativa. */
    legenda: function (container, itens) {
      if (!container) return;
      container.innerHTML = '';
      itens.forEach(function (item) {
        container.appendChild(Util.el('div', { 'class': 'legenda__item' }, [
          Util.el('span', { 'class': 'legenda__marca',
                            estilo: { background: item.cor } }),
          Util.el('span', { html: Util.escapar(item.rotulo) + ' <strong>' +
                                   Util.escapar(item.valor) + '</strong>' })
        ]));
      });
    },

    /** Redesenha todos os gráficos — usado ao alternar o tema. */
    atualizarTema: function () {
      Object.keys(registro).forEach(function (id) {
        registro[id].destroy();
        delete registro[id];
      });
    },

    registro: registro
  };

  PG.Graficos = Graficos;

})(window.PG);
