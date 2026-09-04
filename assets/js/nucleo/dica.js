/* ============================================================================
   NÚCLEO / DICA — sistema único de tooltip
   ----------------------------------------------------------------------------
   Um só elemento flutuante serve a todos os componentes. Cada componente
   descreve o CONTEÚDO; o posicionamento, o atraso e a acessibilidade ficam
   aqui. Ampliar o conteúdo de uma dica no futuro não exige tocar no
   componente que a dispara.

   Uso:
       PG.Dica.ligar(elemento, function () {
         return { titulo: 'Metrô', linhas: [['Extensão', '77,2 km']],
                  nota: 'Inclui projetos e obras.' };
       });

   O conteúdo é uma função: assim a dica sempre reflete o estado atual dos
   filtros, sem precisar ser reconstruída a cada renderização.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var Util = PG.Util;
  var caixa = null;
  var alvoAtual = null;

  function garantirCaixa() {
    if (caixa) return caixa;
    caixa = Util.el('div', { 'class': 'dica', role: 'tooltip', 'aria-hidden': 'true' });
    document.body.appendChild(caixa);
    return caixa;
  }

  /** Monta o HTML a partir da estrutura declarativa devolvida pelo componente. */
  function montar(conteudo) {
    if (typeof conteudo === 'string') return conteudo;

    var html = '';
    if (conteudo.titulo) {
      html += '<div class="dica__titulo">' + Util.escapar(conteudo.titulo) + '</div>';
    }
    if (conteudo.linhas && conteudo.linhas.length) {
      html += '<dl>';
      conteudo.linhas.forEach(function (linha) {
        if (!linha) return;
        html += '<div class="dica__linha"><dt>' + Util.escapar(linha[0]) +
                '</dt><dd>' + Util.escapar(linha[1]) + '</dd></div>';
      });
      html += '</dl>';
    }
    if (conteudo.nota) {
      html += '<div class="dica__nota">' + Util.escapar(conteudo.nota) + '</div>';
    }
    return html;
  }

  /** Mantém a dica dentro da janela, com folga de 8px nas bordas. */
  function posicionar(x, y) {
    var r = caixa.getBoundingClientRect();
    var folga = 8;
    var esq = x + 14;
    var topo = y + 16;

    if (esq + r.width + folga > window.innerWidth) esq = x - r.width - 14;
    if (esq < folga) esq = folga;
    if (topo + r.height + folga > window.innerHeight) topo = y - r.height - 12;
    if (topo < folga) topo = folga;

    caixa.style.left = esq + 'px';
    caixa.style.top = topo + 'px';
  }

  var Dica = {

    mostrar: function (conteudo, x, y) {
      garantirCaixa();
      caixa.innerHTML = montar(conteudo);
      caixa.setAttribute('aria-hidden', 'false');
      caixa.classList.add('visivel');
      posicionar(x, y);
    },

    mover: function (x, y) {
      if (caixa && caixa.classList.contains('visivel')) posicionar(x, y);
    },

    esconder: function () {
      if (!caixa) return;
      caixa.classList.remove('visivel');
      caixa.setAttribute('aria-hidden', 'true');
      alvoAtual = null;
    },

    /**
     * Liga um elemento a um provedor de conteúdo.
     * @param {Element}  elemento
     * @param {Function} obterConteudo  devolve {titulo, linhas:[[rótulo, valor]], nota}
     */
    ligar: function (elemento, obterConteudo) {
      if (!elemento) return;

      elemento.addEventListener('mouseenter', function (ev) {
        alvoAtual = elemento;
        Dica.mostrar(obterConteudo(), ev.clientX, ev.clientY);
      });
      elemento.addEventListener('mousemove', function (ev) {
        if (alvoAtual === elemento) Dica.mover(ev.clientX, ev.clientY);
      });
      elemento.addEventListener('mouseleave', Dica.esconder);

      // Teclado: a mesma informação precisa estar disponível sem mouse.
      if (!elemento.hasAttribute('tabindex')) elemento.setAttribute('tabindex', '0');
      elemento.addEventListener('focus', function () {
        var r = elemento.getBoundingClientRect();
        alvoAtual = elemento;
        Dica.mostrar(obterConteudo(), r.left + r.width / 2, r.bottom - 8);
      });
      elemento.addEventListener('blur', Dica.esconder);
    },

    /** Formata o conteúdo padrão do Chart.js usando o mesmo vocabulário visual. */
    paraGrafico: function (titulo, linhas, nota) {
      return { titulo: titulo, linhas: linhas, nota: nota };
    }
  };

  document.addEventListener('scroll', Dica.esconder, true);
  window.addEventListener('resize', Dica.esconder);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') Dica.esconder();
  });

  PG.Dica = Dica;

})(window.PG);
