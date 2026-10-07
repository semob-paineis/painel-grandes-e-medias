/* AUDITORIA (h): overflow horizontal e responsividade.
   Para cada largura, mede document.scrollWidth x clientWidth e lista TODOS os
   elementos cuja caixa ultrapassa a largura do viewport, com o caminho no DOM,
   a largura medida e os estilos que explicam o estouro. Rolagem horizontal é
   permitida apenas DENTRO dos recipientes marcados como roláveis. */
const { chromium } = require('playwright');

// As quatro larguras pedidas, mais as mais comuns de Android e tablet e duas
// de desktop (para garantir que a correção do celular não mexeu no desktop).
const LARGURAS = (process.env.LARGURAS || '320,360,375,390,414,430,540,768,1024,1280')
  .split(',').map(Number);
const TEMAS = (process.env.TEMAS || 'claro,escuro').split(',');
const ROLAVEIS_OK = ['.tabela-envolucro', '.segmentado', '.grafico', '.mapa__envolucro', '.assistente__log'];

(async () => {
  const base = process.argv[2] || '/home/claude/painel-grandes-e-medias';
  const paginas = (process.argv[3] || 'index.html,propostas.html').split(',');
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
  let problemas = 0;

  for (const pagina of paginas) {
    for (const largura of LARGURAS) {
      for (const tema of TEMAS) {
      for (const abrir of [false, true]) {
        const p = await b.newPage({ viewport: { width: largura, height: 800 }, deviceScaleFactor: 2 });
        const erros = [];
        p.on('pageerror', e => erros.push(e.message));
        await p.goto('file://' + base + '/' + pagina);
        await p.waitForSelector('.bloco, #indicadores .indicador', { timeout: 15000 });
        if (tema === 'escuro') { await p.click('#btnTema'); await p.waitForTimeout(250); }
        await p.waitForTimeout(500);

        if (abrir) {
          // Abre tudo o que pode esconder conteúdo largo (tabelas, detalhes, assistente)
          await p.evaluate(() => {
            ['btnAlternarPropostasSelecao', 'btnAlternarComoLer'].forEach(id => {
              const b = document.getElementById(id); if (b) b.click();
            });
            const linha = document.querySelector('#infraestrutura .infra__linha--abrivel');
            if (linha) linha.click();
            const fab = document.getElementById('assistenteFab'); if (fab) fab.click();
          });
          await p.waitForTimeout(600);
          // menus suspensos e painéis flutuantes também não podem estourar
          await p.evaluate(() => {
            const exp = document.getElementById('btnExportar'); if (exp) exp.click();
            const filtroCol = document.querySelector('.btn-filtro-coluna'); if (filtroCol) filtroCol.click();
          });
          await p.waitForTimeout(300);
          const campo = await p.$('#assistenteCampo');
          if (campo) {
            await p.fill('#assistenteCampo', 'qual a proposta de maior investimento?');
            await p.press('#assistenteCampo', 'Enter');
            await p.waitForTimeout(400);
          }
        }

        const r = await p.evaluate((ok) => {
          const vw = document.documentElement.clientWidth;
          const out = { vw, scrollW: document.documentElement.scrollWidth,
                        bodyScrollW: document.body.scrollWidth, culpados: [] };
          const caminho = el => {
            const partes = [];
            for (let e = el; e && e.nodeType === 1 && partes.length < 4; e = e.parentElement) {
              let s = e.tagName.toLowerCase();
              if (e.id) { partes.unshift(s + '#' + e.id); break; }
              if (e.className && typeof e.className === 'string')
                s += '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.');
              partes.unshift(s);
            }
            return partes.join(' > ');
          };
          document.querySelectorAll('*').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;
            const estoura = rect.right > vw + 0.5 || rect.left < -0.5;
            // rolagem interna legítima: o conteúdo é maior, mas a caixa cabe
            const rolaDentro = el.scrollWidth > el.clientWidth + 1;
            const permitido = ok.some(sel => el.closest(sel));
            if (estoura && !permitido) {
              out.culpados.push({
                caminho: caminho(el), left: Math.round(rect.left), right: Math.round(rect.right),
                w: Math.round(rect.width),
                css: [cs.width, cs.minWidth, cs.position, cs.display, cs.flexBasis, cs.gridTemplateColumns]
                  .join(' | ').slice(0, 120),
                texto: (el.textContent || '').trim().slice(0, 40)
              });
            }
            // Só é corte de verdade quando a caixa REALMENTE recorta: com
            // overflow visible o conteúdo apenas transborda, e esse transbordo
            // já aparece na medição do próprio filho. Reticências declaradas
            // (text-overflow) são truncamento intencional, não corte.
            const recorta = cs.overflowX !== 'visible';
            const reticencias = cs.textOverflow === 'ellipsis';
            if (rolaDentro && recorta && !reticencias && !permitido &&
                el !== document.body && el !== document.documentElement) {
              out.culpados.push({
                caminho: caminho(el) + '  [rolagem interna não prevista]',
                w: Math.round(rect.width), scrollW: el.scrollWidth,
                css: [cs.overflowX, cs.width, cs.minWidth].join(' | '),
                texto: (el.textContent || '').trim().slice(0, 40)
              });
            }
          });
          out.truncados = [];
          document.querySelectorAll('*').forEach(el => {
            const cs = getComputedStyle(el);
            if (cs.textOverflow === 'ellipsis' && cs.overflowX !== 'visible' &&
                el.scrollWidth > el.clientWidth + 1 && el.offsetParent !== null) {
              out.truncados.push((el.className || el.tagName) + ': ' + (el.textContent || '').trim().slice(0, 36));
            }
          });
          out.truncados = [...new Set(out.truncados)].slice(0, 6);
          // deduplica por caminho
          const vistos = new Set();
          out.culpados = out.culpados.filter(c => {
            const k = c.caminho + c.w; if (vistos.has(k)) return false; vistos.add(k); return true;
          }).slice(0, 14);
          return out;
        }, ROLAVEIS_OK);

        const rolagem = r.scrollW > r.vw + 0.5;
        const etiqueta = `${pagina} @${largura}px ${tema}${abrir ? ' (tudo aberto)' : ''}`;
        if (rolagem || r.culpados.length || erros.length) {
          problemas++;
          console.log(`\n### ${etiqueta}`);
          if (rolagem) console.log(`  ROLAGEM HORIZONTAL: scrollWidth ${r.scrollW} > viewport ${r.vw}`);
          if (erros.length) console.log('  ERROS JS:', erros);
          r.culpados.forEach(c => console.log('   -', JSON.stringify(c)));
        } else {
          console.log(`ok  ${etiqueta}` + (r.truncados.length ? `   (reticências: ${r.truncados.length})` : ''));
        }
        if (r.truncados.length) r.truncados.forEach(t => console.log('      reticências:', t));
        await p.close();
      }
      }
    }
  }
  console.log(`\n${problemas ? 'COM PROBLEMAS: ' + problemas + ' cenários' : 'Nenhum overflow horizontal.'}`);
  await b.close();
  process.exit(problemas ? 1 : 0);
})();
