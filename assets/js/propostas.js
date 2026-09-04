/* ============================================================================
   RADAR DE PROPOSTAS — tabela com busca, filtros, ordenação e paginação
   ----------------------------------------------------------------------------
   A tabela é montada a partir de meta.colunas, definido em gerar_propostas.py.
   Incluir uma coluna nova é acrescentar um item lá: cabeçalho, filtro,
   ordenação, busca e exportação passam a considerá-la automaticamente.

   Estado local da página:
       busca        texto da busca global
       filtros      { coluna: Set(valores marcados) }
       ordem        { coluna, direcao }
       pagina       página corrente
   ========================================================================== */

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Dica = PG.Dica;

  var POR_PAGINA = 25;

  var base = { meta: {}, propostas: [] };
  var estado = {
    busca: '',
    filtros: {},
    ordem: { coluna: null, direcao: 'asc' },
    pagina: 1
  };
  var indiceBusca = [];   // texto normalizado por proposta, calculado uma vez


  /* ======================================================================
     CARREGAMENTO
     ====================================================================== */

  function carregar() {
    return fetch('propostas.json', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () {
        if (window.DADOS_PROPOSTAS) return window.DADOS_PROPOSTAS;
        throw new Error('base de propostas indisponível');
      })
      .then(function (pacote) {
        base = pacote;
        indiceBusca = base.propostas.map(function (p) {
          return Util.chaveBusca(Object.keys(p).map(function (k) {
            return p[k];
          }).join(' '));
        });
        return base;
      });
  }


  /* ======================================================================
     SELEÇÃO
     ====================================================================== */

  function colunas() { return base.meta.colunas || []; }

  function valorDe(proposta, chave) {
    return proposta[chave];
  }

  /** Aplica busca global + filtros por coluna. */
  function filtrar() {
    var termo = Util.chaveBusca(estado.busca.trim());
    var chavesFiltradas = Object.keys(estado.filtros).filter(function (c) {
      return estado.filtros[c] && estado.filtros[c].size;
    });

    return base.propostas.filter(function (p, i) {
      if (termo && indiceBusca[i].indexOf(termo) < 0) return false;
      for (var j = 0; j < chavesFiltradas.length; j++) {
        var c = chavesFiltradas[j];
        var v = valorDe(p, c);
        if (!estado.filtros[c].has(v === null || v === undefined ? '' : String(v))) {
          return false;
        }
      }
      return true;
    });
  }

  function ordenar(lista) {
    if (!estado.ordem.coluna) return lista;
    var col = colunas().filter(function (c) {
      return c.chave === estado.ordem.coluna;
    })[0];
    if (!col) return lista;

    var numerica = col.tipo === 'moeda' || col.tipo === 'numero';
    var sinal = estado.ordem.direcao === 'desc' ? -1 : 1;

    return lista.slice().sort(function (a, b) {
      var va = valorDe(a, col.chave), vb = valorDe(b, col.chave);
      if (numerica) return ((Number(va) || 0) - (Number(vb) || 0)) * sinal;
      return String(va == null ? '' : va)
        .localeCompare(String(vb == null ? '' : vb), 'pt-BR') * sinal;
    });
  }


  /* ======================================================================
     RENDERIZAÇÃO
     ====================================================================== */

  function classeSelo(grupo) {
    var mapa = {
      'Contratados': 'selo--contratados',
      'A contratar': 'selo--acontratar',
      'Habilitados': 'selo--habilitados',
      'Desistências': 'selo--desistencias'
    };
    return mapa[grupo] || 'selo--indefinido';
  }

  function formatarCelula(proposta, col) {
    var v = valorDe(proposta, col.chave);
    if (col.tipo === 'moeda') return v ? F.moeda(v) : '—';
    if (col.tipo === 'numero') return v ? F.inteiro(v) : '—';
    return v == null || v === '' ? '—' : String(v);
  }

  function renderCabecalho() {
    var tr = document.getElementById('cabecalhoTabela');
    tr.innerHTML = '';

    colunas().forEach(function (col) {
      var ordenando = estado.ordem.coluna === col.chave;
      var th = Util.el('th', {
        'class': 'ordenavel' + (col.tipo === 'moeda' ? ' n' : ''),
        scope: 'col',
        style: col.largura && col.largura !== 'auto' ? 'width:' + col.largura : null
      });
      if (ordenando) {
        th.setAttribute('aria-sort',
          estado.ordem.direcao === 'asc' ? 'ascending' : 'descending');
      }

      var interno = Util.el('div', { 'class': 'th-interno' }, [
        Util.el('span', { texto: col.titulo }),
        Util.el('span', { 'class': 'th-seta',
          texto: ordenando ? (estado.ordem.direcao === 'asc' ? '▲' : '▼') : '▲' })
      ]);

      if (col.filtro) {
        var ativo = estado.filtros[col.chave] && estado.filtros[col.chave].size;
        var botao = Util.el('button', {
          'class': 'btn-filtro-coluna' + (ativo ? ' esta-ativo' : ''),
          type: 'button',
          title: 'Filtrar por ' + col.titulo,
          'aria-label': 'Filtrar por ' + col.titulo,
          html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" ' +
                'stroke="currentColor" stroke-width="2.4" stroke-linecap="round" ' +
                'stroke-linejoin="round" aria-hidden="true">' +
                '<path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>'
        });
        botao.addEventListener('click', function (e) {
          e.stopPropagation();
          abrirFiltro(col, botao);
        });
        interno.appendChild(botao);
      }

      th.appendChild(interno);
      th.addEventListener('click', function () {
        if (estado.ordem.coluna === col.chave) {
          estado.ordem.direcao = estado.ordem.direcao === 'asc' ? 'desc' : 'asc';
        } else {
          estado.ordem.coluna = col.chave;
          estado.ordem.direcao = col.tipo === 'moeda' ? 'desc' : 'asc';
        }
        estado.pagina = 1;
        render();
      });

      tr.appendChild(th);
    });
  }

  function renderCorpo(lista) {
    var corpo = document.getElementById('corpoTabela');
    corpo.innerHTML = '';

    if (!lista.length) {
      corpo.appendChild(Util.el('tr', {}, [
        Util.el('td', { colspan: colunas().length }, [
          Util.el('div', {
            'class': 'sem-resultado',
            html: '<strong>Nenhuma proposta encontrada</strong>' +
                  'Revise a busca ou limpe os filtros aplicados.'
          })
        ])
      ]));
      return;
    }

    var inicio = (estado.pagina - 1) * POR_PAGINA;
    var pagina = lista.slice(inicio, inicio + POR_PAGINA);

    pagina.forEach(function (proposta) {
      var tr = Util.el('tr', {});

      colunas().forEach(function (col) {
        var td = Util.el('td', { 'class': col.tipo === 'moeda' ? 'n' : '' });

        if (col.tipo === 'selo') {
          td.appendChild(Util.el('span', {
            'class': 'selo ' + classeSelo(proposta.grupo),
            texto: proposta.grupo || '—'
          }));
        } else if (col.chave === 'empreendimento') {
          td.appendChild(Util.el('span', {
            'class': 'celula-longa', texto: formatarCelula(proposta, col)
          }));
        } else {
          var conteudo = formatarCelula(proposta, col);
          td.textContent = conteudo;
          if (conteudo.length > 22) td.title = conteudo;
        }
        tr.appendChild(td);
      });

      Dica.ligar(tr, function () { return dicaProposta(proposta); });
      corpo.appendChild(tr);
    });
  }

  function dicaProposta(p) {
    var linhas = [
      ['Situação', p.situacao || '—'],
      ['Modalidade', p.tipo || '—'],
      ['Local', (p.municipio || '—') + ' / ' + (p.uf || '—')],
      ['Apoio', F.moeda(p.apoio)],
      ['Contratado', p.valorContratado ? F.moeda(p.valorContratado) : 'não contratado']
    ];
    if (p.apoio && p.valorContratado) {
      linhas.push(['Contratado / apoio', F.razao(p.valorContratado, p.apoio, 1)]);
    }
    if (p.portaria) linhas.push(['Portaria', F.resumirTexto(p.portaria, 44)]);

    return {
      titulo: F.resumirTexto(p.empreendimento, 90),
      linhas: linhas,
      nota: p.proponente || undefined
    };
  }

  function renderResumo(lista) {
    var container = document.getElementById('resumoCards');
    if (!container) return;
    container.innerHTML = '';

    var grupos = {};
    lista.forEach(function (p) {
      var g = grupos[p.grupo] || (grupos[p.grupo] =
        { grupo: p.grupo, quantidade: 0, apoio: 0, contratado: 0 });
      g.quantidade++; g.apoio += p.apoio; g.contratado += p.valorContratado;
    });

    var ordem = ['Contratados', 'A contratar', 'Habilitados', 'Desistências'];
    var acentos = { 'Contratados': 'contratado', 'A contratar': 'atencao',
                    'Habilitados': 'selecionado', 'Desistências': 'atencao' };

    ordem.filter(function (g) { return grupos[g]; }).forEach(function (nome) {
      var g = grupos[nome];
      var cartao = Util.el('div', {
        'class': 'indicador', 'data-acento': acentos[nome] || 'selecionado'
      }, [
        Util.el('div', { 'class': 'indicador__rotulo', texto: nome }),
        Util.el('div', { 'class': 'indicador__valor', texto: F.inteiro(g.quantidade) }),
        Util.el('div', { 'class': 'indicador__apoio',
          texto: (nome === 'Contratados' ? F.moedaCurta(g.contratado) + ' contratados'
                                         : F.moedaCurta(g.apoio) + ' em apoio') })
      ]);
      Dica.ligar(cartao, function () {
        return {
          titulo: nome,
          linhas: [['Propostas', F.inteiro(g.quantidade)],
                   ['Apoio', F.moeda(g.apoio)],
                   ['Contratado', F.moeda(g.contratado)]],
          nota: legendaDe(nome)
        };
      });
      container.appendChild(cartao);
    });
  }

  function legendaDe(grupo) {
    var itens = base.meta.legenda || [];
    for (var i = 0; i < itens.length; i++) {
      if (itens[i].grupo === grupo) return itens[i].descricao;
    }
    return undefined;
  }

  function renderPaginacao(total) {
    var container = document.getElementById('paginacao');
    container.innerHTML = '';
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    if (estado.pagina > paginas) estado.pagina = paginas;

    var inicio = total ? (estado.pagina - 1) * POR_PAGINA + 1 : 0;
    var fim = Math.min(estado.pagina * POR_PAGINA, total);

    container.appendChild(Util.el('span', {
      texto: 'Exibindo ' + F.inteiro(inicio) + '–' + F.inteiro(fim) +
             ' de ' + F.inteiro(total)
    }));

    var botoes = Util.el('div', { 'class': 'paginacao__botoes' });
    var irPara = function (n) {
      estado.pagina = n;
      render();
      document.getElementById('tabelaPropostas')
        .scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    var anterior = Util.el('button', { type: 'button', texto: '‹ Anterior' });
    anterior.disabled = estado.pagina === 1;
    anterior.addEventListener('click', function () { irPara(estado.pagina - 1); });
    botoes.appendChild(anterior);

    // Janela de páginas em torno da atual, com primeira e última sempre visíveis.
    var visiveis = new Set([1, paginas, estado.pagina,
      estado.pagina - 1, estado.pagina + 1]);
    var anteriorNumero = 0;
    Array.from(visiveis).filter(function (n) { return n >= 1 && n <= paginas; })
      .sort(function (a, b) { return a - b; })
      .forEach(function (n) {
        if (n - anteriorNumero > 1) {
          botoes.appendChild(Util.el('span', { texto: '…', style: 'padding:5px 4px' }));
        }
        var b = Util.el('button', { type: 'button', texto: String(n) });
        if (n === estado.pagina) b.setAttribute('aria-current', 'page');
        b.addEventListener('click', function () { irPara(n); });
        botoes.appendChild(b);
        anteriorNumero = n;
      });

    var proxima = Util.el('button', { type: 'button', texto: 'Próxima ›' });
    proxima.disabled = estado.pagina === paginas;
    proxima.addEventListener('click', function () { irPara(estado.pagina + 1); });
    botoes.appendChild(proxima);

    container.appendChild(botoes);
  }

  function renderRodapeTabela(lista) {
    var alvo = document.getElementById('contagemResultados');
    var apoio = Util.soma(lista, function (p) { return p.apoio; });
    var contratado = Util.soma(lista, function (p) { return p.valorContratado; });
    alvo.innerHTML = '<strong>' + F.inteiro(lista.length) + '</strong> de ' +
      F.inteiro(base.propostas.length) + ' propostas · apoio <strong>' +
      F.moedaCurta(apoio) + '</strong> · contratado <strong>' +
      F.moedaCurta(contratado) + '</strong>';
  }

  function render() {
    var lista = ordenar(filtrar());
    renderCabecalho();
    renderResumo(lista);
    renderCorpo(lista);
    renderPaginacao(lista.length);
    renderRodapeTabela(lista);
  }


  /* ======================================================================
     FILTRO POR COLUNA
     ====================================================================== */

  var painelAberto = null;

  function fecharFiltro() {
    if (painelAberto) { painelAberto.remove(); painelAberto = null; }
  }

  function abrirFiltro(col, ancora) {
    fecharFiltro();

    // Contagens calculadas sobre a lista já filtrada pelas OUTRAS colunas,
    // para que o usuário veja o efeito real de cada valor.
    var guardado = estado.filtros[col.chave];
    delete estado.filtros[col.chave];
    var contexto = filtrar();
    if (guardado) estado.filtros[col.chave] = guardado;

    var contagem = {};
    contexto.forEach(function (p) {
      var v = valorDe(p, col.chave);
      v = (v === null || v === undefined || v === '') ? '' : String(v);
      contagem[v] = (contagem[v] || 0) + 1;
    });

    var valores = Object.keys(contagem).sort(function (a, b) {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b, 'pt-BR', { numeric: true });
    });

    var marcados = new Set(estado.filtros[col.chave] || valores);

    var painel = Util.el('div', { 'class': 'painel-filtro', role: 'dialog',
                                  'aria-label': 'Filtrar por ' + col.titulo });
    var campoBusca = Util.el('input', { type: 'text',
                                        placeholder: 'Buscar valor…' });
    painel.appendChild(Util.el('div', { 'class': 'painel-filtro__busca' }, [campoBusca]));

    var acoes = Util.el('div', { 'class': 'painel-filtro__acoes' });
    var lista = Util.el('div', { 'class': 'painel-filtro__lista' });

    function pintar(texto) {
      var termo = Util.chaveBusca(texto || '');
      lista.innerHTML = '';
      var visiveis = valores.filter(function (v) {
        return !termo || Util.chaveBusca(v).indexOf(termo) >= 0;
      });
      if (!visiveis.length) {
        lista.appendChild(Util.el('div', {
          style: 'padding:12px;font-size:13px;color:var(--texto-suave)',
          texto: 'Nenhum valor corresponde à busca.'
        }));
        return;
      }
      visiveis.forEach(function (v) {
        var caixa = Util.el('input', { type: 'checkbox' });
        caixa.checked = marcados.has(v);
        caixa.addEventListener('change', function () {
          if (caixa.checked) marcados.add(v); else marcados.delete(v);
          aplicar();
        });
        lista.appendChild(Util.el('label', {}, [
          caixa,
          Util.el('span', { 'class': 'rotulo', texto: v === '' ? '(vazio)' : v }),
          Util.el('span', { 'class': 'contagem', texto: String(contagem[v]) })
        ]));
      });
    }

    function aplicar() {
      if (marcados.size === valores.length) delete estado.filtros[col.chave];
      else estado.filtros[col.chave] = marcados;
      estado.pagina = 1;
      render();
    }

    ['Selecionar todos', 'Limpar'].forEach(function (rotulo) {
      var b = Util.el('button', { type: 'button', texto: rotulo });
      b.addEventListener('click', function () {
        marcados = rotulo === 'Limpar' ? new Set() : new Set(valores);
        pintar(campoBusca.value);
        aplicar();
      });
      acoes.appendChild(b);
    });

    painel.appendChild(acoes);
    painel.appendChild(lista);
    pintar('');

    campoBusca.addEventListener('input', function () { pintar(campoBusca.value); });
    painel.addEventListener('click', function (e) { e.stopPropagation(); });

    document.body.appendChild(painel);
    var r = ancora.getBoundingClientRect();
    var esq = Math.min(r.left, window.innerWidth - 262);
    painel.style.left = Math.max(8, esq) + 'px';
    painel.style.top = Math.min(r.bottom + 6,
      window.innerHeight - painel.offsetHeight - 8) + 'px';

    painelAberto = painel;
    campoBusca.focus();
  }

  document.addEventListener('click', fecharFiltro);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') fecharFiltro();
  });
  window.addEventListener('resize', fecharFiltro);


  /* ======================================================================
     AÇÕES DA PÁGINA
     ====================================================================== */

  function ligarAcoes() {
    var busca = document.getElementById('buscaGlobal');
    busca.addEventListener('input', Util.debounce(function () {
      estado.busca = busca.value;
      estado.pagina = 1;
      render();
    }, 200));

    document.getElementById('btnLimpar').addEventListener('click', function () {
      estado.busca = '';
      estado.filtros = {};
      estado.ordem = { coluna: null, direcao: 'asc' };
      estado.pagina = 1;
      busca.value = '';
      render();
    });

    document.getElementById('btnCSV').addEventListener('click', function () {
      var lista = ordenar(filtrar());
      PG.Tabelas.exportarCSV(
        'radar-propostas.csv',
        colunas().map(function (c) { return c.titulo; }),
        lista.map(function (p) {
          return colunas().map(function (c) {
            var v = valorDe(p, c.chave);
            return c.tipo === 'moeda' ? (v || 0) : (v == null ? '' : v);
          });
        })
      );
    });

    var btnTema = document.getElementById('btnTema');
    var aplicarTema = function (tema) {
      document.documentElement.setAttribute('data-tema', tema);
      try { localStorage.setItem('painel-gmc-tema', tema); } catch (e) { /* ignora */ }
      btnTema.textContent = tema === 'escuro' ? '☀' : '☾';
    };
    var salvo = null;
    try { salvo = localStorage.getItem('painel-gmc-tema'); } catch (e) { /* ignora */ }
    aplicarTema(salvo || (window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro'));
    btnTema.addEventListener('click', function () {
      aplicarTema(document.documentElement.getAttribute('data-tema') === 'escuro'
        ? 'claro' : 'escuro');
    });
  }

  function renderLegenda() {
    var alvo = document.getElementById('legendaGrupos');
    if (!alvo) return;
    alvo.innerHTML = '';
    (base.meta.legenda || []).forEach(function (item) {
      alvo.appendChild(Util.el('div', { 'class': 'legenda__item' }, [
        Util.el('span', { 'class': 'selo ' + classeSelo(item.grupo),
                          texto: item.grupo }),
        Util.el('span', { texto: item.descricao })
      ]));
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    ligarAcoes();
    carregar().then(function () {
      var d = document.getElementById('dataAtualizacao');
      if (d) d.textContent = 'Base atualizada em ' +
        (base.meta.dataAtualizacao || '—');
      renderLegenda();
      render();
    }).catch(function (erro) {
      document.getElementById('corpoTabela').innerHTML =
        '<tr><td colspan="12"><div class="sem-resultado">' +
        '<strong>Não foi possível carregar a listagem</strong>' +
        'Rode gerar_propostas.py para gerar propostas.json.</div></td></tr>';
      console.error(erro);
    });
  });

})(window.PG);
