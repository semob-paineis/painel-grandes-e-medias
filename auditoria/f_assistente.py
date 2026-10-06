#!/usr/bin/env python3
"""Auditoria do assistente: gera perguntas com recorte conhecido, roda o assistente no
navegador e confere cada número citado contra um cálculo independente feito em Python
direto sobre dados.json (sem reutilizar nenhuma função do painel)."""
import json, subprocess, sys, itertools, re, os, collections, tempfile
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, '..')
D = json.load(open(f'{RAIZ}/dados.json'))
REG = [r for r in D['registros'] if r['noEscopo']]
ENT = D['meta']['entregas']
DIC = {d['chave']: d for d in ENT['dicionario']}
UFS = D['meta']['opcoes']['ufs']; REGIOES = D['meta']['opcoes']['regioes']
ANOS = D['meta']['opcoes']['anos']; TIPS = D['meta']['opcoes']['tipologias']
NOME_UF = {'AC':'Acre','AL':'Alagoas','AM':'Amazonas','BA':'Bahia','CE':'Ceará','DF':'Distrito Federal','ES':'Espírito Santo','GO':'Goiás','MA':'Maranhão','MG':'Minas Gerais','MS':'Mato Grosso do Sul','MT':'Mato Grosso','PB':'Paraíba','PE':'Pernambuco','PI':'Piauí','PR':'Paraná','RJ':'Rio de Janeiro','RN':'Rio Grande do Norte','RO':'Rondônia','RR':'Roraima','RS':'Rio Grande do Sul','SC':'Santa Catarina','SE':'Sergipe','SP':'São Paulo','TO':'Tocantins','PA':'Pará','AP':'Amapá'}
FRASE_TIP = {'Metrô e trens':'metrô','VLT':'VLT','BRT e corredores de ônibus':'BRT','Sistema viário e OAE':'sistema viário','Mobilidade ativa':'mobilidade ativa','Terminais e sistemas':'terminais e sistemas','Estudos e projetos':'estudos e projetos'}
TELA = dict(cenario='Consolidado', visao='selecionado')

def tip(r):
    return r.get('tipologia') or ('Estudos e Projetos' if r['categoria']=='Estudos e Projetos' else (r['modo'] or 'Não classificado'))

def recorte(s):
    out = []
    for r in REG:
        if s['cenario'] != 'Consolidado' and r['tipo'] != s['cenario']: continue
        if s.get('ano') and r['rotuloAno'] != s['ano']: continue
        if s.get('regiao') and r['regiao'] != s['regiao']: continue
        if s.get('uf') and r['uf'] != s['uf']: continue
        if s.get('modo') and tip(r) != s['modo']: continue
        if s.get('municipio') and r['municipio'] != s['municipio']: continue
        out.append(r)
    return out

def val(r, vis):
    if vis == 'selecionado': return r['valorContratado'] if r['tipo']=='Migrado Novo PAC' else r['apoio']
    return r['valorContratado']
def selec(l): return [r for r in l if r['etapa'] in ('contratado','aContratar','desistencia')]
def contr(l): return [r for r in l if r['etapa']=='contratado']
def soma(l, f): return sum((f(r) or 0) for r in l)
def ent(l, k): return soma([r for r in l if r.get('entregas')], lambda r: r['entregas'].get(k, 0))

def fmt_scope(s):
    p = []
    if s.get('uf'): p.append('em ' + (NOME_UF[s['uf']] if s.get('_nome') else s['uf']))
    elif s.get('regiao'): p.append('na região ' + s['regiao'])
    if s.get('ano'): p.append('em ' + s['ano'])
    if s.get('modo'): p.append('em ' + FRASE_TIP[s['modo']])
    if s.get('municipio'): p.append('no município de ' + s['municipio'])
    if s['cenario'] == 'Migrado Novo PAC': p.append('dos Migrados')
    if s['cenario'] == 'Governadores': p.append('dos Governadores')
    return ' '.join(p)

