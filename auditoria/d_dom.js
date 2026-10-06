/* AUDITORIA (d): confere o que está DESENHADO na tela contra o que
   PG.Dados.calcular() devolve, em várias combinações de filtros e nas
   quatro abas do bloco de entregas. Também abre o detalhe de cada
   indicador e confere a soma da lista de empreendimentos. */
const { chromium } = require('playwright');

const num = t => {
  const m = String(t).replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : NaN;
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  const problemas = [];
  let detalhes = 0;
  p.on('pageerror', e => problemas.push('ERRO JS: ' + e.message));
  await p.goto('file://' + process.argv[2] + '/index.html');
  await p.waitForTimeout(1200);

  const combos = [
    { cenario: 'Consolidado', visao: 'selecionado' },
    { cenario: 'Consolidado', visao: 'contratado' },
    { cenario: 'Migrado Novo PAC', visao: 'selecionado' },
    { cenario: 'Governadores', visao: 'selecionado' },
    { cenario: 'Consolidado', visao: 'selecionado', regiao: 'Nordeste' },
    { cenario: 'Consolidado', visao: 'selecionado', uf: 'SP' },
    { cenario: 'Consolidado', visao: 'selecionado', modo: 'Metrô e trens' },
    { cenario: 'Consolidado', visao: 'contratado', modo: 'BRT e corredores de ônibus' },
    { cenario: 'Consolidado', visao: 'selecionado', ano: '2024' }
  ];

  for (const c of combos) {
    const rot = JSON.stringify(c);
    await p.evaluate(f => {
      PG.Estado.definirVarios(Object.assign(
        { cenario: 'Consolidado', visao: 'selecionado', ano: 'todos',
          regiao: 'todas', uf: 'todas', modo: 'todos', metricaInfra: 'entregas' }, f));
    }, c);
    await p.waitForTimeout(350);

    // --- abre o bloco de propostas desta seleção -------------------------
    const aberto = await p.$eval('#propostasSelecaoCorpo', e => !e.classList.contains('oculto'));
    if (!aberto) { await p.click('#btnAlternarPropostasSelecao'); await p.waitForTimeout(250); }

    const r = await p.evaluate(() => {
      const res = PG.Dados.calcular(PG.Estado.valores);
      return {
        selQ: res.totaisSelecionado.propostas, selV: res.totaisSelecionado.valor,
        conQ: res.totaisContratado.propostas, conV: res.totaisContratado.valor,
        municipios: res.totais.municipios, ufs: res.totais.ufs,
        universo: res.universo.length,
        funil: res.funil.etapas.map(e => [e.quantidade, e.valor]),
        entregas: res.entregas.itens.filter(i => i.valor > 0)
          .map(i => [i.rotulo, i.valor, i.unidade, i.chave]),
        modos: res.modos.map(m => [m.chave, m.valor])
      };
    });

    // --- cartões ---------------------------------------------------------
    const cartoes = await p.$$eval('#indicadores .indicador',
      els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    const esperadoQ = (c.visao === 'contratado') ? r.conQ : r.selQ;
    const propostasCartao = num((cartoes[0] || '').split('bi').pop());
    if (propostasCartao !== esperadoQ && esperadoQ > 0) {
      problemas.push(`${rot}: cartão de propostas ${propostasCartao} != ${esperadoQ}`);
    }
    const alcance = cartoes.find(t => t.includes('Alcance')) || '';
    const mMun = alcance.match(/(\d+)\s*municípios/);
    const mUf = alcance.match(/(\d+)\s*unidades/);
    if (mMun && parseInt(mMun[1], 10) !== r.municipios) {
      problemas.push(`${rot}: cartão de municípios ${mMun[1]} != ${r.municipios}`);
    }
    if (mUf && parseInt(mUf[1], 10) !== r.ufs) {
      problemas.push(`${rot}: cartão de UFs ${mUf[1]} != ${r.ufs}`);
    }
    const conv = cartoes.find(t => t.includes('Conversão')) || '';
    const mConv = conv.match(/(\d+)\s*de\s*(\d+)/);
    if (mConv && (parseInt(mConv[1], 10) !== r.conQ || parseInt(mConv[2], 10) !== r.selQ)) {
      problemas.push(`${rot}: cartão de conversão ${mConv[0]} != ${r.conQ} de ${r.selQ}`);
    }

    // --- contagem do bloco de propostas ----------------------------------
    const contagem = num(await p.$eval('#propostasSelecaoContagem', e => e.textContent));
    const linhasTabela = await p.$$eval('#propostasSelecaoCorpo tbody tr', e => e.length);
    if (contagem !== linhasTabela) {
      problemas.push(`${rot}: contagem ${contagem} != ${linhasTabela} linhas na tabela`);
    }
    if (contagem !== r.universo) {
      problemas.push(`${rot}: propostas desta seleção ${contagem} != universo ${r.universo}`);
    }

    // --- funil -----------------------------------------------------------
    const funil = await p.$$eval('.funil__etapa, .funil .funil__linha',
      els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    if (funil.length && num(funil[0]) !== r.funil[0][0]) {
      problemas.push(`${rot}: funil etapa 1 = ${funil[0]} esperado ${r.funil[0][0]}`);
    }

    // --- abas do bloco de entregas ---------------------------------------
    for (const [aba, filtro] of [['Todas as entregas', null], ['Extensão', 'km'],
                                 ['Unidades', 'un.'], ['Investimento', 'valor']]) {
      await p.click(`#metricaInfra >> text=${aba}`);
      await p.waitForTimeout(250);
      const linhas = await p.$$eval('.infra__linha',
        els => els.map(e => ({
          nome: e.querySelector('.infra__nome').textContent.trim(),
          metrica: e.querySelector('.infra__metrica').textContent.trim()
        })));
      if (filtro === 'valor') {
        const esperado = r.modos.filter(m => m[1] > 0).length;
        if (linhas.length !== esperado) {
          problemas.push(`${rot}/${aba}: ${linhas.length} linhas != ${esperado} tipologias`);
        }
      } else {
        const esperado = r.entregas.filter(e => !filtro || e[2] === filtro);
        if (linhas.length !== esperado.length) {
          problemas.push(`${rot}/${aba}: ${linhas.length} linhas != ${esperado.length}`);
          continue;
        }
        esperado.forEach((e, i) => {
          const mostrado = num(linhas[i].metrica);
          const alvo = e[2] === 'km' ? Math.round(e[1] * 10) / 10 : e[1];
          if (Math.abs(mostrado - alvo) > 0.051) {
            problemas.push(`${rot}/${aba}: ${e[0]} mostrado ${mostrado} != ${alvo}`);
          }
        });
      }
    }

    // --- detalhe (rastreabilidade): soma da lista = número da linha ------
    await p.click('#metricaInfra >> text=Todas as entregas');
    await p.waitForTimeout(250);
    const qtd = await p.$$eval('.infra__linha--abrivel', e => e.length);
    for (let i = 0; i < qtd; i++) {
      const res = await p.evaluate(async (idx) => {
        const linhas = document.querySelectorAll('.infra__linha--abrivel');
        const el = linhas[idx];
        const nome = el.querySelector('.infra__nome').textContent.trim();
        el.click();
        await new Promise(r => setTimeout(r, 60));
        const det = el.nextSibling;
        if (!det || !det.classList.contains('infra__detalhe')) return { nome, erro: 'sem detalhe' };
        const corpo = Array.from(det.querySelectorAll('tbody tr')).map(tr =>
          Array.from(tr.children).map(td => td.textContent.trim()));
        const rodape = det.querySelector('tfoot td.n').textContent.trim();
        el.click();
        return { nome, corpo, rodape };
      }, i);
      if (res.erro) { problemas.push(`${rot}: ${res.nome}: ${res.erro}`); continue; }
      detalhes++;
      const soma = res.corpo.reduce((a, l) => a + num(l[5]), 0);
      const total = num(res.rodape);
      if (Math.abs(soma - total) > 0.11) {
        problemas.push(`${rot}: detalhe de ${res.nome}: soma ${soma.toFixed(2)} != total ${total}`);
      }
      const semProposta = res.corpo.filter(l => !l[2] || l[2] === '—').length;
      if (semProposta) {
        problemas.push(`${rot}: detalhe de ${res.nome}: ${semProposta} linha(s) sem nº de proposta`);
      }
    }
  }

  console.log('detalhes conferidos:', detalhes);
  console.log(problemas.length ? problemas.join('\n') : 'DOM: nenhuma divergência.');
  await b.close();
  process.exit(problemas.length ? 1 : 0);
})();
