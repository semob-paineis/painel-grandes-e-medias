/* ============================================================================
   COMPONENTE / EXPORTAR — imagem, PDF e dados
   ----------------------------------------------------------------------------
   As bibliotecas de captura (html2canvas) e de PDF (jsPDF) são carregadas por
   CDN e podem faltar em máquina sem rede. Toda função aqui verifica a
   dependência antes de usar e avisa em linguagem clara — o painel nunca quebra
   por causa da exportação.

   GERAÇÃO DE PDF — como funciona
   ----------------------------------------------------------------------------
   Uma foto única de #areaExportavel é tirada (como antes), mas em vez de
   cortá-la em fatias de altura fixa — que corta um quadro ao meio sempre que
   ele cai exatamente na borda de uma página —, medimos ONDE cada seção de
   primeiro nível (cada .bloco ou .grade) começa e termina ANTES de tirar a
   foto, e usamos essas fronteiras para decidir onde quebrar página: se uma
   seção não cabe no que resta da página atual, ela inteira vai para a
   próxima. Só quando uma seção sozinha é mais alta que uma página inteira
   (caso raro) é que ainda cortamos — e só o necessário.

   O cabeçalho institucional (Brasil | Ministério das Cidades, título do
   painel, órgão, data de atualização) é desenhado com texto direto do jsPDF
   na primeira página — não é foto, então fica nítido em qualquer zoom — já
   que o <header> da tela fica fora de #areaExportavel (não existe hoje na
   exportação; por isso "sumia").

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

  /** Filhos de primeiro nível de `elemento` que de fato aparecem na tela —
   *  cada um vira uma "seção" indivisível na paginação do PDF. */
  function secoesExportaveis(elemento) {
    return Array.prototype.filter.call(elemento.children, function (el) {
      return getComputedStyle(el).display !== 'none' && el.offsetHeight > 0;
    });
  }

  var ESPACO_ENTRE_SECOES = 4; // mm, só entre seções de primeiro nível

  /** Mede cada seção de primeiro nível dentro de `elemento`. Uma seção com
   *  tabela grande (mais de 6 linhas) é quebrada em sub-segmentos mais
   *  finos — cabeçalho da seção, cada linha da tabela, e o que vier depois
   *  — para a paginação poder respirar entre linhas em vez de cortar uma
   *  linha ao meio quando a tabela não cabe inteira numa página. Só a
   *  última parte de cada seção carrega o espaçamento entre seções; entre
   *  sub-partes da mesma seção (linhas de uma mesma tabela) não há gap —
   *  são coladas sem folga, exatamente como aparecem na tela. */
  function medirSegmentos(elemento) {
    var rectBase = elemento.getBoundingClientRect();
    var resultado = [];

    secoesExportaveis(elemento).forEach(function (el) {
      var tbody = el.querySelector('tbody');
      if (!tbody || tbody.rows.length <= 6) {
        var r = el.getBoundingClientRect();
        resultado.push({
          topo: r.top - rectBase.top, altura: r.height,
          gapDepois: ESPACO_ENTRE_SECOES
        });
        return;
      }

      var partes = [];
      var rEl = el.getBoundingClientRect();
      var rTbody = tbody.getBoundingClientRect();

      if (rTbody.top > rEl.top) {
        partes.push({ topo: rEl.top - rectBase.top, altura: rTbody.top - rEl.top });
      }
      Array.prototype.forEach.call(tbody.rows, function (tr) {
        var rTr = tr.getBoundingClientRect();
        partes.push({ topo: rTr.top - rectBase.top, altura: rTr.height });
      });
      if (rEl.bottom > rTbody.bottom) {
        partes.push({ topo: rTbody.bottom - rectBase.top, altura: rEl.bottom - rTbody.bottom });
      }
      partes.forEach(function (p, i) {
        p.gapDepois = (i === partes.length - 1) ? ESPACO_ENTRE_SECOES : 0;
        resultado.push(p);
      });
    });

    return resultado;
  }


  /* --- Cabeçalho e rodapé do PDF, desenhados como texto (não foto) -------- */

  function desenharCabecalhoPdf(pdf, margem, largura) {
    var texto = function (id) {
      var el = document.getElementById(id);
      return el ? el.textContent.trim() : '';
    };
    var valorSelect = function (id) {
      var el = document.getElementById(id);
      var opt = el && el.options[el.selectedIndex];
      return opt ? opt.textContent.trim() : '';
    };
    var valorSegmentado = function (id) {
      var el = document.getElementById(id);
      var ativo = el && el.querySelector('[aria-pressed="true"]');
      return ativo ? ativo.textContent.trim() : '';
    };

    var y = margem;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(15, 39, 74);
    pdf.text('BRASIL', margem, y + 3);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(90, 98, 110);
    pdf.text('|  Ministério das Cidades', margem + 13, y + 3);
    y += 7;

    pdf.setDrawColor(222, 226, 232);
    pdf.line(margem, y, margem + largura, y);
    y += 5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(24, 95, 165);
    pdf.text(texto('programaPainel'), margem, y);
    y += 5.5;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.setTextColor(20, 24, 32);
    pdf.text(texto('tituloPainel'), margem, y, { maxWidth: largura });
    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9.5);
    pdf.setTextColor(90, 98, 110);
    pdf.text(texto('orgaoPainel'), margem, y);

    var data = texto('dataAtualizacao');
    pdf.setFontSize(8.5);
    pdf.text(data, margem + largura - pdf.getTextWidth(data), y);
    y += 5;

    // Filtros ativos — a barra de filtros (Modalidade | Visão | Ano | Região
    // | UF | Tipo de investimento) fica fora de #areaExportavel, então nunca
    // aparecia no PDF. Lê o texto exibido em cada controle, não o valor
    // interno (ex.: "Selecionado", não "selecionado"), para bater 100% com
    // o que a pessoa vê na tela.
    var filtros = [
      'Modalidade: ' + (valorSegmentado('filtroCenario') || '—'),
      'Visão: ' + (valorSegmentado('filtroVisao') || '—'),
      'Ano: ' + (valorSelect('filtroAno') || '—'),
      'Região: ' + (valorSelect('filtroRegiao') || '—'),
      'UF: ' + (valorSelect('filtroUF') || '—'),
      'Tipo de investimento: ' + (valorSelect('filtroModo') || '—')
    ].join('   ·   ');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(130, 137, 148);
    pdf.text('FILTROS APLICADOS', margem, y);
    y += 3.8;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(60, 66, 76);
    var linhasFiltros = pdf.splitTextToSize(filtros, largura);
    pdf.text(linhasFiltros, margem, y);
    y += linhasFiltros.length * 3.8 + 3;

    pdf.setDrawColor(222, 226, 232);
    pdf.line(margem, y, margem + largura, y);
    y += 4;

    return y - margem; // altura total ocupada pelo cabeçalho, em mm
  }

  function desenharRodapePdf(pdf, margem, largura, alturaUtil) {
    var total = pdf.internal.getNumberOfPages();
    for (var i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(150, 156, 166);
      pdf.text('Painel de Monitoramento — Grandes e Médias Cidades · SEMOB',
                margem, margem + alturaUtil + 5);
      var rotulo = 'Página ' + i + ' de ' + total;
      pdf.text(rotulo, margem + largura - pdf.getTextWidth(rotulo),
                margem + alturaUtil + 5);
    }
  }


  /* --- Montagem do PDF, seção por seção ------------------------------------ */

  function montarPdfPorSecoes(jsPDFRef, canvas, cssWidth, segmentos) {
    var pdf = new jsPDFRef({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var MARGEM = 8;
    var larguraUtil = 297 - MARGEM * 2;
    var alturaUtil = 210 - MARGEM * 2;
    var mmPorCssPx = larguraUtil / cssWidth;
    var canvasPxPorCssPx = canvas.width / cssWidth;

    var alturaCabecalho = desenharCabecalhoPdf(pdf, MARGEM, larguraUtil);
    var cursorY = MARGEM + alturaCabecalho;
    var restante = alturaUtil - alturaCabecalho;
    var paginaTemConteudo = false;

    var fatiaCanvas = document.createElement('canvas');
    var fatiaCtx = fatiaCanvas.getContext('2d');

    // Segmentos contíguos (ex.: linhas seguidas de uma mesma tabela) são
    // acumulados e desenhados numa imagem só — sem isso, uma tabela de 170
    // linhas viraria 170 chamadas de captura/recorte, deixando a exportação
    // bem mais lenta à toa.
    var pendenteTopoPx = null, pendenteAlturaPx = 0, pendenteY = 0;

    function desenharImagem(topoPx, alturaPx, y) {
      var alturaMm = (alturaPx / canvasPxPorCssPx) * mmPorCssPx;
      fatiaCanvas.width = canvas.width;
      fatiaCanvas.height = alturaPx;
      fatiaCtx.clearRect(0, 0, fatiaCanvas.width, fatiaCanvas.height);
      fatiaCtx.drawImage(canvas, 0, topoPx, canvas.width, alturaPx,
                                  0, 0, canvas.width, alturaPx);
      pdf.addImage(fatiaCanvas.toDataURL('image/png'), 'PNG',
                   MARGEM, y, larguraUtil, alturaMm);
    }

    function flush() {
      if (pendenteAlturaPx > 0) desenharImagem(pendenteTopoPx, pendenteAlturaPx, pendenteY);
      pendenteTopoPx = null;
      pendenteAlturaPx = 0;
    }

    function acumular(topoPx, alturaPx) {
      if (pendenteTopoPx !== null &&
          Math.abs((pendenteTopoPx + pendenteAlturaPx) - topoPx) < 0.5) {
        pendenteAlturaPx += alturaPx; // contíguo ao que já está pendente: só estende
        return;
      }
      flush();
      pendenteTopoPx = topoPx;
      pendenteAlturaPx = alturaPx;
      pendenteY = cursorY;
    }

    function novaPagina() {
      flush();
      pdf.addPage();
      cursorY = MARGEM;
      restante = alturaUtil;
      paginaTemConteudo = false;
    }

    segmentos.forEach(function (seg) {
      var topoPx = seg.topo * canvasPxPorCssPx;
      var alturaPx = seg.altura * canvasPxPorCssPx;
      var alturaMm = seg.altura * mmPorCssPx;
      var gap = seg.gapDepois || 0;

      function colocar() {
        acumular(topoPx, alturaPx);
        cursorY += alturaMm + gap;
        restante -= (alturaMm + gap);
        paginaTemConteudo = true;
        if (gap > 0) flush(); // fim de uma seção de verdade: pode fechar a imagem acumulada
      }

      // Cabe no que resta desta página — caso comum.
      if (alturaMm <= restante) { colocar(); return; }

      // Não coube — a seção (ou linha) inteira vai para a página seguinte.
      if (paginaTemConteudo) novaPagina();
      if (alturaMm <= restante) { colocar(); return; }

      // Nem numa página vazia cabe inteira: é mais alta que uma página
      // inteira sozinha. Único caso em que ainda cortamos — o mínimo
      // necessário, fatia por fatia. Não deveria mais acontecer com linhas
      // de tabela (cada uma é bem menor que uma página), só em algum bloco
      // sem tabela que seja, sozinho, gigante.
      flush();
      var restantePx = alturaPx, offsetPx = topoPx;
      while (restantePx > 0) {
        var capacidadePx = (restante / mmPorCssPx) * canvasPxPorCssPx;
        var pedacoPx = Math.min(capacidadePx, restantePx);
        desenharImagem(offsetPx, pedacoPx, cursorY);
        cursorY += (pedacoPx / canvasPxPorCssPx) * mmPorCssPx;
        restante -= (pedacoPx / canvasPxPorCssPx) * mmPorCssPx;
        paginaTemConteudo = true;
        offsetPx += pedacoPx;
        restantePx -= pedacoPx;
        if (restantePx > 0) novaPagina();
      }
      cursorY += gap;
      restante -= gap;
    });

    flush();
    desenharRodapePdf(pdf, MARGEM, larguraUtil, alturaUtil);
    pdf.save(nomeArquivo('pdf'));
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

      var alvo = Exportar.alvo();

      // A lista de "Propostas desta seleção" só é desenhada quando o
      // painel está aberto (por performance — ver painel.js). Para o PDF
      // sempre trazer a lista, não só o botão fechado, abre-o aqui se
      // estiver fechado (o próprio clique já dispara o desenho, se
      // pendente) e fecha de novo depois, devolvendo a tela ao estado em
      // que estava.
      var botaoPropostas = document.getElementById('btnAlternarPropostasSelecao');
      var corpoPropostas = document.getElementById('propostasSelecaoCorpo');
      var precisaRefechar = !!(botaoPropostas && corpoPropostas &&
        corpoPropostas.classList.contains('oculto'));
      if (precisaRefechar) botaoPropostas.click();

      var rectContainer = alvo.getBoundingClientRect();
      var segmentos = medirSegmentos(alvo);

      capturar(alvo).then(function (canvas) {
        if (precisaRefechar) botaoPropostas.click();
        montarPdfPorSecoes(jsPDFRef, canvas, rectContainer.width, segmentos);
      }).catch(function () {
        if (precisaRefechar) botaoPropostas.click();
        /* já avisado */
      });
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
