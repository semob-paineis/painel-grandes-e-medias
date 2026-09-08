/* ============================================================================
   PAINEL — orquestração da página principal
   ----------------------------------------------------------------------------
   Ordem de execução:
       tema -> carregar base -> montar filtros -> primeira renderização
                                    ^                    |
                                    +---- Estado.aoMudar +

   Nenhuma regra de cálculo mora aqui: este arquivo liga a base aos
   componentes e cuida das interações da página.
   ========================================================================== */

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta;

  /* ======================================================================
     TEMA
     ====================================================================== */

  var Tema = {
    aplicar: function (tema) {
      document.documentElement.setAttribute('data-tema', tema);
      try { localStorage.setItem('painel-gmc-tema', tema); } catch (e) { /* modo privado */ }
      var botao = document.getElementById('btnTema');
      if (botao) {
        botao.textContent = tema === 'escuro' ? '☀' : '☾';
        botao.setAttribute('aria-label',
          tema === 'escuro' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
      }
      // Os gráficos guardam as cores no momento da criação: precisam nascer de novo.
      PG.Graficos.atualizarTema();
      if (PG.Estado.assinantes.length) PG.Estado.notificar();
    },

    iniciar: function () {
      var salvo = null;
      try { salvo = localStorage.getItem('painel-gmc-tema'); } catch (e) { /* ignora */ }
      var prefereEscuro = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute(
        'data-tema', salvo || (prefereEscuro ? 'escuro' : 'claro'));

      var botao = document.getElementById('btnTema');
      if (botao) {
        botao.textContent =
          document.documentElement.getAttribute('data-tema') === 'escuro' ? '☀' : '☾';
        botao.addEventListener('click', function () {
          Tema.aplicar(document.documentElement.getAttribute('data-tema') === 'escuro'
            ? 'claro' : 'escuro');
        });
      }
    }
  };


  /* ======================================================================
     FILTROS
     ====================================================================== */

  function montarSegmentado(container, opcoes, chaveEstado) {
    if (!container) return;
    container.innerHTML = '';
    opcoes.forEach(function (op) {
      var ativo = PG.Estado.valores[chaveEstado] === op.valor;
      var botao = Util.el('button', {
        type: 'button',
        'aria-pressed': ativo ? 'true' : 'false',
        'data-valor': op.valor,
        texto: op.rotulo,
        title: op.descricao || op.rotulo
      });
      botao.addEventListener('click', function () {
        PG.Estado.definir(chaveEstado, op.valor);
        Array.prototype.forEach.call(container.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-pressed',
            b.dataset.valor === PG.Estado.valores[chaveEstado] ? 'true' : 'false');
        });
      });
      container.appendChild(botao);
    });
  }

  function montarSelecao(id, opcoes, chaveEstado, rotuloTodos) {
    var campo = document.getElementById(id);
    if (!campo) return;
    campo.innerHTML = '';
    campo.appendChild(Util.el('option', { value: PG.Estado.valores[chaveEstado] === 'todas'
      ? 'todas' : 'todos', texto: rotuloTodos }));
    // O valor "todos"/"todas" é definido pelo estado inicial da chave.
    campo.firstChild.value = (chaveEstado === 'regiao') ? 'todas' : 'todos';

    opcoes.forEach(function (op) {
      campo.appendChild(Util.el('option', { value: op, texto: op }));
    });
    campo.value = PG.Estado.valores[chaveEstado];
    campo.addEventListener('change', function () {
      PG.Estado.definir(chaveEstado, campo.value);
    });
  }

  // "Estudos e Projetos" é uma categoria, não um modo — mas dados.js agrupa
  // esses registros à parte de qualquer modo (ver porModo em dados.js), e o
  // componente de infraestrutura já os lista como um item próprio. Para o
  // filtro "Tipo de investimento" oferecer a mesma opção, junta-se aqui a
  // categoria à lista de modos, só quando ela de fato existe no escopo.
  var CATEGORIA_ESTUDOS_PROJETOS = 'Estudos e Projetos';

  function modosParaFiltro(opcoes) {
    var modos = (opcoes.modos || []).slice();
    var temEstudosProjetos = (opcoes.categorias || [])
      .indexOf(CATEGORIA_ESTUDOS_PROJETOS) >= 0;
    if (temEstudosProjetos && modos.indexOf(CATEGORIA_ESTUDOS_PROJETOS) < 0) {
      modos.push(CATEGORIA_ESTUDOS_PROJETOS);
      modos.sort();
    }
    return modos;
  }

  function montarFiltros(meta) {
    var opcoes = meta.opcoes || {};

    montarSegmentado(document.getElementById('filtroCenario'),
      (opcoes.cenarios || ['Consolidado']).map(function (c) {
        return {
          valor: c, rotulo: c,
          descricao: c === 'Consolidado'
            ? 'Todas as modalidades no escopo do painel'
            : 'Apenas propostas da modalidade ' + c
        };
      }), 'cenario');

    montarSegmentado(document.getElementById('filtroVisao'), [
      { valor: 'selecionado', rotulo: 'Selecionado',
        descricao: 'Valores selecionados, incluindo o que ainda não foi contratado' },
      { valor: 'contratado', rotulo: 'Contratado',
        descricao: 'Valores efetivamente contratados' }
    ], 'visao');

    montarSelecao('filtroAno', opcoes.anos || [], 'ano', 'Todos os anos');
    montarSelecao('filtroRegiao', opcoes.regioes || [], 'regiao', 'Todas as regiões');
    montarSelecao('filtroModo', modosParaFiltro(opcoes), 'modo', 'Todos os tipos');

    var limpar = document.getElementById('btnLimparFiltros');
    if (limpar) {
      limpar.addEventListener('click', function () {
        PG.Estado.limpar();
        sincronizarFiltros();
      });
    }

    montarSegmentado(document.getElementById('metricaInfra'), [
      { valor: 'km', rotulo: 'Extensão', descricao: 'Quilômetros de via' },
      { valor: 'unidades', rotulo: 'Unidades',
        descricao: 'Material rodante, terminais, abrigos e sistemas' },
      { valor: 'valor', rotulo: 'Investimento', descricao: 'Valor por modo' }
    ], 'metricaInfra');
  }

  /** Reflete o estado nos controles — necessário porque o filtro de modo
      também é acionado pelo componente de infraestrutura. */
  function sincronizarFiltros() {
    [['filtroAno', 'ano'], ['filtroRegiao', 'regiao'], ['filtroModo', 'modo']]
      .forEach(function (par) {
        var campo = document.getElementById(par[0]);
        if (campo) campo.value = PG.Estado.valores[par[1]];
      });
  }


  /* ======================================================================
     RENDERIZAÇÃO
     ====================================================================== */

  function rotuloValor(filtros) {
    return filtros.visao === 'selecionado' ? 'Selecionado' : 'Contratado';
  }

  function renderizar(resultado, filtros) {
    sincronizarFiltros();

    PG.Indicadores.renderizar(
      document.getElementById('indicadores'), resultado, filtros);

    PG.Funil.renderizar(
      document.getElementById('funil'), resultado, filtros);

    PG.Infraestrutura.renderizar(
      document.getElementById('infraestrutura'), resultado, filtros);

    renderizarRegioes(resultado, filtros);
    renderizarAnos(resultado, filtros);
    renderizarMapa(resultado, filtros);
    renderizarFinanciamento(resultado, filtros);
    renderizarResumo(resultado, filtros);
    renderizarQualidade(resultado);
    atualizarContadores(resultado, filtros);
  }

  function atualizarContadores(resultado, filtros) {
    var alvo = document.getElementById('contagemFiltro');
    if (alvo) {
      alvo.innerHTML = '<strong>' + F.inteiro(resultado.totais.propostas) +
        '</strong> propostas · <strong>' + F.moedaCurta(resultado.totais.valor) +
        '</strong> ' + rotuloValor(filtros).toLowerCase();
    }
    // Rótulos que dependem da visão escolhida.
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-rotulo-visao]'),
      function (el) { el.textContent = rotuloValor(filtros).toLowerCase(); }
    );
  }

  function renderizarRegioes(resultado, filtros) {
    PG.Graficos.barras('graficoRegioes', {
      rotulos: resultado.regioes.map(function (l) { return l.chave; }),
      valores: resultado.regioes.map(function (l) { return l.valor; }),
      cores: Paleta.variavel('--gov-azul'),
      eixoMoeda: true,
      rotuloSerie: rotuloValor(filtros)
    });

    PG.Tabelas.desenhar(
      document.getElementById('tabelaRegioes'),
      resultado.regioes,
      PG.Tabelas.colunasDimensao('Região', rotuloValor(filtros)),
      { dica: PG.Tabelas.dicaDimensao('Região', filtros) }
    );
  }

  function renderizarAnos(resultado, filtros) {
    PG.Graficos.barrasComLinha('graficoAnos', {
      rotulos: resultado.anos.map(function (l) { return l.chave; }),
      valores: resultado.anos.map(function (l) { return l.valor; }),
      valoresApoio: resultado.anos.map(function (l) { return l.propostas; }),
      eixoMoeda: true
    });

    PG.Graficos.legenda(document.getElementById('legendaAnos'), [
      { cor: Paleta.variavel('--gov-azul'), rotulo: 'Investimento',
        valor: F.moedaCurta(resultado.totais.valor) },
      { cor: Paleta.variavel('--gov-laranja'), rotulo: 'Propostas',
        valor: F.inteiro(resultado.totais.propostas) }
    ]);

    PG.Tabelas.desenhar(
      document.getElementById('tabelaAnos'),
      resultado.anos,
      PG.Tabelas.colunasDimensao('Ano', rotuloValor(filtros)),
      { dica: PG.Tabelas.dicaDimensao('Ano', filtros) }
    );
  }

  function renderizarMapa(resultado, filtros) {
    PG.Mapa.renderizar(document.getElementById('mapa'), resultado, filtros);
    PG.Mapa.renderizarEscala(document.getElementById('mapaEscala'), resultado);

    PG.Tabelas.desenhar(
      document.getElementById('tabelaUFs'),
      resultado.ufs.slice(0, 12),
      [
        { titulo: 'UF', obter: function (l) { return l.chave; } },
        { titulo: 'Propostas', numerica: true,
          obter: function (l) { return F.inteiro(l.propostas); } },
        { titulo: rotuloValor(filtros), numerica: true,
          obter: function (l) { return F.moedaCurta(l.valor); } },
        { titulo: 'Part.', numerica: true,
          obter: function (l) { return F.percentual(l.participacao, 1); } }
      ],
      { dica: PG.Tabelas.dicaDimensao('UF', filtros) }
    );
  }

  function renderizarFinanciamento(resultado, filtros) {
    var coresFonte = {
      'OGU': Paleta.variavel('--gov-verde'),
      'Financiamento': Paleta.variavel('--gov-azul')
    };
    PG.Graficos.rosca('graficoFontes', {
      rotulos: resultado.fontes.map(function (l) { return l.chave; }),
      valores: resultado.fontes.map(function (l) { return l.valor; }),
      cores: resultado.fontes.map(function (l) {
        return coresFonte[l.chave] || Paleta.variavel('--modo-outros');
      })
    });
    PG.Graficos.legenda(document.getElementById('legendaFontes'),
      resultado.fontes.map(function (l) {
        return {
          cor: coresFonte[l.chave] || Paleta.variavel('--modo-outros'),
          rotulo: l.chave,
          valor: F.moedaCurta(l.valor) + ' · ' + F.percentual(l.participacao, 1)
        };
      }));

    PG.Graficos.rosca('graficoAgentes', {
      rotulos: resultado.agentes.map(function (l) { return l.chave; }),
      valores: resultado.agentes.map(function (l) { return l.valor; }),
      cores: resultado.agentes.map(function (_, i) { return Paleta.sequencia(i); })
    });
    PG.Graficos.legenda(document.getElementById('legendaAgentes'),
      resultado.agentes.map(function (l, i) {
        return {
          cor: Paleta.sequencia(i), rotulo: l.chave,
          valor: F.moedaCurta(l.valor) + ' · ' + F.percentual(l.participacao, 1)
        };
      }));

    PG.Graficos.barras('graficoCategorias', {
      rotulos: resultado.categorias.map(function (l) { return l.chave; }),
      valores: resultado.categorias.map(function (l) { return l.valor; }),
      cores: resultado.categorias.map(function (_, i) { return Paleta.sequencia(i + 2); }),
      eixoMoeda: true,
      horizontal: true,
      rotuloSerie: rotuloValor(filtros)
    });
    PG.Graficos.legenda(document.getElementById('legendaCategorias'),
      resultado.categorias.map(function (l, i) {
        return {
          cor: Paleta.sequencia(i + 2), rotulo: l.chave,
          valor: F.percentual(l.participacao, 1) + ' · ' + F.moedaCurta(l.valor)
        };
      }));
  }

  /* --- Resumo executivo ---------------------------------------------------
     O texto vem da base (TEXTOS em gerar_dados.py); os números são calculados
     no recorte atual e inseridos ao final, para nunca ficarem defasados.    */

  function renderizarResumo(resultado, filtros) {
    var alvo = document.getElementById('resumoNumeros');
    if (!alvo) return;

    var trilhos = resultado.modos.filter(function (m) {
      return ['Metrô', 'VLTs', 'Trens'].indexOf(m.chave) >= 0;
    });
    var kmTrilhos = Util.soma(trilhos, function (m) { return m.km; });
    var lider = resultado.modos.length ? resultado.modos[0] : null;
    var regiaoLider = Util.ordenarPor(resultado.regioes,
      function (r) { return r.valor; }, true)[0];

    var partes = [
      'No recorte atual (' + filtros.cenario.toLowerCase() + '), o painel ' +
      'acompanha <strong>' + F.inteiro(resultado.totaisSelecionado.propostas) +
      ' propostas selecionadas</strong>, somando <strong>' +
      F.moedaCurta(resultado.totaisSelecionado.valor) + '</strong>. Dessas, <strong>' +
      F.inteiro(resultado.totaisContratado.propostas) + '</strong> já foram contratadas, ' +
      'com <strong>' + F.moedaCurta(resultado.totaisContratado.valor) +
      '</strong> em contratos assinados — ' +
      F.razao(resultado.totaisContratado.valor, resultado.totaisSelecionado.valor, 1) +
      ' do valor selecionado.',

      'O conjunto ' + rotuloValor(filtros).toLowerCase() + ' corresponde a <strong>' +
      F.km(resultado.totais.km) + '</strong> de infraestrutura, dos quais <strong>' +
      F.km(kmTrilhos) + '</strong> em sistemas sobre trilhos (metrô, VLT e trem urbano), ' +
      'além de <strong>' + F.inteiro(resultado.totais.unidades) + ' unidades</strong> ' +
      'de material rodante, terminais, abrigos e sistemas.' +
      (lider ? ' O modo de maior investimento é <strong>' + Util.escapar(lider.chave) +
        '</strong>, com ' + F.percentual(lider.participacao, 1) + ' do total.' : ''),

      'A distribuição alcança <strong>' + F.inteiro(resultado.totais.municipios) +
      ' municípios</strong> em <strong>' + F.inteiro(resultado.totais.ufs) +
      ' unidades da federação</strong>' +
      (regiaoLider ? ', com concentração na região <strong>' + regiaoLider.chave +
        '</strong> (' + F.percentual(regiaoLider.participacao, 1) + ' do valor)' : '') + '.'
    ];

    alvo.innerHTML =
      '<div class="resumo-numeros">' +
        '<div class="resumo-numeros__titulo">Números principais</div>' +
        partes.map(function (p) { return '<p>' + p + '</p>'; }).join('') +
      '</div>';
  }

  /* --- Qualidade da base --------------------------------------------------
     Transparência sobre a base: quantos registros pedem conferência e por quê.
     Serve de insumo para a rotina de saneamento, não para julgar o programa. */

  function renderizarQualidade(resultado) {
    var alvo = document.getElementById('qualidade');
    if (!alvo) return;

    var meta = PG.Dados.meta || {};
    var dicionario = meta.dicionarioAlertas || {};
    var contagem = {};
    resultado.alertas.forEach(function (r) {
      r.alertas.forEach(function (a) { contagem[a] = (contagem[a] || 0) + 1; });
    });

    var chaves = Object.keys(contagem).sort(function (a, b) {
      return contagem[b] - contagem[a];
    });

    if (!chaves.length) {
      alvo.innerHTML = '<p>Nenhuma inconsistência detectada no recorte atual.</p>';
      return;
    }

    var linhas = chaves.map(function (c) {
      return { chave: c, descricao: dicionario[c] || c, quantidade: contagem[c] };
    });

    PG.Tabelas.desenhar(alvo, linhas, [
      { titulo: 'Ponto de conferência',
        obter: function (l) { return l.descricao; } },
      { titulo: 'Registros', numerica: true,
        obter: function (l) { return F.inteiro(l.quantidade); },
        total: function (ls) {
          return F.inteiro(Util.soma(ls, function (l) { return l.quantidade; }));
        } }
    ]);

    var nota = document.getElementById('qualidadeNota');
    if (nota) {
      nota.textContent = F.inteiro(resultado.alertas.length) +
        ' de ' + F.inteiro(resultado.recorte.length) +
        ' registros do recorte têm ao menos um ponto a conferir.';
    }
  }


  /* ======================================================================
     AÇÕES DA PÁGINA
     ====================================================================== */

  function ligarExportacao() {
    var botao = document.getElementById('btnExportar');
    var menu = document.getElementById('menuExportar');
    if (botao && menu) {
      botao.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.classList.toggle('aberto');
      });
      document.addEventListener('click', function () { menu.classList.remove('aberto'); });
    }

    var acoes = {
      expImagem: function () { PG.Exportar.imagem(); },
      expPDF: function () { PG.Exportar.pdf(); },
      expCSV: function () {
        PG.Exportar.dados(PG.Dados.calcular(PG.Estado.valores));
      }
    };
    Object.keys(acoes).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () {
        if (menu) menu.classList.remove('aberto');
        acoes[id]();
      });
    });
  }

  function preencherCabecalho(meta) {
    var t = meta.textos || {};
    var definir = function (id, valor) {
      var el = document.getElementById(id);
      if (el && valor) el.textContent = valor;
    };
    definir('tituloPainel', t.tituloPainel);
    definir('programaPainel', t.programa);
    definir('orgaoPainel', t.orgao);
    definir('subtituloPainel', t.subtitulo);
    definir('dataAtualizacao', 'Base atualizada em ' + (meta.dataAtualizacao || '—'));
    definir('rodapeFonte', t.fonte);
    definir('rodapeAviso', t.aviso);
    definir('rodapeOrigem', 'Origem: ' + (meta.origem || '—') +
      ' · Gerado em ' + (meta.geradoEm || '—').replace('T', ' ').slice(0, 16));

    var resumo = document.getElementById('resumoTexto');
    if (resumo && t.resumo) {
      resumo.innerHTML = t.resumo.map(function (p) {
        return '<p>' + Util.escapar(p) + '</p>';
      }).join('');
    }

    if (meta.mock) {
      var aviso = document.getElementById('avisoMock');
      if (aviso) {
        aviso.classList.remove('oculto');
        aviso.textContent = 'Atenção: o painel está exibindo DADOS FICTÍCIOS ' +
          '(base de demonstração). Rode gerar_dados.py apontando para a planilha ' +
          'oficial para carregar os dados reais.';
      }
    }
  }


  /* ======================================================================
     INÍCIO
     ====================================================================== */

  document.addEventListener('DOMContentLoaded', function () {
    Tema.iniciar();
    ligarExportacao();

    PG.Dados.carregar().then(function () {
      var meta = PG.Dados.meta;
      preencherCabecalho(meta);
      montarFiltros(meta);
      PG.Estado.aoMudar(renderizar);
      PG.Estado.notificar();     // primeira renderização
    }).catch(function (erro) {
      var main = document.querySelector('main .container');
      if (main) {
        main.innerHTML = '<div class="bloco"><div class="bloco__corpo">' +
          '<div class="sem-resultado"><strong>Não foi possível carregar a base</strong>' +
          'Verifique se dados.json existe na pasta do projeto ou rode ' +
          'gerar_dados.py para gerá-lo.</div></div></div>';
      }
      console.error(erro);
    });
  });

})(window.PG);
