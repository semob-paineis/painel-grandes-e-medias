/* ============================================================================
   COMPONENTE / FUNIL — progressão das propostas entre etapas
   ----------------------------------------------------------------------------
   Etapas: Selecionadas -> Contratadas -> Em execução

   Proporcionalidade (implementada desde a v1):
     largura da barra = valor da etapa / valor da maior etapa
     com piso de 6% para que uma etapa pequena continue clicável e legível.

   A base do cálculo pode ser trocada entre "propostas" e "investimento" sem
   alterar a marcação: a função desenhar() recebe a métrica como parâmetro.
   Padrão do painel: comparação por valor financeiro (R$), não por contagem
   de propostas — etapas com poucas propostas de alto valor não devem
   aparecer como "pequenas" no funil.
   O formato visual (barra horizontal) está isolado em desenharEtapa(); trocar
   por outro desenho no futuro afeta só essa função.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Paleta = PG.Paleta, Dica = PG.Dica;

  var LARGURA_MINIMA = 6;   // % — evita barra invisível quando a etapa é pequena

  var Funil = {

    metrica: 'valor',   // 'propostas' | 'valor' — comparação sempre pelo valor financeiro

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
        ajustarAoEspaco(container);
      });
    },

    definirMetrica: function (metrica) { Funil.metrica = metrica; }
  };


  var LIMITE_COMPACTA = 26;  // % — abaixo disso, layout compacto (fonte menor), ainda dentro da barra
  var LIMITE_FORA = 12;      // % — abaixo disso, nem o layout compacto cabe: sai da barra

  /* --------------------------------------------------------------------
     O percentual acima é um palpite: 65% de uma tela de 1400px cabe o texto
     inteiro, 65% de um celular de 320px não cabe. Depois que o navegador
     calcula o layout, aqui se mede quantos PIXELS a barra terá de verdade e
     se rebaixa o nível quando o texto não couber — é o que evita o conteúdo
     cortado em telas estreitas, sem mexer no desktop (lá já cabe).
     -------------------------------------------------------------------- */
  function ajustarAoEspaco(container) {
    Array.prototype.forEach.call(container.querySelectorAll('.funil__trilho'), function (trilho) {
      var barra = trilho.querySelector('.funil__barra');
      if (!barra) return;
      var disponivel = trilho.clientWidth * (parseFloat(barra.dataset.largura) || 0) / 100;
      // scrollWidth dá a largura do conteúdo mesmo durante a animação, em que
      // a largura visível ainda está indo de 0% até o valor final.
      if (barra.scrollWidth <= disponivel) return;

      // 1º rebaixamento: fonte menor e percentual sem "da etapa anterior".
      if (!barra.classList.contains('funil__barra--compacta')) {
        barra.classList.add('funil__barra--compacta');
        var conversao = barra.querySelector('.funil__conversao');
        if (conversao && conversao.dataset.curto) conversao.textContent = conversao.dataset.curto;
      }
      if (barra.scrollWidth <= disponivel) return;

      // 2º rebaixamento: o texto sai da barra e fica ao lado dela.
      if (!trilho.dataset.fora) return;
      barra.innerHTML = '';
      barra.classList.remove('funil__barra--compacta');
      var fora = Util.el('div', { 'class': 'funil__fora', texto: trilho.dataset.fora });
      trilho.appendChild(fora);
      var limite = trilho.clientWidth - fora.offsetWidth - 8;
      fora.style.left = Math.max(0, Math.min(disponivel, limite)) + 'px';
    });
  }

  function desenharEtapa(etapa, indice, etapas, maior, metrica, resultado, filtros) {
    var base = metrica === 'valor' ? etapa.valor : etapa.quantidade;
    var largura = Math.max(LARGURA_MINIMA, maior ? (base / maior) * 100 : 0);
    var cor = Paleta.etapa(etapa.chave);
    // Três níveis: cheia (>= 26%), compacta (12–26%, mesmo conteúdo com fonte
    // menor, ainda dentro da barra) e fora (< 12%, não cabe nem compacto).
    var compacta = largura < LIMITE_COMPACTA;
    var fora = largura < LIMITE_FORA;

    var conteudoBarra = fora ? [] : [
      Util.el('span', { 'class': 'funil__quantidade',
                        texto: F.inteiro(etapa.quantidade) }),
      Util.el('span', { 'class': 'funil__valor',
                        texto: F.moedaCurta(etapa.valor) }),
      etapa.conversao !== null
        ? Util.el('span', {
            'class': 'funil__conversao',
            // Compacto: só o percentual, sem "da etapa anterior" — a frase
            // inteira não cabe nem no layout compacto. O texto curto fica
            // guardado para ajustarAoEspaco poder rebaixar depois da medição.
            'data-curto': F.percentual(etapa.conversao, 0),
            texto: compacta
              ? F.percentual(etapa.conversao, 0)
              : F.percentual(etapa.conversao, 0) + ' da etapa anterior'
          })
        : null
    ];

    var barra = Util.el('div', {
      'class': 'funil__barra' + (compacta && !fora ? ' funil__barra--compacta' : ''),
      'data-largura': largura.toFixed(1) + '%',
      estilo: { background: cor }
    }, conteudoBarra);

    var textoFora = F.inteiro(etapa.quantidade) + ' · ' + F.moedaCurta(etapa.valor);
    var trilho = Util.el('div', { 'class': 'funil__trilho', 'data-fora': textoFora }, [barra]);

    // Só nos casos extremos (< 12%) o texto sai para fora da barra.
    if (fora) {
      trilho.appendChild(Util.el('div', {
        'class': 'funil__fora',
        estilo: { left: largura + '%' },
        texto: textoFora
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
    // Conversão acumulada tem as selecionadas como marco zero, medida em valor.
    if (indice > 1 && etapas[1].valor) {
      linhas.push(['Sobre as selecionadas',
        F.razao(etapa.valor, etapas[1].valor, 1)]);
    }

    var nota;
    if (etapa.chave === 'selecionada') {
      var c = resultado.funil.composicao;
      nota = 'Composição: ' + c.map(function (x) {
        return x.nome.toLowerCase() + ' ' + F.inteiro(x.quantidade);
      }).join(' · ') + '.';
    } else if (etapa.chave === 'contratado') {
      nota = 'Inclui contratação parcial, em licitação e concluída.';
    } else {
      nota = 'Contratos com execução física iniciada, conforme a situação registrada na base.';
    }

    return { titulo: etapa.nome, linhas: linhas, nota: nota };
  }

  PG.Funil = Funil;

})(window.PG);
