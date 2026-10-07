/* AUDITORIA (e): CSV exportado pelo painel e integridade do Radar. */
const { chromium } = require('playwright');
const fs = require('fs');

/** Parser CSV conforme RFC 4180: aspas, ponto e vírgula e quebras dentro
    do campo. Um split ingênuo erra em texto com ';'. */
function parseCSV(texto) {
  const t = texto.replace(/^\uFEFF/, '');
  const linhas = []; let campo = '', linha = [], aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ';') { linha.push(campo); campo = ''; }
    else if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

/** Mesmo formato do painel: R$ 28,05 bi. */
function fmtBi(v) {
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2,
    maximumFractionDigits: 2 }).format((v || 0) / 1e9) + ' bi';
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const problemas = [];

  // ---------- painel: CSV da base filtrada ----------------------------------
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  p.on('pageerror', e => problemas.push('ERRO JS painel: ' + e.message));
  await p.goto('file://' + process.argv[2] + '/index.html');
  await p.waitForTimeout(1200);

  const csv = await p.evaluate(() => {
    let capturado = null;
    const original = PG.Util.baixarArquivo;
    PG.Util.baixarArquivo = function (conteudo) { capturado = conteudo; };
    document.getElementById('expCSV').click();
    PG.Util.baixarArquivo = original;
    return capturado;
  });
  if (!csv) problemas.push('CSV não foi gerado');
  else {
    const linhas = parseCSV(csv);
    const cab = linhas[0];
    ['Tipologia', 'Corredores/BRT (km)', 'Veículos', 'Migrado Novo PAC'].forEach(c => {
      if (!cab.includes(c)) problemas.push(`CSV sem a coluna "${c}"`);
    });
    const r = await p.evaluate(() => {
      const res = PG.Dados.calcular(PG.Estado.valores);
      return { recorte: res.universo.length,
               valor: res.totaisSelecionado.valor,
               veiculos: res.entregas.porChave.veiculos.valor,
               corredor: res.entregas.porChave.corredorKm.valor };
    });
    if (linhas.length - 1 !== r.recorte) {
      problemas.push(`CSV com ${linhas.length - 1} linhas != ${r.recorte} do recorte`);
    }
    const iv = cab.indexOf('Veículos'), ic = cab.indexOf('Corredores/BRT (km)');
    const ivalor = cab.indexOf('Valor considerado (R$)');
    const corpo = linhas.slice(1);
    const soma = (i) => corpo.reduce((a, l) => a + (parseFloat(String(l[i]).replace(',', '.')) || 0), 0);
    if (Math.abs(soma(iv) - r.veiculos) > 0.01) {
      problemas.push(`CSV: veículos ${soma(iv)} != ${r.veiculos}`);
    }
    if (Math.abs(soma(ic) - r.corredor) > 0.05) {
      problemas.push(`CSV: corredores ${soma(ic)} != ${r.corredor}`);
    }
    if (Math.abs(soma(ivalor) - r.valor) > 1) {
      problemas.push(`CSV: valor considerado ${soma(ivalor)} != ${r.valor}`);
    }
  }

  // ---------- Radar ---------------------------------------------------------
  const q = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  q.on('pageerror', e => problemas.push('ERRO JS radar: ' + e.message));
  await q.goto('file://' + process.argv[2] + '/propostas.html');
  await q.waitForTimeout(1200);

  const radar = await q.evaluate(() => {
    const base = window.DADOS_PROPOSTAS;
    const apoio = base.propostas.reduce((a, p) => a + (p.migrado ? p.valorContratado : p.apoio), 0);
    const contratado = base.propostas.reduce((a, p) => a + p.valorContratado, 0);
    const cartoes = Array.from(document.querySelectorAll('#resumoCards .indicador'))
      .map(e => e.innerText.replace(/\s+/g, ' ').trim());
    return {
      total: base.propostas.length, apoio, contratado, cartoes,
      rodape: document.getElementById('contagemResultados').innerText.replace(/\s+/g, ' '),
      selos: Array.from(document.querySelectorAll('tbody .selo')).map(e => e.textContent.trim()),
      colunas: Array.from(document.querySelectorAll('thead th')).map(e => e.textContent.trim())
    };
  });
  // O Radar e o painel leem a mesma aba: a contagem e os totais têm de bater
  // com a base, e não com um número escrito aqui — que envelhece a cada
  // atualização da planilha e deixa de testar o que importa.
  const painel = JSON.parse(fs.readFileSync(process.argv[2] + '/dados.json', 'utf8'));
  const universo = painel.registros.filter(r => r.noEscopo &&
    ['contratado', 'aContratar', 'desistencia'].includes(r.etapa));
  const selPainel = universo.reduce((a, r) =>
    a + (r.tipo === 'Migrado Novo PAC' ? r.valorContratado : r.apoio), 0);
  const conPainel = universo.filter(r => r.etapa === 'contratado')
    .reduce((a, r) => a + (r.valorContratado || 0), 0);
  if (radar.total !== universo.length) {
    problemas.push(`Radar: ${radar.total} propostas, painel ${universo.length}`);
  }
  if (Math.abs(radar.apoio - selPainel) > 1) {
    problemas.push(`Radar x painel (selecionado): ${radar.apoio.toFixed(2)} x ${selPainel.toFixed(2)}`);
  }
  if (Math.abs(radar.contratado - conPainel) > 1) {
    problemas.push(`Radar x painel (contratado): ${radar.contratado.toFixed(2)} x ${conPainel.toFixed(2)}`);
  }
  if (radar.selos.includes('Habilitados')) problemas.push('Radar: selo "Habilitados" ainda presente');
  if (!radar.colunas.some(c => /Migrado/.test(c))) problemas.push('Radar: sem a coluna Migrado');
  const esperadoRodape = fmtBi(radar.apoio);
  if (radar.rodape.indexOf(esperadoRodape) < 0) {
    problemas.push(`Radar: rodapé sem o total ${esperadoRodape} — ` + radar.rodape);
  }
  if (radar.cartoes.length !== 3) {
    problemas.push('Radar: ' + radar.cartoes.length + ' cartões (esperado 3)');
  }

  console.log(problemas.length ? problemas.join('\n') : 'CSV e Radar: nenhuma divergência.');
  await b.close();
  process.exit(problemas.length ? 1 : 0);
})();
