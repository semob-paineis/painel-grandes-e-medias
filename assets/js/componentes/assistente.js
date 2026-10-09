/* ============================================================================
   COMPONENTE / ASSISTENTE — ajuda para entender o painel
   ----------------------------------------------------------------------------
   Um assistente de conversa que roda INTEIRO no navegador: não usa IA
   externa, não envia pergunta nem dado para lugar nenhum e funciona offline.

   Princípios
   1. Nenhum número é escrito à mão. Toda quantidade citada numa resposta é
      calculada na hora por Dados.calcular / Dados.totalizar /
      Dados.agregarEntregas — as mesmas funções que alimentam a tela. Por isso
      a resposta e o painel nunca divergem.
   2. Toda resposta diz o RECORTE usado (modalidade, visão, UF, ano...) e traz
      botões para levar o usuário ao número: aplicar o recorte no painel,
      abrir a lista de empreendimentos, ir até o bloco.
   3. As regras (o que é "selecionado", "migrado", "tipologia"...) vêm da base
      de conhecimento BASE_CONCEITOS abaixo — texto editável, separado da lógica.
   4. Quando não entende, diz que não entendeu e mostra o que sabe responder.
      Não inventa.

   Fluxo:  pergunta -> normalizar -> extrair entidades (UF, ano, tipologia...)
           -> decidir a intenção -> calcular -> montar resposta + ações.

   Teste automatizado: PG.Assistente.responder(texto) devolve
   { html, fatos, acoes, sugestoes } sem tocar na tela; "fatos" traz os números
   crus usados na resposta (ver auditoria/f_assistente.js).
   ========================================================================== */

window.PG = window.PG || {};

