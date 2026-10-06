/* AUDITORIA (b): roda o painel no navegador e despeja o resultado de
   PG.Dados.calcular() para todas as combinações de filtros. */
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const erros = [];
  p.on('pageerror', e => erros.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') erros.push('console: ' + m.text()); });
  await p.goto('file://' + process.argv[2] + '/index.html');
  await p.waitForTimeout(1500);

  const saida = await p.evaluate(() => {
    const op = PG.Dados.meta.opcoes;
    const combos = [];
    const base = { cenario: 'Consolidado', visao: 'selecionado', ano: 'todos',
                   regiao: 'todas', uf: 'todas', modo: 'todos', metricaInfra: 'entregas' };
    const tipos = (op.tipologias && op.tipologias.length) ? op.tipologias : op.modos;
    // Um eixo por vez, e depois os cruzamentos de visão x cenário x tipologia.
    ['Consolidado'].concat(op.cenarios.slice(1)).forEach(c =>
      ['selecionado', 'contratado'].forEach(v => {
        combos.push(Object.assign({}, base, { cenario: c, visao: v }));
        op.anos.forEach(a => combos.push(Object.assign({}, base, { cenario: c, visao: v, ano: a })));
        op.regioes.forEach(r => combos.push(Object.assign({}, base, { cenario: c, visao: v, regiao: r })));
        op.ufs.forEach(u => combos.push(Object.assign({}, base, { cenario: c, visao: v, uf: u })));
        tipos.forEach(m => combos.push(Object.assign({}, base, { cenario: c, visao: v, modo: m })));
        // cruzamentos tipologia x região
        tipos.forEach(m => op.regioes.forEach(r =>
          combos.push(Object.assign({}, base, { cenario: c, visao: v, modo: m, regiao: r }))));
      }));

    const compacto = (r, f) => ({
      filtros: f,
      recorte: r.recorte.map(x => x.id),
      universo: r.universo.map(x => x.id),
      totaisSel: r.totaisSelecionado, totaisCon: r.totaisContratado,
      totais: r.totais,
      funil: r.funil.etapas.map(e => ({ chave: e.chave, q: e.quantidade, v: e.valor, c: e.conversao })),
      composicao: r.funil.composicao,
      modos: r.modos.map(l => ({ chave: l.chave, propostas: l.propostas, valor: l.valor,
                                 km: l.km, unidades: l.unidades, participacao: l.participacao })),
      entregas: r.entregas ? { empreendimentos: r.entregas.empreendimentos,
        itens: r.entregas.itens.map(i => ({ chave: i.chave, valor: i.valor,
          empreendimentos: i.empreendimentos })) } : null,
      migrados: r.migrados,
      regioes: r.regioes.map(l => ({ chave: l.chave, propostas: l.propostas, valor: l.valor })),
      anos: r.anos.map(l => ({ chave: l.chave, propostas: l.propostas, valor: l.valor })),
      ufs: r.ufs.map(l => ({ chave: l.chave, propostas: l.propostas, valor: l.valor })),
      fontes: r.fontes.map(l => ({ chave: l.chave, valor: l.valor })),
      agentes: r.agentes.map(l => ({ chave: l.chave, valor: l.valor })),
      categorias: r.categorias.map(l => ({ chave: l.chave, valor: l.valor })),
      alertas: r.alertas.length
    });

    return combos.map(f => compacto(PG.Dados.calcular(f), f));
  });

  fs.writeFileSync(process.argv[3], JSON.stringify(saida));
  console.log('combinações:', saida.length, '| erros de JS:', JSON.stringify(erros));
  await b.close();
})();
