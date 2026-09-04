/* ============================================================================
   COMPONENTE / EXPORTAR — imagem, PDF e dados
   ----------------------------------------------------------------------------
   As bibliotecas de captura (html2canvas) e de PDF (jsPDF) são carregadas por
   CDN e podem faltar em máquina sem rede. Toda função aqui verifica a
   dependência antes de usar e avisa em linguagem clara — o painel nunca quebra
   por causa da exportação.

   Ponto de extensão: para incluir um novo formato (PPTX, XLSX), acrescente uma
   função aqui e um item no menu de exportação do HTML.
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var Util = PG.Util;

  function nomeArquivo(extensao) {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return 'painel-grandes-medias-cidades_' +
           d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' +
           p(d.getHours()) + p(d.getMinutes()) + '.' + extensao;
  }

  function avisar(mensagem) {
    var caixa = Util.el('div', {
      'class': 'aviso aviso--mock',
      estilo: {
        position: 'fixed', bottom: '20px', left: '50%',
        transform: 'translateX(-50%)', zIndex: '300',
        boxShadow: 'var(--sombra-3)', maxWidth: '520px'
      },
      texto: mensagem
    });
    document.body.appendChild(caixa);
    setTimeout(function () { caixa.remove(); }, 5000);
  }

  /** Captura o elemento informado, com os ajustes necessários para a foto sair
      igual ao que está na tela (fundo sólido, sem elementos flutuantes). */
  function capturar(elemento) {
    if (typeof window.html2canvas === 'undefined') {
      avisar('Exportação de imagem indisponível: a biblioteca de captura não ' +
             'foi carregada. Verifique a conexão e recarregue a página.');
      return Promise.reject(new Error('html2canvas ausente'));
    }
    document.body.classList.add('exportando');
    var fundo = getComputedStyle(document.documentElement)
      .getPropertyValue('--fundo-pagina').trim() || '#ffffff';

    return window.html2canvas(elemento, {
      backgroundColor: fundo,
      scale: Math.min(2, window.devicePixelRatio || 1),
      useCORS: true,
      logging: false,
      windowWidth: elemento.scrollWidth
    }).finally(function () {
      document.body.classList.remove('exportando');
    });
  }


  var Exportar = {

    /** Alvo padrão da captura. Ajustável se o layout mudar. */
    seletorAlvo: '#areaExportavel',

    alvo: function () {
      return document.querySelector(Exportar.seletorAlvo) || document.body;
    },

    imagem: function () {
      capturar(Exportar.alvo()).then(function (canvas) {
        canvas.toBlob(function (blob) {
          Util.baixarArquivo(blob, nomeArquivo('png'), 'image/png');
        });
      }).catch(function () { /* já avisado */ });
    },

    pdf: function () {
      var jsPDFRef = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDFRef) {
        avisar('Geração de PDF indisponível: a biblioteca não foi carregada. ' +
               'Alternativa: use Ctrl+P e salve como PDF.');
        return;
      }
      capturar(Exportar.alvo()).then(function (canvas) {
        var imagem = canvas.toDataURL('image/png');
        // Página A4 paisagem, com a captura ajustada à largura útil.
        var pdf = new jsPDFRef({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        var largura = 297 - 16;
        var altura = (canvas.height * largura) / canvas.width;
        var alturaPagina = 210 - 16;

        var restante = altura;
        var deslocamento = 0;
        while (restante > 0) {
          pdf.addImage(imagem, 'PNG', 8, 8 - deslocamento, largura, altura);
          restante -= alturaPagina;
          deslocamento += alturaPagina;
          if (restante > 0) pdf.addPage();
        }
        pdf.save(nomeArquivo('pdf'));
      }).catch(function () { /* já avisado */ });
    },

    /** Base filtrada em CSV — o recorte que está na tela vira arquivo. */
    dados: function (resultado) {
      var F = PG.Formato;
      var cabecalhos = ['Modalidade', 'UF', 'Região', 'Município', 'Proponente',
                        'Empreendimento', 'Modo', 'Categoria', 'Situação',
                        'Etapa', 'Ano portaria', 'Fonte', 'Agente',
                        'Apoio (R$)', 'Contratado (R$)', 'Extensão (km)',
                        'Unidades'];
      var linhas = resultado.recorte.map(function (r) {
        return [r.tipo, r.uf, r.regiao, r.municipio, r.proponente,
                r.empreendimento, r.modo, r.categoria, r.situacao, r.etapa,
                r.rotuloAno, r.fonte, r.agente,
                r.apoio, r.valorContratado, r.km, r.unidades];
      });
      PG.Tabelas.exportarCSV(nomeArquivo('csv'), cabecalhos, linhas);
    }
  };

  PG.Exportar = Exportar;

})(window.PG);
