/* ============================================================================
   COMPONENTE / INFRAESTRUTURA — o que o investimento entrega, por modo
   ----------------------------------------------------------------------------
   Este é o componente que responde à pergunta central do painel: quanto de
   metrô, VLT, trem, BRT e corredor cada real contratado produz.

   Cada linha traz o modo, uma barra proporcional, a métrica escolhida e o
   investimento. A métrica é alternável:
       km        extensão de via
       unidades  material rodante, terminais, abrigos, sistemas
       valor     investimento

   Clicar em uma linha aplica o filtro global de modo — o painel inteiro passa
   a mostrar apenas aquele modo. Clicar de novo desfaz.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta, Dica = PG.Dica;

  var METRICAS = {
    km: {
      rotulo: 'Extensão',
      obter: function (linha) { return linha.km; },
      formatar: function (v) { return F.decimal(v, 1); },
      sufixo: 'km'
    },
    unidades: {
      rotulo: 'Unidades',
      obter: function (linha) { return linha.unidades; },
      formatar: function (v) { return F.inteiro(v); },
      sufixo: 'un.'
    },
    valor: {
      rotulo: 'Investimento',
      obter: function (linha) { return linha.valor; },
      formatar: function (v) { return F.numeroCurto(v); },
      sufixo: ''
    }
  };

  var Infraestrutura = {

    renderizar: function (container, resultado, filtros) {
      if (!container) return;
      container.innerHTML = '';

      var metrica = METRICAS[filtros.metricaInfra] || METRICAS.km;

      // Só entram modos com valor na métrica escolhida — evita lista com zeros.
      var linhas = resultado.modos.filter(function (l) {
        return metrica.obter(l) > 0;
      });
      linhas = Util.ordenarPor(linhas, metrica.obter, true);

      if (!linhas.length) {
        container.appendChild(Util.el('div', {
          'class': 'sem-resultado',
          html: '<strong>Nenhum modo com ' + metrica.rotulo.toLowerCase() +
                ' registrada</strong>Ajuste os filtros ou troque a métrica.'
        }));
        return;
      }

      var maior = metrica.obter(linhas[0]) || 1;

      container.appendChild(Util.el('div', { 'class': 'infra__cabecalho' }, [
        Util.el('span', { texto: 'Modo' }),
        Util.el('span', { texto: 'Distribuição' }),
        Util.el('span', { texto: metrica.rotulo }),
        Util.el('span', { texto: 'Investimento' })
      ]));

      linhas.forEach(function (linha) {
        container.appendChild(
          desenharLinha(linha, maior, metrica, resultado, filtros)
        );
      });

      requestAnimationFrame(function () {
        Array.prototype.forEach.call(
          container.querySelectorAll('.infra__barra'),
          function (b) { b.style.width = b.dataset.largura; }
        );
      });
    },

    metricas: METRICAS
  };


  function desenharLinha(linha, maior, metrica, resultado, filtros) {
    var cor = Paleta.modo(linha.chave);
    var largura = Math.max(1.5, (metrica.obter(linha) / maior) * 100);
    var ativo = filtros.modo === linha.chave;

    var el = Util.el('div', {
      'class': 'infra__linha' + (ativo ? ' esta-ativo' : ''),
      role: 'button',
      'aria-pressed': ativo ? 'true' : 'false',
      title: 'Filtrar o painel por ' + linha.chave
    }, [
      Util.el('div', { 'class': 'infra__modo' }, [
        Util.el('span', { 'class': 'infra__marca', estilo: { background: cor } }),
        Util.el('span', { 'class': 'infra__nome', texto: linha.chave })
      ]),
      Util.el('div', { 'class': 'infra__trilho' }, [
        Util.el('div', {
          'class': 'infra__barra',
          'data-largura': largura.toFixed(1) + '%',
          estilo: { background: cor }
        })
      ]),
      Util.el('div', { 'class': 'infra__metrica' }, [
        document.createTextNode(metrica.formatar(metrica.obter(linha))),
        metrica.sufixo ? Util.el('span', { texto: ' ' + metrica.sufixo }) : null
      ]),
      Util.el('div', { 'class': 'infra__valor',
                       texto: F.moedaCurta(linha.valor) })
    ]);

    // Filtro cruzado: a linha funciona como controle do filtro global de modo.
    function alternar() {
      PG.Estado.definir('modo', ativo ? 'todos' : linha.chave);
    }
    el.addEventListener('click', alternar);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
    });

    Dica.ligar(el, function () { return montarDica(linha, resultado, filtros); });
    return el;
  }


  function montarDica(linha, resultado, filtros) {
    var visao = filtros.visao === 'selecionado' ? 'selecionado' : 'contratado';

    var linhas = [
      ['Propostas', F.inteiro(linha.propostas)],
      ['Investimento ' + visao, F.moeda(linha.valor)],
      ['Participação', F.percentual(linha.participacao, 1)]
    ];
    if (linha.km > 0) linhas.push(['Extensão', F.km(linha.km)]);
    if (linha.unidades > 0) linhas.push(['Unidades', F.inteiro(linha.unidades) + ' un.']);
    if (linha.km > 0 && linha.valor > 0) {
      linhas.push(['Custo por km', F.moedaCurta(linha.valor / linha.km)]);
    }

    // Onde esse modo está concentrado — contexto útil na conversa com o gestor.
    var ufs = Util.agrupar(
      resultado.universo.filter(function (r) { return r.modo === linha.chave; }),
      function (r) { return r.uf; },
      function (acc, r) { acc.valor += PG.Regras.valorDe(r, filtros.visao); },
      function (c) { return { chave: c, valor: 0 }; }
    );
    ufs = Util.ordenarPor(ufs, function (u) { return u.valor; }, true).slice(0, 3);

    var nota = ufs.length
      ? 'Concentração: ' + ufs.map(function (u) {
          return u.chave + ' ' + F.moedaCurta(u.valor);
        }).join(' · ') + '. Clique para filtrar o painel por este modo.'
      : 'Clique para filtrar o painel por este modo.';

    return { titulo: linha.chave, linhas: linhas, nota: nota };
  }

  PG.Infraestrutura = Infraestrutura;

})(window.PG);