def escopos():
    L = []
    base = dict(cenario='Consolidado')
    for c in ['Consolidado','Migrado Novo PAC','Governadores']: L.append(dict(base, cenario=c))
    for u in UFS: L.append(dict(base, uf=u)); L.append(dict(base, uf=u, _nome=True)) if u not in ('PA','AP') else None
    for g in REGIOES: L.append(dict(base, regiao=g))
    for a in ANOS: L.append(dict(base, ano=a))
    for t in TIPS: L.append(dict(base, modo=t))
    ms = sorted({r['municipio'] for r in REG if r['municipio'] and len(r['municipio'])>=4 and r['municipio'] not in NOME_UF.values() and ',' not in r['municipio']})
    for m in ms: L.append(dict(base, municipio=m))
    # combinações
    for u, t in itertools.product(['SP','CE','BA','DF','PE','MG'], TIPS): L.append(dict(base, uf=u, modo=t))
    for a, t in itertools.product(ANOS, ['Metrô e trens','BRT e corredores de ônibus']): L.append(dict(base, ano=a, modo=t))
    for g, a in itertools.product(REGIOES, ['2024','2025']): L.append(dict(base, regiao=g, ano=a))
    for c, u in itertools.product(['Migrado Novo PAC','Governadores'], ['SP','PE','CE','BA','MG','RJ']): L.append(dict(base, cenario=c, uf=u))
    for c, t in itertools.product(['Migrado Novo PAC','Governadores'], TIPS): L.append(dict(base, cenario=c, modo=t))
    return L

def com_visao(s, v):
    d = dict(s); d['_visao'] = v; return d

def monta():
    Q = []  # (pergunta, tipo, escopo_esperado, extra)
    for s in escopos():
        for v in (None, 'selecionado', 'contratado'):
            vis = {None:'', 'selecionado':'selecionado ', 'contratado':'contratado '}[v]
            sv = dict(s, visao=(v or 'selecionado'))
            Q.append((f"Quanto de investimento {vis}{fmt_scope(s)}?", 'valor', sv, {'mencionou': v}))
        sv = dict(s, visao='selecionado')
        Q.append((f"Resumo {fmt_scope(s)}", 'resumo', sv, {}))
        Q.append((f"Quantas propostas {fmt_scope(s)}?", 'contagem', sv, {}))
        Q.append((f"Qual a conversão do funil {fmt_scope(s)}?", 'funil', sv, {}))
    for s in escopos():
        for k in DIC:
            if k in ('projetos','extProjetadaKm'): continue
            if s.get('modo') or s.get('municipio') or s.get('regiao') or s.get('ano'):
                if k not in ('veiculos','estacoes','trilhosKm','corredorKm','oae','abrigos'): continue
            pal = {'corredorKm':'km de corredores','trilhosKm':'km de trilhos','viarioKm':'km de sistema viário','cicloKm':'km de ciclovias','estacoes':'estações','terminais':'terminais','abrigos':'abrigos','oae':'OAE','passarelas':'passarelas','veiculos':'veículos','its':'ITS','cco':'CCO','patios':'pátios'}[k]
            verbo = 'Quantos' if DIC[k]['unidade'] != 'km' else 'Quantos'
            if k in ('estacoes','passarelas'): verbo = 'Quantas'
            if k in ('viarioKm','cicloKm','corredorKm','trilhosKm'): q = f"Quantos {pal} {fmt_scope(s)}?"
            else: q = f"{verbo} {pal} {fmt_scope(s)}?"
            Q.append((q, 'entrega', dict(s, visao='selecionado'), {'chave': k}))
    for s in escopos():
        if s.get('uf') or s.get('municipio'): continue
        for sub, p in (('pontes','pontes'),('viadutos','viadutos')):
            Q.append((f"Quantas {p} {fmt_scope(s)}?", 'entrega', dict(s, visao='selecionado'), {'chave': sub}))
    PL = {'uf':'UFs','regiao':'regiões','ano':'anos','tipologia':'tipologias','municipio':'municípios','fonte':'fontes','agente':'agentes'}
    for dim, pal in (('uf','UF'),('regiao','região'),('ano','ano'),('tipologia','tipologia'),('municipio','município'),('fonte','fonte'),('agente','agente')):
        for s in escopos():
            if dim=='uf' and (s.get('uf') or s.get('municipio') or s.get('regiao')): continue
            if dim=='regiao' and (s.get('uf') or s.get('municipio') or s.get('regiao')): continue
            if dim=='ano' and s.get('ano'): continue
            if dim=='tipologia' and s.get('modo'): continue
            if dim=='municipio' and s.get('municipio'): continue
            if s.get('municipio'): continue
            for v in ('selecionado','contratado'):
                Q.append((f"Quais as maiores {PL[dim]} em investimento {v} {fmt_scope(s)}?", 'ranking', dict(s, visao=v), {'dim': dim}))
    return Q

