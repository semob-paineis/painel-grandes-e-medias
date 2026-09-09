/* ============================================================================
   NÚCLEO / DADOS — carregamento, estado e agregações
   ----------------------------------------------------------------------------
   Fluxo:
       dados.json (ou dados-embutido.js)
            |
       Dados.carregar()            -> base bruta em memória
            |
       Estado (filtros)  --muda--> notifica assinantes
            |
       Dados.calcular()            -> recorte + todas as agregações
            |
       componentes renderizam

   Nenhum componente lê a base diretamente: todos recebem o resultado de
   calcular(). Assim, um filtro novo se propaga a todos sem alterar componente.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var Util = PG.Util;

  /* ======================================================================
     1. CARREGAMENTO
     ====================================================================== */

  var Dados = {
    meta: null,
    registros: [],

    /**
     * Estratégia em três camadas, nesta ordem:
     *   1. fetch('dados.json')          — servidor HTTP, sempre a base corrente
     *   2. window.DADOS_PAINEL          — arquivo embutido, permite file://
     *   3. base mínima de demonstração  — evita tela em branco, marcada como MOCK
     */
    carregar: function (caminho) {
      var pacote = null;
      return fetch(caminho || 'dados.json', { cache: 'no-store' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .catch(function () {
          if (window.DADOS_PAINEL) return window.DADOS_PAINEL;
          return Dados.baseDemonstracao();
        })
        .then(function (p) {
          pacote = p;
          Dados.meta = pacote.meta || {};
          Dados.registros = pacote.registros || [];
          return Dados;
        });
    },

    /* --- Base mínima de demonstração ------------------------------------
       MOCK. Só entra em cena se dados.json e dados-embutido.js falharem.
       Não representa nenhuma proposta real e sai marcada com mock: true. */
    baseDemonstracao: function () {
      var modos = ['Metrô', 'VLTs', 'Trens', 'BRTs', 'Corredores de Ônibus', 'Terminais'];
      var ufs = [['SP', 'Sudeste'], ['BA', 'Nordeste'], ['DF', 'Centro-Oeste'],
                 ['PR', 'Sul'], ['PA', 'Norte']];
      var etapas = ['contratado', 'contratado', 'aContratar', 'habilitada', 'desistencia'];
      var registros = [];
      for (var i = 0; i < 40; i++) {
        var uf = ufs[i % ufs.length], modo = modos[i % modos.length];
        var etapa = etapas[i % etapas.length];
        var apoio = 40e6 + (i * 37e6) % 900e6;
        registros.push({
          id: i, tipo: 'Grandes e Médias', uf: uf[0], regiao: uf[1],
          municipio: 'Município ' + (i + 1), proponente: 'Proponente ' + (i + 1),
          empreendimento: '[DEMONSTRAÇÃO] Intervenção de ' + modo,
          modo: modo, categoria: 'Obras', fonte: i % 2 ? 'OGU' : 'FIN',
          agente: i % 3 ? 'CAIXA' : 'BNDES', situacao: 'Demonstração',
          etapa: etapa, apoio: apoio,
          valorContratado: etapa === 'contratado' ? apoio * 0.8 : 0,
          km: i % 2 ? (i % 17) + 1 : 0, unidades: i % 2 ? 0 : (i % 9) + 1,
          anoPortaria: 2023 + (i % 4), rotuloAno: String(2023 + (i % 4)),
          noEscopo: true, alertas: []
        });
      }
      return {
        meta: {
          mock: true, dataAtualizacao: '—', origem: 'base de demonstração',
          escopo: { tiposNoEscopo: ['Grandes e Médias'] },
          opcoes: {
            cenarios: ['Consolidado', 'Grandes e Médias'],
            anos: ['2023', '2024', '2025', '2026'],
            regioes: ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'],
            modos: modos
          },
          qualidade: { registrosComAlerta: 0, porTipo: {} },
          dicionarioAlertas: {},
          textos: {
            tituloPainel: 'Painel de Monitoramento — Grandes e Médias Cidades',
            programa: 'Novo PAC · Mobilidade Urbana Sustentável',
            subtitulo: 'Base de demonstração',
            orgao: 'Secretaria Nacional de Mobilidade — SEMOB',
            resumo: ['Base de demonstração carregada porque dados.json não foi ' +
                     'encontrado. Rode gerar_dados.py para gerar a base real.'],
            fonte: '', aviso: ''
          }
        },
        registros: registros
      };
    }
  };


  /* ======================================================================
     2. ESTADO DOS FILTROS
     ====================================================================== */

  var Estado = {
    valores: {
      cenario: 'Consolidado',   // Consolidado | Grandes e Médias | Governadores | ...
      visao: 'contratado',      // contratado | selecionado
      ano: 'todos',
      regiao: 'todas',
      modo: 'todos',
      metricaInfra: 'km'        // km | unidades | valor (componente de infraestrutura)
    },

    assinantes: [],

    /** Registra função chamada a cada mudança de filtro. */
    aoMudar: function (fn) { Estado.assinantes.push(fn); },

    definir: function (chave, valor) {
      if (Estado.valores[chave] === valor) return;
      Estado.valores[chave] = valor;
      Estado.notificar();
    },

    notificar: function () {
      var resultado = Dados.calcular(Estado.valores);
      Estado.assinantes.forEach(function (fn) { fn(resultado, Estado.valores); });
    },

    limpar: function () {
      Estado.valores.ano = 'todos';
      Estado.valores.regiao = 'todas';
      Estado.valores.modo = 'todos';
      Estado.notificar();
    }
  };


  /* ======================================================================
     3. REGRAS DE RECORTE
     ====================================================================== */

  // Etapas que formam o universo "selecionado" (carteira viva + baixas).
  var ETAPAS_SELECIONADAS = ['contratado', 'aContratar', 'desistencia'];

  var Regras = {

    /** Aplica cenário + filtros globais. Não aplica a visão (contratado/selecionado). */
    recortar: function (registros, f) {
      return registros.filter(function (r) {
        if (!r.noEscopo) return false;
        if (f.cenario !== 'Consolidado' && r.tipo !== f.cenario) return false;
        if (f.ano !== 'todos' && r.rotuloAno !== f.ano) return false;
        if (f.regiao !== 'todas' && r.regiao !== f.regiao) return false;
        // Usa a mesma chave de porModo(): "Estudos e Projetos" é filtrado
        // pela categoria, não pelo modo literal do registro (ver seção 4).
        if (f.modo !== 'todos' && chaveModoOuCategoria(r) !== f.modo) return false;
        return true;
      });
    },

    contratados: function (lista) {
      return lista.filter(function (r) { return r.etapa === 'contratado'; });
    },

    selecionados: function (lista) {
      return lista.filter(function (r) {
        return ETAPAS_SELECIONADAS.indexOf(r.etapa) >= 0;
      });
    },

    /** Valor que representa cada registro conforme a visão escolhida. */
    /** Valor que representa cada registro conforme a visão escolhida.
     *  Exceção: para "Migrado Novo PAC", o valor de apoio original das
     *  propostas legadas está desatualizado/nulo em parte dos registros
     *  antigos — a própria planilha-fonte (aba "Dados para Painel", tabela
     *  "Evolução de Seleções por Ano") usa o Valor Contratado como o valor
     *  de "selecionado" para esse tipo. Reproduzimos a mesma regra aqui,
     *  no ponto único de cálculo, para que todo o painel fique consistente
     *  com a conferência da planilha. */
    valorDe: function (registro, visao) {
      if (visao === 'selecionado') {
        return registro.tipo === 'Migrado Novo PAC'
          ? registro.valorContratado
          : registro.apoio;
      }
      return registro.valorContratado;
    },

    /** Universo de registros conforme a visão escolhida. */
    universo: function (lista, visao) {
      return visao === 'selecionado'
        ? Regras.selecionados(lista) : Regras.contratados(lista);
    }
  };


  /* ======================================================================
     4. AGREGAÇÕES
     ====================================================================== */

  function totalizar(lista, visao) {
    return {
      propostas: lista.length,
      valor: Util.soma(lista, function (r) { return Regras.valorDe(r, visao); }),
      km: Util.soma(lista, function (r) { return r.km; }),
      unidades: Util.soma(lista, function (r) { return r.unidades; }),
      municipios: Util.unicos(lista, function (r) { return r.uf + '|' + r.municipio; }).length,
      ufs: Util.unicos(lista, function (r) { return r.uf; }).length
    };
  }

  /** Agregação genérica por dimensão. Usada por região, ano, UF, modo, fonte... */
  function porDimensao(lista, visao, obterChave) {
    var linhas = Util.agrupar(
      lista,
      obterChave,
      function (acc, r) {
        acc.propostas += 1;
        acc.valor += Regras.valorDe(r, visao);
        acc.km += r.km;
        acc.unidades += r.unidades;
      },
      function (chave) {
        return { chave: chave, propostas: 0, valor: 0, km: 0, unidades: 0 };
      }
    );
    var total = Util.soma(linhas, function (l) { return l.valor; });
    linhas.forEach(function (l) { l.participacao = total ? l.valor / total : 0; });
    return linhas;
  }

  /** Etapas do funil, com quantidade, valor e conversão em relação à anterior. */
  function montarFunil(recorte) {
    var selecionados = Regras.selecionados(recorte);
    var contratados = Regras.contratados(recorte);
    var emExecucao = contratados.filter(function (r) {
      return r.execucao && /execu|andamento|conclu/i.test(r.execucao);
    });

    var etapas = [
      {
        chave: 'selecionada', nome: 'Selecionadas',
        descricao: 'Aprovadas e com recurso reservado',
        quantidade: selecionados.length,
        // Mesma regra de Regras.valorDe('selecionado'): Migrado Novo PAC
        // usa valorContratado, os demais usam apoio.
        valor: Util.soma(selecionados, function (r) { return Regras.valorDe(r, 'selecionado'); })
      },
      {
        chave: 'contratado', nome: 'Contratadas',
        descricao: 'Contrato assinado com o agente financeiro',
        quantidade: contratados.length,
        valor: Util.soma(contratados, function (r) { return r.valorContratado; })
      },
      {
        chave: 'execucao', nome: 'Em execução',
        descricao: 'Obra ou fornecimento em andamento',
        quantidade: emExecucao.length,
        valor: Util.soma(emExecucao, function (r) { return r.valorContratado; })
      }
    ];

    // Conversão em relação à etapa anterior, medida em valor financeiro (R$).
    // A primeira etapa (Selecionadas) é o marco zero do funil e não tem conversão.
    etapas.forEach(function (e, i) {
      if (i === 0) { e.conversao = null; return; }
      var anterior = etapas[i - 1].valor;
      e.conversao = anterior ? e.valor / anterior : 0;
    });

    // Composição da carteira selecionada — usada no detalhe do funil.
    var contarEtapa = function (chave) {
      return recorte.filter(function (r) { return r.etapa === chave; });
    };
    var aContratar = contarEtapa('aContratar');
    var desistencia = contarEtapa('desistencia');

    return {
      etapas: etapas,
      composicao: [
        { chave: 'contratado', nome: 'Contratadas', quantidade: contratados.length,
          valor: Util.soma(contratados, function (r) { return r.valorContratado; }) },
        { chave: 'aContratar', nome: 'A contratar', quantidade: aContratar.length,
          valor: Util.soma(aContratar, function (r) { return Regras.valorDe(r, 'selecionado'); }) },
        { chave: 'desistencia', nome: 'Desistências', quantidade: desistencia.length,
          valor: Util.soma(desistencia, function (r) { return Regras.valorDe(r, 'selecionado'); }) }
      ]
    };
  }

  /** Infraestrutura por modo — componente central do painel. */
  // "Estudos e Projetos" é uma categoria (natureza do gasto), não um modo de
  // transporte — mas um registro de estudo/projeto ainda carrega um modo
  // (ex.: um projeto de VLT tem modo="VLTs"). Se agrupássemos só por modo,
  // esse valor entraria misturado com obra física do mesmo modo, inflando
  // "o que o investimento entrega" com dinheiro que ainda não virou km nem
  // unidade nenhuma. Por isso esses registros ganham um item próprio aqui,
  // à parte do modo a que se referem — a mesma separação que "Natureza do
  // apoio" já faz, só que também no componente por modo e no filtro.
  var CATEGORIA_ESTUDOS_PROJETOS = 'Estudos e Projetos';

  function chaveModoOuCategoria(r) {
    if (r.categoria === CATEGORIA_ESTUDOS_PROJETOS) {
      return CATEGORIA_ESTUDOS_PROJETOS;
    }
    return r.modo || 'Não classificado';
  }

  function porModo(lista, visao) {
    var linhas = porDimensao(lista, visao, chaveModoOuCategoria);
    linhas.forEach(function (l) {
      l.temExtensao = l.km > 0;
      l.temUnidades = l.unidades > 0;
    });
    return Util.ordenarPor(linhas, function (l) { return l.valor; }, true);
  }

  /** Ordena anos com "Anterior a 2023" sempre na frente. */
  function ordenarAnos(linhas) {
    return linhas.slice().sort(function (a, b) {
      var na = parseInt(a.chave, 10), nb = parseInt(b.chave, 10);
      if (isNaN(na)) return -1;
      if (isNaN(nb)) return 1;
      return na - nb;
    });
  }

  var ORDEM_REGIOES = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

  /**
   * Ponto único de cálculo. Recebe os filtros e devolve tudo que a tela precisa.
   * Para acrescentar um indicador novo, some um campo aqui — os componentes
   * continuam recebendo o mesmo objeto.
   */
  Dados.calcular = function (f) {
    var recorte = Regras.recortar(Dados.registros, f);
    var universo = Regras.universo(recorte, f.visao);

    var regioes = porDimensao(universo, f.visao, function (r) { return r.regiao; });
    regioes.sort(function (a, b) {
      return ORDEM_REGIOES.indexOf(a.chave) - ORDEM_REGIOES.indexOf(b.chave);
    });

    return {
      filtros: f,
      recorte: recorte,
      universo: universo,

      totais: totalizar(universo, f.visao),
      totaisContratado: totalizar(Regras.contratados(recorte), 'contratado'),
      totaisSelecionado: totalizar(Regras.selecionados(recorte), 'selecionado'),

      funil: montarFunil(recorte),
      modos: porModo(universo, f.visao),
      regioes: regioes,
      anos: ordenarAnos(porDimensao(universo, f.visao, function (r) { return r.rotuloAno; })),
      ufs: Util.ordenarPor(
        porDimensao(universo, f.visao, function (r) { return r.uf; }),
        function (l) { return l.valor; }, true),
      fontes: porDimensao(universo, f.visao, function (r) {
        return r.fonte === 'OGU' ? 'OGU' : 'Financiamento';
      }),
      agentes: Util.ordenarPor(
        porDimensao(universo, f.visao, function (r) {
          var a = (r.agente || 'Não informado').toUpperCase();
          if (a.indexOf('CAIXA') >= 0) return 'CAIXA';
          if (a.indexOf('BNDES') >= 0) return 'BNDES';
          if (a.indexOf('BRDE') >= 0 || a.indexOf('BDRE') >= 0) return 'BRDE';
          return 'Outros';
        }),
        function (l) { return l.valor; }, true),
      categorias: Util.ordenarPor(
        porDimensao(universo, f.visao, function (r) { return r.categoria; }),
        function (l) { return l.valor; }, true),

      alertas: recorte.filter(function (r) { return r.alertas && r.alertas.length; })
    };
  };

  PG.Dados = Dados;
  PG.Estado = Estado;
  PG.Regras = Regras;

})(window.PG);
