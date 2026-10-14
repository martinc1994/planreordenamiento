(function () {
  const D = window.DATA;
  const fmt = (n, d = 1) => Number(n).toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const int = n => Number(n).toLocaleString('es-AR');
  const $ = s => document.querySelector(s);

  /* ---------- helpers ---------- */
  function ringArea(ring) { // km², equirectangular local
    const lat0 = ring.reduce((a, c) => a + c[1], 0) / ring.length * Math.PI / 180;
    const kx = 111.32 * Math.cos(lat0), ky = 110.57;
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) s += (ring[i][0] * kx) * (ring[i + 1][1] * ky) - (ring[i + 1][0] * kx) * (ring[i][1] * ky);
    return Math.abs(s / 2);
  }
  function featArea(f) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return polys.reduce((a, p) => a + ringArea(p[0]) - p.slice(1).reduce((b, h) => b + ringArea(h), 0), 0);
  }
  const secNum = f => parseInt(f.properties.Name.split(' ')[1], 10);
  const secs = D.sectores.features.slice().sort((a, b) => secNum(a) - secNum(b));
  const S5 = D.stats[5], S6 = D.stats[6];
  const LETTER = 'ABCDEFG';

  /* ---------- HERO KPIs ---------- */
  const totTrx = 2637500;
  $('#heroKpis').innerHTML = [
    ['7', 'sectores en que se divide la ciudad'],
    [int(totTrx), 'transacciones mensuales analizadas']
  ].map(k => `<div class="kpi reveal"><b>${k[0]}</b><span>${k[1]}</span></div>`).join('');

  /* ---------- Tabla de sectores ---------- */
  const maxTrx = Math.max(...secs.map(f => f.properties.TRX_MES));
  $('#tblSectores').innerHTML = `<thead><tr><th>Sector</th><th>Línea</th><th>Superficie (km²)</th><th>Transacciones/mes</th><th>Tarjetas/mes</th><th>Trx por km²</th></tr></thead><tbody>` +
    secs.map(f => {
      const n = secNum(f), a = featArea(f), p = f.properties, hl = n === 5 || n === 6;
      return `<tr class="${hl ? 'hl' : ''}"><td>Sector ${n}${hl ? ' <span class="tag ' + (n === 5 ? 'e' : 'f') + '">piloto</span>' : ''}</td><td>${LETTER[n - 1]}</td><td>${fmt(a, 1)}</td><td>${int(p.TRX_MES)}</td><td>${int(p.TARJ_MES)}</td><td>${int(p.TRX_MES / a)}</td></tr>`;
    }).join('') + '</tbody>';
  $('#chartSectores').innerHTML = '<div class="chart-title">Transacciones mensuales por sector</div>' +
    secs.map(f => {
      const n = secNum(f), v = f.properties.TRX_MES;
      return `<div class="bar-row ${n === 5 || n === 6 ? 'hl' : ''}"><span>Sector ${n} · Línea ${LETTER[n - 1]}</span><div class="track"><div class="fill" data-w="${v / maxTrx * 100}"></div></div><span class="v">${int(v)}</span></div>`;
    }).join('');

  /* ---------- MAPA ---------- */
  const map = L.map('map', { zoomControl: true, preferCanvas: false });
  const light = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles © Esri', maxZoom: 16, maxNativeZoom: 16 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, maxNativeZoom: 16 })
  ]).addTo(map);
  const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 });
  L.control.layers({ 'Claro': light, 'Calles (OSM)': osm }, null, { position: 'topright', collapsed: true }).addTo(map);
  ['sectores', 'actuales', 'afectados', 'cobertura', 'propuesta'].forEach((p, i) => { map.createPane(p); map.getPane(p).style.zIndex = 400 + i * 10; });

  const LINE_PAL = { 'Linea 1': '#b45309', 'Linea 3': '#7c3aed', 'Linea 4': '#0891b2', 'Linea 5': '#ea580c', 'Linea 6': '#be185d', 'Linea 7': '#15803d', 'Linea 8': '#1d4ed8', 'Linea 9': '#9333ea', 'Linea 10': '#a16207', 'Linea 11': '#0f766e', 'Linea 12': '#b91c1c', 'Linea 17': '#4d7c0f', 'Linea 18': '#c026d3', 'Linea 19': '#047857' };
  const E_COL = ['#0066ff', '#7c3aed', '#0891b2', '#0b2a6f'];
  const F_COL = ['#e4572e', '#c2185b', '#d97706'];
  const GRIS = '#94a3b8';
  const info = $('#mapInfo');
  const setInfo = h => info.innerHTML = h;
  const short = s => s.replace('Linea ', 'L');

  // sectores
  const secColor = n => (n === 5 || n === 6) ? '#1f2937' : '#94a3b8';
  const lSect = L.geoJSON(D.sectores, {
    pane: 'sectores',
    style: f => { const n = secNum(f), p = n === 5 || n === 6; return { color: secColor(n), weight: p ? 2.5 : 1.2, fillColor: p ? '#cbd5e1' : '#e2e8f0', fillOpacity: p ? .38 : .12, opacity: p ? .9 : .7, dashArray: p ? null : '6 6' }; },
    onEachFeature: (f, l) => {
      const n = secNum(f);
      l.on('click', () => setInfo(`<h5>${f.properties.Name}</h5><div class="m">${int(f.properties.TRX_MES)} transacciones/mes · ${int(f.properties.TARJ_MES)} tarjetas<br>${fmt(featArea(f), 1)} km²</div>`));
      l.bindTooltip('Sector ' + n, { permanent: true, direction: 'center', className: 'sector-label' });
    }
  });
  lSect.eachLayer(l => { const t = l.getTooltip(); });

  // 1 · trazos actuales afectados (ramales que ingresan a sectores 5 y/o 6)
  const lActAfectados = L.geoJSON(D.actuales_afectados, {
    pane: 'afectados',
    style: () => ({ color: '#334155', weight: 2.4, opacity: .75 }),
    onEachFeature: (f, l) => {
      l.on('mouseover', () => l.setStyle({ weight: 5.5, opacity: 1, color: '#0f172a' }));
      l.on('mouseout', () => lActAfectados.resetStyle(l));
      l.on('click', () => {
        const secs = f.properties.sectores_afectados || [];
        const secText = secs.length === 2 ? 'Sectores 5 y 6' : secs.length === 1 ? 'Sector ' + secs[0] : '';
        const d5 = f.properties.km_sector_5 ? ` · En Sector 5: <b>${fmt(f.properties.km_sector_5, 2)} km</b>` : '';
        const d6 = f.properties.km_sector_6 ? ` · En Sector 6: <b>${fmt(f.properties.km_sector_6, 2)} km</b>` : '';
        setInfo(`<h5>${f.properties.Nombre}</h5><div class="m">Trazado actual afectado · <b>Ingresa a ${secText}</b>${d5}${d6}<br><small style="color:#64748b">Traza completa: incluye los tramos dentro y fuera del sector piloto.</small></div>`);
      });
      const secs = f.properties.sectores_afectados || [];
      const secText = secs.length === 2 ? 'Sectores 5 y 6' : secs.length === 1 ? 'Sector ' + secs[0] : '';
      l.bindTooltip(`${f.properties.Nombre} (ingresa a ${secText})`, { sticky: true });
    }
  });

  // 2 · red actual completa (todos los ramales de la ciudad)
  const lAct = L.geoJSON(D.actuales, {
    pane: 'actuales', style: () => ({ color: GRIS, weight: 1.8, opacity: .45 }),
    onEachFeature: (f, l) => {
      l.on('mouseover', () => l.setStyle({ weight: 4.5, opacity: 1, color: '#475569' }));
      l.on('mouseout', () => lAct.resetStyle(l));
      l.on('click', () => setInfo(`<h5>${f.properties.Nombre}</h5><div class="m">Red actual completa (ciudad) · Ramal: ${f.properties.Ramal}</div>`));
      l.bindTooltip(`${f.properties.Nombre}`, { sticky: true });
    }
  });

  // zonas sin cobertura (> 350m de la red propuesta)
  const lCob = L.geoJSON(D.sin_cobertura, {
    pane: 'cobertura',
    style: () => ({
      color: '#dc2626',
      weight: 1.5,
      dashArray: '4 4',
      fillColor: '#ef4444',
      fillOpacity: 0.38
    }),
    onEachFeature: (f, l) => {
      l.on('mouseover', () => l.setStyle({ fillOpacity: 0.65, weight: 2.5 }));
      l.on('mouseout', () => lCob.resetStyle(l));
      l.on('click', () => setInfo(`<h5>Zona sin cobertura (&gt;350 m)</h5><div class="m">Sector ${f.properties.sector} · Superficie: <b>${fmt(f.properties.area_ha, 1)} ha</b> (${fmt(f.properties.area_km2, 2)} km²)<br>Distancia al trazado propuesto más cercano: <b>&gt; 350 metros</b></div>`));
      l.bindTooltip(`Sector ${f.properties.sector} · Sin cobertura (&gt;350m): ${fmt(f.properties.area_ha, 1)} ha`, { sticky: true });
    }
  });

  // Unidades óptimas para frecuencias según plan (frecuencias ideales)
  const UNIDADES_OPTIMAS = {
    'E-1': 9, // Manantial Sur
    'E-2': 9, // San Alberto
    'E-3': 7, // B° Terán (no contemplado en flota prioritaria)
    'E-4': 7, // 11 de Marzo
    'F-1': 9, // Mercofrut Autopista
    'F-2': 8, // Villa Amalia / San Cayetano
    'F-3': 9  // Villa Angelina
  };

  // propuesta
  const mkProp = sector => {
    const idx = {};
    return L.geoJSON(D.propuesta, {
      pane: 'propuesta', filter: f => f.properties.sector === sector,
      style: f => { const i = (idx[f.properties.fid] = Object.keys(idx).length); return { color: (sector === 5 ? E_COL : F_COL)[(f.properties.fid - 1) % 4], weight: 5, opacity: .95 }; },
      onEachFeature: (f, l) => {
        l.on('mouseover', () => l.setStyle({ weight: 8 }));
        l.on('mouseout', () => l.setStyle({ weight: 5 }));
        l.on('click', () => setInfo(`<h5>Línea ${f.properties.Linea} · ${f.properties.Recorrido}</h5><div class="m">Propuesta Sector ${sector} · ${fmt(f.properties.Longitud, 2)} km (ida y vuelta)</div>`));
        l.bindTooltip(`Línea ${f.properties.Linea} · ${f.properties.Recorrido}`, { sticky: true });
      }
    });
  };
  const lE = mkProp(5), lF = mkProp(6);

  /* ---- Partículas de sentido de circulación (siguen el orden de vértices de cada trazo) ---- */
  const Flow = (() => {
    const cv = document.createElement('canvas');
    cv.className = 'flow-canvas';
    map.getContainer().appendChild(cv);
    const ctx = cv.getContext('2d');
    const groups = new Map(); // layerGroup -> [{pts, cum, total, color, parts:[offset]}]
    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SPEED = 220, TRAIL = 7; // m/s, puntos de estela
    let raf = null, last = 0, hidden = false, enabled = true;

    function build(group, sector) {
      const list = [];
      group.eachLayer(l => {
        const f = l.feature, col = (sector === 5 ? E_COL : F_COL)[(f.properties.fid - 1) % 4];
        const key = f.properties.Linea + '-' + f.properties.fid;
        const nReq = UNIDADES_OPTIMAS[key] - 2 !== undefined ? UNIDADES_OPTIMAS[key] - 2 : Math.max(1, Math.round(f.properties.Longitud / 2.5));
        if (nReq <= 0) return; // Si no tiene unidades asignadas en el plan piloto, no se muestran partículas

        const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
        parts.forEach(pts => {
          if (pts.length < 2) return;
          const lat0 = pts[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110570;
          const cum = [0];
          for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * kx, (pts[i][1] - pts[i - 1][1]) * ky));
          const total = cum[cum.length - 1];
          if (total < 50) return;
          list.push({ pts, cum, total, color: col, n: nReq, phase: Math.random() });
        });
      });
      groups.set(group, list);
    }
    function at(r, d) { // posición [lng,lat] a distancia d
      const c = r.cum; let lo = 0, hi = c.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; c[m] <= d ? lo = m : hi = m; }
      const t = (d - c[lo]) / ((c[hi] - c[lo]) || 1), a = r.pts[lo], b = r.pts[hi];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    function resize() {
      const s = map.getSize(), dpr = window.devicePixelRatio || 1;
      cv.width = s.x * dpr; cv.height = s.y * dpr; cv.style.width = s.x + 'px'; cv.style.height = s.y + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
      const s = map.getSize();
      ctx.clearRect(0, 0, s.x, s.y);
      if (hidden || !enabled) return;
      const z = map.getZoom(), size = Math.max(3, Math.min(6.5, 2.2 + (z - 12) * .6));
      groups.forEach((list, group) => {
        if (!map.hasLayer(group)) return;
        list.forEach(r => {
          r.phase = (r.phase + (REDUCE ? 0 : dt * SPEED / r.total)) % 1;
          const gap = 1 / r.n;
          for (let k = 0; k < r.n; k++) {
            for (let j = 0; j < TRAIL; j++) {
              let u = ((r.phase + k * gap) % 1) - j * (16 / r.total);
              if (u < 0) u += 1;
              const p = map.latLngToContainerPoint(L.latLng(...at(r, u * r.total).reverse()));
              if (p.x < -10 || p.y < -10 || p.x > s.x + 10 || p.y > s.y + 10) continue;
              const a = 1 - j / TRAIL, rad = size * (0.45 + 0.55 * a);
              ctx.globalAlpha = a;
              ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 6.2832);
              ctx.fillStyle = j === 0 ? '#fff' : r.color; ctx.fill();
              if (j === 0) { ctx.lineWidth = 2.2; ctx.strokeStyle = r.color; ctx.stroke(); }
            }
          }
        });
      });
      ctx.globalAlpha = 1;
    }
    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function refresh() {
      const any = [...groups.keys()].some(g => map.hasLayer(g));
      btn.style.display = any ? '' : 'none';
      if (any) start(); else if (raf) { cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, cv.width, cv.height); }
    }
    const Toggle = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const b = L.DomUtil.create('button', 'flow-toggle on');
        b.type = 'button'; b.id = 'flowToggle';
        b.innerHTML = '<span class="fdot"></span><span class="ftxt">Sentido: activado</span>';
        b.title = 'Mostrar u ocultar las partículas de sentido de circulación';
        L.DomEvent.disableClickPropagation(b);
        b.addEventListener('click', () => {
          enabled = !enabled;
          b.classList.toggle('on', enabled);
          b.querySelector('.ftxt').textContent = 'Sentido: ' + (enabled ? 'activado' : 'desactivado');
          if (!enabled) ctx.clearRect(0, 0, cv.width, cv.height);
        });
        return b;
      }
    });
    const btn = new Toggle().addTo(map).getContainer();
    btn.style.display = 'none';
    build(lE, 5); build(lF, 6);
    resize();
    map.on('resize', resize);
    map.on('zoomstart', () => { hidden = true; });
    map.on('zoomend', () => { hidden = false; });
    [lE, lF].forEach(g => { g.on('add remove', refresh); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = null; } else refresh(); });
    refresh();
    return { refresh };
  })();


  // leyenda
  const leg = [];
  D.propuesta.features.forEach(f => {
    const c = (f.properties.sector === 5 ? E_COL : F_COL)[(f.properties.fid - 1) % 4];
    leg.push(`<div class="lg-row" data-s="${f.properties.sector}" data-fid="${f.properties.fid}"><i style="background:${c}"></i>Línea ${f.properties.Linea} · ${f.properties.Recorrido} <small style="color:#667085">${fmt(f.properties.Longitud, 1)} km</small></div>`);
  });
  $('#legend').innerHTML = leg.join('');
  $('#legend').addEventListener('click', e => {
    const r = e.target.closest('.lg-row'); if (!r) return;
    const grp = r.dataset.s === '5' ? lE : lF;
    grp.eachLayer(l => { if (l.feature.properties.fid == r.dataset.fid) map.fitBounds(l.getBounds(), { padding: [40, 40] }); });
  });

  // toggles
  const bind = (id, layer) => {
    const el = $(id);
    if (el) el.addEventListener('change', e => e.target.checked ? layer.addTo(map) : map.removeLayer(layer));
  };
  bind('#L-afectados', lActAfectados);
  bind('#L-actuales', lAct);
  bind('#L-sectores', lSect);
  bind('#L-E', lE);
  bind('#L-F', lF);
  bind('#L-cob', lCob);
  document.querySelectorAll('input[id^="L-"]').forEach(c => { c.checked = false; });

  // foco
  const b56 = () => L.featureGroup([lE, lF]).getBounds();
  const bSec = n => { let b; lSect.eachLayer(l => { if (secNum(l.feature) === n) b = l.getBounds(); }); return b; };
  function focus(f) {
    document.querySelectorAll('#focus button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    const b = f === 'all' ? b56() : f === 'city' ? lSect.getBounds() : bSec(+f);
    map.flyToBounds(b, { padding: [30, 30], duration: .9 });
  }
  $('#focus').addEventListener('click', e => { const b = e.target.closest('button'); if (b) focus(b.dataset.f); });
  map.fitBounds(b56(), { padding: [30, 30] });
  setInfo('<b>Tip:</b> tocá una línea o un sector para ver sus datos.');

  /* ---------- Comparativa ---------- */
  const mk = (S, cls, letter) => {
    const m = S.metod, pct = m.propuesta / m.actual * 100, red = 100 - pct;
    const trx = letter === 'E' ? 242043 : 265705;
    return `<article class="cmp reveal">
      <header><h3>${S.nombre}</h3><span class="tag ${cls}">Línea ${letter}</span></header>
      <div class="big"><div><small>Reducción de km</small><b>−${fmt(red)}<span>%</span></b></div><div><small>Propuesta / actual</small><b>${fmt(pct)}<span>%</span></b></div></div>
      <div class="dual">
        <div class="lbl"><span>Red actual</span><b>${fmt(m.actual, 2)} km</b></div><div class="track"><div class="fill a" data-w="100"></div></div>
        <div class="lbl"><span>Red propuesta</span><b>${fmt(m.propuesta, 2)} km</b></div><div class="track"><div class="fill ${cls === 'e' ? 'pe' : 'pf'}" data-w="${pct}"></div></div>
      </div>
      <div class="mini">
        <div><b>${fmt(m.actual - m.propuesta, 2)} km</b><small>menos kilómetros de red</small></div>
        <div><b>${S.recorridos.length}</b><small>recorridos propuestos</small></div>
        <div><b>${int(trx)}</b><small>transacciones/mes · ${fmt(S.area_km2, 1)} km²</small></div>
      </div>
    </article>`;
  };
  $('#compare').innerHTML = mk(S5, 'e', 'E') + mk(S6, 'f', 'F');
  $('#bufTxt').textContent = D.buffer;

  $('#tblProp').innerHTML = '<thead><tr><th>Sector</th><th>Línea</th><th>Recorrido</th><th>Longitud (km)</th><th>Unidades Requeridas (flota)</th></tr></thead><tbody>' +
    [[5, S5], [6, S6]].map(([n, S]) => {
      let totUnidades = 0;
      const rows = S.recorridos.map((r, i) => {
        // Encontrar fid correspondiente
        const feat = D.propuesta.features.find(f => f.properties.sector === n && f.properties.Recorrido === r.Recorrido);
        const fid = feat ? feat.properties.fid : (i + 1);
        const un = UNIDADES_OPTIMAS[(n === 5 ? 'E' : 'F') + '-' + fid];
        if (un) totUnidades += un;
        return `<tr><td>${i === 0 ? 'Sector ' + n : ''}</td><td><span class="tag ${n === 5 ? 'e' : 'f'}">${r.Linea}</span></td><td>${r.Recorrido}</td><td>${fmt(r.Longitud, 2)}</td><td><b>${un !== undefined && un > 0 ? un + ' unidades' : '—'}</b></td></tr>`;
      }).join('');
      const totKm = S.recorridos.reduce((a, r) => a + r.Longitud, 0);
      return rows + `<tr class="hl"><td colspan="3"><b>Total Línea ${n === 5 ? 'E' : 'F'}</b></td><td><b>${fmt(totKm, 2)}</b></td><td><b>${totUnidades} unidades</b></td></tr>`;
    }).join('') + '</tbody>';

  const lt = (S, id, n) => {
    const main = S.metod.lineas.map(x => 'Linea ' + x);
    $(id).innerHTML = `<caption>Sector ${n}</caption><thead><tr><th>Línea actual</th><th>km dentro</th><th></th></tr></thead><tbody>` +
      Object.entries(S.lineas_km).map(([k, v]) => `<tr class="${main.includes(k) ? 'hl' : ''}"><td>${short(k)}</td><td>${fmt(v, 2)}</td><td>${main.includes(k) ? '<span class="tag l">principal</span>' : ''}</td></tr>`).join('') + '</tbody>';
  };
  lt(S5, '#tblL5', 5); lt(S6, '#tblL6', 6);

  /* ---------- Conclusiones ---------- */
  const r5 = (1 - S5.metod.propuesta / S5.metod.actual) * 100, r6 = (1 - S6.metod.propuesta / S6.metod.actual) * 100;
  const ahorro = ((S5.metod.actual - S5.metod.propuesta) + (S6.metod.actual - S6.metod.propuesta));
  const base = S5.metod.actual + S6.metod.actual;
  $('#concl').innerHTML = `
    <div class="cc reveal"><h3>Sector 5 · Línea E</h3><ul>
      <li>La red propuesta (${fmt(S5.metod.propuesta, 2)} km) equivale al <b>${fmt(100 - r5)}%</b> de la actual (${fmt(S5.metod.actual, 2)} km): <b>−${fmt(r5)}%</b>.</li>
      <li>Hoy lo cubren con ramales puntuales las líneas <b>L6, L17 y L11</b>.</li>
      <li>Cobertura territorial a ≤350 m: el <b>98,4%</b> del sector cuenta con servicio accesible a pie, representando las parcelas sin cobertura sólo una minoría del <b>1,6%</b> (0,18 km²) concentrada en límites periféricos.</li></ul></div>
    <div class="cc reveal"><h3>Sector 6 · Línea F</h3><ul>
      <li>La red propuesta (${fmt(S6.metod.propuesta, 2)} km) equivale al <b>${fmt(100 - r6)}%</b> de la actual (${fmt(S6.metod.actual, 2)} km): <b>−${fmt(r6)}%</b>.</li>
      <li>Hoy lo cubren con ramales puntuales las líneas <b>L6, L11, L4, L8, L1 y L10</b>: seis líneas contra un único servicio unificado.</li>
      <li>Cobertura territorial a ≤350 m: el <b>71,8%</b> del sector dispone de servicio directo. Las áreas sin cobertura representan el <b>28,2%</b> restante y corresponden en su gran mayoría a zonas no residenciales (tierras periurbanas y márgenes ribereños) que incluso el sistema actual no cubre.</li></ul></div>
    <div class="cc wide reveal"><h3>Lectura conjunta del piloto</h3><ul>
      <li>Entre ambos sectores se pasaría de <b>${fmt(base, 2)} km</b> a <b>${fmt(S5.metod.propuesta + S6.metod.propuesta, 2)} km</b> de red: <b>−${fmt(ahorro, 2)} km (${fmt(ahorro / base * 100)}%)</b>.</li>
      <li>El Sector 5 reduce más (${fmt(r5)}%) que el Sector 6 (${fmt(r6)}%): el 6 tiene mayor superficie y una red actual más extensa por sumarse varias líneas.</li>
      <li>El análisis objetivo de cobertura a 350 metros confirma una cobertura casi total en el tejido residencial urbano, asegurando un servicio de proximidad directo y eficiente.</li></ul></div>`;

  /* ---------- pestañas modelo predictivo ---------- */
  document.querySelectorAll('.m-tab').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('on'));
      b.classList.add('on');
      const s = b.dataset.sec;
      document.querySelectorAll('.model-panel').forEach(p => p.classList.remove('on'));
      const target = $('#modelSec' + s);
      if (target) target.classList.add('on');
    });
  });

  /* ---------- animaciones ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll('[data-w]').forEach(f => f.style.width = f.dataset.w + '%');
    if (e.target.dataset.w) e.target.style.width = e.target.dataset.w + '%';
    io.unobserve(e.target);
  }), { threshold: .15 });
  document.querySelectorAll('.reveal,.chart,.bar-row .fill').forEach(el => io.observe(el));
  document.querySelectorAll('.chart').forEach(c => { const o = new IntersectionObserver(es => { if (es[0].isIntersecting) { c.querySelectorAll('[data-w]').forEach(f => f.style.width = f.dataset.w + '%'); o.disconnect(); } }, { threshold: .2 }); o.observe(c); });
  document.querySelectorAll('.sec h2, .sec .sub, .roadmap, .impact, .card, .step, .comp-card, .model-intro').forEach(el => { el.classList.add('reveal'); io.observe(el); });
  window.addEventListener('load', () => setTimeout(() => map.invalidateSize(), 300));
})();
