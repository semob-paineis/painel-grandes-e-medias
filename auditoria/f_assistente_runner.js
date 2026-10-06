// Executa PG.Assistente.responder para cada pergunta de um JSON e devolve os "fatos".
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [entrada, saida, painel] = process.argv.slice(2);
  const perguntas = JSON.parse(fs.readFileSync(entrada, 'utf8'));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const erros = [];
  p.on('pageerror', e => erros.push(e.message));
  await p.goto('file://' + painel);
  await p.waitForFunction(() => document.querySelector('#indicadores .indicador'));
  const res = await p.evaluate(qs => qs.map(q => {
    try {
      PG.Assistente._reset && PG.Assistente._reset();
      const x = PG.Assistente.responder(q);
      return { q, fatos: x.fatos, acoes: (x.acoes || []).map(a => a.rotulo), texto: x.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() };
    } catch (e) { return { q, erro: String(e && e.stack || e) }; }
  }), perguntas);
  fs.writeFileSync(saida, JSON.stringify({ res, erros }, null, 1));
  await b.close();
})();
