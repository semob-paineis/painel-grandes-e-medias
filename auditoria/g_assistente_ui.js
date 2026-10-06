/* AUDITORIA (g): usa o assistente como o usuário usa — abre a janela, digita a pergunta,
   clica nos botões — e confere se a TELA do painel mostra os mesmos números que a resposta. */
const { chromium } = require('playwright');
const num = t => { const m = String(t).replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
(async () => {
  const painel = process.argv[2];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const falhas = []; let verificados = 0;
  p.on('pageerror', e => falhas.push('ERRO JS: ' + e.message));
  await p.goto('file://' + painel + '/index.html');
  await p.waitForSelector('#indicadores .indicador');
  await p.click('#assistenteFab');
  await p.waitForSelector('#assistentePainel:not(.oculto)');
  if (!(await p.$('.assistente__msg--assistente'))) falhas.push('sem mensagem de boas-vindas');

  async function perguntar(q) {
    await p.fill('#assistenteCampo', q);
    await p.press('#assistenteCampo', 'Enter');
    await p.waitForTimeout(80);
    return p.evaluate(() => {
      const msgs = document.querySelectorAll('.assistente__msg--assistente');
      const m = msgs[msgs.length - 1];
      return { texto: m.innerText, botoes: Array.from(m.querySelectorAll('.assistente__acao')).map(x => x.textContent) };
    });
  }
  async function clicar(rotulo) {
    await p.evaluate(r => {
      const msgs = document.querySelectorAll('.assistente__msg--assistente');
      const m = msgs[msgs.length - 1];
      Array.from(m.querySelectorAll('.assistente__acao')).find(x => x.textContent === r).click();
    }, rotulo);
    await p.waitForTimeout(250);
  }
  async function reset() {
    await p.evaluate(() => {
      const seg = (id, v) => { const b = document.querySelector('#' + id + ' button[data-valor="' + v + '"]'); if (b) b.click(); };
      seg('filtroCenario', 'Consolidado'); seg('filtroVisao', 'selecionado');
      document.getElementById('btnLimparFiltros').click();
    });
  }
  const cartoes = () => p.evaluate(() => {
    const o = {};
    document.querySelectorAll('#indicadores .indicador').forEach(c => {
      o[c.dataset.cartao] = { valor: c.querySelector('.indicador__valor').textContent, apoio: c.querySelector('.indicador__apoio').textContent };
    });
    return o;
  });
  const filtrosTela = () => p.evaluate(() => Object.assign({}, PG.Estado.valores));

  // ----- 1) "Aplicar este recorte" ------------------------------------------------
  const casos = [
    ['Quanto foi contratado em SP?', 'valor'], ['Quanto de investimento selecionado no Nordeste?', 'valor'],
    ['Quanto foi para metrô e trens em SP?', 'valor'], ['Quanto foi em 2024?', 'valor'],
    ['Resumo dos Migrados', 'resumo'], ['Resumo da Bahia', 'resumo'], ['Resumo de BRT contratado', 'resumo'],
    ['Quanto foi para BRT no Ceará?', 'valor'], ['Resumo do Centro-Oeste em 2025', 'resumo'],
    ['Quanto de investimento dos Governadores?', 'valor'], ['Resumo de mobilidade ativa', 'resumo'],
    ['Quanto foi para estudos e projetos?', 'valor'], ['Quanto foi para VLT?', 'valor'],
    ['Quantas propostas em MG contratadas?', 'contagem'], ['Resumo do Rio de Janeiro', 'resumo']
  ];
  for (const [q, tipo] of casos) {
    // volta ao estado inicial entre casos
    await reset();
    const r = await perguntar(q);
    const resp = await p.evaluate(q => PG.Assistente.responder(q).fatos, q);
    const rotulo = r.botoes.find(x => /Aplicar este recorte/.test(x));
    if (!rotulo) { falhas.push(`[${q}] sem botão de aplicar (botões: ${r.botoes})`); continue; }
    await clicar(rotulo);
    const tela = await filtrosTela(); const c = await cartoes();
    const esperado = await p.evaluate(() => {
      const res = PG.Dados.calcular(PG.Estado.valores); const F = PG.Formato; return {
        inv: F.moedaCurta(res.totais.valor), prop: F.inteiro(res.totais.propostas) + ' propostas',
        conv: F.razao(res.totaisContratado.valor, res.totaisSelecionado.valor, 1), mun: F.inteiro(res.totais.municipios) };
    });
    const f0 = resp.itens ? resp.itens[0].filtros : resp.filtros;
    for (const k of ['cenario', 'visao', 'ano', 'regiao', 'uf', 'modo'])
      if (tela[k] !== f0[k] && !(k === 'regiao' && f0.uf !== 'todas')) falhas.push(`[${q}] filtro ${k}: tela=${tela[k]} resposta=${f0[k]}`);
    if (c.investimento.valor !== esperado.inv) falhas.push(`[${q}] cartão investimento ${c.investimento.valor} x ${esperado.inv}`);
    if (c.investimento.apoio !== esperado.prop) falhas.push(`[${q}] cartão propostas ${c.investimento.apoio} x ${esperado.prop}`);
    if (c.conversao.valor !== esperado.conv) falhas.push(`[${q}] cartão conversão ${c.conversao.valor} x ${esperado.conv}`);
    // número da resposta == número do cartão
    const base = resp.itens ? resp.itens[0] : resp;
    const valorResp = await p.evaluate(v => PG.Formato.moedaCurta(v), base.valor);
    if (tipo !== 'contagem' && c.investimento.valor !== valorResp) falhas.push(`[${q}] resposta ${valorResp} x cartão ${c.investimento.valor}`);
    if (resp.itens ? resp.itens[0].propostas !== undefined && tipo === 'contagem' && c.investimento.apoio !== `${resp.itens[0].propostas} propostas` : false) falhas.push(`[${q}] contagem diverge do cartão`);
    if (tipo === 'resumo') {
      if (num(c.extensao.valor) !== Math.round(resp.extensaoKm * 10) / 10 && c.extensao.valor !== await p.evaluate(v => PG.Formato.decimal(v, 1), resp.extensaoKm)) falhas.push(`[${q}] extensão ${c.extensao.valor} x ${resp.extensaoKm}`);
      if (num(c.unidades.valor) !== resp.materialRodante) falhas.push(`[${q}] material rodante ${c.unidades.valor} x ${resp.materialRodante}`);
      if (num(c.alcance.valor) !== resp.municipios) falhas.push(`[${q}] municípios ${c.alcance.valor} x ${resp.municipios}`);
    }
    verificados++;
  }

  // ----- 2) "Ver os empreendimentos no painel" ----------------------------------------
  const ent = ['Por que há 60 veículos?', 'Quantos km de trilhos?', 'Quantas estações em SP?', 'Quantos OAE?', 'Quantos abrigos no Nordeste?',
    'Quantas passarelas?', 'Quantos veículos em metrô e trens?', 'Quantos km de corredores contratados?', 'Quantos terminais?', 'Quantos ITS?', 'Quantas estações em 2024?', 'Quantos km de ciclovias?', 'Quantas pontes?'];
  for (const q of ent) {
    await reset();
    const r = await perguntar(q);
    const fatos = await p.evaluate(q => PG.Assistente.responder(q).fatos, q);
    const bt = r.botoes.find(x => /empreendimentos no painel/.test(x));
    if (!bt) { falhas.push(`[${q}] sem botão de empreendimentos`); continue; }
    await clicar(bt);
    const det = await p.evaluate(() => {
      const d = document.querySelector('#infraestrutura .infra__detalhe');
      if (!d) return null;
      const linhas = Array.from(d.querySelectorAll('tbody tr')).map(tr => tr.lastChild.textContent);
      return { titulo: d.querySelector('.infra__detalhe__titulo').textContent, linhas, total: d.querySelector('tfoot td.n').textContent,
               linhaMetrica: document.querySelector('#infraestrutura .infra__linha.esta-aberto .infra__metrica').textContent };
    });
    if (!det) { falhas.push(`[${q}] detalhe não abriu`); continue; }
    const soma = det.linhas.reduce((a, t) => a + num(t), 0);
    const fa = fatos.itens[0]; const alvoChave = fa.chave;
    // pontes/viadutos: o detalhe abre a linha de OAE (pai); só conferimos o pai
    const esperado = (alvoChave === 'pontes' || alvoChave === 'viadutos') ? null : fa.total;
    if (esperado !== null) {
      if (Math.abs(num(det.total) - esperado) > 0.051) falhas.push(`[${q}] total da lista ${det.total} x resposta ${esperado}`);
      if (Math.abs(soma - esperado) > 0.05 * det.linhas.length + 0.01) falhas.push(`[${q}] soma das linhas ${soma} x resposta ${esperado}`);
      if (Math.abs(num(det.linhaMetrica) - esperado) > 0.051) falhas.push(`[${q}] linha do painel ${det.linhaMetrica} x resposta ${esperado}`);
    } else if (!/OAE/.test(det.titulo)) falhas.push(`[${q}] detalhe de OAE não abriu`);
    // as linhas listadas na resposta existem na lista
    verificados++;
  }

  // ----- 3) "Ver propostas desta seleção" e demais botões ----------------------------
  await reset();
  let r = await perguntar('Quantos veículos em metrô e trens?');
  await clicar('Ver propostas desta seleção');
  const prop = await p.evaluate(() => {
    const corpo = document.getElementById('propostasSelecaoCorpo');
    const linhas = Array.from(corpo.querySelectorAll('tbody tr')).map(tr => tr.innerText);
    return { aberto: !corpo.classList.contains('oculto'), n: linhas.length, veiculos: linhas.filter(t => /veículos/.test(t)).map(t => (t.match(/(\d+) veículos/) || [])[1]) };
  });
  if (!prop.aberto) falhas.push('propostas desta seleção não abriu');
  const somaVeic = prop.veiculos.reduce((a, x) => a + Number(x), 0);
  const fatosVeic = await p.evaluate(() => PG.Assistente.responder('Quantos veículos em metrô e trens?').fatos.itens[0].total);
  if (somaVeic !== fatosVeic || somaVeic !== 60) falhas.push(`veículos em "Propostas desta seleção": soma ${somaVeic} x resposta ${fatosVeic} x 60`);

  for (const [q, botao] of [['O que é Migrado Novo PAC?', 'Ver só os Migrados'], ['Como conferir um número?', 'Ver “Como ler este painel”'], ['Como funciona o filtro?', 'Limpar filtros'], ['O que é o funil?', 'Ir ao funil']]) {
    await perguntar(q); await clicar(botao); verificados++;
  }
  const t = await filtrosTela();
  // último botão: "Ir ao funil" não muda filtros; antes, 'Ver só os Migrados' mudou — 'Limpar filtros' não mexe no cenário
  const comoLerAberto = await p.$eval('#comoLerCorpo', e => !e.classList.contains('oculto'));
  if (!comoLerAberto) falhas.push('botão "Ver Como ler este painel" não abriu o bloco');

  // ----- 3b) ranking de propostas x tabela "Propostas desta seleção" -----------------
  // A lista do assistente e a da tela têm de ser a MESMA lista, na mesma ordem.
  for (const [q, filtro] of [['quais as maiores propostas?', null],
                             ['quais as maiores propostas em SP?', { uf: 'SP' }],
                             ['quais as maiores propostas contratadas?', { visao: 'contratado' }],
                             ['quais as maiores propostas de metrô e trens?', { modo: 'Metrô e trens' }]]) {
    await reset();
    r = await perguntar(q);
    const fatos = await p.evaluate(q => PG.Assistente.responder(q).fatos, q);
    const aplicar = r.botoes.find(x => /Aplicar este recorte/.test(x));
    if (aplicar) await clicar(aplicar);
    await p.evaluate(() => {
      const c = document.getElementById('propostasSelecaoCorpo');
      if (c.classList.contains('oculto')) document.getElementById('btnAlternarPropostasSelecao').click();
    });
    await p.waitForTimeout(250);
    const tabela = await p.evaluate(() => {
      const c = document.getElementById('propostasSelecaoCorpo');
      const trs = Array.from(c.querySelectorAll('tbody tr'));
      const cel = tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
      return { linhas: trs.length, primeira: trs.length ? cel(trs[0]) : null,
               total: (function () {
                 const tds = c.querySelectorAll('tfoot td');
                 return tds.length ? tds[tds.length - 1].textContent.trim() : null;
               })() };
    });
    if (filtro) {
      const tela = await filtrosTela();
      for (const k in filtro) if (tela[k] !== filtro[k]) falhas.push(`[${q}] filtro ${k}: ${tela[k]} x ${filtro[k]}`);
    }
    if (fatos.dimensao !== 'proposta') { falhas.push(`[${q}] dimensão ${fatos.dimensao}`); continue; }
    const topo = await p.evaluate(v => PG.Formato.moedaCurta(v), fatos.linhas[0].valor);
    const totalFmt = await p.evaluate(v => PG.Formato.moedaCurta(v), fatos.total);
    if (!tabela.primeira) { falhas.push(`[${q}] tabela vazia`); continue; }
    if (tabela.primeira[tabela.primeira.length - 1] !== topo)
      falhas.push(`[${q}] 1ª linha da tabela ${tabela.primeira[tabela.primeira.length - 1]} x assistente ${topo}`);
    if (tabela.total !== totalFmt) falhas.push(`[${q}] total da tabela ${tabela.total} x assistente ${totalFmt}`);
    const nomeAssistente = fatos.linhas[0].chave.replace(/…$/, '');
    const nomeTabela = tabela.primeira[6] || '';
    if (nomeTabela.indexOf(nomeAssistente.slice(0, 30)) < 0)
      falhas.push(`[${q}] empreendimento da 1ª linha: "${nomeTabela.slice(0, 40)}" x "${nomeAssistente.slice(0, 40)}"`);
    verificados++;
  }

  // ----- 3c) ficha de uma proposta --------------------------------------------------
  for (const [q, uf, proposta] of [['Me fale sobre a proposta 8654/2024', 'BA', '8654/2024'],
                                   ['proposta 56000001868/2023', 'DF', '56000001868/2023'],
                                   ['detalhes do ID Governa 4575', 'SP', null]]) {
    await reset();
    r = await perguntar(q);
    const fatos = await p.evaluate(q => PG.Assistente.responder(q).fatos, q);
    if (fatos.tipo !== 'ficha') { falhas.push(`[${q}] veio ${fatos.tipo}`); continue; }
    if (fatos.uf !== uf) falhas.push(`[${q}] UF ${fatos.uf} x ${uf}`);
    const bt = r.botoes.find(x => /Ver no painel/.test(x));
    if (!bt) { falhas.push(`[${q}] sem botão "Ver no painel"`); continue; }
    await clicar(bt);
    const tela = await filtrosTela();
    if (tela.uf !== uf) falhas.push(`[${q}] filtro de UF na tela: ${tela.uf} x ${uf}`);
    const achou = await p.evaluate(pr => {
      const c = document.getElementById('propostasSelecaoCorpo');
      if (c.classList.contains('oculto')) return 'fechado';
      if (!pr) return 'ok';
      return Array.from(c.querySelectorAll('tbody tr')).some(tr => tr.innerText.indexOf(pr) >= 0) ? 'ok' : 'ausente';
    }, proposta);
    if (achou !== 'ok') falhas.push(`[${q}] proposta na tabela: ${achou}`);
    verificados++;
  }

  // ----- 4) acessibilidade/UX da janela ---------------------------------------------
  await p.keyboard.press('Escape');
  const fechado = await p.$eval('#assistentePainel', e => e.classList.contains('oculto'));
  if (!fechado) falhas.push('Esc não fechou o assistente');
  const fabVisivel = await p.$eval('#assistenteFab', e => !e.classList.contains('oculto'));
  if (!fabVisivel) falhas.push('botão flutuante não voltou');

  console.log('conferências de interface:', verificados);
  console.log('falhas:', falhas.length); falhas.slice(0, 40).forEach(f => console.log(' -', f));
  await b.close();
  process.exit(falhas.length ? 1 : 0);
})();