def igual(a, b, tol=1e-6):
    return abs((a or 0) - (b or 0)) <= tol * max(1, abs(b or 0))

def verificar(q, tipo, s, extra, resp, falhas):
    f = resp.get('fatos') or {}
    if 'erro' in resp: falhas.append((q, 'EXCEÇÃO ' + resp['erro'][:200])); return
    def falha(m): falhas.append((q, m))
    if f.get('tipo') != tipo and not (tipo=='entrega' and f.get('tipo')=='entrega'):
        falha(f"intenção errada: esperado {tipo}, veio {f.get('tipo')}"); return
    # recorte conferido: filtros devolvidos == recorte pedido
    def conf_filtros(F, municipio):
        ok = (F['cenario']==s['cenario'] and (F['ano']==(s.get('ano') or 'todos')) and
              (F['regiao']==(s.get('regiao') or 'todas')) and (F['uf']==(s.get('uf') or 'todas')) and
              (F['modo']==(s.get('modo') or 'todos')) and (municipio==s.get('municipio')))
        if not ok: falha(f"recorte interpretado errado: pedido {({k:v for k,v in s.items() if not k.startswith('_')})}, veio {F} mun={municipio}")
        return ok
    rec = recorte(s); sel = selec(rec); con = contr(rec)
    vis = s['visao']; uni = sel if vis=='selecionado' else con
    if tipo == 'valor':
        it = f['itens'][0]
        if not conf_filtros(it['filtros'], it['municipio']): return
        if extra['mencionou'] and it['filtros']['visao'] != extra['mencionou']: falha('visão mencionada ignorada')
        for nome, v in (('selecionado', soma(sel, lambda r: val(r,'selecionado'))), ('contratado', soma(con, lambda r: val(r,'contratado')))):
            if not igual(it[nome], v): falha(f"valor {nome}: assistente {it[nome]} x independente {v}")
        if it['propostasSel'] != len(sel) or it['propostasCon'] != len(con): falha('contagem de propostas')
        if not igual(it['valor'], soma(uni, lambda r: val(r, vis))): falha('valor da visão')
    elif tipo == 'resumo':
        if not conf_filtros(f['filtros'], f['municipio']): return
        v = soma(uni, lambda r: val(r, vis))
        chk = [('valor', v), ('propostas', len(uni)), ('selecionado', soma(sel, lambda r: val(r,'selecionado'))),
               ('contratado', soma(con, lambda r: val(r,'contratado'))), ('propostasSel', len(sel)), ('propostasCon', len(con)),
               ('municipios', len({(r['uf'],r['municipio']) for r in uni})), ('ufs', len({r['uf'] for r in uni})),
               ('extensaoKm', ent(uni,'corredorKm')+ent(uni,'trilhosKm')),
               ('materialRodante', ent(uni,'veiculos')+ent(uni,'its')+ent(uni,'cco')+ent(uni,'patios'))]
        for k, e in chk:
            if not igual(f[k], e): falha(f"resumo.{k}: {f[k]} x {e}")
    elif tipo == 'contagem':
        it = f['itens'][0]
        if not conf_filtros(it['filtros'], it['municipio']): return
        if it['propostas'] != len(uni): falha(f"propostas {it['propostas']} x {len(uni)}")
        if it['municipios'] != len({(r['uf'],r['municipio']) for r in uni}): falha('municípios')
        if it['ufs'] != len({r['uf'] for r in uni}): falha('ufs')
    elif tipo == 'funil':
        if not conf_filtros(f['filtros'], f['municipio']): return
        ex = [r for r in con if r.get('execucao') and re.search(r'execu|andamento|conclu', r['execucao'], re.I)]
        exp = [(len(sel), soma(sel, lambda r: val(r,'selecionado'))), (len(con), soma(con, lambda r: r['valorContratado'])), (len(ex), soma(ex, lambda r: r['valorContratado']))]
        for e, (qn, vv) in zip(f['etapas'], exp):
            if e['quantidade'] != qn or not igual(e['valor'], vv): falha(f"funil {e['nome']}: {e['quantidade']}/{e['valor']} x {qn}/{vv}")
        if not igual(f['faltaConverter'], exp[0][1]-exp[1][1]): falha('falta converter')
    elif tipo == 'entrega':
        it = f['itens'][0]
        for sub in f['itens']:
            if sub['chave'] != extra['chave']: falha(f"item de entrega errado: {sub['chave']} x {extra['chave']}")
        ie = it['itens'][0]
        if not conf_filtros(ie['filtros'], ie['municipio']): return
        e = ent(uni, extra['chave'])
        if not igual(it['total'], e): falha(f"entrega {extra['chave']}: assistente {it['total']} x independente {e}")
    elif tipo == 'ranking':
        if f.get('dimensao') != extra['dim']: falha(f"dimensão {f.get('dimensao')} x {extra['dim']}"); return
        F = f['filtros']
        # o ranking ignora o filtro da própria dimensão
        s2 = dict(s)
        if extra['dim'] in ('uf','regiao'): s2.pop('uf', None); s2.pop('regiao', None)
        if extra['dim'] == 'ano': s2.pop('ano', None)
        if extra['dim'] == 'tipologia': s2.pop('modo', None)
        rec2 = recorte(s2); uni2 = selec(rec2) if vis=='selecionado' else contr(rec2)
        chave = {'uf':lambda r:r['uf'],'regiao':lambda r:r['regiao'],'ano':lambda r:r['rotuloAno'],'tipologia':tip,'municipio':lambda r:f"{r['municipio']} ({r['uf']})",'fonte':lambda r:'OGU' if r['fonte']=='OGU' else 'Financiamento','agente':lambda r:('CAIXA' if 'CAIXA' in (r['agente'] or '').upper() else 'BNDES' if 'BNDES' in (r['agente'] or '').upper() else 'BRDE' if ('BRDE' in (r['agente'] or '').upper() or 'BDRE' in (r['agente'] or '').upper()) else 'Outros')}[extra['dim']]
        g = collections.defaultdict(float)
        for r in uni2: g[chave(r)] += val(r, vis)
        exp = sorted(g.items(), key=lambda kv: -kv[1])
        got = f['linhas']
        if not igual(f['total'], sum(g.values())): falha(f"total do ranking {f['total']} x {sum(g.values())}")
        for i, l in enumerate(got):
            if not igual(l['valor'], exp[i][1]): falha(f"ranking posição {i+1}: {l['chave']}={l['valor']} x {exp[i][0]}={exp[i][1]}")
            elif l['chave'] != exp[i][0] and not any(igual(exp[i][1], kv[1]) and kv[0]==l['chave'] for kv in exp): falha(f"ranking chave posição {i+1}: {l['chave']} x {exp[i][0]}")

def main():
    Q = monta()
    dest = os.environ.get('AUD_TMP') or tempfile.mkdtemp()
    json.dump([q[0] for q in Q], open(f'{dest}/aud_q.json', 'w'))
    subprocess.run(['node', os.path.join(AQUI, 'f_assistente_runner.js'), f'{dest}/aud_q.json', f'{dest}/aud_r.json', RAIZ + '/index.html'], check=True)
    R = json.load(open(f'{dest}/aud_r.json'))
    print('erros de página:', R['erros'])
    falhas = []
    for (q, tipo, s, extra), resp in zip(Q, R['res']):
        verificar(q, tipo, s, extra, resp, falhas)
    por = collections.Counter(q[1] for q in Q)
    print('perguntas:', len(Q), dict(por))
    print('falhas:', len(falhas))
    for q, m in falhas[:60]: print(' -', q, '=>', m)
    json.dump(falhas, open(f'{dest}/aud_falhas.json','w'), ensure_ascii=False, indent=1)
    return 1 if falhas else 0
sys.exit(main())
