/* ============================================================================
   COMPONENTE / MAPA — distribuição do investimento por UF
   ----------------------------------------------------------------------------
   Coroplético em SVG puro, sem dependência de biblioteca de mapas: a projeção
   e o caminho de cada UF são calculados aqui a partir do GeoJSON simplificado
   (assets/js/geo-uf.js). Isso mantém o painel funcionando offline e reduz o
   peso da página.

   Se o ativo geográfico não estiver presente, o bloco se anuncia e o painel
   segue funcionando — a mesma informação está na tabela de UFs.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta, Dica = PG.Dica;
  var NS = 'http://www.w3.org/2000/svg';

  /* --- Projeção -----------------------------------------------------------
     Equirretangular com correção de latitude: suficiente e estável para um
     mapa temático do Brasil, sem precisar de d3-geo.                        */

  function calcularProjecao(features, largura, altura) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    function visitar(coords) {
      if (typeof coords[0] === 'number') {
        var lon = coords[0], lat = coords[1];
        var y = -lat;
        if (lon < minX) minX = lon;
        if (lon > maxX) maxX = lon;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        return;
      }
      coords.forEach(visitar);
    }
    features.forEach(function (f) { visitar(f.geometry.coordinates); });

    var margem = 8;
    var escala = Math.min(
      (largura - margem * 2) / (maxX - minX),
      (altura - margem * 2) / (maxY - minY)
    );
    var deslocX = margem + (largura - margem * 2 - (maxX - minX) * escala) / 2;
    var deslocY = margem + (altura - margem * 2 - (maxY - minY) * escala) / 2;

    return function (lon, lat) {
      return [
        (lon - minX) * escala + deslocX,
        (-lat - minY) * escala + deslocY
      ];
    };
  }

  function caminhoDe(geometry, projetar) {
    var partes = geometry.type === 'Polygon'
      ? [geometry.coordinates] : geometry.coordinates;
    var d = '';
    partes.forEach(function (poligono) {
      poligono.forEach(function (anel) {
        anel.forEach(function (ponto, i) {
          var p = projetar(ponto[0], ponto[1]);
          d += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1);
        });
        d += 'Z';
      });
    });
    return d;
  }


  var Mapa = {

    renderizar: function (container, resultado, filtros) {
      if (!container) return;
      container.innerHTML = '';

      if (!window.GEO_UF) {
        container.appendChild(Util.el('div', {
          'class': 'sem-resultado',
          html: '<strong>Mapa indisponível</strong>' +
                'O arquivo assets/js/geo-uf.js não foi carregado. ' +
                'A distribuição por UF está na tabela abaixo.'
        }));
        return;
      }

      var porUF = {};
      resultado.ufs.forEach(function (u) { porUF[u.chave] = u; });
      var maior = resultado.ufs.length ? resultado.ufs[0].valor : 0;

      var largura = container.clientWidth || 900;
      var altura = container.clientHeight || 470;
      var features = window.GEO_UF.features;
      var projetar = calcularProjecao(features, largura, altura);

      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + largura + ' ' + altura);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label',
        'Mapa do investimento por unidade da federação');

      features.forEach(function (f) {
        var sigla = f.properties.sigla;
        var dado = porUF[sigla];
        var intensidade = maior && dado ? dado.valor / maior : 0;

        var caminho = document.createElementNS(NS, 'path');
        caminho.setAttribute('d', caminhoDe(f.geometry, projetar));
        caminho.setAttribute('class', 'mapa__uf');
        caminho.setAttribute('fill', dado && dado.valor > 0
          ? Paleta.escalaAzul(0.15 + intensidade * 0.85)
          : Paleta.variavel('--fundo-sutil'));
        caminho.setAttribute('data-uf', sigla);

        Dica.ligar(caminho, function () {
          return montarDica(sigla, f.properties.nome, dado, resultado, filtros);
        });
        svg.appendChild(caminho);
      });

      container.appendChild(svg);
    },

    /** Escala de cor exibida abaixo do mapa. */
    renderizarEscala: function (container, resultado) {
      if (!container) return;
      var maior = resultado.ufs.length ? resultado.ufs[0].valor : 0;
      var paradas = [0, .25, .5, .75, 1].map(function (t) {
        return Paleta.escalaAzul(0.15 + t * 0.85);
      });
      container.innerHTML = '';
      container.appendChild(Util.el('span', { texto: 'R$ 0' }));
      container.appendChild(Util.el('div', {
        'class': 'mapa__gradiente',
        estilo: { background: 'linear-gradient(90deg,' + paradas.join(',') + ')' }
      }));
      container.appendChild(Util.el('span', { texto: F.moedaCurta(maior) }));
    }
  };


  function montarDica(sigla, nome, dado, resultado, filtros) {
    if (!dado) {
      return {
        titulo: sigla + ' — ' + nome,
        linhas: [['Investimento', 'sem registro no recorte atual']],
        nota: 'Nenhuma proposta desta UF atende aos filtros selecionados.'
      };
    }

    var linhas = [
      ['Investimento', F.moeda(dado.valor)],
      ['Propostas', F.inteiro(dado.propostas)],
      ['Participação', F.percentual(dado.participacao, 1)]
    ];
    if (dado.km > 0) linhas.push(['Extensão', F.km(dado.km)]);
    if (dado.unidades > 0) linhas.push(['Unidades', F.inteiro(dado.unidades) + ' un.']);

    // Principais modos da UF — dá leitura qualitativa ao número.
    var modos = Util.agrupar(
      resultado.universo.filter(function (r) { return r.uf === sigla; }),
      function (r) { return r.modo || 'Não classificado'; },
      function (acc, r) { acc.valor += PG.Regras.valorDe(r, filtros.visao); },
      function (c) { return { chave: c, valor: 0 }; }
    );
    modos = Util.ordenarPor(modos, function (m) { return m.valor; }, true).slice(0, 3);

    return {
      titulo: sigla + ' — ' + nome,
      linhas: linhas,
      nota: modos.length
        ? 'Principais modos: ' + modos.map(function (m) { return m.chave; }).join(', ') + '.'
        : undefined
    };
  }

  PG.Mapa = Mapa;

})(window.PG);
