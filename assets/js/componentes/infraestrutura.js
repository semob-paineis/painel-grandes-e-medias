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

   Ícones (seção 1.1): cada modo ganha um ícone SVG embutido — sem fonte de
   ícones externa, para manter o painel funcionando sem internet. O ícone
   herda a cor do modo via currentColor, então nunca fica dessincronizado da
   cor da barra: uma única fonte de verdade (Paleta.modo).
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


  /* ======================================================================
     1.1 ÍCONES POR MODO
     ----------------------------------------------------------------------
     Todos no mesmo estilo de linha (stroke, 24x24, cantos arredondados) para
     ficarem visualmente coerentes entre si. stroke="currentColor" faz o
     ícone herdar a cor definida no elemento pai (via CSS color).

     Para incluir um modo novo: acrescente um item no array TESTES abaixo,
     com uma palavra-chave (sem acento, minúscula) e o SVG correspondente.
     O primeiro teste que bater na string do modo "vence" — não precisa
     bater o nome inteiro, só conter a palavra-chave.
     ====================================================================== */

  var ICONE_PADRAO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/></svg>';

  var ICONES = {
    metro:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6 21c-1.6 0-2.7-4-2.7-9s1.1-9 2.7-9h12c1.6 0 2.7 4 2.7 9s-1.1 9-2.7 9"/>' +
      '<rect x="8" y="5" width="8" height="7" rx="1"/>' +
      '<circle cx="9" cy="17" r="1.2"/><circle cx="15" cy="17" r="1.2"/>' +
      '<line x1="11.3" y1="17" x2="12.7" y2="17"/></svg>',

    aeromovel:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 8h14a3 3 0 0 1 0 6H3"/>' +
      '<line x1="3" y1="8" x2="3" y2="14"/>' +
      '<line x1="6" y1="17" x2="6" y2="21"/><line x1="4" y1="21" x2="8" y2="21"/>' +
      '<line x1="16" y1="17" x2="16" y2="21"/><line x1="14" y1="21" x2="18" y2="21"/></svg>',

    ciclovia:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/>' +
      '<path d="M6 17l4-8h4l4 8"/><path d="M10 9h4"/><circle cx="14" cy="9" r="1"/></svg>',

    brt:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="7" width="18" height="10" rx="2"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<circle cx="7" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/></svg>',

    corredor:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 20L9 4"/><path d="M20 20L15 4"/>' +
      '<line x1="12" y1="3" x2="12" y2="7"/>' +
      '<line x1="12" y1="10" x2="12" y2="14"/>' +
      '<line x1="12" y1="17" x2="12" y2="21"/></svg>',

    trilho:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="4" y="6" width="16" height="10" rx="2"/>' +
      '<line x1="4" y1="11" x2="20" y2="11"/>' +
      '<circle cx="8" cy="19" r="1.3"/><circle cx="16" cy="19" r="1.3"/>' +
      '<line x1="9" y1="6" x2="9" y2="3"/><line x1="15" y1="6" x2="15" y2="3"/></svg>',

    terminal:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 21V9l8-5 8 5v12"/><line x1="4" y1="21" x2="20" y2="21"/>' +
      '<rect x="10" y="14" width="4" height="7"/></svg>',

    sistema:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="7" y="7" width="10" height="10" rx="1"/>' +
      '<line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/>' +
      '<line x1="9" y1="17" x2="9" y2="21"/><line x1="15" y1="17" x2="15" y2="21"/>' +
      '<line x1="3" y1="9" x2="7" y2="9"/><line x1="3" y1="15" x2="7" y2="15"/>' +
      '<line x1="17" y1="9" x2="21" y2="9"/><line x1="17" y1="15" x2="21" y2="15"/></svg>',

    plano:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="5" y="4" width="14" height="17" rx="2"/>' +
      '<rect x="9" y="2" width="6" height="4" rx="1"/>' +
      '<line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>' +
      '<line x1="8" y1="18" x2="13" y2="18"/></svg>',

    oae:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M2 15h20"/><path d="M4 15v-2a8 8 0 0 1 16 0v2"/>' +
      '<line x1="6" y1="15" x2="6" y2="20"/><line x1="12" y1="15" x2="12" y2="20"/>' +
      '<line x1="18" y1="15" x2="18" y2="20"/></svg>'
  };

  // Ordem importa: o primeiro teste que bater na string normalizada vence.
  var TESTES = [
    ['metro', ICONES.metro],
    ['aeromovel', ICONES.aeromovel],
    ['ciclovia', ICONES.ciclovia],
    ['bicicl', ICONES.ciclovia],
    ['brt', ICONES.brt],
    ['corredor', ICONES.corredor],
    ['vlt', ICONES.trilho],
    ['tren', ICONES.trilho],
    ['terminal', ICONES.terminal],
    ['sistema', ICONES.sistema],
    ['plano', ICONES.plano],
    ['oae', ICONES.oae],
    ['obra de arte', ICONES.oae]
  ];

  function normalizar(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  /** Devolve o SVG (string) do ícone correspondente ao nome do modo. */
  function iconeDoModo(nomeModo) {
    var n = normalizar(nomeModo);
    for (var i = 0; i < TESTES.length; i++) {
      if (n.indexOf(TESTES[i][0]) >= 0) return TESTES[i][1];
    }
    return ICONE_PADRAO;
  }


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

    metricas: METRICAS,

    // Exposto para permitir testes/uso pontual em outros componentes.
    iconeDoModo: iconeDoModo
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
        Util.el('span', {
          'class': 'infra__icone',
          estilo: { color: cor },
          html: iconeDoModo(linha.chave),
          'aria-hidden': 'true'
        }),
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
