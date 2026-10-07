/* AUDITORIA (i): todo valor em R$ exibido está em bilhões?
   Abre as duas páginas, expande blocos, passa o mouse sobre cartões, linhas e
   mapa (dicas), faz perguntas ao assistente e varre o texto visível atrás de
   qualquer valor monetário em "mi", "mil" ou reais cheios. */
const { chromium } = require('playwright');
const PROIBIDO = [
  /R\$\s*-?[\d.]+(,\d+)?\s*(mi|mil|milh|milhões|milhoes)\b/i,   // R$ 25,7 mi / R$ 600 mil
  /R\$\s*-?\d{1,3}(\.\d{3})+(,\d{2})?(?!\s*bi)/,                 // R$ 1.234.567,89
  /\b\d+(,\d+)?\s+mi\b(?!lh)/                                      // "964,9 mi" sem R$
];
(async () => {
  const base = process.argv[2];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const achados = []; let textos = 0;
  const varrer = async (p, onde) => {
    const t = await p.evaluate(() => document.body.innerText);
    textos++;
    // Textos que explicam a conversão citam milhões de propósito ("R$ 0,965 bi
    // são R$ 965 milhões") — não são valores exibidos.
    t.split('\n').filter(l => !/bilh(ões|oes)/i.test(l)).forEach(l => PROIBIDO.forEach(re => {
      if (re.test(l)) achados.push(`[${onde}] ${l.trim().slice(0, 120)}`);
    }));
  };
  // ---- painel
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await p.goto('file://' + base + '/index.html');
  await p.waitForSelector('#indicadores .indicador'); await p.waitForTimeout(800);
  await p.evaluate(() => { ['btnAlternarPropostasSelecao', 'btnAlternarComoLer'].forEach(id => document.getElementById(id).click()); });
  for (const aba of ['entregas', 'km', 'unidades', 'valor']) {
    await p.click(`#metricaInfra button[data-valor="${aba}"]`); await p.waitForTimeout(250);
    await varrer(p, 'painel aba ' + aba);
  }
  // dicas: cartões, linhas de infraestrutura, funil, tabelas, mapa
  const alvos = await p.$$('#indicadores .indicador, #infraestrutura .infra__linha, #funil .funil__trilho, #tabelaRegioes tbody tr, #tabelaUFs tbody tr, #mapa path');
  for (const el of alvos.slice(0, 60)) {
    try { await el.hover({ timeout: 800 }); await p.waitForTimeout(60);
      const d = await p.evaluate(() => { const x = document.querySelector('.dica.visivel'); return x ? x.innerText : ''; });
      d.split('\n').forEach(l => PROIBIDO.forEach(re => { if (re.test(l)) achados.push('[dica] ' + l.trim()); }));
    } catch (e) {}
  }
  // cenários
  for (const c of ['Migrado Novo PAC', 'Governadores']) {
    await p.click(`#filtroCenario button[data-valor="${c}"]`); await p.waitForTimeout(300);
    await varrer(p, 'cenário ' + c);
  }
  // assistente
  await p.click('#assistenteFab');
  for (const q of ['Resumo do que estou vendo', 'Qual a proposta de maior investimento?', 'quais as menores propostas?',
                   'Quanto foi selecionado e contratado em SP?', 'O que é Migrado Novo PAC?', 'Qual a conversão em contratação?',
                   'Me fale sobre a proposta 8654/2024', 'quais os maiores proponentes?', 'Qual UF recebeu mais investimento?']) {
    await p.fill('#assistenteCampo', q); await p.press('#assistenteCampo', 'Enter'); await p.waitForTimeout(150);
  }
  await varrer(p, 'assistente');
  await p.close();
  // ---- Radar
  const r = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  await r.goto('file://' + base + '/propostas.html');
  await r.waitForSelector('#corpoTabela tr'); await r.waitForTimeout(600);
  await varrer(r, 'Radar');
  const linhas = await r.$$('#corpoTabela tr');
  for (const el of linhas.slice(0, 10)) {
    try { await el.hover({ timeout: 800 }); await r.waitForTimeout(60);
      const d = await r.evaluate(() => { const x = document.querySelector('.dica.visivel'); return x ? x.innerText : ''; });
      d.split('\n').forEach(l => PROIBIDO.forEach(re => { if (re.test(l)) achados.push('[dica Radar] ' + l.trim()); }));
    } catch (e) {}
  }
  const cab = await r.evaluate(() => Array.from(document.querySelectorAll('#cabecalhoTabela th')).map(t => t.innerText.trim()).filter(t => /R\$/.test(t)));
  console.log('cabeçalhos com R$ no Radar:', cab);
  console.log('telas varridas:', textos, '| dicas inspecionadas: até', alvos.length + 10);
  const unicos = [...new Set(achados)];
  console.log(unicos.length ? 'VALORES FORA DE BILHÕES:\n - ' + unicos.join('\n - ') : 'Nenhum valor fora de bilhões.');
  await b.close();
  process.exit(unicos.length ? 1 : 0);
})();
