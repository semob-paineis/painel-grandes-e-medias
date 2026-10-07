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

   Aba "Todas as entregas" (padrão): em vez de agrupar por modo, lista TUDO o
   que os empreendimentos entregam — corredores, trilhos, sistema viário,
   ciclovias, estações, terminais, abrigos, OAE, passarelas, veículos, ITS,
   CCO, pátios, projetos —, a partir da aba "Indicadores de Obra" da planilha
   (ver agregarEntregas em dados.js). Cada empreendimento entra uma vez só.

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
    entregas: {
      rotulo: 'Entregas',
      obter: function (linha) { return linha.valor; },
      formatar: function (v) { return F.numeroCurto(v); },
      sufixo: ''
    },
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

    estudo:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h9"/>' +
      '<path d="M13 3l4 4v3"/>' +
      '<line x1="7" y1="9" x2="12" y2="9"/><line x1="7" y1="13" x2="10" y2="13"/>' +
      '<circle cx="16.5" cy="16.5" r="3"/><line x1="18.7" y1="18.7" x2="21" y2="21"/></svg>',

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
    ['ativa', ICONES.ciclovia],
    ['bicicl', ICONES.ciclovia],
    ['brt', ICONES.brt],
    ['corredor', ICONES.corredor],
    ['vlt', ICONES.trilho],
    ['tren', ICONES.trilho],
    ['terminal', ICONES.terminal],
    ['viario', ICONES.corredor],
    ['sistema', ICONES.sistema],
    ['plano', ICONES.plano],
    ['estudo', ICONES.estudo],
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



  /* ======================================================================
     1.2 ABA "TODAS AS ENTREGAS"
     ====================================================================== */

  // Ícone de cada entrega (reaproveita os SVG de modo, já embutidos).
  var ICONE_ENTREGA = {
    corredorKm: ICONES.corredor,  trilhosKm: ICONES.trilho,
    viarioKm: ICONES.corredor,    cicloKm: ICONES.ciclovia,
    estacoes: ICONES.trilho,      terminais: ICONES.terminal,
    abrigos: ICONES.terminal,     oae: ICONES.oae,
    passarelas: ICONES.oae,       veiculos: ICONES.brt,
    its: ICONES.sistema,          cco: ICONES.sistema,
    patios: ICONES.sistema,       projetos: ICONES.estudo,
    extProjetadaKm: ICONES.estudo
  };

  function formatarEntrega(item, valor) {
    return item.unidade === 'km' ? F.decimal(valor, 1) : F.inteiro(valor);
  }

  var UNIDADE_DA_ABA = { km: 'km', unidades: 'un.' };

  function renderizarEntregas(container, resultado, filtros) {
    var e = resultado.entregas;
    // Abas Extensão/Unidades usam o mesmo levantamento por empreendimento
    // da aba "Todas as entregas", apenas filtrando a unidade de medida.
    var unidadeAba = UNIDADE_DA_ABA[filtros.metricaInfra] || null;
    if (e && unidadeAba) {
      e = { itens: e.itens.filter(function (i) { return i.unidade === unidadeAba; }),
            porChave: e.porChave, empreendimentos: e.empreendimentos };
    }
    var temDados = e && e.itens.some(function (i) { return i.valor > 0; });

    if (!temDados) {
      container.appendChild(Util.el('div', {
        'class': 'sem-resultado',
        html: '<strong>Nenhuma entrega registrada</strong>' +
              'Ajuste os filtros ou escolha outra aba.'
      }));
      return;
    }

    container.appendChild(Util.el('div', { 'class': 'infra__cabecalho' }, [
      Util.el('span', { texto: 'Entrega' }),
      Util.el('span', { texto: 'Distribuição' }),
      Util.el('span', { texto: unidadeAba === 'km' ? 'Extensão' : unidadeAba === 'un.' ? 'Unidades' : 'Total' })
    ]));

    // Agrupa mantendo a ordem do dicionário (gerar_dados.py).
    var grupos = [], porGrupo = {};
    e.itens.forEach(function (item) {
      if (item.valor <= 0) return;
      if (!porGrupo[item.grupo]) {
        porGrupo[item.grupo] = { nome: item.grupo, itens: [] };
        grupos.push(porGrupo[item.grupo]);
      }
      porGrupo[item.grupo].itens.push(item);
    });

    grupos.forEach(function (grupo, g) {
      container.appendChild(Util.el('div', {
        'class': 'infra__grupo', texto: grupo.nome
      }));
      var cor = Paleta.sequencia(g);
      // km e unidades não se comparam: a barra é proporcional ao maior da
      // mesma unidade dentro do grupo.
      var maiores = {};
      grupo.itens.forEach(function (i) {
        maiores[i.unidade] = Math.max(maiores[i.unidade] || 0, i.valor);
      });
      grupo.itens.forEach(function (item) {
        container.appendChild(desenharLinhaEntrega(
          item, maiores[item.unidade] || 1, cor, resultado, filtros, container));
      });
    });

    requestAnimationFrame(function () {
      Array.prototype.forEach.call(
        container.querySelectorAll('.infra__barra'),
        function (b) { b.style.width = b.dataset.largura; }
      );
    });
  }

  function desenharLinhaEntrega(item, maior, cor, resultado, filtros, container) {
    var largura = Math.max(1.5, (item.valor / maior) * 100);
    var el = Util.el('div', {
      'class': 'infra__linha infra__linha--abrivel', tabindex: '0',
      role: 'button', 'aria-expanded': 'false',
      title: 'Clique para ver os empreendimentos que compõem este número'
    }, [
      Util.el('div', { 'class': 'infra__modo' }, [
        Util.el('span', {
          'class': 'infra__icone', estilo: { color: cor },
          html: ICONE_ENTREGA[item.chave] || ICONE_PADRAO, 'aria-hidden': 'true'
        }),
        Util.el('span', { 'class': 'infra__nome', texto: item.rotulo, title: item.rotulo })
      ]),
      Util.el('div', { 'class': 'infra__trilho' }, [
        Util.el('div', {
          'class': 'infra__barra', 'data-largura': largura.toFixed(1) + '%',
          estilo: { background: cor }
        })
      ]),
      Util.el('div', { 'class': 'infra__metrica' }, [
        document.createTextNode(formatarEntrega(item, item.valor)),
        Util.el('span', { texto: ' ' + item.unidade }),
        Util.el('span', { 'class': 'infra__seta', texto: '▸', 'aria-hidden': 'true' })
      ])
    ]);

    // Rastreabilidade: a linha abre a lista dos empreendimentos que formam
    // o número, com a proposta de cada um — a mesma chave do Radar.
    function alternarDetalhe() {
      var aberto = el.getAttribute('aria-expanded') === 'true';
      var seguinte = el.nextSibling;
      if (seguinte && seguinte.classList &&
          seguinte.classList.contains('infra__detalhe')) {
        container.removeChild(seguinte);
      }
      el.setAttribute('aria-expanded', aberto ? 'false' : 'true');
      el.classList.toggle('esta-aberto', !aberto);
      if (!aberto) {
        container.insertBefore(
          montarDetalheEntrega(item, resultado, cor), el.nextSibling);
      }
    }
    el.addEventListener('click', alternarDetalhe);
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); alternarDetalhe(); }
    });

    Dica.ligar(el, function () { return montarDicaEntrega(item, resultado, filtros); });
    return el;
  }


  /** Como identificar a proposta fora do painel: o número da proposta
   *  quando existe, senão o ID Governa — e, em último caso, a própria linha
   *  da BASEDEDADOS, que a coluna ao lado sempre traz. */
  function identificacao(r) {
    if (r.proposta && r.proposta !== 's/n') return r.proposta;
    if (r.idGoverna) return 'ID Governa ' + r.idGoverna;
    return 'sem nº';
  }

  /** Lista dos empreendimentos que compõem uma entrega — um por linha, com
   *  a proposta, para conferir o número contra a planilha e contra o Radar. */
  function montarDetalheEntrega(item, resultado, cor) {
    var registros = resultado.universo.filter(function (r) {
      return r.entregas && (r.entregas[item.chave] || 0) > 0;
    });
    registros = Util.ordenarPor(registros, function (r) {
      return r.entregas[item.chave];
    }, true);

    var caixa = Util.el('div', { 'class': 'infra__detalhe' });
    caixa.appendChild(Util.el('div', {
      'class': 'infra__detalhe__titulo',
      html: '<strong>' + Util.escapar(item.rotulo) + '</strong> — ' +
            formatarEntrega(item, item.valor) + ' ' + item.unidade + ' em ' +
            F.inteiro(registros.length) + ' empreendimento' +
            (registros.length === 1 ? '' : 's')
    }));

    var tabela = Util.el('table', { 'class': 'tabela tabela--compacta' });
    tabela.appendChild(Util.el('thead', {}, [
      Util.el('tr', {}, [
        Util.el('th', { texto: 'Empreendimento' }),
        Util.el('th', { texto: 'UF / Município' }),
        Util.el('th', { texto: 'Proposta' }),
        Util.el('th', { 'class': 'n', texto: 'Linha na base' }),
        Util.el('th', { texto: 'Situação' }),
        Util.el('th', { 'class': 'n', texto: item.unidade === 'km' ? 'Extensão' : 'Unidades' })
      ])
    ]));
    tabela.appendChild(Util.el('tbody', {}, registros.map(function (r) {
      return Util.el('tr', {}, [
        Util.el('td', {}, [Util.el('span', {
          'class': 'celula-longa', texto: r.empreendimento || '—',
          title: r.empreendimento || '' })]),
        Util.el('td', { texto: (r.uf || '—') + ' · ' + (r.municipio || '—') }),
        Util.el('td', { texto: identificacao(r) }),
        Util.el('td', { 'class': 'n', texto: String(r.id) }),
        Util.el('td', { texto: r.situacao || '—' }),
        Util.el('td', { 'class': 'n',
          texto: formatarEntrega(item, r.entregas[item.chave]) + ' ' + item.unidade })
      ]);
    })));
    tabela.appendChild(Util.el('tfoot', {}, [
      Util.el('tr', {}, [
        Util.el('td', { colspan: '5', texto: 'Total' }),
        Util.el('td', { 'class': 'n',
          texto: formatarEntrega(item, item.valor) + ' ' + item.unidade })
      ])
    ]));
    // A tabela tem células que não quebram: a rolagem horizontal fica dentro
    // deste envoltório, como nas demais tabelas do painel, em vez de empurrar
    // a página inteira em telas estreitas.
    caixa.appendChild(Util.el('div', { 'class': 'tabela-envolucro' }, [tabela]));
    caixa.appendChild(Util.el('p', {
      'class': 'infra__detalhe__nota',
      texto: 'Quantidades do levantamento por empreendimento (aba "Indicadores ' +
             'de Obra" da planilha). Cada empreendimento aparece uma única vez, ' +
             'na proposta que o representa. "Linha na base" é a linha da ' +
             'BASEDEDADOS, a mesma referência usada na aba de indicadores.' +
             (item.unidade === 'km'
               ? ' As extensões aparecem arredondadas em uma casa decimal; por isso a ' +
                 'soma das linhas pode diferir do total em alguns décimos.'
               : '')
    }));
    caixa.style.borderLeftColor = cor;
    return caixa;
  }

  function montarDicaEntrega(item, resultado, filtros) {
    var linhas = [
      ['Total', formatarEntrega(item, item.valor) + ' ' + item.unidade],
      ['Empreendimentos', F.inteiro(item.empreendimentos) + ' de ' +
                          F.inteiro(resultado.entregas.empreendimentos)]
    ];
    if (item.componentes) {
      item.componentes.forEach(function (c) {
        linhas.push([c.rotulo, F.inteiro(c.valor) + ' un.']);
      });
    }
    if (item.empreendimentosMigrados > 0) {
      linhas.push(['Em empreendimentos Migrados',
        formatarEntrega(item, item.valorMigrado) + ' ' + item.unidade +
        ' (' + F.inteiro(item.empreendimentosMigrados) + ')']);
    }
    var nota = {
      oae: 'Viadutos + pontes + túneis, trincheiras, elevados e outras OAE. ' +
           'Passarelas são contadas à parte.',
      viarioKm: 'Melhorias no sistema viário e acessos, sem exclusividade de ' +
                'um modo (BRT, VLT ou metrô).',
      cicloKm: 'Ciclovias e ciclofaixas implantadas junto aos empreendimentos.',
      extProjetadaKm: 'Extensão prevista em estudos e projetos — ainda não é obra.',
      projetos: 'Estudos e projetos contratados — ainda não são obra.'
    }[item.chave] || 'Soma dos empreendimentos do recorte atual.';
    if (item.empreendimentosMigrados > 0) {
      nota += ' Nos empreendimentos Migrados Novo PAC, a quantidade refere-se ' +
              'ao empreendimento inteiro, não só à parcela migrada.';
    }
    return { titulo: item.rotulo, linhas: linhas, nota: nota };
  }

  /* --- Notas do rodapé do componente ------------------------------------- */

  function atualizarNotas(resultado, filtros) {
    var nota = document.getElementById('infraNota');
    var aviso = document.getElementById('infraAvisoMigrado');
    var e = resultado.entregas;

    if (nota) {
      if (filtros.metricaInfra !== 'valor') {
        var n = e ? e.empreendimentos : 0;
        nota.textContent = 'Cada empreendimento é contado uma única vez. ' +
          'Quilômetros e unidades não se somam entre si. Obras de arte ' +
          'especiais (OAE) reúnem viadutos, pontes e túneis/trincheiras/' +
          'elevados; passarelas aparecem separadas. Fonte: levantamento ' +
          'por empreendimento (' + F.inteiro(n) + ' no recorte).';
      } else {
        nota.textContent = 'Clique em uma tipologia para filtrar todo o painel por ' +
          'ela. Cada empreendimento pertence a uma única tipologia, definida ' +
          'pela sua natureza geral; por isso os valores somam o total sem ' +
          'repetição. O investimento não é repartido entre as entregas — ' +
          'para quilômetros e unidades, veja as abas Extensão e Unidades.';
      }
    }

    if (aviso) {
      var m = resultado.migrados;
      if (m && m.propostas > 0) {
        aviso.classList.remove('oculto');
        aviso.innerHTML = '<strong>Migrado Novo PAC.</strong> ' +
          F.inteiro(m.propostas) + ' registro(s) deste recorte migraram de ' +
          'programas anteriores: as quantidades acima referem-se ao ' +
          'empreendimento inteiro, mas o investimento exibido é só a parcela ' +
          'migrada ao Novo PAC (' + F.moedaCurta(m.parcela) + ' de ' +
          F.moedaCurta(m.original) + ' de apoio federal original, ' +
          F.percentual(m.percentual, 1) + '). O custo por km usa o apoio ' +
          'federal original.';
      } else {
        aviso.classList.add('oculto');
        aviso.innerHTML = '';
      }
    }
  }

  var Infraestrutura = {

    renderizar: function (container, resultado, filtros) {
      if (!container) return;
      container.innerHTML = '';
      atualizarNotas(resultado, filtros);

      if (filtros.metricaInfra !== 'valor') {
        renderizarEntregas(container, resultado, filtros);
        return;
      }

      var metrica = METRICAS[filtros.metricaInfra] || METRICAS.km;

      // Só entram modos com valor na métrica escolhida — evita lista com zeros.
      var linhas = resultado.modos.filter(function (l) {
        return metrica.obter(l) > 0;
      });
      linhas = Util.ordenarPor(linhas, metrica.obter, true);

      if (!linhas.length) {
        container.appendChild(Util.el('div', {
          'class': 'sem-resultado',
          html: '<strong>Nenhuma tipologia com ' + metrica.rotulo.toLowerCase() +
                ' registrada</strong>Ajuste os filtros ou troque a métrica.'
        }));
        return;
      }

      var maior = metrica.obter(linhas[0]) || 1;

      // Só a métrica escolhida na aba (Extensão | Unidades | Investimento) —
      // sem uma coluna "Investimento" fixa ao lado, que duplicava a
      // informação sempre que a aba escolhida já era "Investimento".
      container.appendChild(Util.el('div', { 'class': 'infra__cabecalho' }, [
        Util.el('span', { texto: 'Tipologia' }),
        Util.el('span', { texto: 'Distribuição' }),
        Util.el('span', { texto: metrica.rotulo })
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
      ])
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
    if (linha.km > 0 && linha.valorCusto > 0) {
      linhas.push(['Custo por km', F.moedaCurta(linha.valorCusto / linha.km)]);
    }
    if (linha.migrados > 0) {
      linhas.push(['Migrado Novo PAC', F.inteiro(linha.migrados) + ' registro(s)']);
    }

    // Onde esse modo está concentrado — contexto útil na conversa com o gestor.
    var ufs = Util.agrupar(
      resultado.universo.filter(function (r) { return (r.tipologia || r.modo) === linha.chave; }),
      function (r) { return r.uf; },
      function (acc, r) { acc.valor += PG.Regras.valorDe(r, filtros.visao); },
      function (c) { return { chave: c, valor: 0 }; }
    );
    ufs = Util.ordenarPor(ufs, function (u) { return u.valor; }, true).slice(0, 3);

    var nota = ufs.length
      ? 'Concentração: ' + ufs.map(function (u) {
          return u.chave + ' ' + F.moedaCurta(u.valor);
        }).join(' · ') + '. Clique para filtrar o painel por esta tipologia.'
      : 'Clique para filtrar o painel por esta tipologia.';
    if (linha.migrados > 0) {
      nota += ' O custo por km usa o apoio federal original dos registros ' +
              'Migrado Novo PAC, não só a parcela migrada.';
    }

    return { titulo: linha.chave, linhas: linhas, nota: nota };
  }

  PG.Infraestrutura = Infraestrutura;

})(window.PG);
