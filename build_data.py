"""Reproyecta (EPSG:5345 -> WGS84), calcula métricas y genera web/data.js"""
import json, os, faulthandler
faulthandler.dump_traceback_later(40, exit=True)
from pyproj import Transformer
from shapely.geometry import shape, mapping
from shapely.ops import transform, unary_union

ROOT = os.path.dirname(os.path.abspath(__file__))
tr = Transformer.from_crs(5345, 4326, always_xy=True)


def load(name):
    raw = open(os.path.join(ROOT, name), 'rb').read()
    try:
        txt = raw.decode('utf-8')
    except UnicodeDecodeError:
        txt = raw.decode('cp1252')
    return json.loads(txt)


def fix(v):
    if isinstance(v, str) and '\ufffd' in v:
        for a, b in (('B\ufffd ', 'B° '), ('Cha\ufffdaritos', 'Chañaritos'), ('Pe\ufffda', 'Peña')):
            v = v.replace(a, b)
    return v


def feats(name, drop=('path',)):
    out = []
    for f in load(name)['features']:
        g = shape(f['geometry'])
        p = {k: fix(v) for k, v in f['properties'].items() if k not in drop}
        out.append((g, p))
    return out


actual = feats('recorridos_actuales.geojson')
sect = feats('sectores.geojson')
e = feats('LE_SECTOR5.geojson')
f6 = feats('LF_SECTOR6.geojson')
gpk = feats('Recorrido Actual vs Linea E.gpkg.geojson')

S = {}
for g, p in sect:
    n = int(p['Name'].split()[1])
    S[n] = (g, p)


def km(g):
    return g.length / 1000


def geo(g, prec=6, simplify=2.0):
    g = g.simplify(simplify)
    g2 = transform(tr.transform, g)
    return json.loads(json.dumps(mapping(g2), default=float).replace('.', '.'))  # noqa


def round_coords(o, nd=6):
    if isinstance(o, (list, tuple)):
        return [round_coords(i, nd) for i in o]
    if isinstance(o, float):
        return round(o, nd)
    return o


def fc(items):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": p,
         "geometry": {"type": mp["type"], "coordinates": round_coords(mp["coordinates"])}}
        for p, mp in items]}


BUF = 300
res = {}
proposals = {5: e, 6: f6}
methodology = {5: {"actual": 70.11, "propuesta": 56.86, "lineas": ["6", "17", "11"]},
               6: {"actual": 76.8, "propuesta": 69.29, "lineas": ["6", "11", "4", "8", "1", "10"]}}
layers_clip = []
for n, prop in proposals.items():
    poly = S[n][0]
    cur_clip = unary_union([g.intersection(poly) for g, _ in actual])
    prop_all = unary_union([g for g, _ in prop])
    prop_in = prop_all.intersection(poly)
    # líneas actuales que pisan el sector
    per_line = {}
    for g, p in actual:
        c = g.intersection(poly)
        if c.length > 50:
            per_line.setdefault(p['Line'], 0)
            per_line[p['Line']] += c.length / 1000
            layers_clip.append(({"sector": n, "Line": p['Line'], "Ramal": p['Ramal'],
                                 "km_dentro": round(c.length / 1000, 2)}, mapping(transform(tr.transform, c))))
    area_km2 = poly.area / 1e6
    cur_s = cur_clip.simplify(5)
    prop_s = prop_all.simplify(5)
    prop_in_s = prop_in.simplify(5)
    cur_buf = cur_s.buffer(BUF, quad_segs=3)
    prop_buf_all = prop_s.buffer(BUF, quad_segs=3)
    cb = cur_buf.intersection(poly)
    pb = prop_in_s.buffer(BUF, quad_segs=3).intersection(poly)
    cov_prop = pb.area / poly.area * 100
    cov_cur = cb.area / poly.area * 100
    # % de la red actual dentro del sector a <=BUF de la propuesta
    cur_near = cur_clip.intersection(prop_buf_all).length / max(cur_clip.length, 1) * 100
    # % de la red propuesta (en el sector) que coincide con la actual
    prop_near = prop_in.intersection(cur_buf).length / max(prop_in.length, 1) * 100
    sd = S[n][1]
    res[n] = {
        "nombre": sd['Name'], "trx": sd['TRX_MES'], "tarj": sd['TARJ_MES'],
        "area_km2": round(area_km2, 2),
        "km_actual_clip_bruto": round(km(cur_clip), 2),
        "km_prop_total": round(sum(p['Longitud'] for _, p in prop), 2),
        "km_prop_en_sector": round(km(prop_in), 2),
        "cob_actual_pct": round(cov_cur, 1), "cob_prop_pct": round(cov_prop, 1),
        "actual_cubierta_pct": round(cur_near, 1), "prop_sobre_actual_pct": round(prop_near, 1),
        "lineas_km": {k: round(v, 2) for k, v in sorted(per_line.items(), key=lambda x: -x[1])},
        "metod": methodology[n],
        "recorridos": [{"Linea": p['Linea'], "Recorrido": p['Recorrido'], "Longitud": p['Longitud']} for _, p in prop],
    }
    print(n, json.dumps(res[n], ensure_ascii=False))

