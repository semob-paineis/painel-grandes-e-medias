"""AUDITORIA (b/c): confere o que o painel calculou (dump do navegador)
contra um cálculo independente feito aqui, a partir de dados.json."""
import json, sys
from collections import defaultdict

dados = json.load(open(sys.argv[1], encoding="utf-8"))
dump = json.load(open(sys.argv[2], encoding="utf-8"))
REG = {r["id"]: r for r in dados["registros"]}
META = dados["meta"]
SEL = ("contratado", "aContratar", "desistencia")

erros = defaultdict(list)
def check(grupo, cond, msg):
    if not cond: erros[grupo].append(msg)

def chave_modo(r):
    if r.get("tipologia"): return r["tipologia"]
    if r.get("categoria") == "Estudos e Projetos": return "Estudos e Projetos"
    return r.get("modo") or "Não classificado"

def valor(r, visao):
    if visao == "selecionado":
        return r["valorContratado"] if r["tipo"] == "Migrado Novo PAC" else r["apoio"]
    return r["valorContratado"]

def recortar(f):
    out = []
    for r in dados["registros"]:
        if not r["noEscopo"]: continue
        if f["cenario"] != "Consolidado" and r["tipo"] != f["cenario"]: continue
        if f["ano"] != "todos" and r["rotuloAno"] != f["ano"]: continue
        if f["regiao"] != "todas" and r["regiao"] != f["regiao"]: continue
        if f["uf"] != "todas" and r["uf"] != f["uf"]: continue
        if f["modo"] != "todos" and chave_modo(r) != f["modo"]: continue
        out.append(r)
    return out

def quase(a, b, tol=0.02):
    return abs((a or 0) - (b or 0)) <= tol

for caso in dump:
    f = caso["filtros"]
    rot = f"{f['cenario']}/{f['visao']}/ano={f['ano']}/reg={f['regiao']}/uf={f['uf']}/tip={f['modo']}"
    rec = recortar(f)
    ids_rec = sorted(r["id"] for r in rec)
    check("recorte", ids_rec == sorted(caso["recorte"]), f"{rot}: recorte difere")

    uni = [r for r in rec if (r["etapa"] in SEL if f["visao"] == "selecionado"
                              else r["etapa"] == "contratado")]
    check("universo", sorted(r["id"] for r in uni) == sorted(caso["universo"]),
          f"{rot}: universo difere")

    sel = [r for r in rec if r["etapa"] in SEL]
    con = [r for r in rec if r["etapa"] == "contratado"]
    check("totais", caso["totaisSel"]["propostas"] == len(sel), f"{rot}: nº selecionadas")
    check("totais", quase(caso["totaisSel"]["valor"],
          sum(valor(r, "selecionado") for r in sel)), f"{rot}: valor selecionado")
    check("totais", caso["totaisCon"]["propostas"] == len(con), f"{rot}: nº contratadas")
    check("totais", quase(caso["totaisCon"]["valor"],
          sum(r["valorContratado"] for r in con)), f"{rot}: valor contratado")
    check("totais", caso["totais"]["municipios"] ==
          len({(r["uf"], r["municipio"]) for r in uni}), f"{rot}: municípios")
    check("totais", caso["totais"]["ufs"] == len({r["uf"] for r in uni}), f"{rot}: UFs")

    # funil
    exe = [r for r in con if r.get("execucao") and
           any(t in r["execucao"].lower() for t in ("execu", "andamento", "conclu"))]
    esperado = [("selecionada", len(sel), sum(valor(r, "selecionado") for r in sel)),
                ("contratado", len(con), sum(r["valorContratado"] for r in con)),
                ("execucao", len(exe), sum(r["valorContratado"] for r in exe))]
    for etapa, (ch, q, v) in zip(caso["funil"], esperado):
        check("funil", etapa["chave"] == ch and etapa["q"] == q and quase(etapa["v"], v),
              f"{rot}: funil {ch}: painel={etapa['q']}/{etapa['v']:.2f} esperado={q}/{v:.2f}")
    # o funil não pode crescer de uma etapa para a outra
    check("funil", caso["funil"][0]["q"] >= caso["funil"][1]["q"] >= caso["funil"][2]["q"],
          f"{rot}: funil com etapa maior que a anterior")
    check("funil", sum(c["quantidade"] for c in caso["composicao"]) == len(sel),
          f"{rot}: composição do funil != selecionadas")

    # dimensões: a soma das linhas tem de fechar com o total do universo
    total_uni = sum(valor(r, f["visao"]) for r in uni)
    for dim, obter in (("regioes", lambda r: r["regiao"]), ("anos", lambda r: r["rotuloAno"]),
                       ("ufs", lambda r: r["uf"]), ("modos", chave_modo)):
        acc = defaultdict(lambda: [0, 0.0])
        for r in uni:
            acc[obter(r)][0] += 1
            acc[obter(r)][1] += valor(r, f["visao"])
        linhas = {l["chave"]: l for l in caso[dim]}
        check(dim, set(linhas) == set(acc), f"{rot}: {dim}: chaves diferentes")
        for k, (q, v) in acc.items():
            if k in linhas:
                check(dim, linhas[k]["propostas"] == q and quase(linhas[k]["valor"], v),
                      f"{rot}: {dim}[{k}]")
        check(dim, quase(sum(l["valor"] for l in caso[dim]), total_uni, 0.1),
              f"{rot}: soma de {dim} != total do universo")

    for dim in ("fontes", "agentes", "categorias"):
        check(dim, quase(sum(l["valor"] for l in caso[dim]), total_uni, 0.1),
              f"{rot}: soma de {dim} != total do universo")

    # entregas: somadas pelos registros-âncora do universo
    if caso["entregas"]:
        anc = [r for r in uni if r.get("entregas")]
        check("entregas", caso["entregas"]["empreendimentos"] == len(anc),
              f"{rot}: nº de empreendimentos com levantamento")
        for item in caso["entregas"]["itens"]:
            v = sum(r["entregas"].get(item["chave"], 0) for r in anc)
            n = sum(1 for r in anc if r["entregas"].get(item["chave"], 0) > 0)
            check("entregas", quase(item["valor"], v, 0.01) and item["empreendimentos"] == n,
                  f"{rot}: entrega {item['chave']}: painel={item['valor']} esperado={v}")
        oae = {i["chave"]: i["valor"] for i in caso["entregas"]["itens"]}.get("oae")
        comp = sum(r["entregas"].get(k, 0) for r in anc
                   for k in ("viadutos", "pontes", "outrasOAE"))
        check("entregas", quase(oae, comp, 0.01), f"{rot}: OAE != viadutos+pontes+outras")

    mig = [r for r in uni if r["migrado"]]
    check("migrados", caso["migrados"]["propostas"] == len(mig) and
          quase(caso["migrados"]["parcela"], sum(r["valorContratado"] for r in mig)) and
          quase(caso["migrados"]["original"], sum(r["apoio"] for r in mig)),
          f"{rot}: resumo de migrados")

print(f"combinações conferidas: {len(dump)}")
total = 0
for g, lista in sorted(erros.items()):
    total += len(lista)
    print(f"\n[{g}] {len(lista)} divergência(s)")
    for m in lista[:6]: print("   -", m)
if not total: print("\nNenhuma divergência.")
sys.exit(1 if total else 0)