(function (PG) {
  'use strict';

  var F = PG.Formato, Util = PG.Util;

  /* ======================================================================
     1. TEXTO: normalização e detecção de frases
     ====================================================================== */

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** A frase aparece como palavras inteiras? (texto já normalizado) */
  function tem(n, frase) { return (' ' + n + ' ').indexOf(' ' + frase + ' ') >= 0; }
  function temAlgum(n, frases) {
    for (var i = 0; i < frases.length; i++) if (tem(n, frases[i])) return frases[i];
    return null;
  }
  function escHtml(t) { return Util.escapar(t); }

  /* ======================================================================
     2. ENTIDADES: o que a pergunta cita (UF, região, ano, tipologia...)
     ====================================================================== */

  var UFS = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
             'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

  // Siglas que também são palavras comuns em português: só valem em MAIÚSCULAS.
  var UF_SIGLA_MINUSCULA_OK = ['sp','rj','mg','ba','ce','pr','rs','sc','df','go','mt',
                               'ms','pb','pi','rn','ro','rr'];

  var NOME_UF = [
    ['mato grosso do sul', 'MS'], ['rio grande do norte', 'RN'],
    ['rio grande do sul', 'RS'], ['espirito santo', 'ES'], ['distrito federal', 'DF'],
    ['santa catarina', 'SC'], ['minas gerais', 'MG'], ['mato grosso', 'MT'],
    ['rio de janeiro', 'RJ'], ['sao paulo', 'SP'], ['pernambuco', 'PE'],
    ['tocantins', 'TO'], ['maranhao', 'MA'], ['amazonas', 'AM'], ['alagoas', 'AL'],
    ['sergipe', 'SE'], ['rondonia', 'RO'], ['roraima', 'RR'], ['paraiba', 'PB'],
    ['parana', 'PR'], ['bahia', 'BA'], ['ceara', 'CE'], ['goias', 'GO'],
    ['piaui', 'PI'], ['amapa', 'AP'], ['acre', 'AC'], ['estado do para', 'PA']
  ];

  var NOME_REGIAO = [
    ['centro oeste', 'Centro-Oeste'], ['nordeste', 'Nordeste'], ['sudeste', 'Sudeste'],
    ['norte', 'Norte'], ['sul', 'Sul']
  ];

  // Tipologias (valores do filtro "Tipo de investimento") e as palavras que
  // as evocam. A ordem importa: frases mais longas primeiro.
  var FRASES_TIPOLOGIA = [
    ['VLT', ['veiculo leve sobre trilhos', 'vlts', 'vlt']],
    ['Metrô e trens', ['metro e trens', 'metros', 'metro', 'trens', 'trem', 'ferrovia']],
    ['BRT e corredores de ônibus', ['corredores de onibus', 'corredor de onibus',
      'brts', 'brt', 'corredores', 'corredor', 'onibus']],
    ['Sistema viário e OAE', ['sistema viario e oae', 'sistema viario', 'viario',
      'obras de arte especiais', 'obra de arte especial', 'oae', 'viadutos',
      'viaduto', 'pontes', 'ponte']],
    ['Mobilidade ativa', ['mobilidade ativa', 'ciclofaixas', 'ciclofaixa',
      'ciclovias', 'ciclovia']],
    ['Terminais e sistemas', ['terminais e sistemas', 'terminais', 'terminal',
      'abrigos']],
    ['Estudos e projetos', ['estudos e projetos', 'estudos', 'estudo']]
  ];

  // Palavras que servem tanto para nomear o item medido ("km de corredores")
  // quanto para recortar a carteira ("veículos em corredores"): aí quem decide
  // é a preposição que vem antes (ver papelDaPalavra).
  var PALAVRAS_DE_ENTREGA = ['corredores', 'corredor', 'brts', 'brt', 'ciclovias',
    'ciclovia', 'ciclofaixas', 'ciclofaixa', 'terminais', 'terminal', 'abrigos',
    'oae', 'viadutos', 'viaduto', 'pontes', 'ponte', 'viario', 'sistema viario',
    'obras de arte especiais', 'obra de arte especial'];

  // Destas, as que nomeiam um item do levantamento mas NÃO dão nome a nenhuma
  // tipologia — "abrigos" é um indicador, a tipologia correspondente chama-se
  // "Terminais e sistemas". Ninguém diz "investimento em abrigos" querendo a
  // tipologia, então aqui a palavra é sempre o item medido.
  var SO_ITEM = ['abrigos', 'ciclovias', 'ciclovia', 'ciclofaixas', 'ciclofaixa',
    'oae', 'viadutos', 'viaduto', 'pontes', 'ponte',
    'obras de arte especiais', 'obra de arte especial'];

  /** Remove da cópia do texto a frase já reconhecida, para ela não ser lida
   *  de novo como outra entidade ("veículo leve sobre trilhos" ≠ "veículos"). */
  function consumir(n, frase) {
    return (' ' + n + ' ').split(' ' + frase + ' ').join('  ').trim();
  }

  function municipiosDaBase() {
    var mapa = {};
    (PG.Dados.registros || []).forEach(function (r) {
      if (!r.noEscopo || !r.municipio) return;
      var k = norm(r.municipio);
      if (k.length >= 4 && !mapa[k]) mapa[k] = r.municipio;
    });
    return mapa;
  }

  var PREPOSICOES_DE_RECORTE = ['em', 'no', 'na', 'nos', 'nas', 'para', 'entre', 'dentro'];

  /** 'escopo' se a frase vem logo depois de "em/no/na/para..."; senão 'item'. */
  function papelDaPalavra(n, frase) {
    var texto = ' ' + n + ' ', i = texto.indexOf(' ' + frase + ' ');
    if (i < 0) return 'item';
    var antes = texto.slice(0, i).trim().split(/\s+/);
    var anterior = antes[antes.length - 1];
    return PREPOSICOES_DE_RECORTE.indexOf(anterior) >= 0 ? 'escopo' : 'item';
  }

  function extrairEntidades(original) {
    var n = norm(original);
    var e = { ufs: [], regiao: null, ano: null, tipologias: [], tipologiaVia: {},
              municipio: null, cenario: null, visao: null, restante: n };

    // --- Ano -----------------------------------------------------------
    if (/anterior a 2023|antes de 2023|ate 2022/.test(n)) {
      e.ano = 'Anterior a 2023';
      n = n.replace(/anterior a 2023|antes de 2023|ate 2022/, ' ');
    } else {
      var a = n.match(/\b(2023|2024|2025|2026)\b/);
      if (a) { e.ano = a[1]; n = n.replace(a[1], ' '); }
    }

    // --- Município (antes da UF: "São Paulo" cidade x estado) ------------
    // "São Paulo" é cidade ou estado? Só vira cidade quando a pergunta diz
    // "município de São Paulo" — "qual município tem mais obras em São Paulo"
    // está perguntando pelo estado.
    function pedeCidade(nome) {
      return tem(n, 'municipio de ' + nome) || tem(n, 'cidade de ' + nome) ||
             tem(n, 'municipio ' + nome) || tem(n, 'cidade ' + nome);
    }
    var muns = municipiosDaBase();
    var nomes = Object.keys(muns).sort(function (x, y) { return y.length - x.length; });
    for (var i = 0; i < nomes.length; i++) {
      if (!tem(n, nomes[i])) continue;
      var ehNomeDeUF = NOME_UF.some(function (p) { return p[0] === nomes[i]; });
      if (ehNomeDeUF && !pedeCidade(nomes[i])) continue;  // "São Paulo" = estado, salvo pedido
      // "Rio Grande" é um município do RS, mas em "no Rio Grande do Sul" essas
      // duas palavras são o começo do nome do estado, não a cidade.
      var dentroDeUF = NOME_UF.some(function (par) {
        return par[0] !== nomes[i] && par[0].indexOf(nomes[i]) >= 0 && tem(n, par[0]);
      });
      if (dentroDeUF && !pedeCidade(nomes[i])) continue;
      e.municipio = muns[nomes[i]];
      n = consumir(n, nomes[i]);
      break;
    }

    // --- UF: nomes e siglas --------------------------------------------
    NOME_UF.forEach(function (p) {
      if (tem(n, p[0]) && e.ufs.indexOf(p[1]) < 0) {
        e.ufs.push(p[1]); n = consumir(n, p[0]);
      }
    });
    (original.match(/\b[A-Z]{2}\b/g) || []).forEach(function (s) {
      if (UFS.indexOf(s) >= 0 && e.ufs.indexOf(s) < 0) e.ufs.push(s);
    });
    UF_SIGLA_MINUSCULA_OK.forEach(function (s) {
      if (tem(n, s) && e.ufs.indexOf(s.toUpperCase()) < 0) e.ufs.push(s.toUpperCase());
    });

    // --- Região --------------------------------------------------------
    NOME_REGIAO.forEach(function (p) {
      if (!e.regiao && tem(n, p[0])) {
        e.regiao = p[1];
        n = consumir(consumir(n, 'regiao ' + p[0]), p[0]);
      }
    });

    // --- Modalidade (cenário) e visão ----------------------------------
    if (temAlgum(n, ['migrado', 'migrados', 'migrada', 'migradas', 'migracao'])) {
      e.cenario = 'Migrado Novo PAC';
    } else if (temAlgum(n, ['governadores', 'governador'])) {
      e.cenario = 'Governadores';
    } else if (/modalidade grandes e medias/.test(n)) {
      e.cenario = 'Grandes e Médias';
    } else if (tem(n, 'consolidado')) {
      e.cenario = 'Consolidado';
    }
    var pedeDiferenca = /\b(diferenca|diferencas|versus|vs)\b/.test(n);
    if (!pedeDiferenca) {
      if (/\bcontratad[oa]s?\b|\bcontratou\b/.test(n) &&
          !/a contratar/.test(n)) e.visao = 'contratado';
      else if (/\bselecionad[oa]s?\b/.test(n)) e.visao = 'selecionado';
    }

    // --- Tipologia ------------------------------------------------------
    // Algumas palavras servem de RECORTE ("veículos em BRT") e de ITEM medido
    // ("km de corredores"). O papel vem da palavra que a antecede: "em/no/na/
    // para..." indica recorte; qualquer outra indica item. Palavras de item
    // ficam no texto de entregas e só viram recorte se a pergunta não for de
    // entregas (ver responder: tipologiasAmbiguas).
    e.tipologiasAmbiguas = [];
    e.restanteEntregas = consumir(n, 'veiculo leve sobre trilhos');
    FRASES_TIPOLOGIA.forEach(function (par) {
      par[1].forEach(function (frase) {
        if (!tem(n, frase)) return;
        var sobreposta = PALAVRAS_DE_ENTREGA.indexOf(frase) >= 0;
        var papel = SO_ITEM.indexOf(frase) >= 0 ? 'item'
          : (!sobreposta || papelDaPalavra(n, frase) === 'escopo' ? 'escopo' : 'item');
        if (papel === 'escopo') {
          if (e.tipologias.indexOf(par[0]) < 0) {
            e.tipologias.push(par[0]);
            e.tipologiaVia[par[0]] = frase;
          }
          e.restanteEntregas = consumir(e.restanteEntregas, frase);
        } else if (e.tipologiasAmbiguas.indexOf(par[0]) < 0) {
          e.tipologiasAmbiguas.push(par[0]);
          e.tipologiaVia[par[0]] = frase;
        }
        n = consumir(n, frase);
      });
    });

    e.restante = n;
    return e;
  }

  /* ======================================================================
     3. CÁLCULO: sempre pelas funções do painel
     ====================================================================== */

  function filtrosDaTela() {
    var v = PG.Estado.valores;
    return { cenario: v.cenario, visao: v.visao, ano: v.ano, regiao: v.regiao,
             uf: v.uf, modo: v.modo, metricaInfra: v.metricaInfra };
  }

  /** Monta o recorte pedido. Se a pergunta cita alguma dimensão (UF, região,
   *  ano, tipologia, município), as dimensões NÃO citadas ficam em "todos";
   *  modalidade e visão continuam as da tela, salvo se citadas. Sem nenhuma
   *  entidade, vale exatamente o que está na tela. */
  function resolverEscopo(ents, ufEspecifica, tipologiaEspecifica) {
    var f = filtrosDaTela();
    var citouDimensao = ents.ufs.length || ents.regiao || ents.ano ||
      ents.tipologias.length || ents.municipio;
    if (citouDimensao) {
      f.ano = 'todos'; f.regiao = 'todas'; f.uf = 'todas'; f.modo = 'todos';
    }
    if (ents.ano) f.ano = ents.ano;
    var uf = ufEspecifica !== undefined ? ufEspecifica : ents.ufs[0];
    if (uf) f.uf = uf; else if (ents.regiao) f.regiao = ents.regiao;
    var tip = tipologiaEspecifica !== undefined ? tipologiaEspecifica : ents.tipologias[0];
    if (tip) f.modo = tip;
    if (ents.cenario) f.cenario = ents.cenario;
    if (ents.visao) f.visao = ents.visao;
    return { f: f, municipio: ents.municipio || null,
             daTela: !citouDimensao && !ents.cenario && !ents.visao };
  }

  /** Expande "SP e RJ" ou "metrô e VLT" em um recorte por item (dimensões
   *  exclusivas entre si, então as linhas podem ser somadas). */
  function expandirEscopos(ents, ignorarTipologia) {
    var tips = ignorarTipologia ? [] : ents.tipologias;
    if (ents.ufs.length > 1) {
      return ents.ufs.map(function (uf) {
        return { rotulo: uf, esc: resolverEscopo(ents, uf) };
      });
    }
    if (tips.length > 1) {
      return tips.map(function (t) {
        return { rotulo: t, esc: resolverEscopo(ents, undefined, t) };
      });
    }
    var esc = ignorarTipologia
      ? resolverEscopoSemTipologia(ents) : resolverEscopo(ents);
    return [{ rotulo: null, esc: esc }];
  }

  function resolverEscopoSemTipologia(ents) {
    var copia = {};
    Object.keys(ents).forEach(function (k) { copia[k] = ents[k]; });
    copia.tipologias = [];
    return resolverEscopo(copia);
  }

  /** Quando a pergunta cita várias UFs ou tipologias, o cabeçalho lista todas. */
  function multiDe(itens, ents) {
    if (itens.length < 2) return null;
    return { dim: ents.ufs.length > 1 ? 'uf' : 'modo',
             rotulos: itens.map(function (i) { return i.rotulo; }) };
  }

  function nomeMunicipioIgual(a, b) { return norm(a) === norm(b); }

  /** Calcula tudo de um recorte. Município não é filtro do painel: quando
   *  citado, filtra-se a lista e as MESMAS funções agregam o resultado. */
  function calcular(esc) {
    var r = PG.Dados.calcular(esc.f);
    var mun = esc.municipio;
    function porMun(l) {
      return mun ? l.filter(function (x) { return nomeMunicipioIgual(x.municipio, mun); }) : l;
    }
    var recorte = porMun(r.recorte), universo = porMun(r.universo);
    var sel = PG.Regras.selecionados(recorte), con = PG.Regras.contratados(recorte);
    var D = PG.Dados;
    return {
      esc: esc, f: esc.f, r: r, recorte: recorte, universo: universo,
      sel: sel, con: con,
      tot: D.totalizar(universo, esc.f.visao),
      totSel: D.totalizar(sel, 'selecionado'),
      totCon: D.totalizar(con, 'contratado'),
      entregas: D.agregarEntregas(universo),
      modos: D.porDimensao(universo, esc.f.visao, D.chaveModoOuCategoria)
        .sort(function (a, b) { return b.valor - a.valor; })
    };
  }

  function valorEntrega(c, chave) {
    if (!c.entregas) return null;
    if (c.entregas.porChave[chave]) return c.entregas.porChave[chave].valor;
    var oae = c.entregas.porChave.oae;
    if (oae && oae.componentes) {
      var achou = oae.componentes.filter(function (x) { return x.chave === chave; })[0];
      return achou ? achou.valor : 0;
    }
    return 0;
  }

  /* ======================================================================
     4. DESCRIÇÃO DO RECORTE E FORMATAÇÃO
     ====================================================================== */

  function descreverRecorte(esc, semVisao, multi) {
    var f = esc.f, p = [f.cenario];
    if (!semVisao) p.push(f.visao === 'selecionado' ? 'Selecionado' : 'Contratado');
    if (f.ano !== 'todos') p.push('ano ' + f.ano);
    if (f.regiao !== 'todas') p.push('região ' + f.regiao);
    if (multi && multi.dim === 'uf') p.push('UFs ' + multi.rotulos.join(', '));
    else if (f.uf !== 'todas') p.push('UF ' + f.uf);
    if (esc.municipio) p.push('município ' + esc.municipio);
    if (multi && multi.dim === 'modo') p.push('tipos ' + multi.rotulos.join(', '));
    else if (f.modo !== 'todos') p.push('tipo ' + f.modo);
    var livres = [];
    if (f.ano === 'todos') livres.push('ano');
    if (f.regiao === 'todas' && f.uf === 'todas' && !(multi && multi.dim === 'uf')) livres.push('região/UF');
    if (f.modo === 'todos' && !(multi && multi.dim === 'modo')) livres.push('tipo');
    var txt = p.map(esc2).join(' · ');
    if (livres.length && !esc.daTela) txt += ' <span class="assistente__suave">(sem filtro de ' + livres.join(', ') + ')</span>';
    return '<div class="assistente__recorte"><strong>Recorte:</strong> ' + txt +
      (esc.daTela ? ' <span class="assistente__suave">(o que está na tela)</span>' : '') + '</div>';
  }
  function esc2(t) { return escHtml(t); }

  function fmtEntrega(unidade, v) {
    return unidade === 'km' ? F.decimal(v, 1) + ' km' : F.inteiro(v) + ' un.';
  }
  function plural(n, um, varios) { return F.inteiro(n) + ' ' + (n === 1 ? um : varios); }
  function lista(itens) {
    return '<ul class="assistente__lista">' + itens.map(function (i) {
      return '<li>' + i + '</li>';
    }).join('') + '</ul>';
  }
  function ident(r) {
    if (r.proposta && r.proposta !== 's/n') return 'proposta ' + escHtml(r.proposta);
    if (r.idGoverna) return 'ID Governa ' + escHtml(r.idGoverna);
    return 'linha ' + escHtml(r.id) + ' da base';
  }

  /* ======================================================================
     5. AÇÕES (botões das respostas)
     ====================================================================== */

  function aplicarRecorteNoPainel(esc) {
    var f = esc.f;
    function clicarSeg(id, valor) {
      var b = document.querySelector('#' + id + ' button[data-valor="' + valor + '"]');
      if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    }
    function definirSelect(id, valor) {
      var s = document.getElementById(id);
      if (!s || s.value === valor) return;
      s.value = valor;
      s.dispatchEvent(new Event('change'));
    }
    clicarSeg('filtroCenario', f.cenario);
    clicarSeg('filtroVisao', f.visao);
    var limpar = document.getElementById('btnLimparFiltros');
    if (limpar) limpar.click();
    if (f.ano !== 'todos') definirSelect('filtroAno', f.ano);
    if (f.uf !== 'todas') definirSelect('filtroUF', f.uf);          // a cascata ajusta a região
    else if (f.regiao !== 'todas') definirSelect('filtroRegiao', f.regiao);
    if (f.modo !== 'todos') definirSelect('filtroModo', f.modo);
  }

  function destacar(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('assistente-destaque');
    void el.offsetWidth;
    el.classList.add('assistente-destaque');
    setTimeout(function () { el.classList.remove('assistente-destaque'); }, 2600);
  }

  function blocoPorTitulo(texto) {
    var alvo = norm(texto), achado = null;
    Array.prototype.forEach.call(document.querySelectorAll('.bloco__titulo'), function (h) {
      if (!achado && norm(h.textContent).indexOf(alvo) >= 0) achado = h.closest('.bloco');
    });
    return achado;
  }

  function abrirBloco(botaoId, corpoId) {
    var b = document.getElementById(botaoId), c = document.getElementById(corpoId);
    if (b && c && c.classList.contains('oculto')) b.click();
    return c;
  }

  function abrirLinhaDeEntrega(rotulo) {
    var b = document.querySelector('#metricaInfra button[data-valor="entregas"]');
    if (b && b.getAttribute('aria-pressed') !== 'true') b.click();
    var alvo = null;
    Array.prototype.forEach.call(document.querySelectorAll('#infraestrutura .infra__linha--abrivel'),
      function (el) {
        var nome = el.querySelector('.infra__nome');
        if (nome && nome.textContent === rotulo) alvo = el;
      });
    if (alvo) {
      if (alvo.getAttribute('aria-expanded') !== 'true') alvo.click();
      destacar(alvo);
    } else {
      destacar(blocoPorTitulo('O que o investimento entrega'));
    }
  }

  var EXECUTAR = {
    aplicar: function (a) { aplicarRecorteNoPainel(a.esc); destacar(document.getElementById('indicadores')); },
    entrega: function (a) { aplicarRecorteNoPainel(a.esc); abrirLinhaDeEntrega(a.rotuloEntrega); },
    propostas: function (a) {
      aplicarRecorteNoPainel(a.esc);
      abrirBloco('btnAlternarPropostasSelecao', 'propostasSelecaoCorpo');
      destacar(document.getElementById('propostasSelecaoCorpo'));
    },
    bloco: function (a) { destacar(blocoPorTitulo(a.titulo)); },
    comoLer: function () {
      abrirBloco('btnAlternarComoLer', 'comoLerCorpo');
      destacar(blocoPorTitulo('Como ler este painel'));
    },
    csv: function () { PG.Exportar.dados(PG.Dados.calcular(PG.Estado.valores)); },
    limpar: function () {
      var l = document.getElementById('btnLimparFiltros'); if (l) l.click();
    }
  };

  /* ======================================================================
     6. BASE DE CONHECIMENTO — as regras do painel, em linguagem direta
        (editar aqui; cada item é independente)
        chaves: frases (já sem acento) que evocam o tema; peso = nº de palavras
     ====================================================================== */

  var BASE_CONCEITOS = [
    {
      id: 'selecionado_contratado',
      titulo: 'Selecionado × Contratado',
      chaves: ['diferenca entre selecionado e contratado', 'selecionado e contratado',
               'selecionado ou contratado', 'o que e selecionado', 'o que e contratado',
               'o que significa selecionado', 'o que significa contratado', 'visao',
               'selecionado x contratado', 'contratado x selecionado'],
      html: function () {
        return '<p><strong>Selecionado</strong> é tudo o que foi aprovado com recurso ' +
          'reservado: propostas já contratadas, propostas ainda a contratar e as ' +
          'desistências, pelo valor de apoio. <strong>Contratado</strong> é só o que já ' +
          'tem contrato assinado com o agente financeiro, pelo valor contratado.</p>' +
          '<p>Por isso o Selecionado nunca é menor que o Contratado. A diferença é o que ' +
          'ainda falta converter em contrato. A <em>Conversão em contratação</em> é ' +
          'justamente Contratado ÷ Selecionado, em R$.</p>' +
          '<p>Troque a visão no seletor <em>Visão</em>, no topo: ele muda todos os blocos ' +
          'de uma vez, inclusive as entregas (no Contratado entram só os empreendimentos ' +
          'com contrato assinado).</p>';
      },
      sugestoes: ['Qual a conversão em contratação?', 'O que é Migrado Novo PAC?']
    },
    {
      id: 'migrado',
      titulo: 'Migrado Novo PAC',
      chaves: ['o que e migrado', 'o que significa migrado', 'migrado novo pac',
               'migrados', 'migrado', 'parcela migrada', 'apoio original',
               'por que o valor do radar e maior', 'radar migrado'],
      html: function () {
        var c = calcular({ f: Object.assign(filtrosDaTela(), {
          cenario: 'Migrado Novo PAC', visao: 'selecionado', ano: 'todos',
          regiao: 'todas', uf: 'todas', modo: 'todos' }), municipio: null, daTela: false });
        var parcela = Util.soma(c.universo, function (r) { return r.valorContratado; });
        var original = Util.soma(c.universo, function (r) { return r.apoio; });
        ultimosFatos = { tipo: 'migrado', propostas: c.universo.length,
                         parcela: parcela, original: original };
        return '<p>São empreendimentos que <strong>já existiam em programas anteriores</strong> ' +
          'e dos quais apenas uma parte do investimento migrou para o Novo PAC.</p>' +
          lista([
            '<strong>Valor</strong> mostrado no painel = só a <em>parcela migrada</em>.',
            '<strong>Quilômetros e unidades</strong> = do empreendimento inteiro.',
            '<strong>Custo por km</strong> usa o apoio federal <em>original</em> (senão ' +
              'o custo ficaria subestimado).',
            'No <strong>Radar de Propostas</strong>, a coluna Apoio mostra o valor ' +
              'original — por isso a soma lá é maior que o total do painel.',
            'A contrapartida dos entes não está incluída.'
          ]) +
          '<p>Hoje, na carteira toda: <strong>' + F.inteiro(c.universo.length) +
          ' registros</strong>, parcela migrada de <strong>' + F.moedaCurta(parcela) +
          '</strong> sobre um investimento federal original de <strong>' +
          F.moedaCurta(original) + '</strong> (' + F.percentual(original ? parcela / original : 0, 1) +
          ').</p>';
      },
      acoes: [{ rotulo: 'Ver só os Migrados', tipo: 'aplicar', cenario: 'Migrado Novo PAC' }],
      sugestoes: ['Quanto foi migrado?', 'De onde vem este número?']
    },
    {
      id: 'tipologia',
      titulo: 'Tipologia (Tipo de investimento)',
      chaves: ['tipologia', 'tipologias', 'tipo de investimento', 'tipos de investimento',
               'como e classificado', 'como sao classificados', 'item principal',
               'classificacao dos empreendimentos'],
      html: function () {
        var lista7 = (PG.Dados.meta.opcoes || {}).tipologias || [];
        return '<p>Cada <strong>empreendimento</strong> recebe uma única tipologia e entra ' +
          '<strong>inteiro</strong> nela. Assim as categorias não se sobrepõem e a soma ' +
          'delas fecha 100% do valor.</p>' +
          (lista7.length ? '<p>As categorias são: ' + lista7.map(function (t) {
            return '<em>' + escHtml(t) + '</em>';
          }).join(', ') + '.</p>' : '') +
          '<p>Quando um empreendimento reúne terminais, abrigos, sistemas ou obras de arte ' +
          'junto com um corredor ou com trilhos, ele entra na tipologia do corredor ou dos ' +
          'trilhos. <em>Estudos e projetos</em> ficam separados, porque ainda não viraram ' +
          'obra. A classificação está na coluna <em>Tipologia do empreendimento</em> da aba ' +
          'Indicadores de Obra da planilha.</p>';
      },
      sugestoes: ['Quanto foi para metrô e trens?', 'Por que valor por tipologia é diferente do valor por entrega?']
    },
    {
      id: 'valor_vs_entrega',
      titulo: 'Valor por tipologia × entregas',
      chaves: ['valor por tipologia', 'valor por entrega', 'dinheiro por entrega',
               'custo por entrega', 'custo de cada entrega', 'por que km e unidades',
               'somar km e unidades', 'km e unidades nao se somam', 'repartido',
               'quanto custa cada estacao', 'quanto custa cada veiculo'],
      html: function () {
        return lista([
          '<strong>O dinheiro não é repartido entre as entregas.</strong> A planilha não ' +
            'traz custo por componente: um corredor com abrigos e estações tem um valor só, ' +
            'que fica inteiro na tipologia do empreendimento.',
          '<strong>Por isso o valor por tipologia não bate com “o que cada entrega custou”.</strong> ' +
            'Não existe esse número na base.',
          '<strong>Quilômetros e unidades não se somam.</strong> Cada indicador tem a sua ' +
            'própria unidade de medida.'
        ]);
      }
    },
    {
      id: 'apoio_contratado',
      titulo: 'Apoio × valor contratado',
      chaves: ['apoio e valor contratado', 'diferenca entre apoio', 'o que e apoio',
               'o que e o apoio', 'valor de apoio', 'apoio federal', 'apoio selecionado',
               'apoio ou valor contratado', 'o que e valor contratado'],
      html: function () {
        return '<p><strong>Apoio</strong> é o investimento federal reservado quando a proposta é ' +
          'selecionada; é o valor usado na visão <em>Selecionado</em>. <strong>Valor contratado</strong> ' +
          'é o que consta no contrato assinado com o agente financeiro; é o valor da visão ' +
          '<em>Contratado</em>.</p><p>Os dois podem diferir: o contrato pode sair com valor menor que o ' +
          'apoio (e o painel sinaliza, nos pontos de conferência, quando o contratado fica maior). ' +
          'Nos Migrado Novo PAC a visão Selecionado usa o valor contratado (a parcela migrada); o apoio ' +
          'original aparece no Radar e no custo por km.</p>';
      },
      sugestoes: ['Qual a diferença entre selecionado e contratado?', 'O que é Migrado Novo PAC?']
    },
    {
      id: 'escopo',
      titulo: 'O que está dentro e fora do painel',
      chaves: ['escopo', 'fora do escopo', 'habilitada', 'habilitadas', 'habilitacao',
               'desistencia da habilitacao', 'o que entra no painel', 'o que nao entra',
               'quais propostas entram', 'por que a proposta nao aparece', 'nao aparece'],
      html: function () {
        var c = calcular(resolverEscopo({ ufs: [], tipologias: [] }));
        var todas = (PG.Dados.registros || []).filter(function (r) { return r.noEscopo; }).length;
        var uni = PG.Regras.selecionados(PG.Dados.registros.filter(function (r) { return r.noEscopo; })).length;
        ultimosFatos = { tipo: 'escopo', registrosNoEscopo: todas, selecionadas: uni };
        return '<p>Entram nos números as propostas <strong>Selecionadas e Contratadas</strong> ' +
          'das três modalidades (Grandes e Médias, Governadores e Migrado Novo PAC).</p>' +
          '<p><strong>Ficam de fora</strong>, aqui e no Radar de Propostas: as propostas ' +
          'apenas <em>habilitadas</em> e as desistências da habilitação — elas ainda não ' +
          'foram selecionadas.</p>' +
          '<p>Na base, ' + F.inteiro(todas) + ' registros estão no escopo das modalidades; ' +
          F.inteiro(uni) + ' são selecionados e formam o universo dos números.</p>';
      },
      acoes: [{ rotulo: 'Abrir o Radar de Propostas', tipo: 'link', href: 'propostas.html' }]
    },
    {
      id: 'fontes_planilha',
      titulo: 'De onde vêm os dados',
      chaves: ['de onde vem os dados', 'de onde vem as informacoes', 'fonte dos dados',
               'qual a fonte', 'planilha', 'base de dados', 'basededados',
               'indicadores de obra', 'lista de projetos', 'abas da planilha'],
      html: function () {
        var m = PG.Dados.meta || {};
        return '<p>Tudo vem de uma planilha de acompanhamento, em duas abas:</p>' + lista([
          '<strong>BASEDEDADOS</strong> — uma linha por proposta: valores (apoio e ' +
            'contratado), situação, localização. Alimenta os valores em R$, o funil, ' +
            'o mapa, os gráficos e também o <a href="propostas.html">Radar de ' +
            'Propostas</a> — as duas telas leem a mesma aba e por isso não divergem.',
          '<strong>Indicadores de Obra</strong> — uma linha por empreendimento: ' +
            'quilômetros, estações, veículos, OAE etc. Alimenta “O que o investimento ' +
            'entrega” e os cartões de extensão e material rodante.',
          'A aba <strong>Lista de Projetos</strong> da planilha continua existindo para ' +
            'consulta no Excel, mas desde 07/10/2026 não alimenta mais o painel.'
        ]) + '<p>Base atual: <strong>' + escHtml(m.origem || '—') + '</strong>, atualizada em <strong>' +
          escHtml(m.dataAtualizacao || '—') + '</strong>.</p>';
      },
      acoes: [{ rotulo: 'Ver “Como ler este painel”', tipo: 'comoLer' }]
    },
    {
      id: 'rastrear',
      titulo: 'Como conferir um número',
      chaves: ['de onde vem este numero', 'de onde vem esse numero', 'de onde vem o numero',
               'como conferir', 'como conferir um numero', 'como checar', 'como validar',
               'rastrear', 'rastreabilidade', 'como confiro', 'como auditar', 'origem do numero',
               'como sei que o numero esta certo', 'de onde vem esse valor', 'de onde vem este valor'],
      html: function () {
        return '<p>Todo número pode ser rastreado até a planilha:</p>' +
          '<ol class="assistente__lista">' +
          '<li>Em <em>O que o investimento entrega</em>, clique na linha do indicador: abre ' +
          'a lista dos empreendimentos que o compõem, com a quantidade de cada um e o número ' +
          'da proposta.</li>' +
          '<li>Em <em>Propostas desta seleção</em>, a coluna <em>Entregas levantadas</em> mostra ' +
          'o que cada proposta entrega.</li>' +
          '<li>Com o número da proposta, localize o registro no Radar de Propostas e na ' +
          'planilha.</li>' +
          '<li>Em <em>Exportar › CSV</em>, a base filtrada sai com uma coluna por indicador, ' +
          'para refazer qualquer soma por fora.</li></ol>' +
          '<p>Dica: pergunte por um número específico, como “de onde vêm os veículos?”, ' +
          'que eu mostro os empreendimentos que o formam.</p>';
      },
      acoes: [{ rotulo: 'Ver “Como ler este painel”', tipo: 'comoLer' },
              { rotulo: 'Exportar CSV', tipo: 'csv' }],
      sugestoes: ['De onde vêm os veículos?', 'Quantos km de trilhos?']
    },
    {
      id: 'empreendimento_proposta',
      titulo: 'Empreendimento × proposta',
      chaves: ['empreendimento e proposta', 'empreendimento ou proposta', 'varias propostas',
               'mesmo empreendimento', 'entregas registradas uma vez', 'proposta sem entregas',
               'por que a proposta nao mostra', 'nao consigo identificar', 'o que e empreendimento',
               'o que e proposta'],
      html: function () {
        return '<p>Um <strong>empreendimento</strong> pode reunir várias <strong>propostas</strong> ' +
          '(por exemplo, uma para obras e outra para material rodante).</p>' + lista([
          'O <strong>dinheiro</strong> está em cada proposta.',
          'As <strong>entregas</strong> (km, estações, veículos...) são levantadas por ' +
            'empreendimento e registradas <strong>uma única vez</strong>, na proposta que o ' +
            'representa. As outras propostas do mesmo empreendimento aparecem sem entregas ' +
            'na coluna <em>Entregas levantadas</em> — é de propósito, para não contar duas vezes.',
          'Se só parte das propostas de um empreendimento está contratada, as entregas ' +
            'continuam sendo do empreendimento inteiro.'
        ]);
      },
      acoes: [{ rotulo: 'Abrir “Propostas desta seleção”', tipo: 'propostasTela' }]
    },
    {
      id: 'funil',
      titulo: 'Funil e conversão',
      chaves: ['o que e o funil', 'como funciona o funil', 'o que e conversao', 'o que significa conversao',
               'etapas do funil', 'o que e em execucao', 'o que significa em execucao', 'em execucao', 'o que e selecionada', 'o que e contratada', 'como e calculada a conversao',
               'como calcula a conversao'],
      html: function () {
        return '<p>O funil mostra três etapas da carteira:</p>' + lista([
          '<strong>Selecionadas</strong> — aprovadas e com recurso reservado.',
          '<strong>Contratadas</strong> — com contrato assinado com o agente financeiro.',
          '<strong>Em execução</strong> — contratadas cuja obra ou fornecimento está em ' +
            'andamento ou já foi concluído.'
        ]) + '<p>A <strong>conversão</strong> de cada etapa é medida em <strong>valor (R$)</strong> ' +
          'em relação à etapa anterior, e não em número de propostas.</p>';
      },
      acoes: [{ rotulo: 'Ir ao funil', tipo: 'bloco', titulo: 'Funil de conversão' }],
      sugestoes: ['Qual a conversão em contratação?']
    },
    {
      id: 'cartoes',
      titulo: 'Cartões do topo',
      chaves: ['cartoes', 'cartao', 'indicadores do topo', 'extensao de sistemas',
               'material rodante e equipamentos', 'alcance territorial', 'o que mostra o cartao',
               'como e calculada a extensao', 'como e calculado o alcance'],
      html: function () {
        return lista([
          '<strong>Investimento</strong> — soma do valor na visão escolhida (Selecionado ou ' +
            'Contratado).',
          '<strong>Conversão em contratação</strong> — Contratado ÷ Selecionado, em R$.',
          '<strong>Extensão de sistemas</strong> — km de corredores, BRT e faixas exclusivas ' +
            'mais km sobre trilhos (metrô, VLT e trem). Sistema viário e ciclovias são ' +
            'indicadores à parte.',
          '<strong>Material rodante e equipamentos</strong> — veículos, ITS, centros de controle ' +
            '(CCO) e pátios. Estações, terminais, abrigos e OAE ficam em “O que o investimento ' +
            'entrega”.',
          '<strong>Alcance territorial</strong> — municípios distintos (município principal de ' +
            'cada proposta) e UFs.'
        ]) + '<p>Passe o mouse sobre um cartão para ver a composição do número.</p>';
      }
    },
    {
      id: 'oae',
      titulo: 'OAE',
      chaves: ['o que e oae', 'o que significa oae', 'obra de arte especial', 'obras de arte especiais',
               'o que e obra de arte'],
      html: function () {
        var c = calcular(resolverEscopo({ ufs: [], tipologias: [] }));
        var oae = c.entregas && c.entregas.porChave.oae;
        var comp = oae && oae.componentes ? oae.componentes.map(function (x) {
          return F.inteiro(x.valor) + ' ' + x.rotulo.toLowerCase();
        }).join(' + ') : null;
        ultimosFatos = { tipo: 'oae', total: oae ? oae.valor : null };
        return '<p><strong>OAE</strong> = Obra de Arte Especial: viadutos, pontes, túneis, ' +
          'trincheiras, elevados e outras estruturas de grande porte. No painel, o total ' +
          'soma viadutos + pontes + outras. Passarelas são contadas à parte.</p>' +
          (comp ? '<p>No recorte atual: <strong>' + F.inteiro(oae.valor) + ' OAE</strong> (' + comp + ').</p>' : '');
      },
      sugestoes: ['Quantas pontes?', 'Quantos viadutos?']
    },
    {
      id: 'custo_km',
      titulo: 'Custo por km',
      chaves: ['custo por km', 'custo por quilometro', 'quanto custa o km', 'r por km', 'custo do km'],
      html: function () {
        return '<p>O <strong>custo por km</strong> é o valor do investimento dividido pelos ' +
          'quilômetros, e aparece quando se passa o mouse sobre uma linha de “O que o ' +
          'investimento entrega” (aba Investimento) que tenha extensão.</p>' +
          '<p>Nos <strong>Migrado Novo PAC</strong> usa-se o apoio federal <em>original</em>, ' +
          'porque o valor exibido é só a parcela migrada enquanto o km é do empreendimento ' +
          'inteiro. A contrapartida dos entes não entra.</p>';
      }
    },
    {
      id: 'fontes_recursos',
      titulo: 'Fonte de recursos',
      chaves: ['ogu', 'fat', 'fgts', 'fonte de recursos', 'orcamento geral da uniao',
               'financiamento', 'o que e fin', 'fonte de recurso'],
      html: function () {
        return '<p>O bloco <em>Fonte de recursos</em> separa o <strong>OGU</strong> (Orçamento ' +
          'Geral da União) do <strong>Financiamento</strong>. Os recursos de financiamento ' +
          'vêm do FGTS (Pró-Transporte) e do FAT, e são operados por CAIXA e BNDES.</p>';
      },
      acoes: [{ rotulo: 'Ir a “Fonte de recursos”', tipo: 'bloco', titulo: 'Fonte de recursos' }]
    },
    {
      id: 'agente',
      titulo: 'Agente financeiro',
      chaves: ['agente financeiro', 'agentes financeiros', 'caixa', 'bndes', 'brde', 'o que e agente'],
      html: function () {
        return '<p>O <strong>agente financeiro</strong> é a instituição que contrata e acompanha ' +
          'o financiamento ou o repasse com o proponente: CAIXA, BNDES ou BRDE. O bloco ' +
          '<em>Agente financeiro</em> mostra a distribuição do valor entre eles.</p>';
      },
      acoes: [{ rotulo: 'Ir a “Agente financeiro”', tipo: 'bloco', titulo: 'Agente financeiro' }]
    },
    {
      id: 'natureza',
      titulo: 'Natureza do apoio',
      chaves: ['natureza do apoio', 'obras equipamentos e estudos', 'categoria', 'categorias',
               'o que e natureza'],
      html: function () {
        return '<p>A <strong>natureza do apoio</strong> diz para que serve o dinheiro: ' +
          '<em>Obras</em>, <em>Equipamentos</em> (ex.: material rodante) ou <em>Estudos e ' +
          'Projetos</em>. É diferente da tipologia, que classifica o empreendimento pelo ' +
          'tipo de sistema.</p>';
      },
      acoes: [{ rotulo: 'Ir a “Natureza do apoio”', tipo: 'bloco', titulo: 'Natureza do apoio' }]
    },
    {
      id: 'ano',
      titulo: 'Ano',
      chaves: ['o que e o ano', 'qual ano', 'ano da portaria', 'anterior a 2023', 'o que significa ano',
               'ano de selecao', 'evolucao por ano'],
      html: function () {
        return '<p>O <strong>ano</strong> é o da portaria de seleção (coluna <em>Ano portaria</em> ' +
          'da planilha). Quando há mais de um ano na célula, vale o mais recente. ' +
          '<em>Anterior a 2023</em> reúne as propostas sem ano de portaria informado, em geral ' +
          'herdadas de programas anteriores.</p>';
      }
    },
    {
      id: 'modalidades',
      titulo: 'Modalidades',
      chaves: ['modalidade', 'modalidades', 'consolidado', 'o que e consolidado',
               'grandes e medias', 'governadores', 'cenario', 'cenarios'],
      html: function () {
        return '<p>O seletor <em>Modalidade</em> escolhe quais propostas compõem os números:</p>' + lista([
          '<strong>Consolidado</strong> — soma as três modalidades abaixo.',
          '<strong>Grandes e Médias</strong>, <strong>Governadores</strong> — propostas de cada modalidade.',
          '<strong>Migrado Novo PAC</strong> — empreendimentos herdados de programas anteriores ' +
            '(com regras próprias de valor; veja “O que é Migrado Novo PAC?”).'
        ]);
      },
      sugestoes: ['O que é Migrado Novo PAC?']
    },
    {
      id: 'radar',
      titulo: 'Radar de Propostas',
      chaves: ['radar', 'radar de propostas', 'listagem de propostas', 'lista de propostas',
               'onde vejo as propostas', 'propostas desta selecao'],
      html: function () {
        return '<p>O <strong>Radar de Propostas</strong> é uma página à parte com a listagem ' +
          'detalhada (uma linha por proposta, com busca, ordenação e filtro por coluna). ' +
          'Já <em>Propostas desta seleção</em>, aqui no painel, lista as propostas que formam ' +
          'os números da tela e respeita todos os filtros do topo, inclusive Tipo de investimento.</p>';
      },
      acoes: [{ rotulo: 'Abrir o Radar', tipo: 'link', href: 'propostas.html' },
              { rotulo: 'Abrir “Propostas desta seleção”', tipo: 'propostasTela' }]
    },
    {
      id: 'exportar',
      titulo: 'Exportar',
      chaves: ['exportar', 'baixar', 'download', 'gerar pdf', 'pdf', 'imagem', 'png', 'csv',
               'salvar', 'imprimir', 'como exporto'],
      html: function () {
        return '<p>O botão <em>Exportar</em>, no topo, oferece:</p>' + lista([
          '<strong>Imagem (PNG)</strong> e <strong>PDF</strong> — do painel como está na tela, ' +
            'com os filtros aplicados.',
          '<strong>CSV</strong> — a base filtrada, uma linha por proposta, com valor, tipologia ' +
            'e uma coluna por indicador de entrega.'
        ]);
      },
      acoes: [{ rotulo: 'Exportar CSV agora', tipo: 'csv' }]
    },
    {
      id: 'filtros',
      titulo: 'Filtros',
      chaves: ['filtro', 'filtros', 'como filtrar', 'como uso os filtros', 'limpar filtros',
               'como funcionam os filtros', 'filtro de uf', 'filtro de regiao'],
      html: function () {
        return lista([
          'Os filtros do topo valem para <strong>todos os blocos</strong> ao mesmo tempo.',
          'Escolher uma <strong>UF</strong> ajusta a <strong>região</strong> automaticamente; ' +
            'trocar a região para uma incompatível com a UF limpa a UF.',
          'Clicar numa linha de <em>O que o investimento entrega</em> (por tipologia) também ' +
            'aplica o filtro de tipo.',
          '<strong>Limpar filtros</strong> volta ano, região, UF e tipo a “todos”; ' +
            'modalidade e visão ficam como estão.',
          'O painel não tem filtro por município; para ver um município, filtre a UF e ' +
            'abra <em>Propostas desta seleção</em>.'
        ]);
      },
      acoes: [{ rotulo: 'Limpar filtros', tipo: 'limpar' }]
    },
    {
      id: 'atualizacao',
      titulo: 'Atualização da base',
      chaves: ['atualizacao', 'atualizado', 'atualizada', 'data da base', 'quando foi atualizado',
               'versao da planilha', 'ultima atualizacao', 'qual a data'],
      html: function () {
        var m = PG.Dados.meta || {};
        ultimosFatos = { tipo: 'atualizacao', data: m.dataAtualizacao, origem: m.origem };
        return '<p>A base foi atualizada em <strong>' + escHtml(m.dataAtualizacao || '—') +
          '</strong>, a partir de <strong>' + escHtml(m.origem || '—') + '</strong>.</p>';
      }
    },
    {
      id: 'qualidade',
      titulo: 'Pontos de conferência',
      chaves: ['alerta', 'alertas', 'qualidade dos dados', 'inconsistencia', 'inconsistencias',
               'pontos de conferencia', 'erro na base', 'dados com problema'],
      html: function () {
        var c = calcular(resolverEscopo({ ufs: [], tipologias: [] }));
        var dic = PG.Dados.meta.dicionarioAlertas || {};
        var cont = {};
        c.r.alertas.forEach(function (r) { r.alertas.forEach(function (a) { cont[a] = (cont[a] || 0) + 1; }); });
        var chaves = Object.keys(cont);
        ultimosFatos = { tipo: 'qualidade', registrosComAlerta: c.r.alertas.length, porTipo: cont };
        if (!chaves.length) return '<p>Nenhuma inconsistência detectada no recorte atual.</p>';
        return '<p>A leitura da planilha marca registros que merecem conferência. No recorte atual ' +
          'são <strong>' + F.inteiro(c.r.alertas.length) + '</strong>:</p>' +
          lista(chaves.map(function (k) {
            return '<strong>' + F.inteiro(cont[k]) + '</strong> — ' + escHtml(dic[k] || k);
          })) + '<p>O detalhe está no bloco <em>Pontos de conferência</em>, no fim da página.</p>';
      }
    },
    {
      id: 'mapa',
      titulo: 'Mapa por UF',
      chaves: ['mapa', 'investimento por unidade da federacao', 'cores do mapa', 'o que mostra o mapa'],
      html: function () {
        return '<p>O mapa pinta cada UF conforme o valor do recorte (quanto mais escura, maior ' +
          'o valor) e a tabela ao lado traz os mesmos números. Passe o mouse sobre uma UF para ' +
          'ver o detalhamento.</p>';
      },
      acoes: [{ rotulo: 'Ir ao mapa', tipo: 'bloco', titulo: 'Investimento por unidade da federação' }]
    },
    {
      id: 'unidade',
      titulo: 'Valores em bilhões',
      chaves: ['bilhoes', 'bilhao', 'em bilhoes', 'unidade de medida', 'em que unidade', 'por que bi',
               'o que significa bi', 'casas decimais', 'quanto e 0', 'converter para milhoes',
               'milhoes', 'em milhoes'],
      html: function () {
        return '<p>Todo valor em R$ do painel, do Radar e das minhas respostas está em ' +
          '<strong>bilhões</strong>, para qualquer número poder ser comparado a qualquer outro.</p>' +
          lista([
            'Sempre com <strong>duas casas decimais</strong>: <strong>R$ 28,52 bi</strong>, ' +
              '<strong>R$ 0,96 bi</strong> (≈ R$ 960 milhões), <strong>R$ 0,03 bi</strong> (≈ R$ 30 milhões).',
            'Valores abaixo de R$ 5 milhões aparecem como <strong>&lt; R$ 0,01 bi</strong>, para não ' +
              'parecerem zero.',
            'Para ler em milhões, multiplique por 1.000: R$ 0,27 bi ≈ R$ 270 milhões.',
            'O CSV exportado traz os valores cheios, em reais.'
          ]);
      }
    },
    {
      id: 'identificacao',
      titulo: 'Como uma proposta é identificada',
      chaves: ['id governa', 'idgoverna', 'governa', 'o que e s n', 'sem numero',
               'linha na base', 'linha da base', 'numero da proposta', 'como identificar a proposta',
               'o que e linha na base'],
      html: function () {
        return '<p>Cada linha dos números do painel é uma proposta, identificada nesta ordem:</p>' +
          lista([
            '<strong>Número da proposta</strong> — quando existe, é a chave para achar o ' +
              'registro no Radar e na planilha.',
            '<strong>ID Governa</strong> — identificador do sistema Governa, usado quando a ' +
              'proposta ainda não tem número (aparece como <em>s/n</em> na planilha).',
            '<strong>Linha na base</strong> — a linha da aba BASEDEDADOS. Serve de último ' +
              'recurso e é a referência que a aba Indicadores de Obra usa.'
          ]) +
          '<p>Pode me perguntar por qualquer um deles: digite o número da proposta, o ID Governa ' +
          'ou “linha 21 da base” que eu mostro a ficha completa do registro.</p>';
      },
      sugestoes: ['Me fale sobre a proposta 8654/2024']
    },
    {
      id: 'contrapartida',
      titulo: 'Contrapartida',
      chaves: ['contrapartida', 'contrapartidas', 'o que e contrapartida',
               'quanto o municipio entra', 'recurso proprio'],
      html: function () {
        return '<p>A <strong>contrapartida</strong> é a parte que o ente (município, estado ou ' +
          'consórcio) coloca no empreendimento, além do apoio federal. Ela está na planilha, mas ' +
          '<strong>não entra em nenhum número do painel</strong>: todos os valores exibidos são ' +
          'apoio federal ou valor contratado com a União.</p>' +
          '<p>Por isso o investimento total de uma obra costuma ser maior do que o painel mostra, ' +
          'e o custo por km também. A contrapartida de cada proposta aparece na ficha, quando ' +
          'está preenchida — pergunte pelo número da proposta.</p>';
      }
    },
    {
      id: 'situacao_execucao',
      titulo: 'Situação × estágio de execução',
      chaves: ['situacao e execucao', 'diferenca entre situacao', 'o que e situacao',
               'o que e estagio', 'em licitacao', 'em acao preparatoria', 'o que e cancelada',
               'o que significa contratada', 'o que e desistencia', 'em contratacao'],
      html: function () {
        return '<p>São duas colunas diferentes da planilha:</p>' + lista([
          '<strong>Situação</strong> — onde a proposta está no trâmite com a União: ' +
            '<em>Contratada</em>, <em>Em ação preparatória</em>, <em>Em licitação</em>, ' +
            '<em>Desistência</em>, <em>Cancelada</em>. É ela que define se a proposta entra como ' +
            'contratada nos números.',
          '<strong>Estágio de execução</strong> — como vai a obra ou o fornecimento: ' +
            '<em>Em execução</em>, <em>Concluído</em>, <em>Em licitação</em>, <em>Não iniciada</em>. ' +
            'É o que alimenta a etapa <em>Em execução</em> do funil.'
        ]) + '<p>Pergunte “qual a situação com mais propostas?” para ver a distribuição.</p>';
      },
      acoes: [{ rotulo: 'Ir ao funil', tipo: 'bloco', titulo: 'Funil de conversão' }],
      sugestoes: ['Qual a situação com mais propostas?']
    },
    {
      id: 'proponente',
      titulo: 'Proponente',
      chaves: ['proponente', 'quem propoe', 'quem pede', 'quem e o responsavel',
               'o que e proponente', 'tipo de proponente'],
      html: function () {
        return '<p>O <strong>proponente</strong> é quem apresentou a proposta e assina o contrato: ' +
          'uma prefeitura, um governo estadual, uma empresa pública, uma autarquia ou um consórcio. ' +
          'Não é o mesmo que o município onde a obra acontece — um governo estadual pode ser o ' +
          'proponente de uma obra na capital.</p>' +
          '<p>O painel não tem um bloco por proponente, mas eu ordeno por ele: pergunte “quais os ' +
          'maiores proponentes?”.</p>';
      },
      sugestoes: ['Quais os maiores proponentes?']
    },
    {
      id: 'sobre',
      titulo: 'Sobre o assistente',
      chaves: ['quem e voce', 'o que voce e', 'voce usa ia', 'inteligencia artificial', 'como voce funciona',
               'o que voce sabe', 'voce erra', 'posso confiar', 'sobre o assistente'],
      html: function () {
        return '<p>Sou um assistente que roda <strong>só no seu navegador</strong>: não uso IA ' +
          'externa, não envio suas perguntas nem os dados para nenhum servidor e funciono offline.</p>' +
          '<p>Os números que cito são calculados na hora pelas <strong>mesmas funções</strong> que ' +
          'montam a tela, sobre o recorte que informo em cada resposta — então batem com o painel. ' +
          'As explicações vêm de um texto fixo com as regras do painel. Se eu não entender a ' +
          'pergunta, digo isso em vez de chutar.</p>';
      }
    }
  ];

  var ultimosFatos = null;

  /* ======================================================================
     7. INTENÇÕES DE DADOS
     ====================================================================== */

  var ENTREGA_PALAVRAS = [
    ['corredorKm',  ['corredores', 'corredor', 'brt', 'brts', 'faixas exclusivas', 'faixa exclusiva']],
    ['trilhosKm',   ['trilhos', 'trilho', 'via ferrea']],
    ['viarioKm',    ['sistema viario', 'viario']],
    ['cicloKm',     ['ciclovias', 'ciclovia', 'ciclofaixas', 'ciclofaixa']],
    ['estacoes',    ['estacoes', 'estacao']],
    ['terminais',   ['terminais', 'terminal']],
    ['abrigos',     ['abrigos', 'abrigo', 'paradas', 'parada']],
    ['viadutos',    ['viadutos', 'viaduto']],
    ['pontes',      ['pontes', 'ponte']],
    ['oae',         ['oae', 'obras de arte especiais', 'obra de arte especial', 'obras de arte']],
    ['passarelas',  ['passarelas', 'passarela']],
    ['veiculos',    ['veiculos', 'veiculo', 'material rodante', 'trens unidade', 'composicoes']],
    ['its',         ['its', 'semaforos', 'semaforo']],
    ['cco',         ['cco', 'centros de controle', 'centro de controle']],
    ['patios',      ['patios', 'patio', 'oficinas', 'garagens']],
    ['extProjetadaKm', ['km projetados', 'extensao projetada', 'extensao projetada em estudos']],
    ['projetos',    ['projetos e estudos', 'quantos projetos', 'quantidade de projetos']]
  ];

  function detectarEntregas(n) {
    var achadas = [], via = {};
    ENTREGA_PALAVRAS.forEach(function (par) {
      var f = temAlgum(n, par[1]);
      if (f) {
        achadas.push(par[0]); via[par[0]] = f;
        par[1].forEach(function (p) { n = consumir(n, p); });
      }
    });
    return { chaves: achadas, via: via };
  }

  // Itens de entrega cujas palavras também nomeiam uma tipologia (recorte).
  var ENTREGA_SOBREPOSTA = ['corredorKm', 'terminais', 'abrigos', 'oae', 'viadutos', 'pontes',
    'cicloKm', 'viarioKm'];

  // Frases em que o usuário pede a ficha de um empreendimento específico.
  var MARCADORES_FICHA = ['me fale sobre', 'fale sobre', 'me fale da', 'me fale do',
    'detalhes', 'detalhe da', 'detalhe do', 'ficha', 'informacoes sobre', 'informacoes da',
    'informacoes do', 'procure', 'procurar', 'busque', 'buscar', 'encontre', 'localize',
    'onde esta', 'o que entrega', 'me mostre', 'status da', 'status do',
    'sobre a proposta', 'sobre o empreendimento', 'dados da proposta', 'me explique a obra'];

  var MARCADORES_CONCEITO = ['por que', 'porque', 'o que e', 'o que significa', 'o que sao', 'defina', 'definicao',
    'explique o conceito', 'significado', 'diferenca', 'diferencas', 'o que quer dizer',
    'como e calculad', 'como e calculado', 'como e calculada', 'como funciona'];

  // Dimensões pelas quais se pode ordenar uma lista. As quatro primeiras
  // respondem "qual proposta/empreendimento/proponente", que é a pergunta mais
  // frequente de quem olha um número grande e quer saber de onde ele vem.
  var DIMENSOES = [
    ['proposta', ['proposta', 'propostas']],
    ['empreendimento', ['empreendimento', 'empreendimentos', 'obra', 'obras',
                        'intervencao', 'intervencoes']],
    ['proponente', ['proponente', 'proponentes', 'quem recebeu', 'beneficiario',
                    'beneficiarios', 'tomador', 'tomadores']],
    ['municipio', ['municipio', 'municipios', 'cidade', 'cidades']],
    ['uf', ['uf', 'ufs', 'estado', 'estados', 'unidade da federacao', 'unidades da federacao']],
    ['regiao', ['regiao', 'regioes']],
    ['ano', ['ano', 'anos']],
    ['tipologia', ['tipologia', 'tipologias', 'tipo', 'tipos', 'modo', 'modos']],
    ['situacao', ['situacao', 'situacoes', 'status']],
    ['execucao', ['estagio', 'estagios', 'andamento', 'execucao das obras']],
    ['modalidade', ['modalidade', 'modalidades']],
    ['fonte', ['fonte', 'fontes', 'ogu']],
    ['agente', ['agente', 'agentes', 'caixa', 'bndes']]
  ];

  var NOME_DIMENSAO = {
    proposta: ['proposta', 'propostas'], empreendimento: ['empreendimento', 'empreendimentos'],
    proponente: ['proponente', 'proponentes'], municipio: ['município', 'municípios'],
    uf: ['UF', 'UFs'], regiao: ['região', 'regiões'], ano: ['ano', 'anos'],
    tipologia: ['tipologia', 'tipologias'], situacao: ['situação', 'situações'],
    execucao: ['estágio de execução', 'estágios de execução'],
    modalidade: ['modalidade', 'modalidades'], fonte: ['fonte de recursos', 'fontes de recursos'],
    agente: ['agente financeiro', 'agentes financeiros']
  };

  function dimensaoDoRanking(n, ents) {
    // Dimensão já fixada por um recorte citado não pode ser a do ranking
    // ("na região Nordeste" não pede ranking de regiões).
    var fixa = {};
    if (ents) {
      if (ents.ufs.length) { fixa.uf = true; fixa.regiao = true; }
      if (ents.regiao) fixa.regiao = true;
      if (ents.ano) fixa.ano = true;
      if (ents.tipologias.length) fixa.tipologia = true;
      if (ents.municipio) { fixa.municipio = true; fixa.uf = true; }
      if (ents.cenario) fixa.modalidade = true;
    }
    for (var i = 0; i < DIMENSOES.length; i++) {
      if (!fixa[DIMENSOES[i][0]] && temAlgum(n, DIMENSOES[i][1])) return DIMENSOES[i][0];
    }
    return null;
  }

  /** Dimensão de uma LISTAGEM: vale o substantivo que aparece primeiro na frase.
   *  Em "lista dos municípios com propostas contratadas" o objeto é município;
   *  "propostas" ali só qualifica. (No ranking vale a ordem de DIMENSOES.) */
  function dimensaoDaLista(n, ents) {
    var fixa = {};
    if (ents) {
      if (ents.ufs.length) { fixa.uf = true; fixa.regiao = true; }
      if (ents.regiao) fixa.regiao = true;
      if (ents.ano) fixa.ano = true;
      if (ents.tipologias.length) fixa.tipologia = true;
      if (ents.municipio) { fixa.municipio = true; fixa.uf = true; }
      if (ents.cenario) fixa.modalidade = true;
    }
    var melhor = null, pos = 1e9, t = ' ' + n + ' ';
    DIMENSOES.forEach(function (d) {
      if (fixa[d[0]]) return;
      d[1].forEach(function (f) {
        var i = t.indexOf(' ' + f + ' ');
        if (i >= 0 && i < pos) { pos = i; melhor = d[0]; }
      });
    });
    return melhor;
  }

  var VERBOS_DE_LISTA = /\b(lista|listas|liste|listar|listagem|relacao|relacione|relacionar|enumere|enumerar|apresente|apresentar|mostre|mostrar|exiba|exibir|quais|todos os|todas as|todo o|me de|me passe|me traga|traga|gostaria de ver|quero ver|preciso ver)\b/;

  /** O que está sendo comparado: valor em R$ (padrão) ou número de propostas.
   *  Devolve também o texto sem a expressão da métrica, para que o substantivo
   *  usado ali ("mais PROPOSTAS") não seja confundido com a dimensão. */
  var EXPRESSAO_CONTAGEM =
    /\b(mais|maior|maiores|menos|menor|menores|numero|quantidade|total)\s+(de\s+|em\s+)?(propostas|proposta|contratos|contrato|obras|empreendimentos)\b/;

  function metricaDoRanking(n) {
    var m = n.match(EXPRESSAO_CONTAGEM);
    if (!m) return { metrica: 'valor', texto: n };
    var semMetrica = n.replace(m[0], ' ' + m[1] + ' ');
    // Se o substantivo contado era a única coisa citada, ele é a DIMENSÃO da
    // lista ("as maiores propostas"), não a métrica. Só há contagem quando
    // sobra outra dimensão no texto ("qual UF tem mais propostas").
    if (!dimensaoDoRanking(semMetrica, null)) return { metrica: 'valor', texto: n };
    return { metrica: 'propostas', texto: semMetrica };
  }

  /* ---------------------------- respostas de dados ------------------------ */

  function respostaResumo(ents) {
    var esc = resolverEscopo(ents), c = calcular(esc);
    var e = c.entregas;
    var extensao = e ? valorEntrega(c, 'corredorKm') + valorEntrega(c, 'trilhosKm') : c.tot.km;
    var rodante = e ? valorEntrega(c, 'veiculos') + valorEntrega(c, 'its') +
      valorEntrega(c, 'cco') + valorEntrega(c, 'patios') : c.tot.unidades;
    var conv = c.totSel.valor ? c.totCon.valor / c.totSel.valor : 0;
    var rotuloVisao = esc.f.visao === 'selecionado' ? 'selecionado' : 'contratado';
    var top = c.modos.slice(0, 3);
    var soma = Util.soma(c.modos, function (m) { return m.valor; });
    var fatos = {
      tipo: 'resumo', filtros: esc.f, municipio: esc.municipio,
      valor: c.tot.valor, propostas: c.tot.propostas, municipios: c.tot.municipios,
      ufs: c.tot.ufs, selecionado: c.totSel.valor, contratado: c.totCon.valor,
      propostasSel: c.totSel.propostas, propostasCon: c.totCon.propostas,
      conversao: conv, extensaoKm: extensao, materialRodante: rodante
    };
    var html = descreverRecorte(esc) + lista([
      '<strong>Investimento ' + rotuloVisao + ':</strong> ' + F.moedaCurta(c.tot.valor) +
        ' em ' + plural(c.tot.propostas, 'proposta', 'propostas') + '.',
      '<strong>Conversão em contratação:</strong> ' + F.razao(c.totCon.valor, c.totSel.valor, 1) +
        ' (' + F.moedaCurta(c.totCon.valor) + ' contratados de ' + F.moedaCurta(c.totSel.valor) +
        ' selecionados; ' + F.inteiro(c.totCon.propostas) + ' de ' + F.inteiro(c.totSel.propostas) +
        ' propostas).',
      '<strong>Extensão de sistemas:</strong> ' + F.decimal(extensao, 1) + ' km' +
        (e ? ' (corredores + trilhos)' : '') + '.',
      '<strong>Material rodante e equipamentos:</strong> ' + F.inteiro(rodante) + ' un.' +
        (e ? ' (veículos, ITS, CCO e pátios)' : '') + '.',
      '<strong>Alcance:</strong> ' + plural(c.tot.municipios, 'município', 'municípios') + ' em ' +
        plural(c.tot.ufs, 'UF', 'UFs') + '.'
    ]);
    if (top.length && soma) {
      html += '<p>Maiores tipologias em valor: ' + top.map(function (m) {
        return '<strong>' + escHtml(m.chave) + '</strong> (' + F.percentual(m.valor / soma, 0) + ')';
      }).join(', ') + '.</p>';
    }
    return {
      html: html, fatos: fatos,
      acoes: acoesDoEscopo(esc, c),
      sugestoes: ['Qual UF recebeu mais investimento?', 'De onde vem este número?']
    };
  }

  function acoesDoEscopo(esc, c, extra) {
    var a = [];
    if (esc.municipio) {
      a.push({ rotulo: 'Ver propostas de ' + esc.municipio, tipo: 'propostas', esc: esc,
               dica: 'O painel não filtra município: aplica a UF e abre a lista.' });
    } else if (!esc.daTela) {
      a.push({ rotulo: 'Aplicar este recorte no painel', tipo: 'aplicar', esc: esc });
    }
    if (!esc.municipio) a.push({ rotulo: 'Ver propostas desta seleção', tipo: 'propostas', esc: esc });
    return a.concat(extra || []);
  }

  function respostaValor(ents) {
    var itens = expandirEscopos(ents);
    var linhas = [], fatosItens = [], totS = 0, totC = 0, propS = 0, propC = 0, escPrimeiro = null;
    itens.forEach(function (it) {
      var c = calcular(it.esc);
      if (!escPrimeiro) escPrimeiro = it.esc;
      var vv = it.esc.f.visao;
      var destaque = vv === 'selecionado'
        ? { s: true } : { c: true };
      var txt = (it.rotulo ? '<strong>' + escHtml(it.rotulo) + '</strong> — ' : '') +
        (ents.visao
          ? '<strong>' + (vv === 'selecionado' ? 'Selecionado' : 'Contratado') + ': ' +
            F.moedaCurta(c.tot.valor) + '</strong> em ' + plural(c.tot.propostas, 'proposta', 'propostas')
          : 'Selecionado: <strong>' + F.moedaCurta(c.totSel.valor) + '</strong> (' +
            plural(c.totSel.propostas, 'proposta', 'propostas') + ') · Contratado: <strong>' +
            F.moedaCurta(c.totCon.valor) + '</strong> (' +
            plural(c.totCon.propostas, 'proposta', 'propostas') + ')');
      linhas.push(txt);
      totS += c.totSel.valor; totC += c.totCon.valor;
      propS += c.totSel.propostas; propC += c.totCon.propostas;
      fatosItens.push({ rotulo: it.rotulo, filtros: it.esc.f, municipio: it.esc.municipio,
        valor: c.tot.valor, propostas: c.tot.propostas,
        selecionado: c.totSel.valor, contratado: c.totCon.valor,
        propostasSel: c.totSel.propostas, propostasCon: c.totCon.propostas });
    });
    var esc1 = itens[0].esc, c1 = calcular(esc1);
    var html = descreverRecorte(esc1, false, multiDe(itens, ents)) + lista(linhas);
    if (itens.length > 1) {
      html += '<p>Total dos itens citados: Selecionado <strong>' + F.moedaCurta(totS) +
        '</strong> · Contratado <strong>' + F.moedaCurta(totC) + '</strong>.</p>';
    }
    // Composição por tipologia (só quando o recorte é único e não fixa a tipologia)
    if (itens.length === 1 && esc1.f.modo === 'todos' && c1.modos.length) {
      var soma = Util.soma(c1.modos, function (m) { return m.valor; });
      if (soma > 0 && c1.modos.length > 1) {
        html += '<p>Como se divide (visão ' + (esc1.f.visao === 'selecionado' ? 'Selecionado' : 'Contratado') +
          '):</p>' + lista(c1.modos.slice(0, 5).map(function (m) {
            return escHtml(m.chave) + ': <strong>' + F.moedaCurta(m.valor) + '</strong> (' +
              F.percentual(m.valor / soma, 0) + ')';
          }));
      }
    }
    var original = null;
    if (esc1.f.cenario === 'Migrado Novo PAC') {
      var parcela = Util.soma(c1.universo, function (r) { return r.valorContratado; });
      original = Util.soma(c1.universo, function (r) { return r.apoio; });
      html += '<p>Nos Migrado Novo PAC o valor mostrado é só a <strong>parcela migrada</strong> ao Novo PAC. ' +
        'O investimento federal <strong>original</strong> desses ' + plural(c1.universo.length, 'registro', 'registros') +
        ' é <strong>' + F.moedaCurta(original) + '</strong> (a parcela equivale a ' +
        F.percentual(original ? parcela / original : 0, 1) + '). Veja “O que é Migrado Novo PAC?”.</p>';
    }
    return {
      html: html,
      fatos: { tipo: 'valor', itens: fatosItens, selecionado: totS, contratado: totC, apoioOriginalMigrados: original },
      acoes: acoesDoEscopo(esc1, c1),
      sugestoes: ['Qual a conversão em contratação?', 'Qual UF recebeu mais investimento?']
    };
  }

  function respostaContagem(ents, n) {
    var itens = expandirEscopos(ents), linhas = [], fatosItens = [];
    itens.forEach(function (it) {
      var c = calcular(it.esc);
      var rotulo = it.rotulo ? '<strong>' + escHtml(it.rotulo) + '</strong> — ' : '';
      linhas.push(rotulo + plural(c.tot.propostas, 'proposta', 'propostas') + ' · ' +
        plural(c.tot.municipios, 'município', 'municípios') + ' · ' + plural(c.tot.ufs, 'UF', 'UFs'));
      fatosItens.push({ rotulo: it.rotulo, filtros: it.esc.f, municipio: it.esc.municipio,
        propostas: c.tot.propostas, municipios: c.tot.municipios, ufs: c.tot.ufs,
        propostasSel: c.totSel.propostas, propostasCon: c.totCon.propostas });
    });
    var esc1 = itens[0].esc, c1 = calcular(esc1);
    var html = descreverRecorte(esc1, false, multiDe(itens, ents)) + lista(linhas) +
      '<p>Entre as propostas selecionadas (' + F.inteiro(c1.totSel.propostas) + '), ' +
      F.inteiro(c1.totCon.propostas) + ' já estão contratadas.</p>';
    return {
      html: html, fatos: { tipo: 'contagem', itens: fatosItens },
      acoes: acoesDoEscopo(esc1, c1),
      sugestoes: ['Qual a conversão em contratação?']
    };
  }

  function respostaEntrega(ents, chavesEntrega, via, explicativa) {
    var itens = expandirEscopos(ents);
    var dic = ((PG.Dados.meta.entregas || {}).dicionario) || [];
    var ROTULO_SUB = { viadutos: 'Viadutos', pontes: 'Pontes' };
    var partes = [], fatos = [], acoes = [], escPrimeiro = itens[0].esc;
    var ROT = {}; dic.forEach(function (d) { ROT[d.chave] = d; });

    if (!PG.Dados.meta.entregas) {
      return { html: '<p>A base carregada não traz o levantamento “Indicadores de Obra”, então ' +
        'não consigo detalhar as entregas.</p>', fatos: { tipo: 'entrega', indisponivel: true },
        acoes: [], sugestoes: [] };
    }

    var esc1 = itens[0].esc, c1 = calcular(esc1);
    var html = descreverRecorte(esc1, false, multiDe(itens, ents));

    chavesEntrega.forEach(function (chave) {
      var d = ROT[chave] || { rotulo: ROTULO_SUB[chave] || chave, unidade: 'un.' };
      var linhasItens = [], totalChave = 0, fatosChave = [];
      itens.forEach(function (it) {
        var c = calcular(it.esc);
        var v = valorEntrega(c, chave) || 0;
        totalChave += v;
        linhasItens.push((it.rotulo ? escHtml(it.rotulo) + ': ' : '') + '<strong>' + fmtEntrega(d.unidade, v) + '</strong>');
        fatosChave.push({ rotulo: it.rotulo, filtros: it.esc.f, municipio: it.esc.municipio, valor: v });
      });
      var cabeca = '<p><strong>' + escHtml(d.rotulo) + '</strong>';
      if (itens.length === 1) {
        cabeca += ': <strong>' + fmtEntrega(d.unidade, totalChave) + '</strong>';
      }
      cabeca += '</p>';
      html += cabeca;
      if (itens.length > 1) {
        html += lista(linhasItens) + '<p>Total: <strong>' + fmtEntrega(d.unidade, totalChave) + '</strong>.</p>';
      }

      if (itens.length === 1) {
        var contribuintes = c1.universo.filter(function (r) {
          return r.entregas && (r.entregas[chave] || 0) > 0;
        }).sort(function (a, b) { return b.entregas[chave] - a.entregas[chave]; });
        if (totalChave === 0) {
          html += '<p>Nenhum empreendimento deste recorte tem esse item no levantamento.</p>';
        } else {
          html += '<p>Vem de ' + plural(contribuintes.length, 'empreendimento', 'empreendimentos') +
            (contribuintes.length > 1 ? '; os maiores:' : ':') + '</p>' +
            lista(contribuintes.slice(0, 5).map(function (r) {
              return escHtml(F.resumirTexto(r.empreendimento || '—', 64)) + ' <span class="assistente__suave">(' +
                escHtml(r.municipio || '—') + '/' + escHtml(r.uf || '—') + ' · ' + ident(r) + ')</span>: <strong>' +
                fmtEntrega(d.unidade, r.entregas[chave]) + '</strong>';
            })) + (contribuintes.length > 5
              ? '<p class="assistente__suave">e mais ' + F.inteiro(contribuintes.length - 5) +
                ' (a lista completa abre no botão abaixo).</p>' : '');
        }
        if (chave === 'oae') {
          var oae = c1.entregas.porChave.oae;
          if (oae && oae.componentes && oae.componentes.length) {
            html += '<p class="assistente__suave">Composição: ' + oae.componentes.map(function (x) {
              return F.inteiro(x.valor) + ' ' + x.rotulo.toLowerCase();
            }).join(' + ') + '.</p>';
          }
        }
        var item = c1.entregas.porChave[chave];
        if (item && item.valorMigrado > 0) {
          html += '<p class="assistente__suave">Inclui ' + fmtEntrega(d.unidade, item.valorMigrado) +
            ' de ' + plural(item.empreendimentosMigrados, 'empreendimento Migrado Novo PAC',
              'empreendimentos Migrado Novo PAC') + ' (quantidade do empreendimento inteiro).</p>';
        }
      }
      fatos.push({ chave: chave, rotulo: d.rotulo, unidade: d.unidade, total: totalChave, itens: fatosChave });
    });

    html += '<p class="assistente__suave">' + (esc1.f.visao === 'selecionado'
      ? 'Visão Selecionado: inclui empreendimentos ainda não contratados.'
      : 'Visão Contratado: só empreendimentos com contrato assinado.') +
      ' As quantidades vêm do levantamento por empreendimento (aba Indicadores de Obra), registradas uma vez ' +
      'por empreendimento. Em “Propostas desta seleção”, a coluna <em>Entregas levantadas</em> mostra ' +
      'essas quantidades proposta a proposta.</p>';

    var chavePai = chavesEntrega[0] === 'viadutos' || chavesEntrega[0] === 'pontes' ? 'oae' : chavesEntrega[0];
    var rotuloPai = (ROT[chavePai] || {}).rotulo;
    // Só oferece o botão quando há o que mostrar (linha sem valor não existe na tela).
    if (itens.length === 1 && fatos.length && fatos[0].total > 0) {
      acoes.push({ rotulo: 'Ver os empreendimentos no painel', tipo: 'entrega', esc: esc1, rotuloEntrega: rotuloPai });
      acoes.push({ rotulo: 'Ver propostas desta seleção', tipo: 'propostas', esc: esc1 });
    }
    return {
      html: html, fatos: { tipo: 'entrega', itens: fatos }, acoes: acoes,
      sugestoes: ['Por que valor por tipologia é diferente do valor por entrega?',
                  'Como conferir um número?']
    };
  }

  /** Agrupa o universo por proposta usando a MESMA função da tabela "Propostas
   *  desta seleção" (painel.js) — assim a lista do assistente e a da tela são
   *  sempre a mesma lista. Sem o painel carregado, cai num agrupamento
   *  equivalente, com a mesma chave. */
  function gruposDeProposta(universo, filtros) {
    if (PG.Painel && PG.Painel.agregarPropostasSelecao) {
      return PG.Painel.agregarPropostasSelecao(universo, filtros);
    }
    var mapa = {}, ordem = [];
    universo.forEach(function (r) {
      var k = (r.proposta && r.proposta !== 's/n')
        ? r.proposta : [r.uf, r.municipio, r.empreendimento].join('|');
      if (!mapa[k]) {
        mapa[k] = { chave: k, proposta: r.proposta, uf: r.uf, municipio: r.municipio,
                    proponente: r.proponente, empreendimento: r.empreendimento,
                    tipologia: r.tipologia, idGoverna: r.idGoverna, linhas: [],
                    situacao: r.situacao, valor: 0, entregas: null };
        ordem.push(k);
      }
      var g = mapa[k];
      g.linhas.push(r.id);
      g.valor += PG.Regras.valorDe(r, filtros.visao) || 0;
      if (r.entregas) g.entregas = r.entregas;
    });
    return ordem.map(function (k) { return mapa[k]; });
  }

  var CHAVE_DIMENSAO = {
    uf: function (r) { return r.uf; },
    regiao: function (r) { return r.regiao; },
    ano: function (r) { return r.rotuloAno; },
    tipologia: function (r) { return PG.Dados.chaveModoOuCategoria(r); },
    municipio: function (r) { return r.municipio + ' (' + r.uf + ')'; },
    empreendimento: function (r) { return r.empreendimento || '—'; },
    proponente: function (r) { return (r.proponente || 'Não informado') + ' (' + r.uf + ')'; },
    situacao: function (r) { return r.situacao || 'Não informada'; },
    execucao: function (r) { return r.execucao || 'Não informado'; },
    modalidade: function (r) { return r.tipo; },
    fonte: function (r) { return r.fonte === 'OGU' ? 'OGU' : 'Financiamento'; },
    agente: function (r) {
      var a = (r.agente || 'Não informado').toUpperCase();
      if (a.indexOf('CAIXA') >= 0) return 'CAIXA';
      if (a.indexOf('BNDES') >= 0) return 'BNDES';
      if (a.indexOf('BRDE') >= 0 || a.indexOf('BDRE') >= 0) return 'BRDE';
      return 'Outros';
    }
  };

  /** Linhas do ranking: cada uma com rótulo, valor e uma legenda de contexto
   *  (município/UF e identificação da proposta) que permite achar o registro. */
  function linhasDoRanking(c, dim, metrica, entregaChave) {
    var visao = c.f.visao, U = c.universo, linhas;

    if (dim === 'proposta') {
      linhas = gruposDeProposta(U, c.f).map(function (g) {
        var valor;
        if (entregaChave) valor = (g.entregas && g.entregas[entregaChave]) || 0;
        else if (metrica === 'propostas') valor = 1;
        else valor = g.valor;
        return {
          chave: F.resumirTexto(g.empreendimento || '—', 70), id: g.chave, valor: valor,
          contexto: (g.municipio || '—') + '/' + (g.uf || '—') + ' · ' +
            ((g.proposta && g.proposta !== 's/n') ? 'proposta ' + g.proposta
              : (g.idGoverna ? 'ID Governa ' + g.idGoverna : 'linha ' + g.linhas[0])) +
            (g.situacao ? ' · ' + g.situacao : '')
        };
      });
    } else {
      var grupos = {}, ordem = [], chaveDim = CHAVE_DIMENSAO[dim];
      U.forEach(function (r) {
        var k = chaveDim(r);
        if (!grupos[k]) { grupos[k] = []; ordem.push(k); }
        grupos[k].push(r);
      });
      linhas = ordem.map(function (k) {
        var lista = grupos[k], valor, contexto = null;
        if (entregaChave) {
          var ag = PG.Dados.agregarEntregas(lista);
          valor = ag ? (valorEntrega({ entregas: ag }, entregaChave) || 0) : 0;
        } else if (metrica === 'propostas') {
          valor = gruposDeProposta(lista, c.f).length;
        } else {
          valor = Util.soma(lista, function (r) { return PG.Regras.valorDe(r, visao); });
        }
        if (dim === 'empreendimento') {
          contexto = (lista[0].municipio || '—') + '/' + (lista[0].uf || '—') +
            ' · ' + plural(gruposDeProposta(lista, c.f).length, 'proposta', 'propostas');
        }
        return { chave: dim === 'empreendimento' ? F.resumirTexto(k, 70) : k, id: k,
                 valor: valor, contexto: contexto };
      });
    }
    return linhas.filter(function (l) { return l.valor > 0; });
  }

  function respostaRanking(ents, n, entregaChave, metrica) {
    var m = metricaDoRanking(ents.restante);
    metrica = metrica || (entregaChave ? 'entrega' : m.metrica);
    var dim = dimensaoDoRanking(m.texto, ents);
    var pedeMenor = temAlgum(n, ['menor', 'menores', 'ultimo', 'ultimos', 'menos']);
    var padrao = false;
    if (!dim) { dim = 'uf'; padrao = true; }
    // Contar propostas por proposta não diz nada: nesse caso vale o valor.
    if (dim === 'proposta' && metrica === 'propostas') metrica = 'valor';

    // Quando a dimensão do ranking já está fixada no recorte, ignora o filtro dela.
    var entsR = {};
    Object.keys(ents).forEach(function (k) { entsR[k] = ents[k]; });
    if (dim === 'uf') { entsR.ufs = []; }
    if (dim === 'regiao') { entsR.regiao = null; entsR.ufs = []; }
    if (dim === 'ano') { entsR.ano = null; }
    if (dim === 'tipologia') { entsR.tipologias = []; }
    if (dim === 'municipio') { entsR.municipio = null; }
    var esc = resolverEscopo(entsR), c = calcular(esc);

    var metricaRotulo, fmt, d = null;
    if (entregaChave) {
      d = ((PG.Dados.meta.entregas || {}).dicionario || [])
        .filter(function (x) { return x.chave === entregaChave; })[0] ||
        { rotulo: entregaChave === 'viadutos' ? 'Viadutos' : entregaChave === 'pontes' ? 'Pontes' : entregaChave,
          unidade: 'un.' };
      metricaRotulo = d.rotulo;
      fmt = function (v) { return fmtEntrega(d.unidade, v); };
    } else if (metrica === 'propostas') {
      metricaRotulo = 'Número de propostas';
      fmt = function (v) { return plural(v, 'proposta', 'propostas'); };
    } else {
      metricaRotulo = 'Investimento ' + (esc.f.visao === 'selecionado' ? 'selecionado' : 'contratado');
      fmt = F.moedaCurta;
    }

    var linhas = linhasDoRanking(c, dim, metrica, entregaChave);
    linhas.sort(function (a, b) { return pedeMenor ? a.valor - b.valor : b.valor - a.valor; });
    var total = Util.soma(linhas, function (l) { return l.valor; });
    var pedeUm = /\b(qual|quem)\b/.test(n) && !temAlgum(n, ['top', 'ranking', 'principais', 'maiores', 'menores']);
    var quantos = pedeUm ? 3 : 5;
    var pedidoExplicito = n.match(/\b(\d{1,2})\s+(maiores|menores|principais|primeiras|primeiros)\b/);
    if (pedidoExplicito) quantos = Math.min(15, Math.max(1, parseInt(pedidoExplicito[1], 10)));
    var nome = NOME_DIMENSAO[dim] || [dim, dim + 's'];

    var html = descreverRecorte(esc);
    if (!linhas.length) {
      html += '<p>Não há dados para esse recorte.</p>';
    } else {
      html += '<p><strong>' + (pedeMenor ? 'Menores ' : 'Maiores ') + nome[1] +
        '</strong> — ' + escHtml(metricaRotulo) + ':</p>' +
        '<ol class="assistente__lista">' + linhas.slice(0, quantos).map(function (l) {
          return '<li>' + escHtml(l.chave) + ': <strong>' + fmt(l.valor) + '</strong>' +
            (total && metrica !== 'propostas'
              ? ' <span class="assistente__suave">(' + F.percentual(l.valor / total, 1) + ')</span>' : '') +
            (l.contexto ? '<br><span class="assistente__suave">' + escHtml(l.contexto) + '</span>' : '') +
            '</li>';
        }).join('') + '</ol>';
      if (linhas.length > quantos) {
        html += '<p class="assistente__suave">Há mais ' + F.inteiro(linhas.length - quantos) +
          ' ' + nome[1] + ' na lista; o total do recorte é ' + fmt(total) + '.</p>';
      }
      if (dim === 'proposta' || dim === 'empreendimento') {
        html += '<p class="assistente__suave">' +
          (dim === 'proposta'
            ? 'Uma linha por proposta, como em “Propostas desta seleção”. Um empreendimento ' +
              'com mais de uma proposta aparece uma vez para cada uma.'
            : 'Valor somado de todas as propostas do mesmo empreendimento.') +
          ' Pergunte por um deles pelo nome ou pelo número da proposta para ver a ficha completa.</p>';
      }
    }
    if (padrao) {
      html += '<p class="assistente__suave">Ordenei por UF. Para outra lista, pergunte por ' +
        'proposta, empreendimento, proponente, município, região, ano, tipologia, situação, fonte ou agente.</p>';
    }
    return {
      html: html,
      fatos: { tipo: 'ranking', dimensao: dim, metrica: metrica, filtros: esc.f,
               municipio: esc.municipio, entrega: entregaChave || null,
               linhas: linhas.slice(0, quantos), total: total, menor: pedeMenor },
      acoes: acoesDoEscopo(esc, c),
      sugestoes: dim === 'proposta' || dim === 'empreendimento'
        ? ['Quais os maiores proponentes?', 'Qual UF recebeu mais investimento?']
        : ['Qual a proposta de maior investimento?', 'Quanto foi para metrô e trens?']
    };
  }

  /** Lista COMPLETA de uma dimensão ("liste os municípios com propostas
   *  contratadas"): todos os itens do recorte, do maior valor ao menor, cada um
   *  com valor e número de propostas, e o total conferível com o painel. */
  function respostaListagem(ents, n, entregaChave, dimForcada) {
    var dim = dimForcada || dimensaoDaLista(n, ents);
    var entsR = {};
    Object.keys(ents).forEach(function (k) { entsR[k] = ents[k]; });
    if (dim === 'uf') { entsR.ufs = []; }
    if (dim === 'regiao') { entsR.regiao = null; entsR.ufs = []; }
    if (dim === 'ano') { entsR.ano = null; }
    if (dim === 'tipologia') { entsR.tipologias = []; }
    if (dim === 'municipio') { entsR.municipio = null; }
    var esc = resolverEscopo(entsR), c = calcular(esc);
    var nome = NOME_DIMENSAO[dim] || [dim, dim + 's'];
    var d = null, fmt = F.moedaCurta, rotuloMetrica;
    if (entregaChave) {
      d = ((PG.Dados.meta.entregas || {}).dicionario || [])
        .filter(function (x) { return x.chave === entregaChave; })[0] ||
        { rotulo: entregaChave, unidade: 'un.' };
      fmt = function (v) { return fmtEntrega(d.unidade, v); };
      rotuloMetrica = d.rotulo;
    } else {
      rotuloMetrica = 'investimento ' + (esc.f.visao === 'selecionado' ? 'selecionado' : 'contratado');
    }
    var linhas = linhasDoRanking(c, dim, entregaChave ? 'entrega' : 'valor', entregaChave);
    var contagem = {};
    linhasDoRanking(c, dim, 'propostas', null).forEach(function (l) { contagem[l.id] = l.valor; });
    // Sem métrica de valor (dim 'proposta' sem valor), o item continua listado.
    linhas.sort(function (a, b) { return b.valor - a.valor; });
    var total = Util.soma(linhas, function (l) { return l.valor; });
    var html = descreverRecorte(esc);
    if (!linhas.length) {
      html += '<p>Não há ' + nome[1] + ' nesse recorte.</p>';
    } else {
      html += '<p><strong>' + plural(linhas.length, nome[0], nome[1]) + '</strong>' +
        (esc.f.visao === 'selecionado' ? ' com propostas selecionadas' : ' com propostas contratadas') +
        (entregaChave ? ' e com ' + escHtml(d.rotulo.toLowerCase()) : '') +
        ' — ordenados por ' + escHtml(rotuloMetrica) + ':</p>' +
        '<ol class="assistente__lista assistente__lista--rolavel">' + linhas.map(function (l) {
          var np = contagem[l.id];
          return '<li>' + escHtml(l.chave) + ': <strong>' + fmt(l.valor) + '</strong>' +
            (np && dim !== 'proposta' && dim !== 'empreendimento' ? ' <span class="assistente__suave">· ' +
              plural(np, 'proposta', 'propostas') + '</span>' : '') +
            (l.contexto ? '<br><span class="assistente__suave">' + escHtml(l.contexto) + '</span>' : '') +
            '</li>';
        }).join('') + '</ol>' +
        '<p class="assistente__suave">Total da lista: ' + fmt(total) +
        (entregaChave ? '' : ' — o mesmo valor do painel para este recorte') + '.</p>';
    }
    return {
      html: html,
      fatos: { tipo: 'listagem', dimensao: dim, filtros: esc.f, municipio: esc.municipio,
               entrega: entregaChave || null, itens: linhas.length, total: total,
               linhas: linhas.map(function (l) { return { chave: l.chave, valor: l.valor }; }) },
      acoes: acoesDoEscopo(esc, c),
      sugestoes: dim === 'municipio'
        ? ['Quais os maiores municípios?', 'Quais os proponentes?']
        : ['Quais os municípios?', 'Qual a conversão em contratação?']
    };
  }

  function respostaFunil(ents) {
    var esc = resolverEscopo(ents), c = calcular(esc);
    // O funil do painel é calculado sobre o recorte (independe da visão).
    var fun = esc.municipio ? null : c.r.funil;
    if (!fun) {
      // Município: refaz as três etapas com as mesmas regras.
      var sel = c.sel, con = c.con;
      var exec = con.filter(function (r) { return r.execucao && /execu|andamento|conclu/i.test(r.execucao); });
      fun = {
        etapas: [
          { nome: 'Selecionadas', quantidade: sel.length, valor: Util.soma(sel, function (r) { return PG.Regras.valorDe(r, 'selecionado'); }) },
          { nome: 'Contratadas', quantidade: con.length, valor: Util.soma(con, function (r) { return r.valorContratado; }) },
          { nome: 'Em execução', quantidade: exec.length, valor: Util.soma(exec, function (r) { return r.valorContratado; }) }
        ],
        composicao: []
      };
      fun.etapas.forEach(function (e, i) {
        e.conversao = i === 0 ? null : (fun.etapas[i - 1].valor ? e.valor / fun.etapas[i - 1].valor : 0);
      });
    }
    var comp = c.r.funil.composicao;
    var aContratar = esc.municipio ? c.recorte.filter(function (r) { return r.etapa === 'aContratar'; }) : null;
    var linhas = fun.etapas.map(function (e) {
      return '<strong>' + esc2(e.nome) + ':</strong> ' + F.moedaCurta(e.valor) + ' em ' +
        plural(e.quantidade, 'proposta', 'propostas') +
        (e.conversao === null ? '' : ' — ' + F.percentual(e.conversao, 1) + ' da etapa anterior (em valor)');
    });
    var html = descreverRecorte(esc, true) + lista(linhas);
    var faltaConverter = fun.etapas[0].valor - fun.etapas[1].valor;
    html += '<p>Ainda falta contratar <strong>' + F.moedaCurta(faltaConverter) + '</strong> do que foi selecionado.</p>';
    return {
      html: html,
      fatos: { tipo: 'funil', filtros: esc.f, municipio: esc.municipio,
        etapas: fun.etapas.map(function (e) { return { nome: e.nome, quantidade: e.quantidade, valor: e.valor, conversao: e.conversao }; }),
        faltaConverter: faltaConverter },
      acoes: acoesDoEscopo(esc, c, [{ rotulo: 'Ir ao funil', tipo: 'bloco', titulo: 'Funil de conversão' }]),
      sugestoes: ['O que é conversão?', 'O que é Selecionado e Contratado?']
    };
  }

  function respostaMigradoNumeros(ents) {
    var e2 = {}; Object.keys(ents).forEach(function (k) { e2[k] = ents[k]; });
    e2.cenario = 'Migrado Novo PAC';
    var esc = resolverEscopo(e2), c = calcular(esc);
    var parcela = Util.soma(c.universo, function (r) { return r.valorContratado; });
    var original = Util.soma(c.universo, function (r) { return r.apoio; });
    var html = descreverRecorte(esc) + lista([
      '<strong>Parcela migrada ao Novo PAC:</strong> ' + F.moedaCurta(parcela) +
        ' (valor mostrado no painel), em ' + plural(c.universo.length, 'registro', 'registros') + '.',
      '<strong>Investimento federal original:</strong> ' + F.moedaCurta(original) +
        ' — a parcela equivale a ' + F.percentual(original ? parcela / original : 0, 1) + '.'
    ]) + '<p class="assistente__suave">Quilômetros e unidades desses registros são do empreendimento inteiro.</p>';
    return {
      html: html,
      fatos: { tipo: 'migradoNumeros', filtros: esc.f, propostas: c.universo.length, parcela: parcela, original: original },
      acoes: acoesDoEscopo(esc, c, []), sugestoes: ['O que é Migrado Novo PAC?']
    };
  }

  /* ======================================================================
     7b. FICHA DE UMA PROPOSTA OU EMPREENDIMENTO
     ----------------------------------------------------------------------
     Localiza um registro pelo número da proposta, pelo contrato, pelo ID
     Governa, pela linha da base ou pelo nome do empreendimento, e devolve
     tudo o que a base tem sobre ele. Diferente das outras respostas, esta
     NÃO depende dos filtros da tela: é uma consulta à base inteira — inclusive
     a propostas que não entram nos números (habilitadas), o que responde
     "por que esta proposta não aparece no painel?".
     ====================================================================== */

  // Palavras que não distinguem um empreendimento de outro (artigos, termos da
  // pergunta). O peso das demais é calculado a partir da própria base: quanto
  // mais rara a palavra entre os nomes, mais ela identifica um empreendimento.
  var PALAVRAS_VAZIAS = ('para pelo pela pelos pelas dos das com sem entre sobre qual quais quanto ' +
    'quantos quantas quando onde como esse essa este esta isso aquele aquela mais menos muito ' +
    'fale falar conte detalhe detalhes informacao informacoes ficha dados sobre procure procurar ' +
    'busque buscar encontre encontrar localize localizar mostre mostrar quero saber status ' +
    'proposta propostas empreendimento empreendimentos obra obras projeto projetos valor valores ' +
    'investimento investimentos situacao numero linha base painel entrega entregas que uma esse').split(' ');

  var indiceNomes = null;

  function indice() {
    if (indiceNomes) return indiceNomes;
    var regs = PG.Dados.registros || [];
    var freq = {}, nomes = {};
    regs.forEach(function (r) {
      var nome = norm(r.empreendimento || '');
      if (nomes[nome]) return;
      nomes[nome] = 1;
      var vistos = {};
      nome.split(' ').forEach(function (t) {
        if (t.length >= 4 && !vistos[t]) { vistos[t] = 1; freq[t] = (freq[t] || 0) + 1; }
      });
    });
    indiceNomes = { freq: freq, total: Object.keys(nomes).length || 1 };
    return indiceNomes;
  }

  /** Peso de uma palavra como identificadora: 1 se aparece em poucos nomes,
   *  0,4 se em vários, 0 se é comum a quase todos. */
  function peso(t) {
    var ix = indice(), f = ix.freq[t] || 0;
    if (!f) return 0;
    var p = f / ix.total;
    return p <= 0.08 ? 1 : (p <= 0.35 ? 0.4 : 0);
  }

  function numerosDoTexto(original) {
    return (String(original).match(/\d[\d./-]*\d|\b\d+\b/g) || []).map(function (t) {
      return t.replace(/[.\-]$/, '');
    });
  }

  function identificadores(r) {
    var ids = [];
    // Algumas células da planilha trazem mais de um valor (quebra de linha
    // dentro da célula): cada pedaço também identifica o registro.
    function acrescentar(valor) {
      var t = String(valor == null ? '' : valor).trim();
      if (!t) return;
      ids.push(t);
      if (/\s/.test(t)) {
        t.split(/\s+/).forEach(function (parte) {
          if (parte.length >= 4 && ids.indexOf(parte) < 0) ids.push(parte);
        });
      }
    }
    if (r.proposta && r.proposta !== 's/n') acrescentar(r.proposta);
    if (r.contrato) acrescentar(r.contrato);
    String(r.idGoverna || '').split(',').forEach(function (x) {
      x = x.trim();
      // Um ID Governa curto (3 dígitos) ou com cara de ano confundiria-se com
      // qualquer número solto da pergunta.
      if (x.length >= 4 && !/^(19|20)\d{2}$/.test(x)) ids.push('gov:' + x);
    });
    return ids;
  }

  /** Procura um empreendimento/proposta. Devolve null, um achado único
   *  ({ registros, via }) ou uma lista de candidatos para o usuário escolher. */
  function acharRegistro(original, n, opcoes) {
    opcoes = opcoes || {};
    var regs = PG.Dados.registros || [];
    var numeros = numerosDoTexto(original);

    // --- 1. Por número (sinal forte: proposta, contrato ou ID Governa) ----
    if (numeros.length) {
      var porNumero = [], via = null;
      regs.forEach(function (r) {
        var ids = identificadores(r);
        numeros.forEach(function (t) {
          if (ids.indexOf(t) >= 0) { porNumero.push(r); via = 'número ' + t; }
          else if (ids.indexOf('gov:' + t) >= 0) { porNumero.push(r); via = 'ID Governa ' + t; }
        });
      });
      if (!porNumero.length) {
        // "proposta 8654" para uma proposta registrada como "8654/2024"
        regs.forEach(function (r) {
          var base = String(r.proposta || '').split('/')[0].trim();
          if (base.length >= 4 && numeros.indexOf(base) >= 0) {
            porNumero.push(r); via = 'número ' + base;
          }
        });
      }
      // "linha 21 da base" é a linha da planilha; "linha 7 Rubi" é o nome de um
      // empreendimento — por isso exige-se a palavra "base" junto.
      var linhaDaBase = n.match(/\blinha\s+(\d+)\b/);
      if (!porNumero.length && linhaDaBase && /\bbase\b/.test(n)) {
        regs.forEach(function (r) {
          if (String(r.id) === linhaDaBase[1]) { porNumero.push(r); via = 'linha ' + r.id + ' da base'; }
        });
      }
      if (porNumero.length) {
        // O número achou UMA proposta, mas a ficha mostra o empreendimento
        // inteiro: é nele que estão as entregas, e o valor só fecha somando
        // todas as propostas que o compõem.
        var alvoNum = porNumero[0];
        return {
          registros: regs.filter(function (r) {
            return norm(r.empreendimento || '') === norm(alvoNum.empreendimento || '') &&
              r.uf === alvoNum.uf;
          }),
          via: via, exato: true
        };
      }
    }

    // --- 2. Por nome do empreendimento -----------------------------------
    // Só quando quem chamou pediu: um nome parcial é um palpite, e um palpite
    // não pode atropelar uma pergunta que tem resposta exata.
    if (opcoes.somenteNumero) return null;
    var tokens = {}, texto = norm(original);
    texto.split(' ').forEach(function (t) {
      if (t.length >= 4 && PALAVRAS_VAZIAS.indexOf(t) < 0) tokens[t] = 1;
    });
    var listaTokens = Object.keys(tokens);
    if (!listaTokens.length) return null;

    var porNome = {};
    regs.forEach(function (r) {
      var nome = norm(r.empreendimento || '');
      if (!nome) return;
      var pontos = 0;
      listaTokens.forEach(function (t) { if ((' ' + nome + ' ').indexOf(' ' + t) >= 0) pontos += peso(t); });
      if (norm(r.municipio || '') && texto.indexOf(norm(r.municipio).split(',')[0]) >= 0) pontos += 0.5;
      if (pontos <= 0) return;
      var chave = nome + '|' + r.uf;
      if (!porNome[chave] || porNome[chave].pontos < pontos) {
        porNome[chave] = { pontos: pontos, registro: r, chave: chave };
      }
    });

    var candidatos = Object.keys(porNome).map(function (k) { return porNome[k]; })
      .sort(function (a, b) { return b.pontos - a.pontos; });
    if (!candidatos.length) return null;

    var minimo = opcoes.minimo || 2.4;
    if (candidatos[0].pontos < minimo) return null;
    var segundo = candidatos[1] ? candidatos[1].pontos : 0;
    if (segundo && candidatos[0].pontos - segundo < 0.5) {
      return { candidatos: candidatos.slice(0, 4), exato: false };
    }
    var alvo = candidatos[0].registro;
    return {
      registros: regs.filter(function (r) {
        return norm(r.empreendimento || '') === norm(alvo.empreendimento || '') && r.uf === alvo.uf;
      }),
      via: 'nome do empreendimento', exato: false
    };
  }

  var ETAPA_NO_UNIVERSO = { contratado: 1, aContratar: 1, desistencia: 1 };

  function respostaFicha(achado) {
    if (achado.candidatos) {
      return {
        html: '<p>Encontrei mais de um empreendimento parecido. Qual deles?</p>' +
          lista(achado.candidatos.map(function (c) {
            return escHtml(F.resumirTexto(c.registro.empreendimento, 90)) +
              ' <span class="assistente__suave">(' + escHtml(c.registro.municipio || '—') + '/' +
              escHtml(c.registro.uf || '—') + ')</span>';
          })),
        fatos: { tipo: 'ficha', ambiguo: true,
                 candidatos: achado.candidatos.map(function (c) { return c.registro.empreendimento; }) },
        acoes: [],
        sugestoes: achado.candidatos.slice(0, 3).map(function (c) {
          var r = c.registro;
          return (r.proposta && r.proposta !== 's/n')
            ? 'Proposta ' + r.proposta : F.resumirTexto(r.empreendimento, 60);
        })
      };
    }

    // Todas as propostas do empreendimento, para o valor total não ficar
    // partido quando ele tem mais de uma (ver "Empreendimento × proposta").
    var regs = achado.registros.slice().sort(function (a, b) { return a.id - b.id; });
    var r0 = regs[0];
    var doPainel = regs.filter(function (r) { return r.noEscopo && ETAPA_NO_UNIVERSO[r.etapa]; });
    var foraDoEscopo = regs.filter(function (r) { return !r.noEscopo; });
    var apoio = Util.soma(regs, function (r) { return r.apoio; });
    var contratado = Util.soma(regs, function (r) { return r.valorContratado; });
    var migrado = regs.some(function (r) { return r.migrado; });
    var comEntregas = regs.filter(function (r) { return r.entregas; })[0];
    var dic = ((PG.Dados.meta.entregas || {}).dicionario) || [];

    var html = '<p class="assistente__titulo-resp">' + escHtml(r0.empreendimento || '—') + '</p>';
    html += '<div class="assistente__recorte"><strong>Ficha da base</strong> — consulta direta à ' +
      'planilha, sem depender dos filtros da tela. Localizado por ' + escHtml(achado.via) + '.</div>';

    var ident = [
      ['Local', (r0.municipio || '—') + ' / ' + (r0.uf || '—') + ' · ' + (r0.regiao || '—')],
      ['Proponente', (r0.proponente || '—') + (r0.tipoProponente ? ' (' + r0.tipoProponente + ')' : '')],
      ['Modalidade', r0.tipo || '—'],
      ['Tipologia', r0.tipologia || '—'],
      ['Natureza do apoio', r0.categoria || '—'],
      ['Agente / fonte', (r0.agente || '—') + ' · ' + (r0.fonte === 'OGU' ? 'OGU' : 'Financiamento (' + (r0.fonte || '—') + ')')],
      ['Ano da portaria', r0.rotuloAno || '—']
    ];
    html += lista(ident.map(function (p) {
      return '<strong>' + escHtml(p[0]) + ':</strong> ' + escHtml(p[1]);
    }));

    html += '<p><strong>' + (regs.length === 1 ? 'Proposta' : regs.length + ' propostas deste empreendimento') +
      '</strong> (valores da base):</p>';
    html += lista(regs.map(function (r) {
      var partes = [];
      partes.push('<strong>' + escHtml(identificacaoDe(r)) + '</strong>');
      partes.push(escHtml(r.situacao || '—'));
      if (r.execucao && r.execucao !== r.situacao) partes.push(escHtml(r.execucao));
      partes.push('apoio ' + F.moedaCurta(r.apoio));
      if (r.valorContratado) partes.push('contratado ' + F.moedaCurta(r.valorContratado));
      if (r.contrapartida) partes.push('contrapartida ' + F.moedaCurta(r.contrapartida));
      if (r.pctFisico) partes.push('físico ' + F.percentual(r.pctFisico, 1));
      if (r.pctFinanceiro) partes.push('financeiro ' + F.percentual(r.pctFinanceiro, 1));
      partes.push('<span class="assistente__suave">linha ' + r.id + ' da base</span>');
      return partes.join(' · ');
    }));

    if (regs.length > 1) {
      html += '<p>Somando as propostas: apoio <strong>' + F.moedaCurta(apoio) +
        '</strong> · contratado <strong>' + F.moedaCurta(contratado) + '</strong>.</p>';
    }
    if (migrado) {
      html += '<p class="assistente__suave">Migrado Novo PAC: o painel mostra apenas a parcela migrada (' +
        F.moedaCurta(contratado) + '); o apoio federal original é ' + F.moedaCurta(apoio) +
        '. Os quilômetros e as unidades são do empreendimento inteiro.</p>';
    }

    if (comEntregas) {
      var itens = [];
      dic.forEach(function (d) {
        var v = comEntregas.entregas[d.chave] || 0;
        if (v > 0) itens.push(escHtml(d.rotulo) + ': <strong>' + fmtEntrega(d.unidade, v) + '</strong>');
      });
      html += itens.length
        ? '<p><strong>O que entrega</strong> (levantamento por empreendimento):</p>' + lista(itens)
        : '<p>O levantamento de entregas deste empreendimento não registra quantidades.</p>';
    } else {
      html += '<p class="assistente__suave">As quantidades deste empreendimento estão lançadas em ' +
        'outra proposta do mesmo empreendimento, para não contar duas vezes.</p>';
    }

    if (!doPainel.length) {
      html += '<p><strong>Não entra nos números do painel.</strong> ' +
        (foraDoEscopo.length === regs.length
          ? 'Este registro é de outra modalidade, fora do escopo deste painel.'
          : 'A situação é “' + escHtml(r0.situacao || '—') + '”: só propostas selecionadas e ' +
            'contratadas entram; habilitadas e desistências da habilitação ficam de fora.') + '</p>';
    } else if (doPainel.length < regs.length) {
      html += '<p class="assistente__suave">' + plural(doPainel.length, 'proposta entra', 'propostas entram') +
        ' nos números do painel; ' + F.inteiro(regs.length - doPainel.length) + ' fica de fora do escopo.</p>';
    }

    var alertas = {};
    regs.forEach(function (r) { (r.alertas || []).forEach(function (a) { alertas[a] = 1; }); });
    var dicAlertas = PG.Dados.meta.dicionarioAlertas || {};
    if (Object.keys(alertas).length) {
      html += '<p class="assistente__suave">Pontos de conferência: ' +
        Object.keys(alertas).map(function (a) { return escHtml(dicAlertas[a] || a); }).join(' · ') + '.</p>';
    }

    var esc = { f: Object.assign(filtrosDaTela(), {
      ano: 'todos', regiao: 'todas', uf: r0.uf, modo: 'todos',
      cenario: doPainel.length ? r0.tipo : filtrosDaTela().cenario
    }), municipio: null, daTela: false };

    return {
      html: html,
      fatos: { tipo: 'ficha', via: achado.via, empreendimento: r0.empreendimento,
               uf: r0.uf, municipio: r0.municipio, modalidade: r0.tipo, tipologia: r0.tipologia,
               propostas: regs.map(function (r) {
                 return { id: r.id, proposta: r.proposta, situacao: r.situacao, etapa: r.etapa,
                          apoio: r.apoio, valorContratado: r.valorContratado, noEscopo: r.noEscopo };
               }),
               apoio: apoio, contratado: contratado, noUniverso: doPainel.length,
               entregas: comEntregas ? comEntregas.entregas : null },
      acoes: doPainel.length
        ? [{ rotulo: 'Ver no painel (UF ' + r0.uf + ')', tipo: 'propostas', esc: esc },
           { rotulo: 'Abrir o Radar de Propostas', tipo: 'link', href: 'propostas.html' }]
        : [{ rotulo: 'Abrir o Radar de Propostas', tipo: 'link', href: 'propostas.html' }],
      sugestoes: ['Qual a proposta de maior investimento?', 'Como conferir um número?']
    };
  }

  /** Mesma identificação usada no resto do painel (ver ident), com inicial
   *  maiúscula para servir de rótulo da linha na ficha. */
  function identificacaoDe(r) {
    var t = ident(r);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }


  /* ======================================================================
     8. DECISÃO: qual resposta dar
     ====================================================================== */

  var contexto = { ultima: null };

  function melhorConceito(n) {
    var melhor = null, melhorPeso = 0;
    BASE_CONCEITOS.forEach(function (t) {
      var peso = 0;
      t.chaves.forEach(function (ch) {
        if (tem(n, ch)) peso += ch.split(' ').length * 2 + 1;
      });
      if (peso > melhorPeso) { melhor = t; melhorPeso = peso; }
    });
    return melhor ? { topico: melhor, peso: melhorPeso } : null;
  }

  var AJUDA_EXEMPLOS = [
    'Resumo do que estou vendo',
    'Qual a proposta de maior investimento?',
    'Quanto foi selecionado e contratado em SP?',
    'Quantos veículos há no recorte atual?',
    'Liste os municípios com propostas contratadas',
    'Quais os maiores proponentes?',
    'Qual UF tem mais propostas?',
    'Qual a conversão em contratação?',
    'O que é Migrado Novo PAC?',
    'Como conferir um número?'
  ];

  function respostaAjuda(prefixo) {
    return {
      html: (prefixo ? '<p>' + prefixo + '</p>' : '') +
        '<p>Posso ajudar de três formas:</p>' + lista([
          '<strong>Números</strong> — valores, propostas, entregas (km, estações, veículos, OAE...) ' +
            'e conversão, para o recorte que você citar: UF, região, ano, tipologia, município, ' +
            'modalidade, “contratado” ou “selecionado”.',
          '<strong>Listas</strong> — maiores e menores propostas, empreendimentos, proponentes, ' +
            'municípios, UFs, regiões, anos, tipologias, situações, fontes e agentes, por valor ' +
            'ou por número de propostas.',
          '<strong>Ficha de um empreendimento</strong> — digite o número da proposta, o ID Governa ' +
            'ou o nome e eu mostro tudo o que a base tem sobre ele, inclusive se ele entra ou ' +
            'não nos números do painel.',
          '<strong>Conceitos</strong> — selecionado × contratado, Migrado Novo PAC, tipologia, ' +
            'escopo, OAE, funil, fontes de recursos.',
          '<strong>Rastreio</strong> — de onde vem cada número, com a lista de empreendimentos ' +
            'e botões que levam até o dado na tela.'
        ]),
      fatos: { tipo: 'ajuda' }, acoes: [], sugestoes: AJUDA_EXEMPLOS.slice(0, 6)
    };
  }

  function responder(texto) {
    var original = String(texto || '').trim();
    if (!original) return respostaAjuda('');
    if (!PG.Dados || !PG.Dados.registros || !PG.Dados.registros.length) {
      return { html: '<p>A base ainda está carregando. Tente de novo em instantes.</p>',
               fatos: { tipo: 'carregando' }, acoes: [], sugestoes: [] };
    }
    var n = norm(original);
    ultimosFatos = null;

    if (/^(oi|ola|bom dia|boa tarde|boa noite|e ai|opa)( .*)?$/.test(n) && n.split(' ').length <= 4) {
      return respostaAjuda('Olá! Sou o assistente do painel.');
    }
    if (/^(obrigad[oa]|valeu|show|perfeito|otimo|ok)\b/.test(n) && n.split(' ').length <= 4) {
      return { html: '<p>Por nada! Se surgir outra dúvida sobre os números, é só perguntar.</p>',
               fatos: { tipo: 'agradecimento' }, acoes: [], sugestoes: [] };
    }
    if (/\b(ajuda|help|o que (voce )?(pode|sabe|consegue)|o que posso perguntar|exemplos)\b/.test(n)) {
      return respostaAjuda('');
    }

    // Um número de proposta, de contrato ou de ID Governa identifica um
    // registro sem ambiguidade — vem antes de qualquer outra leitura.
    var achadoNumero = acharRegistro(original, n, { somenteNumero: true });
    if (achadoNumero) { contexto.ultima = null; return respostaFicha(achadoNumero); }

    var ents = extrairEntidades(original);
    var entr = detectarEntregas(ents.restanteEntregas);

    // "Me fale sobre…", "o que entrega…", "detalhes de…": o usuário quer a
    // ficha de um empreendimento, e aí basta um nome aproximado.
    if (temAlgum(n, MARCADORES_FICHA)) {
      var achadoNome = acharRegistro(original, n, { minimo: 1 });
      if (achadoNome) { contexto.ultima = null; return respostaFicha(achadoNome); }
    }
    var ehConceito = !!temAlgum(n, MARCADORES_CONCEITO) || /^como\b/.test(n);
    var conceito = melhorConceito(n);

    var pedeValor = /\b(quanto|quantos reais|valor|valores|investimento|investimentos|investido|recurso|recursos|montante|gasto|gastos|custa|custou|r)\b/.test(n);
    var pedeQuantidade = /\b(quantos|quantas|quantidade|total de|numero de)\b/.test(n);
    var pedeRanking = /\b(maior|maiores|menor|menores|top|ranking|principais|lidera|mais|menos|ultimo|ultimos)\b/.test(n);
    var pedeFunil = /\b(funil|conversao|converte|converteu|a contratar|em execucao|falta contratar|faltam contratar|desistencia|desistencias)\b/.test(n);
    var pedeResumo = /\b(resumo|resuma|resumir|panorama|visao geral|situacao atual|numeros principais|principais numeros|o que estou vendo|o que to vendo|explique a tela|explicar a tela)\b/.test(n);
    // Contagem de ...: "município"/"estado" só contam como objeto da contagem
    // quando não são o recorte citado ("abrigos no município de Campinas").
    var objetosDeContagem = ['proposta', 'propostas', 'empreendimento', 'empreendimentos',
      'contratos', 'obras'];
    if (!ents.municipio) objetosDeContagem.push('municipio', 'municipios', 'cidade', 'cidades');
    if (!ents.ufs.length) objetosDeContagem.push('ufs', 'estados');
    var pedeContagem = pedeQuantidade && !!temAlgum(n, objetosDeContagem);
    var pedeEntrega = entr.chaves.length > 0 && !pedeFunil;
    // "Quanto foi para terminais e sistemas?" pergunta valor (R$), não unidades.
    if (pedeEntrega && pedeValor && !pedeQuantidade && !/\b(km|quilometros|quilometragem|extensao)\b/.test(n) &&
        !/\b(por que|porque)\b/.test(n)) pedeEntrega = false;
    // "Quantas propostas de BRT?" conta propostas; BRT é recorte, não item.
    if (pedeEntrega && pedeContagem && entr.chaves.every(function (k) {
      return ENTREGA_SOBREPOSTA.indexOf(k) >= 0; })) pedeEntrega = false;
    // Palavras que poderiam ser item ou recorte: sem pergunta de entrega, são recorte.
    if (!pedeEntrega && ents.tipologiasAmbiguas.length) {
      ents.tipologiasAmbiguas.forEach(function (t) {
        if (ents.tipologias.indexOf(t) < 0) ents.tipologias.push(t);
      });
    }
    // A métrica sai do texto antes da dimensão: em "qual UF tem mais propostas",
    // "propostas" é o que se conta, e a dimensão é a UF.
    var dimRanking = dimensaoDoRanking(metricaDoRanking(ents.restante).texto, ents);
    // Listagem: "liste/apresente/quais + <dimensão>" sem pedir maior/menor nem contar.
    var dimLista = dimensaoDaLista(ents.restante, ents);
    var pedeLista = !!dimLista && !pedeRanking && !pedeQuantidade && !pedeFunil && !ehConceito &&
      (VERBOS_DE_LISTA.test(n) || new RegExp('^(os |as |em que |que )?(' +
        DIMENSOES.map(function (d) { return d[1].join('|'); }).join('|') + ')\\b').test(n));
    var rankingDeEntrega = pedeEntrega && pedeRanking && dimRanking && !/\b(quantos|quantas)\b/.test(n);
    var pedeMigradoNum = ents.cenario === 'Migrado Novo PAC' && /\b(parcela|original|percentual)\b/.test(n) && !ehConceito;
    var temEntidade = ents.ufs.length || ents.regiao || ents.ano || ents.tipologias.length ||
      ents.municipio || ents.cenario || ents.visao;

    var resp = null, ctx = null;

    // 1. Conceito explícito ("o que é", "diferença entre"...) vence, se houver tema.
    if (ehConceito && conceito && !(pedeEntrega && /porque|por que/.test(n))) {
      resp = montarConceito(conceito.topico);
    }
    // 1b. Custo por km: explica a regra (o número aparece na dica da linha)
    else if (/\b(custo|custa|custar)\b.*\b(km|quilometro)\b|\b(km|quilometro)\b.*\b(custo|custa)\b/.test(n)) {
      resp = montarConceito(BASE_CONCEITOS.filter(function (t) { return t.id === 'custo_km'; })[0]);
    }
    // 2. Resumo da tela
    else if (pedeResumo) { resp = respostaResumo(ents); ctx = { tipo: 'resumo' }; }
    // 3. Funil / conversão
    else if (pedeFunil && !pedeRanking) { resp = respostaFunil(ents); ctx = { tipo: 'funil' }; }
    // 3b. Listagem completa ("liste os municípios com propostas contratadas")
    else if (pedeLista) {
      resp = respostaListagem(ents, n, pedeEntrega ? entr.chaves[0] : null, dimLista);
      ctx = { tipo: 'lista', dim: dimLista, chave: pedeEntrega ? entr.chaves[0] : null };
    }
    // 4. Ranking de uma entrega ("qual UF tem mais estações?")
    else if (rankingDeEntrega) {
      resp = respostaRanking(ents, n, entr.chaves[0]); ctx = { tipo: 'ranking' };
    }
    // 5. Entregas (km, estações, veículos...), inclusive "por que há N veículos?"
    else if (pedeEntrega) {
      resp = respostaEntrega(ents, entr.chaves, entr.via);
      ctx = { tipo: 'entrega', chaves: entr.chaves };
    }
    // 5b. Ranking de valor
    else if (pedeRanking && (dimRanking || /\b(qual|quais|quem)\b/.test(n))) {
      resp = respostaRanking(ents, n, null); ctx = { tipo: 'ranking' };
    }
    // 6. Migrado em números
    else if (pedeMigradoNum) { resp = respostaMigradoNumeros(ents); ctx = { tipo: 'migradoNumeros' }; }
    // 7. Contagem de propostas / municípios
    else if (pedeContagem) { resp = respostaContagem(ents, n); ctx = { tipo: 'contagem' }; }
    // 8. Valor
    else if (pedeValor && (temEntidade || !conceito)) { resp = respostaValor(ents); ctx = { tipo: 'valor' }; }
    // 9. Conceito sem marcador ("tipologia", "radar", "exportar"...)
    else if (conceito) { resp = montarConceito(conceito.topico); }
    // 10. Pergunta de seguimento ("e na Bahia?")
    else if (temEntidade && contexto.ultima && n.split(' ').length <= 8) {
      var u = contexto.ultima;
      var chamar = {
        resumo: function () { return respostaResumo(ents); },
        funil: function () { return respostaFunil(ents); },
        entrega: function () { return respostaEntrega(ents, u.chaves, {}); },
        ranking: function () { return respostaRanking(ents, n, null); },
        lista: function () { return respostaListagem(ents, n, u.chave, u.dim); },
        contagem: function () { return respostaContagem(ents, n); },
        valor: function () { return respostaValor(ents); },
        migradoNumeros: function () { return respostaMigradoNumeros(ents); }
      }[u.tipo];
      if (chamar) { resp = chamar(); ctx = u; }
    }
    // 11. Só entidade sem contexto: assume valor
    if (!resp && temEntidade) { resp = respostaValor(ents); ctx = { tipo: 'valor' }; }

    // Último recurso antes de desistir: a pergunta pode citar o nome de um
    // empreendimento sem nenhuma palavra que eu reconheça.
    if (!resp) {
      var porNome = acharRegistro(original, n, { minimo: 2.4 });
      if (porNome) { contexto.ultima = null; return respostaFicha(porNome); }
    }
    if (!resp) {
      resp = respostaAjuda('Não consegui entender essa pergunta. Para não chutar uma resposta, ' +
        'veja o que sei responder:');
    }
    if (ctx) contexto.ultima = ctx;
    if (ultimosFatos && !resp.fatos) resp.fatos = ultimosFatos;
    return resp;
  }

  function montarConceito(t) {
    var html = '<p class="assistente__titulo-resp">' + escHtml(t.titulo) + '</p>' + t.html();
    var acoes = (t.acoes || []).map(function (a) {
      return a.tipo === 'aplicar'
        ? { rotulo: a.rotulo, tipo: 'aplicar',
            esc: { f: Object.assign(filtrosDaTela(), { cenario: a.cenario || 'Consolidado', ano: 'todos',
              regiao: 'todas', uf: 'todas', modo: 'todos' }), municipio: null, daTela: false } }
        : a;
    });
    return { html: html, fatos: ultimosFatos || { tipo: 'conceito', id: t.id },
             acoes: acoes, sugestoes: t.sugestoes || [] };
  }

  /* ======================================================================
     9. INTERFACE
     ====================================================================== */

  var ui = {};

  function criarBotaoAcao(a) {
    if (a.tipo === 'link') {
      return Util.el('a', { 'class': 'assistente__acao', href: a.href, texto: a.rotulo });
    }
    var b = Util.el('button', { type: 'button', 'class': 'assistente__acao', texto: a.rotulo });
    if (a.dica) b.title = a.dica;
    b.addEventListener('click', function () {
      var tipo = a.tipo === 'propostasTela' ? 'propostas' : a.tipo;
      var param = a;
      if (a.tipo === 'propostasTela') {
        param = { esc: { f: filtrosDaTela(), municipio: null, daTela: true } };
      }
      if (EXECUTAR[tipo]) EXECUTAR[tipo](param);
      if (window.matchMedia && window.matchMedia('(max-width: 780px)').matches) fechar();
    });
    return b;
  }

  function adicionar(classe, conteudo) {
    var m = Util.el('div', { 'class': 'assistente__msg assistente__msg--' + classe });
    if (typeof conteudo === 'string' && classe === 'usuario') m.textContent = conteudo;
    else m.innerHTML = conteudo;
    ui.log.appendChild(m);
    return m;
  }

  function limparSugestoes() {
    Array.prototype.forEach.call(ui.log.querySelectorAll('.assistente__sugestoes'), function (el) {
      el.parentNode.removeChild(el);
    });
  }

  function mostrarSugestoes(lista) {
    limparSugestoes();
    if (!lista || !lista.length) return;
    var box = Util.el('div', { 'class': 'assistente__sugestoes' });
    lista.forEach(function (s) {
      var b = Util.el('button', { type: 'button', 'class': 'assistente__chip', texto: s });
      b.addEventListener('click', function () { perguntar(s); });
      box.appendChild(b);
    });
    ui.log.appendChild(box);
  }

  function rolar() { ui.log.scrollTop = ui.log.scrollHeight; }

  function perguntar(texto) {
    var t = String(texto || '').trim();
    if (!t) return;
    limparSugestoes();
    adicionar('usuario', t);
    var resp;
    try { resp = responder(t); }
    catch (erro) {
      console.error(erro);
      resp = { html: '<p>Não consegui montar essa resposta. Tente reformular a pergunta.</p>',
               acoes: [], sugestoes: AJUDA_EXEMPLOS.slice(0, 4) };
    }
    var msg = adicionar('assistente', resp.html);
    if (resp.acoes && resp.acoes.length) {
      var box = Util.el('div', { 'class': 'assistente__acoes' });
      resp.acoes.forEach(function (a) { box.appendChild(criarBotaoAcao(a)); });
      msg.appendChild(box);
    }
    mostrarSugestoes(resp.sugestoes);
    rolar();
  }

  function abrir() {
    ui.painel.classList.remove('oculto');
    ui.fab.setAttribute('aria-expanded', 'true');
    ui.fab.classList.add('oculto');
    if (!ui.log.children.length) boasVindas();
    setTimeout(function () { ui.campo.focus(); }, 30);
  }

  function fechar() {
    ui.painel.classList.add('oculto');
    ui.fab.classList.remove('oculto');
    ui.fab.setAttribute('aria-expanded', 'false');
    ui.fab.focus();
  }

  function boasVindas() {
    adicionar('assistente',
      '<p><strong>Olá! Sou o assistente do painel.</strong> Respondo com os números desta tela ' +
      'e explico as regras de cada indicador. Tudo é calculado no seu navegador: nenhuma pergunta ' +
      'sai daqui.</p><p>Experimente:</p>');
    mostrarSugestoes(['Resumo do que estou vendo', 'Qual a proposta de maior investimento?',
      'Quantos veículos há?', 'Qual a diferença entre selecionado e contratado?',
      'O que é Migrado Novo PAC?', 'Como conferir um número?']);
  }

  var ICONE_CHAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>' +
    '<path d="M9 11h6M9 14h4"/></svg>';

  function montarUI() {
    if (document.getElementById('assistenteFab')) return;
    ui.fab = Util.el('button', {
      type: 'button', id: 'assistenteFab', 'class': 'assistente__fab',
      'aria-label': 'Abrir o assistente do painel', 'aria-expanded': 'false',
      'aria-controls': 'assistentePainel',
      html: ICONE_CHAT + '<span class="assistente__fab-texto">Dúvidas?</span>'
    });
    ui.campo = Util.el('input', {
      type: 'text', id: 'assistenteCampo', autocomplete: 'off',
      placeholder: 'Pergunte sobre os números ou as regras…',
      'aria-label': 'Digite sua pergunta', maxlength: '240'
    });
    ui.log = Util.el('div', { 'class': 'assistente__log', role: 'log', 'aria-live': 'polite' });
    var btnFechar = Util.el('button', { type: 'button', 'class': 'assistente__icone',
      'aria-label': 'Fechar o assistente', texto: '×' });
    var btnLimpar = Util.el('button', { type: 'button', 'class': 'assistente__icone',
      'aria-label': 'Limpar a conversa', title: 'Limpar a conversa', texto: '↺' });
    var form = Util.el('form', { 'class': 'assistente__form', autocomplete: 'off' }, [
      ui.campo,
      Util.el('button', { type: 'submit', 'class': 'assistente__enviar', texto: 'Enviar' })
    ]);
    ui.painel = Util.el('section', {
      id: 'assistentePainel', 'class': 'assistente oculto', role: 'dialog',
      'aria-label': 'Assistente do painel'
    }, [
      Util.el('header', { 'class': 'assistente__cabecalho' }, [
        Util.el('div', {}, [
          Util.el('div', { 'class': 'assistente__nome', texto: 'Assistente do painel' }),
          Util.el('div', { 'class': 'assistente__sub',
            texto: 'Responde com os números desta tela · roda no seu navegador, sem IA externa' })
        ]),
        Util.el('div', { 'class': 'assistente__botoes' }, [btnLimpar, btnFechar])
      ]),
      ui.log, form
    ]);

    document.body.appendChild(ui.fab);
    document.body.appendChild(ui.painel);

    ui.fab.addEventListener('click', abrir);
    btnFechar.addEventListener('click', fechar);
    btnLimpar.addEventListener('click', function () {
      ui.log.innerHTML = ''; contexto.ultima = null; boasVindas(); ui.campo.focus();
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var t = ui.campo.value; ui.campo.value = '';
      perguntar(t);
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !ui.painel.classList.contains('oculto')) fechar();
    });
  }

  document.addEventListener('DOMContentLoaded', montarUI);

  PG.Assistente = {
    responder: responder,
    perguntar: perguntar,
    abrir: function () { montarUI(); abrir(); },
    // Expostos para auditoria (auditoria/f_assistente.js)
    _reset: function () { contexto.ultima = null; },
    _extrairEntidades: extrairEntidades,
    _norm: norm
  };

})(window.PG);