def pr(g): return mapping(transform(tr.transform, g.simplify(2)))

# Zonas a más de 350m de la red propuesta en Sectores 5 y 6
prop_all_union = unary_union([g for g, _ in e] + [g for g, _ in f6]).simplify(3)
buf350_prop = prop_all_union.buffer(350, quad_segs=4)

uncovered_features = []
for n in (5, 6):
    poly = S[n][0]
    diff = poly.difference(buf350_prop).simplify(2)
    polys = [diff] if diff.geom_type == 'Polygon' else list(diff.geoms) if diff.geom_type == 'MultiPolygon' else []
    for p in polys:
        if p.area >= 1500:
            uncovered_features.append({
                "type": "Feature",
                "properties": {
                    "sector": n,
                    "area_m2": round(p.area, 1),
                    "area_ha": round(p.area / 10000, 2),
                    "area_km2": round(p.area / 1e6, 3),
                    "distancia": "> 350 m",
                    "descripcion": f"Área sin cobertura directa (>350m) · Sector {n}"
                },
                "geometry": pr(p)
            })

uncovered_fc = {
    "type": "FeatureCollection",
    "features": uncovered_features
}

with open(os.path.join(ROOT, 'sin_cobertura_350m.geojson'), 'w', encoding='utf-8') as fh:
    json.dump(uncovered_fc, fh, ensure_ascii=False, indent=2)

# Identificar trazos actuales que ingresan a los sectores 5 y 6
actual_enriched = []
afectados_list = []
for g, p in actual:
    sec_in = []
    km_sec = {}
    for n in (5, 6):
        c = g.intersection(S[n][0])
        if c.length > 50:
            sec_in.append(n)
            km_sec[f"km_sector_{n}"] = round(c.length / 1000, 2)
    p_enriched = {
        **p,
        "afectado": len(sec_in) > 0,
        "sectores_afectados": sec_in,
        **km_sec
    }
    actual_enriched.append((g, p_enriched))
    if len(sec_in) > 0:
        afectados_list.append((g, p_enriched))

# Guardar archivo GeoJSON de trazos actuales afectados
afectados_fc = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": p,
            "geometry": pr(g)
        }
        for g, p in afectados_list
    ]
}
with open(os.path.join(ROOT, 'trazos_actuales_afectados.geojson'), 'w', encoding='utf-8') as fh:
    json.dump(afectados_fc, fh, ensure_ascii=False, indent=2)

DATA = {
    "stats": res,
    "actuales": fc([(p, pr(g)) for g, p in actual_enriched]),
    "actuales_afectados": fc([(p, pr(g)) for g, p in afectados_list]),
    "sectores": fc([(p, pr(g)) for g, p in sect]),
    "propuesta": fc([({**p, "sector": 5}, pr(g)) for g, p in e] + [({**p, "sector": 6}, pr(g)) for g, p in f6]),
    "paradas_propuesta": load('Paradas_propuesta.geojson'),
    "recortes": fc([(p, mapping(transform(tr.transform, shape(m)))) for p, m in layers_clip]),
    "gpkg_E": fc([({"Long": p['Long']}, pr(g)) for g, p in gpk if g is not None and not g.is_empty]),
    "sin_cobertura": uncovered_fc,
    "buffer": BUF,
}
os.makedirs(os.path.join(ROOT, 'web'), exist_ok=True)
with open(os.path.join(ROOT, 'web', 'data.js'), 'w', encoding='utf-8') as fh:
    fh.write('window.DATA = ' + json.dumps(DATA, ensure_ascii=False, separators=(',', ':')) + ';')
print('actuales total:', len(actual_enriched), 'afectados (entran a 5/6):', len(afectados_list))
print('sin cobertura features:', len(uncovered_features))
print('ok')
