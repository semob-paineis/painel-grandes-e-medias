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
  var fmtMoeda = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 2
  });

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

    /** Valor cheio: R$ 1.234.567,89 — para tooltips e tabelas. */
    moeda: function (v) {
      return fmtMoeda.format(Number(v) || 0);
    },

    /** Valor abreviado: R$ 18,1 bi — para cartões e eixos de gráfico. */
    moedaCurta: function (v) {
      var n = Number(v) || 0;
      var sinal = n < 0 ? '-' : '';
      n = Math.abs(n);
      if (n >= 1e9) return sinal + 'R$ ' + fmtDecimal.format(n / 1e9) + ' bi';
      if (n >= 1e6) return sinal + 'R$ ' + fmtDecimal.format(n / 1e6) + ' mi';
      if (n >= 1e3) return sinal + 'R$ ' + fmtInteiro.format(n / 1e3) + ' mil';
      return sinal + fmtMoeda.format(n);
    },

    /** Apenas o número abreviado, sem o prefixo — usado quando o rótulo já diz. */
    numeroCurto: function (v) {
      var n = Number(v) || 0;
      if (n >= 1e9) return fmtDecimal.format(n / 1e9) + ' bi';
      if (n >= 1e6) return fmtDecimal.format(n / 1e6) + ' mi';
      if (n >= 1e3) return fmtInteiro.format(n / 1e3) + ' mil';
      return fmtInteiro.format(n);
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
    'Aeromóvel':                   '--modo-aeromovel'
  };

  var CORES_ETAPA = {
    habilitada:   '--etapa-habilitada',
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
