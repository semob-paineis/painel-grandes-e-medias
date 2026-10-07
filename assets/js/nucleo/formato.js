/* ============================================================================
   NÚCLEO / FORMATO — formatação de números, paleta e utilitários
   ----------------------------------------------------------------------------
   Sem módulos ES: o painel precisa abrir por duplo clique (file://), onde
   import/export é bloqueado. Tudo é pendurado no namespace único window.PG.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  /* --- Formatação de números ---------------------------------------------- */

  var fmtInteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var fmtDecimal = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1, maximumFractionDigits: 1
  });
  // Regras de casas decimais dos valores em bilhões (ver "VALORES EM R$").
  var BILHOES = {
    padrao:  { significativos: 3, minimo: 2, maximo: 4 },
    detalhe: { significativos: 4, minimo: 3, maximo: 5 }
  };

  /** "R$ 28,52 bi"; negativo como "-R$ 1,50 bi", à maneira brasileira. */
  function comPrefixo(v, regra) {
    var n = Number(v) || 0;
    return (n < 0 ? '-' : '') + 'R$ ' + emBilhoes(Math.abs(n), regra) + ' bi';
  }

  /** Número em bilhões (sem "R$" e sem "bi"), com as casas da regra. Um valor
   *  positivo pequeno demais para a casa máxima vira "< 0,0001": mostrar
   *  "0,0000" diria que é zero, e não é. */
  function emBilhoes(v, regra) {
    var n = (Number(v) || 0) / 1e9;
    var abs = Math.abs(n);
    if (abs === 0) {
      return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: regra.minimo,
        maximumFractionDigits: regra.minimo }).format(0);
    }
    var menor = Math.pow(10, -regra.maximo);
    if (abs < menor / 2) {
      return (n < 0 ? '-' : '') + '< ' + new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: regra.maximo, maximumFractionDigits: regra.maximo }).format(menor);
    }
    // Casas para mostrar N algarismos significativos: 28,5 tem 1 dígito antes
    // da vírgula; 0,0257 tem o primeiro significativo na 2ª casa.
    var ordem = Math.floor(Math.log10(abs));
    var casas = Math.min(regra.maximo,
      Math.max(regra.minimo, regra.significativos - 1 - ordem));
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n);
  }

  var Formato = {

    inteiro: function (v) {
      return fmtInteiro.format(Number(v) || 0);
    },

    decimal: function (v, casas) {
      return new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas == null ? 1 : casas,
        maximumFractionDigits: casas == null ? 1 : casas
      }).format(Number(v) || 0);
    },

    /* ----------------------------------------------------------------------
       VALORES EM R$ — UMA SÓ UNIDADE: BILHÕES
       Todo valor financeiro do painel, do Radar e do assistente sai em
       bilhões, para que qualquer número possa ser comparado a qualquer outro
       sem conversão de cabeça. Como a carteira vai de R$ 600 mil a R$ 7 bi,
       o número de casas decimais acompanha a grandeza: o bastante para não
       perder informação, sem sobrar zero à direita.
         padrão   (cartões, listas, tabelas): 3 algarismos significativos,
                   no mínimo 2 e no máximo 4 casas — 28,52 · 0,965 · 0,0257
         detalhe  (dicas ao passar o mouse e Radar): 4 algarismos,
                   no mínimo 3 e no máximo 5 casas — 28,523 · 0,9649
         eixo     (gráficos): só as casas necessárias — 2 · 0,5 · 0,25
       Para mudar a regra, mude só os números em BILHOES.
       ---------------------------------------------------------------------- */

    /** Valor por proposta/linha no detalhe: R$ 28,523 bi. */
    moeda: function (v) {
      // A casa a mais só aparece quando acrescenta informação: 1,519 sim,
      // mas 7,200 vira 7,20 e 0,02000 vira 0,0200.
      var detalhe = emBilhoes(Math.abs(Number(v) || 0), BILHOES.detalhe);
      var padrao = emBilhoes(Math.abs(Number(v) || 0), BILHOES.padrao);
      var comoNumero = function (t) { return parseFloat(t.replace(/\./g, '').replace(',', '.')); };
      var regra = (detalhe.indexOf('<') < 0 && comoNumero(detalhe) === comoNumero(padrao))
        ? BILHOES.padrao : BILHOES.detalhe;
      return comPrefixo(v, regra);
    },

    /** Valor de cartões, listas e textos: R$ 28,52 bi. */
    moedaCurta: function (v) { return comPrefixo(v, BILHOES.padrao); },

    /** O mesmo valor sem o "R$" — quando o rótulo da coluna já diz. */
    numeroCurto: function (v) {
      return emBilhoes(v, BILHOES.padrao) + ' bi';
    },

    /** Marcas do eixo dos gráficos: 0 · 0,5 · 2 bi (sem zeros à direita). */
    eixoBilhoes: function (v) {
      var n = (Number(v) || 0) / 1e9;
      return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n) + ' bi';
    },

    km: function (v) {
      var n = Number(v) || 0;
      return (n >= 100 ? fmtInteiro.format(n) : fmtDecimal.format(n)) + ' km';
    },

    /** Percentual a partir de fração (0,4655 -> 46,6%). */
    percentual: function (fracao, casas) {
      var n = (Number(fracao) || 0) * 100;
      return Formato.decimal(n, casas == null ? 1 : casas) + '%';
    },

    /** Percentual a partir de razão entre dois números, protegendo divisão por zero. */
    razao: function (parte, total, casas) {
      if (!total) return '—';
      return Formato.percentual(parte / total, casas);
    },

    data: function (iso) {
      if (!iso) return '—';
      var p = String(iso).split('-');
      return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
    },

    /** Corta texto longo preservando palavra. */
    resumirTexto: function (texto, limite) {
      if (!texto) return '—';
      if (texto.length <= limite) return texto;
      return texto.slice(0, texto.lastIndexOf(' ', limite)) + '…';
    }
  };


  /* --- Paleta -------------------------------------------------------------
     As cores vivem no CSS (tokens.css). Aqui só lemos as variáveis, para que
     trocar a identidade visual continue sendo uma alteração de CSS.          */

  var CORES_MODO = {
    'Metrô':                       '--modo-metro',
    'Trens':                       '--modo-trens',
    'VLTs':                        '--modo-vlt',
    'BRTs':                        '--modo-brt',
    'Corredores de Ônibus':        '--modo-corredor',
    'Terminais':                   '--modo-terminais',
    'Sistemas':                    '--modo-sistemas',
    'OAE (Obra de Arte Especial)': '--modo-oae',
    'Ciclovias':                   '--modo-ciclovias',
    'Abrigos':                     '--modo-abrigos',
    'Planos de Mobilidade Urbana': '--modo-planos',
    'Aeromóvel':                   '--modo-aeromovel',
    'Sistema Viário':              '--modo-corredor',
    // Tipologias do empreendimento (aba Investimento e filtro)
    'Metrô e trens':               '--modo-metro',
    'VLT':                         '--modo-vlt',
    'BRT e corredores de ônibus':  '--modo-brt',
    'Sistema viário e OAE':        '--modo-oae',
    'Mobilidade ativa':            '--modo-ciclovias',
    'Terminais e sistemas':        '--modo-terminais',
    'Estudos e projetos':          '--modo-planos'
  };

  var CORES_ETAPA = {
    selecionada:  '--etapa-selecionada',
    contratado:   '--etapa-contratada',
    aContratar:   '--etapa-preparacao',
    desistencia:  '--etapa-desistencia',
    execucao:     '--etapa-execucao'
  };

  var Paleta = {
    /** Lê uma variável CSS do :root já resolvida (respeita o tema ativo). */
    variavel: function (nome) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(nome).trim();
    },
    modo: function (nome) {
      return Paleta.variavel(CORES_MODO[nome] || '--modo-outros');
    },
    etapa: function (chave) {
      return Paleta.variavel(CORES_ETAPA[chave] || '--gov-azul');
    },
    /** Sequência estável para categorias sem cor própria (fonte, agente...). */
    sequencia: function (indice) {
      var seq = ['--gov-azul', '--modo-vlt', '--modo-trens', '--modo-corredor',
                 '--modo-brt', '--modo-terminais', '--modo-sistemas', '--modo-oae'];
      return Paleta.variavel(seq[indice % seq.length]);
    },
    /** Interpola do claro ao azul institucional — usada no mapa coroplético. */
    escalaAzul: function (t) {
      t = Math.max(0, Math.min(1, t || 0));
      var c0 = [226, 234, 246], c1 = [7, 40, 92];
      var c = c0.map(function (v, i) { return Math.round(v + (c1[i] - v) * t); });
      return 'rgb(' + c.join(',') + ')';
    }
  };


  /* --- Utilitários gerais -------------------------------------------------- */

  var Util = {

    /** Agrupa uma lista por chave e soma métricas. */
    agrupar: function (lista, obterChave, acumular, inicial) {
      var mapa = new Map();
      lista.forEach(function (item) {
        var chave = obterChave(item);
        if (chave === null || chave === undefined || chave === '') return;
        if (!mapa.has(chave)) mapa.set(chave, inicial(chave));
        acumular(mapa.get(chave), item);
      });
      return Array.from(mapa.values());
    },

    soma: function (lista, obter) {
      return lista.reduce(function (t, x) { return t + (obter(x) || 0); }, 0);
    },

    unicos: function (lista, obter) {
      var s = new Set();
      lista.forEach(function (x) { var v = obter(x); if (v) s.add(v); });
      return Array.from(s);
    },

    ordenarPor: function (lista, obter, desc) {
      return lista.slice().sort(function (a, b) {
        var va = obter(a), vb = obter(b);
        if (typeof va === 'string' || typeof vb === 'string') {
          return String(va).localeCompare(String(vb), 'pt-BR') * (desc ? -1 : 1);
        }
        return (desc ? vb - va : va - vb);
      });
    },

    /** Remove acento e caixa — usado nas buscas textuais. */
    chaveBusca: function (texto) {
      return String(texto == null ? '' : texto)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    },

    debounce: function (fn, espera) {
      var t;
      return function () {
        var ctx = this, args = arguments;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, espera);
      };
    },

    /** Cria elemento com atributos e filhos em uma chamada. */
    el: function (tag, atributos, filhos) {
      var n = document.createElement(tag);
      Object.keys(atributos || {}).forEach(function (k) {
        if (k === 'texto') n.textContent = atributos[k];
        else if (k === 'html') n.innerHTML = atributos[k];
        else if (k === 'estilo') Object.assign(n.style, atributos[k]);
        else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), atributos[k]);
        else if (atributos[k] !== null && atributos[k] !== undefined) {
          n.setAttribute(k, atributos[k]);
        }
      });
      (filhos || []).forEach(function (f) {
        if (f) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
      });
      return n;
    },

    /** Escapa texto vindo da base antes de injetar como HTML. */
    escapar: function (texto) {
      return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    baixarArquivo: function (conteudo, nome, tipo) {
      var blob = conteudo instanceof Blob
        ? conteudo : new Blob([conteudo], { type: tipo || 'text/plain;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = nome;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
  };

  PG.Formato = Formato;
  PG.Paleta = Paleta;
  PG.Util = Util;
  PG.CORES_MODO = CORES_MODO;

})(window.PG);
