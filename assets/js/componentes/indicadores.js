/* ============================================================================
   COMPONENTE / INDICADORES — cartões do topo do painel
   ----------------------------------------------------------------------------
   Os cartões são declarados em uma lista de definições. Incluir, remover ou
   reordenar indicador é mexer em CARTOES, não no HTML nem na renderização.

   Cada definição:
     chave     identificador estável
     rotulo    texto curto acima do número
     acento    cor da borda esquerda (ver tokens.css)
     valor     (r, f) -> string principal
     unidade   (opcional) sufixo menor ao lado do número
     apoio     (r, f) -> linha de contexto abaixo
     dica      (r, f) -> conteúdo do tooltip
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util, Dica = PG.Dica;

  function rotuloVisao(f) {
    return f.visao === 'selecionado' ? 'selecionado' : 'contratado';
  }

  var CARTOES = [
    {
      chave: 'investimento',
      acento: 'contratado',
      rotulo: function (r, f) {
        return f.visao === 'selecionado' ? 'Investimento selecionado'
                                         : 'Investimento contratado';
      },
      valor: function (r) { return F.moedaCurta(r.totais.valor); },
      apoio: function (r) {
        return F.inteiro(r.totais.propostas) + ' propostas';
      },
      dica: function (r, f) {
        return {
          titulo: 'Investimento ' + rotuloVisao(f),
          linhas: [
            ['Valor', F.moeda(r.totais.valor)],
            ['Propostas', F.inteiro(r.totais.propostas)],
            ['Ticket médio', F.moedaCurta(
              r.totais.propostas ? r.totais.valor / r.totais.propostas : 0)]
          ],
          nota: f.visao === 'selecionado'
            ? 'Soma do apoio das propostas selecionadas, incluindo as ainda não contratadas.'
            : 'Soma do valor efetivamente contratado com os agentes financeiros.'
        };
      }
    },
    {
      chave: 'conversao',
      acento: 'selecionado',
      rotulo: function () { return 'Conversão em contratação'; },
      valor: function (r) {
        return F.razao(r.totaisContratado.valor, r.totaisSelecionado.valor, 1);
      },
      apoio: function (r) {
        return F.inteiro(r.totaisContratado.propostas) + ' de ' +
               F.inteiro(r.totaisSelecionado.propostas) + ' propostas';
      },
      dica: function (r) {
        return {
          titulo: 'Conversão em contratação',
          linhas: [
            ['Selecionado', F.moedaCurta(r.totaisSelecionado.valor)],
            ['Contratado', F.moedaCurta(r.totaisContratado.valor)],
            ['A converter', F.moedaCurta(
              r.totaisSelecionado.valor - r.totaisContratado.valor)],
            ['Propostas convertidas', F.razao(
              r.totaisContratado.propostas, r.totaisSelecionado.propostas, 1)]
          ],
          nota: 'Percentual do valor selecionado que já virou contrato assinado.'
        };
      }
    },
    {
      chave: 'extensao',
      acento: 'infra',
      rotulo: function () { return 'Extensão de sistemas'; },
      valor: function (r) { return F.decimal(r.totais.km, 1); },
      unidade: 'km',
      apoio: function (r) {
        var trilhos = r.modos.filter(function (m) {
          return ['Metrô', 'VLTs', 'Trens'].indexOf(m.chave) >= 0;
        });
        var km = Util.soma(trilhos, function (m) { return m.km; });
        return F.decimal(km, 1) + ' km sobre trilhos';
      },
      dica: function (r, f) {
        var linhas = r.modos
          .filter(function (m) { return m.km > 0; })
          .slice(0, 6)
          .map(function (m) { return [m.chave, F.km(m.km)]; });
        return {
          titulo: 'Extensão por modo',
          linhas: linhas,
          nota: 'Quilômetros de via em propostas ' + rotuloVisao(f) + 's. ' +
                'Inclui implantação, expansão e requalificação.'
        };
      }
    },
    {
      chave: 'unidades',
      acento: 'rodante',
      rotulo: function () { return 'Material rodante e equipamentos'; },
      valor: function (r) { return F.inteiro(r.totais.unidades); },
      unidade: 'un.',
      apoio: function (r) {
        var m = r.modos.filter(function (x) { return x.unidades > 0; });
        m = Util.ordenarPor(m, function (x) { return x.unidades; }, true);
        return m.length
          ? 'Maior volume em ' + m[0].chave + ' (' + F.inteiro(m[0].unidades) + ' un.)'
          : 'Sem unidades registradas no recorte';
      },
      dica: function (r) {
        var linhas = Util.ordenarPor(
          r.modos.filter(function (m) { return m.unidades > 0; }),
          function (m) { return m.unidades; }, true
        ).slice(0, 6).map(function (m) {
          return [m.chave, F.inteiro(m.unidades) + ' un.'];
        });
        return {
          titulo: 'Unidades por modo',
          linhas: linhas,
          nota: 'Trens, veículos, terminais, abrigos e sistemas contratados por ' +
                'unidade, e não por extensão.'
        };
      }
    },
    {
      chave: 'alcance',
      acento: 'alcance',
      rotulo: function () { return 'Alcance territorial'; },
      valor: function (r) { return F.inteiro(r.totais.municipios); },
      unidade: 'municípios',
      apoio: function (r) {
        return F.inteiro(r.totais.ufs) + ' unidades da federação';
      },
      dica: function (r) {
        var top = r.ufs.slice(0, 5).map(function (u) {
          return [u.chave, F.moedaCurta(u.valor)];
        });
        return {
          titulo: 'Alcance territorial',
          linhas: [['Municípios', F.inteiro(r.totais.municipios)],
                   ['UFs', F.inteiro(r.totais.ufs)]].concat(top),
          nota: 'Municípios distintos citados como município principal da proposta.'
        };
      }
    }
  ];


  var Indicadores = {

    /** Desenha ou atualiza os cartões dentro do container informado. */
    renderizar: function (container, resultado, filtros) {
      if (!container) return;
      container.innerHTML = '';

      CARTOES.forEach(function (def) {
        var valor = def.valor(resultado, filtros);
        var cartao = Util.el('div', {
          'class': 'indicador',
          'data-acento': def.acento,
          'data-cartao': def.chave
        }, [
          Util.el('div', { 'class': 'indicador__rotulo',
                           texto: def.rotulo(resultado, filtros) }),
          Util.el('div', { 'class': 'indicador__valor' }, [
            document.createTextNode(valor),
            def.unidade
              ? Util.el('span', { 'class': 'indicador__unidade',
                                  texto: ' ' + def.unidade })
              : null
          ]),
          Util.el('div', { 'class': 'indicador__apoio',
                           texto: def.apoio(resultado, filtros) })
        ]);

        Dica.ligar(cartao, function () { return def.dica(resultado, filtros); });
        container.appendChild(cartao);
      });
    },

    definicoes: CARTOES
  };

  PG.Indicadores = Indicadores;

})(window.PG);
