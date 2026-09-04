/* ============================================================================
   COMPONENTE / FUNIL — progressão das propostas entre etapas
   ----------------------------------------------------------------------------
   Etapas: Habilitadas -> Selecionadas -> Contratadas -> Em execução

   Proporcionalidade (implementada desde a v1):
     largura da barra = quantidade da etapa / quantidade da maior etapa
     com piso de 6% para que uma etapa pequena continue clicável e legível.

   A base do cálculo pode ser trocada entre "propostas" e "investimento" sem
   alterar a marcação: a função desenhar() recebe a métrica como parâmetro.
   O formato visual (barra horizontal) está isolado em desenharEtapa(); trocar
   por outro desenho no futuro afeta só essa função.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta, Dica = PG.Dica;

  var LARGURA_MINIMA = 6;   // % — evita barra invisível quando a etapa é pequena

  var Funil = {

    metrica: 'propostas',   // 'propostas' | 'valor'

    /**
     * @param {Element} container
     * @param {Object}  resultado  saída de PG.Dados.calcular()
     */
    renderizar: function (container, resultado, filtros) {
      if (!container) return;
      container.innerHTML = '';

      var etapas = resultado.funil.etapas;
      var metrica = Funil.metrica;
      var maior = Math.max.apply(null, etapas.map(function (e) {
        return metrica === 'valor' ? e.valor : e.quantidade;
      }).concat([1]));

      etapas.forEach(function (etapa, indice) {
        container.appendChild(
          desenharEtapa(etapa, indice, etapas, maior, metrica, resultado, filtros)
        );
      });

      // A animação só acontece se a largura for aplicada após o elemento entrar
      // no documento — daí o requestAnimationFrame.
      requestAnimationFrame(function () {
        Array.prototype.forEach.call(
          container.querySelectorAll('.funil__barra'),
          function (barra) { barra.style.width = barra.dataset.largura; }
        );
      });
    },

    definirMetrica: function (metrica) { Funil.metrica = metrica; }
  };


  function desenharEtapa(etapa, indice, etapas, maior, metrica, resultado, filtros) {
    var base = metrica === 'valor' ? etapa.valor : etapa.quantidade;
    var largura = Math.max(LARGURA_MINIMA, maior ? (base / maior) * 100 : 0);
    var cor = Paleta.etapa(etapa.chave);
    var estreita = largura < 26;

    var barra = Util.el('div', {
      'class': 'funil__barra',
      'data-largura': largura.toFixed(1) + '%',
      estilo: { background: cor }
    }, estreita ? [] : [
      Util.el('span', { 'class': 'funil__quantidade',
                        texto: F.inteiro(etapa.quantidade) }),
      Util.el('span', { 'class': 'funil__valor',
                        texto: F.moedaCurta(etapa.valor) }),
      etapa.conversao !== null
        ? Util.el('span', { 'class': 'funil__conversao',
                            texto: F.percentual(etapa.conversao, 0) + ' da etapa anterior' })
        : null
    ]);

    var trilho = Util.el('div', { 'class': 'funil__trilho' }, [barra]);

    // Quando a barra fica curta, os números vão para fora dela.
    if (estreita) {
      trilho.appendChild(Util.el('div', {
        'class': 'funil__fora',
        estilo: { left: largura + '%' },
        texto: F.inteiro(etapa.quantidade) + ' · ' + F.moedaCurta(etapa.valor)
      }));
    }

    var etapaEl = Util.el('div', { 'class': 'funil__etapa' }, [
      Util.el('div', { 'class': 'funil__rotulo' }, [
        Util.el('div', { 'class': 'funil__nome', texto: etapa.nome }),
        Util.el('div', { 'class': 'funil__descricao', texto: etapa.descricao })
      ]),
      trilho
    ]);

    Dica.ligar(trilho, function () {
      return montarDica(etapa, indice, etapas, resultado, filtros);
    });

    return etapaEl;
  }


  /* --- Conteúdo do tooltip -------------------------------------------------
     Estruturado em linhas rótulo/valor. Para enriquecer a dica no futuro
     (prazos, agentes, alertas), basta acrescentar linhas aqui.               */

  function montarDica(etapa, indice, etapas, resultado) {
    var linhas = [
      ['Propostas', F.inteiro(etapa.quantidade)],
      ['Valor', F.moeda(etapa.valor)]
    ];

    if (etapa.quantidade) {
      linhas.push(['Valor médio',
        F.moedaCurta(etapa.valor / etapa.quantidade)]);
    }
    if (etapa.conversao !== null) {
      linhas.push(['Conversão desde ' + etapas[indice - 1].nome.toLowerCase(),
        F.percentual(etapa.conversao, 1)]);
    }
    // Conversão acumulada tem as selecionadas como marco zero.
    if (indice > 1 && etapas[1].quantidade) {
      linhas.push(['Sobre as selecionadas',
        F.razao(etapa.quantidade, etapas[1].quantidade, 1)]);
    }

    var nota;
    if (etapa.chave === 'selecionada') {
      var c = resultado.funil.composicao;
      nota = 'Composição: ' + c.map(function (x) {
        return x.nome.toLowerCase() + ' ' + F.inteiro(x.quantidade);
      }).join(' · ') + '.';
    } else if (etapa.chave === 'habilitada') {
      nota = 'Propostas habilitadas que ainda não passaram pela seleção final.';
    } else if (etapa.chave === 'contratado') {
      nota = 'Inclui contratação parcial, em licitação e concluída.';
    } else {
      nota = 'Contratos com execução física iniciada, conforme a situação registrada na base.';
    }

    return { titulo: etapa.nome, linhas: linhas, nota: nota };
  }

  PG.Funil = Funil;

})(window.PG);
