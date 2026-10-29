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
    ['7', 'Sectores en que se divide la ciudad'],
    [int(totTrx), 'Transacciones mensuales analizadas']
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
  ['sectores', 'actuales', 'afectados', 'cobertura', 'propuesta', 'highlight'].forEach((p, i) => { map.createPane(p); map.getPane(p).style.zIndex = 400 + i * 10; });

  const LINE_PAL = { 'Linea 1': '#b45309', 'Linea 3': '#7c3aed', 'Linea 4': '#0891b2', 'Linea 5': '#ea580c', 'Linea 6': '#be185d', 'Linea 7': '#15803d', 'Linea 8': '#1d4ed8', 'Linea 9': '#9333ea', 'Linea 10': '#a16207', 'Linea 11': '#0f766e', 'Linea 12': '#b91c1c', 'Linea 17': '#4d7c0f', 'Linea 18': '#c026d3', 'Linea 19': '#047857' };
  const E_COL = ['#0066ff', '#7c3aed', '#0891b2', '#0b2a6f'];
  const F_COL = ['#e4572e', '#c2185b', '#d97706'];
  const GRIS = '#94a3b8';
  const DEFAULT_TIP = '<b>Tip:</b> tocá una línea o un sector para ver sus datos.';
  let activeInfoLayer = null;
  const info = $('#mapInfo');
  const setInfo = (h, layer = null) => {
    info.innerHTML = h;
    activeInfoLayer = layer;
  };
  const resetInfo = () => {
    info.innerHTML = DEFAULT_TIP;
    activeInfoLayer = null;
  };
  const short = s => s.replace('Linea ', 'L');

  // ---------- SECTORES: GESTIÓN DIFERENCIADA (SECTORES 1 A 7) ----------
  const SEC_PALETTE = {
    1: { fill: '#0284c7', border: '#94a3b8' }, // Sector 1 · Línea A
    2: { fill: '#16a34a', border: '#94a3b8' }, // Sector 2 · Línea B
    3: { fill: '#ca8a04', border: '#94a3b8' }, // Sector 3 · Línea C
    4: { fill: '#9333ea', border: '#94a3b8' }, // Sector 4 · Línea D
    5: { fill: '#0066ff', border: '#64748b' }, // Sector 5 · Línea E (Piloto)
    6: { fill: '#e4572e', border: '#64748b' }, // Sector 6 · Línea F (Piloto)
    7: { fill: '#0d9488', border: '#94a3b8' }  // Sector 7 · Línea G
  };

  const lSectGroup = L.layerGroup().addTo(map);
  const activeSectors = new Map(); // n -> { layer, feat, n }
  const sectorLayersMap = new Map();

  function createSectorLayer(f, n) {
    const isPilot = n === 5 || n === 6;
    const pal = SEC_PALETTE[n] || { fill: '#94a3b8', border: '#94a3b8' };
    const layer = L.geoJSON(f, {
      pane: 'sectores',
      style: () => ({
        color: isPilot ? '#64748b' : '#94a3b8',
        weight: isPilot ? 1.6 : 1.3,
        fillColor: isPilot ? (n === 5 ? '#3b82f6' : '#ea580c') : pal.fill,
        fillOpacity: isPilot ? 0.08 : 0.06,
        opacity: 0.75,
        dashArray: '5 5'
      }),
      onEachFeature: (feat, l) => {
        l.on('click', () => {
          setInfo(`<h5>${feat.properties.Name}</h5>
            <div class="m">
              <b>${int(feat.properties.TRX_MES)}</b> transacciones/mes · <b>${int(feat.properties.TARJ_MES)}</b> tarjetas<br>
              Superficie: <b>${fmt(featArea(feat), 1)} km²</b> · Densidad: <b>${int(feat.properties.TRX_MES / featArea(feat))} trx/km²</b><br>
              <span class="tag ${n === 5 ? 'e' : n === 6 ? 'f' : 'l'}">Línea ${LETTER[n - 1]}${isPilot ? ' · Piloto' : ''}</span>
            </div>`, l);
        });
        l.on('mouseover', () => {
          l.setStyle({ fillOpacity: isPilot ? 0.20 : 0.16, weight: 2.2, opacity: 0.95 });
        });
        l.on('mouseout', () => {
          layer.resetStyle(l);
        });
        l.bindTooltip(`Sector ${n} · Línea ${LETTER[n - 1]}`, {
          permanent: true,
          direction: 'center',
          className: 'sector-label'
        });
      }
    });
    return layer;
  }

  function toggleSector(n, shouldZoom = false) {
    const feat = D.sectores.features.find(x => secNum(x) === n);
    if (!feat) return;

    if (activeSectors.has(n)) {
      // DESACTIVAR
      const item = activeSectors.get(n);
      lSectGroup.removeLayer(item.layer);
      activeSectors.delete(n);
      if (activeInfoLayer === item.layer) resetInfo();
    } else {
      // ACTIVAR
      let layer = sectorLayersMap.get(n);
      if (!layer) {
        layer = createSectorLayer(feat, n);
        sectorLayersMap.set(n, layer);
      }
      lSectGroup.addLayer(layer);
      activeSectors.set(n, { layer, feat, n });

      if (shouldZoom) {
        map.fitBounds(layer.getBounds(), { padding: [35, 35] });
      }

      setInfo(`<h5>${feat.properties.Name}</h5>
        <div class="m">
          <b>${int(feat.properties.TRX_MES)}</b> transacciones/mes · <b>${int(feat.properties.TARJ_MES)}</b> tarjetas<br>
          Superficie: <b>${fmt(featArea(feat), 1)} km²</b> · Densidad: <b>${int(feat.properties.TRX_MES / featArea(feat))} trx/km²</b><br>
          <span class="tag ${n === 5 ? 'e' : n === 6 ? 'f' : 'l'}">Línea ${LETTER[n - 1]}${n === 5 || n === 6 ? ' · Piloto' : ''}</span>
        </div>`, layer);
    }

    syncSectorsUI();
    checkAnyActiveLayers();
  }

  function setAllSectors(enabled) {
    secs.forEach(f => {
      const n = secNum(f);
      const isActive = activeSectors.has(n);
      if (enabled && !isActive) {
        toggleSector(n, false);
      } else if (!enabled && isActive) {
        toggleSector(n, false);
      }
    });
  }

  function setPilotSectors() {
    secs.forEach(f => {
      const n = secNum(f);
      const shouldBeActive = n === 5 || n === 6;
      const isActive = activeSectors.has(n);
      if (shouldBeActive && !isActive) {
        toggleSector(n, false);
      } else if (!shouldBeActive && isActive) {
        toggleSector(n, false);
      }
    });
    map.fitBounds(b56(), { padding: [35, 35] });
  }

  function syncSectorsUI() {
    const cbMaster = $('#L-sectores');
    const count = activeSectors.size;

    if (cbMaster) {
      if (count === secs.length) {
        cbMaster.checked = true;
        cbMaster.indeterminate = false;
      } else if (count > 0) {
        cbMaster.checked = false;
        cbMaster.indeterminate = true;
      } else {
        cbMaster.checked = false;
        cbMaster.indeterminate = false;
      }
    }

    const subtxt = $('#sectorsSubtxt');
    if (subtxt) {
      if (count === 0) {
        subtxt.textContent = '7 polígonos delimitados (individuales)';
      } else if (count === secs.length) {
        subtxt.textContent = 'Todos los sectores activos (7 de 7)';
      } else {
        const activeNames = [...activeSectors.keys()].sort((a,b)=>a-b).map(n => `S${n}`).join(', ');
        subtxt.textContent = `${count} de 7 activos (${activeNames})`;
      }
    }

    secs.forEach(f => {
      const n = secNum(f);
      const isActive = activeSectors.has(n);
      const row = $(`#sectorsList .sec-item-row[data-sec="${n}"]`);
      const cb = $(`#sec-cb-${n}`);
      if (row) row.classList.toggle('active', isActive);
      if (cb) cb.checked = isActive;
    });
  }

  function renderSectorsList() {
    const container = $('#sectorsList');
    if (!container) return;
    const html = secs.map(f => {
      const n = secNum(f);
      const a = featArea(f);
      const pal = SEC_PALETTE[n] || { fill: '#94a3b8' };
      const isPilot = n === 5 || n === 6;
      const tag = isPilot ? `<span class="sec-tag-piloto ${n === 5 ? 'e' : 'f'}">Piloto</span>` : '';
      return `
        <div class="sec-item-row" data-sec="${n}">
          <input type="checkbox" class="sec-item-cb" id="sec-cb-${n}">
          <i class="sec-item-sw" style="background:${pal.fill}"></i>
          <div class="sec-item-info">
            <span class="sec-item-title">Sector ${n}</span>
            <span class="sec-item-line">· Línea ${LETTER[n - 1]}</span>
            ${tag}
          </div>
          <span class="sec-item-km">${fmt(a, 1)} km²</span>
          <button type="button" class="sec-item-zoom" title="Enfocar Sector ${n}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>
        </div>
      `;
    }).join('');

    container.innerHTML = html;

    container.addEventListener('click', e => {
      const zoomBtn = e.target.closest('.sec-item-zoom');
      const row = e.target.closest('.sec-item-row');
      if (!row) return;
      const n = parseInt(row.dataset.sec, 10);
      if (zoomBtn) {
        e.stopPropagation();
        if (!activeSectors.has(n)) toggleSector(n, false);
        const feat = D.sectores.features.find(x => secNum(x) === n);
        if (feat) map.fitBounds(L.geoJSON(feat).getBounds(), { padding: [35, 35] });
        return;
      }
      toggleSector(n, false);
    });
  }

  renderSectorsList();

  // 1 · trazos actuales afectados (ramales que ingresan a sectores 5 y/o 6)
  const lActAfectados = L.geoJSON(D.actuales_afectados, {
    pane: 'afectados',
    style: () => ({ color: '#526071', weight: 2.4, opacity: .78 }),
    onEachFeature: (f, l) => {
      l.on('mouseover', () => l.setStyle({ weight: 5, opacity: 1, color: '#334155' }));
      l.on('mouseout', () => lActAfectados.resetStyle(l));
      l.on('click', () => {
        const secs = f.properties.sectores_afectados || [];
        const secText = secs.length === 2 ? 'Sectores 5 y 6' : secs.length === 1 ? 'Sector ' + secs[0] : '';
        const d5 = f.properties.km_sector_5 ? ` · En Sector 5: <b>${fmt(f.properties.km_sector_5, 2)} km</b>` : '';
        const d6 = f.properties.km_sector_6 ? ` · En Sector 6: <b>${fmt(f.properties.km_sector_6, 2)} km</b>` : '';
        setInfo(`<h5>${f.properties.Nombre}</h5><div class="m">Trazado actual afectado · <b>Ingresa a ${secText}</b>${d5}${d6}<br><small style="color:#64748b">Traza completa (ida y vuelta)</small></div>`, lActAfectados);
      });
    }
  });

  // 2 · red actual completa (todos los ramales de la ciudad)
  const lAct = L.geoJSON(D.actuales, {
    pane: 'actuales', style: () => ({ color: '#94a3b8', weight: 1.8, opacity: .45 }),
    onEachFeature: (f, l) => {
      l.on('mouseover', () => l.setStyle({ weight: 4.5, opacity: 1, color: '#64748b' }));
      l.on('mouseout', () => lAct.resetStyle(l));
      l.on('click', () => setInfo(`<h5>${f.properties.Nombre}</h5><div class="m">Red actual completa (ciudad) · Ramal: ${f.properties.Ramal}</div>`, lAct));
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
      l.on('click', () => setInfo(`<h5>Zona sin cobertura (&gt;350 m)</h5><div class="m">Sector ${f.properties.sector} · Superficie: <b>${fmt(f.properties.area_ha, 1)} ha</b> (${fmt(f.properties.area_km2, 2)} km²)<br>Distancia al trazado propuesto más cercano: <b>&gt; 350 metros</b></div>`, lCob));
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

  // ---------- RAMALES PROPUESTOS: GESTIÓN INDIVIDUAL ----------
  const lPropHighlights = L.layerGroup().addTo(map);
  const activeProposedLayers = new Map(); // key ('E-1', 'E-2', etc.) -> { grp, casing, lineLayer, feat, key }

  const getPropKey = f => `${f.properties.Linea}-${f.properties.fid}`;
  const getPropColor = f => (f.properties.sector === 5 ? E_COL : F_COL)[(f.properties.fid - 1) % (f.properties.sector === 5 ? E_COL.length : F_COL.length)];

  // ---------- PARADAS OPTIMIZADAS DE LA PROPUESTA (SECTOR 5) ----------
  function isRouteWithRealStops(routeKey) {
    return routeKey === 'E-1' || routeKey === 'E-2';
  }

  function getRealStopsForRoute(routeKey) {
    if (!D.paradas_propuesta || !D.paradas_propuesta.features) return [];
    const ramalFilter = routeKey === 'E-1' ? 'Manantial Sur' : routeKey === 'E-2' ? 'San Alberto' : null;
    if (!ramalFilter) return [];
    return D.paradas_propuesta.features.filter(f => {
      const r = f.properties && f.properties.Ramal;
      return r && r.toLowerCase().includes(ramalFilter.toLowerCase());
    });
  }

  const lMapStopsGroup = L.layerGroup().addTo(map);
  let showMapStops = true;

  const ParadasControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const b = L.DomUtil.create('button', 'paradas-toggle on');
      b.type = 'button';
      b.id = 'paradasToggle';
      b.innerHTML = '<span class="pdot"></span><span class="ptxt">🚏 Paradas propuesta</span>';
      b.title = 'Mostrar u ocultar los puntos de paradas optimizadas de los recorridos activos';
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener('click', () => {
        showMapStops = !showMapStops;
        b.classList.toggle('on', showMapStops);
        updateMapStops();
      });
      return b;
    }
  });
  const paradasBtn = new ParadasControl().addTo(map).getContainer();
  paradasBtn.style.display = 'none';

  function updateMapStops() {
    lMapStopsGroup.clearLayers();
    const hasE1 = activeProposedLayers.has('E-1');
    const hasE2 = activeProposedLayers.has('E-2');
    const isAvail = hasE1 || hasE2;

    if (!isAvail) {
      paradasBtn.style.display = 'none';
      return;
    }

    paradasBtn.style.display = '';

    const stopsToShow = [];
    const seen = new Set();

    if (hasE1) {
      getRealStopsForRoute('E-1').forEach(f => {
        const k = `${f.geometry.coordinates[0]}_${f.geometry.coordinates[1]}`;
        if (!seen.has(k)) {
          seen.add(k);
          stopsToShow.push({ f, color: E_COL[0], ramal: 'Manantial Sur' });
        }
      });
    }

    if (hasE2) {
      getRealStopsForRoute('E-2').forEach(f => {
        const k = `${f.geometry.coordinates[0]}_${f.geometry.coordinates[1]}`;
        if (!seen.has(k)) {
          seen.add(k);
          stopsToShow.push({ f, color: E_COL[1], ramal: 'San Alberto' });
        }
      });
    }

    const txtSpan = paradasBtn.querySelector('.ptxt');
    if (txtSpan) {
      txtSpan.textContent = `🚏 Paradas (${stopsToShow.length}): ` + (showMapStops ? 'activadas' : 'desactivadas');
    }

    if (!showMapStops) return;

    stopsToShow.forEach(item => {
      const p = item.f.properties;
      const coords = item.f.geometry.coordinates;
      const lat = coords[1], lon = coords[0];
      const marker = L.circleMarker([lat, lon], {
        pane: 'highlight',
        radius: 5,
        color: '#ffffff',
        weight: 2,
        fillColor: item.color,
        fillOpacity: 0.95
      });

      marker.bindTooltip(`<b>🚏 ${p.Direccion}</b><br><small style="color:#cbd5e1">Línea ${p.Linea || 'E'} · Ramal: ${p.Ramal}</small>`, {
        direction: 'top',
        className: 'leaflet-tooltip'
      });

      marker.on('click', () => {
        setInfo(`<h5>🚏 Parada: ${p.Direccion}</h5>
          <div class="m">Propuesta Línea ${p.Linea || 'E'} · Ramal: <b>${p.Ramal}</b><br>
          Punto de parada optimizado (Sector 5 · Línea E)<br>
          <small style="color:#64748b">Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}</small></div>`, marker);
      });

      marker.on('mouseover', () => marker.setRadius(7.5));
      marker.on('mouseout', () => marker.setRadius(5));

      lMapStopsGroup.addLayer(marker);
    });
  }

  function syncProposedMasterCheckboxes() {
    const eFeatures = D.propuesta.features.filter(f => f.properties.sector === 5);
    const fFeatures = D.propuesta.features.filter(f => f.properties.sector === 6);

    const activeE = eFeatures.filter(f => activeProposedLayers.has(getPropKey(f))).length;
    const cbE = $('#L-E');
    if (cbE) {
      if (activeE === eFeatures.length) {
        cbE.checked = true; cbE.indeterminate = false;
      } else if (activeE > 0) {
        cbE.checked = false; cbE.indeterminate = true;
      } else {
        cbE.checked = false; cbE.indeterminate = false;
      }
    }

    const activeF = fFeatures.filter(f => activeProposedLayers.has(getPropKey(f))).length;
    const cbF = $('#L-F');
    if (cbF) {
      if (activeF === fFeatures.length) {
        cbF.checked = true; cbF.indeterminate = false;
      } else if (activeF > 0) {
        cbF.checked = false; cbF.indeterminate = true;
      } else {
        cbF.checked = false; cbF.indeterminate = false;
      }
    }

    const btnClear = $('#btnClearProp');
    if (btnClear) {
      if (activeProposedLayers.size > 0) {
        btnClear.style.display = '';
        btnClear.textContent = activeProposedLayers.size > 1 ? `Limpiar (${activeProposedLayers.size})` : 'Limpiar';
      } else {
        btnClear.style.display = 'none';
      }
    }

    checkAnyActiveLayers();
    updateMapStops();
  }

  function toggleProposed(key, shouldZoom = true) {
    const f = D.propuesta.features.find(x => getPropKey(x) === key);
    if (!f) return;
    const rowEl = $(`#legend .lg-row[data-key="${key}"]`);

    if (activeProposedLayers.has(key)) {
      // DESACTIVAR
      const item = activeProposedLayers.get(key);
      lPropHighlights.removeLayer(item.grp);
      activeProposedLayers.delete(key);
      if (rowEl) rowEl.classList.remove('active');
      if (activeInfoLayer === item.grp) resetInfo();
    } else {
      // ACTIVAR
      const col = getPropColor(f);
      const casing = L.geoJSON(f, {
        pane: 'propuesta',
        interactive: false,
        style: () => ({ color: '#ffffff', weight: 8.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' })
      });
      const lineLayer = L.geoJSON(f, {
        pane: 'propuesta',
        interactive: true,
        style: () => ({ color: col, weight: 5.5, opacity: 0.98, lineCap: 'round', lineJoin: 'round' })
      });

      const grp = L.layerGroup([casing, lineLayer]).addTo(lPropHighlights);
      activeProposedLayers.set(key, { grp, casing, lineLayer, feat: f, key });
      if (rowEl) rowEl.classList.add('active');

      if (shouldZoom) {
        map.fitBounds(lineLayer.getBounds(), { padding: [40, 40], maxZoom: 15 });
      }

      lineLayer.on('click', () => {
        toggleProposed(key, false);
      });
      lineLayer.on('mouseover', () => lineLayer.setStyle({ weight: 8 }));
      lineLayer.on('mouseout', () => lineLayer.setStyle({ weight: 5.5 }));

      // Info card
      const unReq = UNIDADES_OPTIMAS[key] || Math.max(1, Math.round(f.properties.Longitud / 2.5));
      setInfo(`<h5>Línea ${f.properties.Linea} · ${f.properties.Recorrido}</h5>
        <div class="m">Propuesta Sector ${f.properties.sector} · Longitud: <b>${fmt(f.properties.Longitud, 2)} km</b> (ida y vuelta)<br>
        Flota proyectada: <b>${unReq} unidades</b> para frecuencia regular.</div>`, grp);
    }

    syncProposedMasterCheckboxes();
    Flow.refresh();
  }

  // Renderizar listado de la leyenda propuesta
  function renderProposedList() {
    const container = $('#legend');
    if (!container) return;
    const rows = [];
    D.propuesta.features.forEach(f => {
      const key = getPropKey(f);
      const c = getPropColor(f);
      const isActive = activeProposedLayers.has(key);
      const hasStops = isRouteWithRealStops(key);
      const badgeStops = hasStops ? `<span class="badge-stops-pill" title="Cuenta con puntos de paradas optimizadas relevadas en GeoJSON">🚏 Paradas</span>` : '';
      rows.push(`<div class="lg-row ${isActive ? 'active' : ''}" data-key="${key}" data-s="${f.properties.sector}" data-fid="${f.properties.fid}">
        <i style="background:${c}"></i>
        <span style="flex:1;">Línea ${f.properties.Linea} · ${f.properties.Recorrido} ${badgeStops}</span>
        <small style="color:#667085;font-variant-numeric:tabular-nums;">${fmt(f.properties.Longitud, 1)} km</small>
      </div>`);
    });
    container.innerHTML = rows.join('');
  }

  renderProposedList();

  $('#legend')?.addEventListener('click', e => {
    const r = e.target.closest('.lg-row');
    if (!r) return;
    const key = r.dataset.key;
    toggleProposed(key);
  });

  $('#btnClearProp')?.addEventListener('click', () => {
    [...activeProposedLayers.keys()].forEach(k => toggleProposed(k, false));
    resetInfo();
  });

  /* ---- Partículas de sentido de circulación (siguen el orden de vértices de cada trazo) ---- */
  const Flow = (() => {
    const cv = document.createElement('canvas');
    cv.className = 'flow-canvas';
    map.getContainer().appendChild(cv);
    const ctx = cv.getContext('2d');
    const tracks = []; // [{key, pts, cum, total, color, n, phase}]
    const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SPEED = 220, TRAIL = 7; // m/s, puntos de estela
    let raf = null, last = 0, hidden = false, enabled = true;

    function build() {
      tracks.length = 0;
      D.propuesta.features.forEach(f => {
        const key = getPropKey(f);
        const col = getPropColor(f);
        const nReq = UNIDADES_OPTIMAS[key] - 2 !== undefined ? UNIDADES_OPTIMAS[key] - 2 : Math.max(1, Math.round(f.properties.Longitud / 2.5));
        if (nReq <= 0) return;

        const parts = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
        parts.forEach(pts => {
          if (pts.length < 2) return;
          const lat0 = pts[0][1] * Math.PI / 180, kx = 111320 * Math.cos(lat0), ky = 110570;
          const cum = [0];
          for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot((pts[i][0] - pts[i - 1][0]) * kx, (pts[i][1] - pts[i - 1][1]) * ky));
          const total = cum[cum.length - 1];
          if (total < 50) return;
          tracks.push({ key, pts, cum, total, color: col, n: nReq, phase: Math.random() });
        });
      });
    }

    function at(r, d) {
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
      tracks.forEach(r => {
        // Solo renderizar si el ramal está activo individualmente
        if (!activeProposedLayers.has(r.key)) return;

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
      ctx.globalAlpha = 1;
    }
    function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function refresh() {
      const any = activeProposedLayers.size > 0;
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
    build();
    resize();
    map.on('resize', resize);
    map.on('zoomstart', () => { hidden = true; });
    map.on('zoomend', () => { hidden = false; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = null; } else refresh(); });
    refresh();
    return { refresh };
  })();

  // ---------- RAMALES DEL SISTEMA ACTUAL ----------
  const cleanStr = s => (s || '').replace(/\ufffd/g, 'ñ').replace(/Chaaritos|Chaaritos/g, 'Chañaritos').replace(/Pea|Pea/g, 'Peña');
  function calcKm(coords) {
    let d = 0;
    for (let i = 1; i < coords.length; i++) {
      const lat0 = (coords[i][1] + coords[i - 1][1]) / 2 * Math.PI / 180;
      const kx = 111.32 * Math.cos(lat0), ky = 110.57;
      d += Math.hypot((coords[i][0] - coords[i - 1][0]) * kx, (coords[i][1] - coords[i - 1][1]) * ky);
    }
    return d;
  }

  // Ordenar numéricamente por línea (1, 3, 4, ... 19) y luego por nombre de ramal
  const getLineNum = f => parseInt((f.properties.Line || '').replace(/\D/g, ''), 10) || 0;
  const actSorted = D.actuales.features.slice().sort((a, b) => {
    const nA = getLineNum(a), nB = getLineNum(b);
    if (nA !== nB) return nA - nB;
    return (a.properties.Ramal || '').localeCompare(b.properties.Ramal || '');
  });

  const lActHighlights = L.layerGroup().addTo(map);
  const activeActualLayers = new Map(); // fid -> { grp, lineLayer }

  const ACT_COL = '#526071'; // Tonalidad grisácea para todo el sistema actual

  function renderActualesList(filterText = '') {
    const term = filterText.toLowerCase().trim();
    const rows = [];
    actSorted.forEach(f => {
      const fid = f.properties.fid;
      const lineName = cleanStr(f.properties.Line);
      const ramalName = cleanStr(f.properties.Ramal);
      const fullName = cleanStr(f.properties.Nombre);
      if (term && !fullName.toLowerCase().includes(term) && !lineName.toLowerCase().includes(term) && !ramalName.toLowerCase().includes(term)) {
        return;
      }
      const col = ACT_COL;
      const km = f.km || (f.km = calcKm(f.geometry.coordinates));
      const isActive = activeActualLayers.has(fid);
      rows.push(`<div class="lg-row ${isActive ? 'active' : ''}" data-fid="${fid}" title="${fullName} · ${fmt(km, 1)} km"><i style="background:${col}"></i><span>${fullName}</span><small style="color:#667085">${fmt(km, 1)} km</small></div>`);
    });
    const container = $('#legendActuales');
    if (container) {
      container.innerHTML = rows.length ? rows.join('') : '<div style="padding:10px 0;font-size:12px;color:var(--mut)">No se encontraron ramales</div>';
    }
  }

  function toggleActual(fid) {
    const f = D.actuales.features.find(x => x.properties.fid == fid);
    if (!f) return;
    const rowEl = $(`#legendActuales .lg-row[data-fid="${fid}"]`);
    const btnClear = $('#btnClearActuales');

    if (activeActualLayers.has(fid)) {
      // DESACTIVAR
      const item = activeActualLayers.get(fid);
      lActHighlights.removeLayer(item.grp);
      activeActualLayers.delete(fid);
      if (rowEl) rowEl.classList.remove('active');

      if (activeActualLayers.size === 0) {
        if (btnClear) btnClear.style.display = 'none';
        resetInfo();
      } else {
        if (btnClear) btnClear.textContent = `Limpiar (${activeActualLayers.size})`;
      }
    } else {
      // ACTIVAR
      const casing = L.geoJSON(f, {
        pane: 'highlight',
        interactive: false,
        style: () => ({ color: '#ffffff', weight: 7.5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' })
      });
      const lineLayer = L.geoJSON(f, {
        pane: 'highlight',
        interactive: true,
        style: () => ({ color: ACT_COL, weight: 4.8, opacity: 1, lineCap: 'round', lineJoin: 'round' })
      });

      const grp = L.layerGroup([casing, lineLayer]).addTo(lActHighlights);
      activeActualLayers.set(fid, { grp, lineLayer });
      if (rowEl) rowEl.classList.add('active');

      if (btnClear) {
        btnClear.style.display = '';
        btnClear.textContent = activeActualLayers.size > 1 ? `Limpiar (${activeActualLayers.size})` : 'Limpiar';
      }

      // Zoom al trazo
      map.fitBounds(lineLayer.getBounds(), { padding: [40, 40], maxZoom: 15 });

      // Click sobre el trazado resaltado en el mapa permite desactivarlo
      lineLayer.on('click', () => {
        toggleActual(fid);
      });
      lineLayer.on('mouseover', () => lineLayer.setStyle({ weight: 6.8, color: '#334155' }));
      lineLayer.on('mouseout', () => lineLayer.setStyle({ weight: 4.8, color: ACT_COL }));

      // Info card
      const cName = cleanStr(f.properties.Nombre);
      const km = f.km || calcKm(f.geometry.coordinates);
      setInfo(`<h5>${cName}</h5><div class="m">Ramal actual · <b>${cleanStr(f.properties.Ramal)}</b><br>Longitud total: <b>${fmt(km, 1)} km</b></div>`, lActHighlights);
    }
  }

  // Render inicial de ramales actuales
  renderActualesList();

  // Eventos de lista y búsqueda
  $('#legendActuales')?.addEventListener('click', e => {
    const r = e.target.closest('.lg-row');
    if (!r) return;
    const fid = parseInt(r.dataset.fid, 10);
    toggleActual(fid);
  });

  $('#btnClearActuales')?.addEventListener('click', () => {
    lActHighlights.clearLayers();
    activeActualLayers.clear();
    document.querySelectorAll('#legendActuales .lg-row.active').forEach(el => el.classList.remove('active'));
    $('#btnClearActuales').style.display = 'none';
    resetInfo();
  });

  $('#searchActuales')?.addEventListener('input', e => {
    renderActualesList(e.target.value);
  });

  // toggles
  const checkAnyActiveLayers = () => {
    const anyChecked = [...document.querySelectorAll('input[id^="L-"]')].some(c => c.checked || c.indeterminate) ||
      (activeActualLayers && activeActualLayers.size > 0) ||
      (activeProposedLayers && activeProposedLayers.size > 0) ||
      (activeSectors && activeSectors.size > 0);
    if (!anyChecked) {
      resetInfo();
    }
  };

  const bind = (id, layer) => {
    const el = $(id);
    if (el) {
      el.addEventListener('change', e => {
        if (e.target.checked) {
          layer.addTo(map);
        } else {
          map.removeLayer(layer);
          if (activeInfoLayer === layer) {
            resetInfo();
          }
        }
        checkAnyActiveLayers();
      });
    }
  };
  bind('#L-afectados', lActAfectados);
  bind('#L-actuales', lAct);
  bind('#L-cob', lCob);

  // Toggle master para Sectores (1 a 7)
  $('#L-sectores')?.addEventListener('change', e => {
    const isChecked = e.target.checked;
    e.target.indeterminate = false;
    setAllSectors(isChecked);
  });

  // Toggle colapso/despliegue del subpanel de sectores
  const toggleSectorsSubpanel = (forceState = null) => {
    const panel = $('#sectorsSubpanel');
    const btn = $('#btnToggleSecSub');
    const txt = $('#txtToggleSecSub');
    if (!panel) return;
    const isCurrentlyCollapsed = panel.classList.contains('collapsed');
    const nextCollapsed = forceState !== null ? forceState : !isCurrentlyCollapsed;
    panel.classList.toggle('collapsed', nextCollapsed);
    if (btn) btn.classList.toggle('collapsed', nextCollapsed);
    if (txt) txt.textContent = nextCollapsed ? 'Desplegar' : 'Contraer';
  };

  $('#btnToggleSecSub')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleSectorsSubpanel();
  });

  // Botones de acción rápida de sectores
  $('#btnSecAll')?.addEventListener('click', () => setAllSectors(true));
  $('#btnSecNone')?.addEventListener('click', () => setAllSectors(false));
  $('#btnSecPiloto')?.addEventListener('click', () => setPilotSectors());

  // Toggle master para Línea E (Sector 5)
  $('#L-E')?.addEventListener('change', e => {
    const isChecked = e.target.checked;
    e.target.indeterminate = false;
    D.propuesta.features.filter(f => f.properties.sector === 5).forEach(f => {
      const key = getPropKey(f);
      if (isChecked && !activeProposedLayers.has(key)) {
        toggleProposed(key, false);
      } else if (!isChecked && activeProposedLayers.has(key)) {
        toggleProposed(key, false);
      }
    });
    checkAnyActiveLayers();
  });

  // Toggle master para Línea F (Sector 6)
  $('#L-F')?.addEventListener('change', e => {
    const isChecked = e.target.checked;
    e.target.indeterminate = false;
    D.propuesta.features.filter(f => f.properties.sector === 6).forEach(f => {
      const key = getPropKey(f);
      if (isChecked && !activeProposedLayers.has(key)) {
        toggleProposed(key, false);
      } else if (!isChecked && activeProposedLayers.has(key)) {
        toggleProposed(key, false);
      }
    });
    checkAnyActiveLayers();
  });

  document.querySelectorAll('input[id^="L-"]').forEach(c => { c.checked = false; c.indeterminate = false; });

  // foco
  const b56 = () => L.geoJSON(D.propuesta).getBounds();
  const bSec = n => {
    const f = D.sectores.features.find(x => secNum(x) === n);
    return f ? L.geoJSON(f).getBounds() : b56();
  };
  function focus(f) {
    document.querySelectorAll('#focus button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
    const b = f === 'all' ? b56() : f === 'city' ? L.geoJSON(D.sectores).getBounds() : bSec(+f);
    map.flyToBounds(b, { padding: [30, 30], duration: .9 });
  }
  $('#focus')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const f = b.dataset.f;
    focus(f);
    if (f === '5' || f === '6') {
      const n = parseInt(f, 10);
      if (!activeSectors.has(n)) toggleSector(n, false);
    }
  });
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
  document.querySelectorAll('.sec h2, .sec .sub, .roadmap, .impact, .card, .step, .comp-table-card, .model-intro').forEach(el => { el.classList.add('reveal'); io.observe(el); });

  /* ==========================================================================
     MOTOR Y ESTUDIO DE SIMULACIÓN DE TRANSPORTE PÚBLICO (DIRECTIVA)
     ========================================================================== */
  const CENTRO_BOUNDS = {
    latMin: -26.840,
    latMax: -26.820,
    lngMin: -65.220,
    lngMax: -65.195
  };

  function isPointInCentro(lng, lat) {
    return lat >= CENTRO_BOUNDS.latMin && lat <= CENTRO_BOUNDS.latMax &&
           lng >= CENTRO_BOUNDS.lngMin && lng <= CENTRO_BOUNDS.lngMax;
  }

  function haversineM(c1, c2) {
    const lat0 = (c1[1] + c2[1]) / 2 * Math.PI / 180;
    const kx = 111320 * Math.cos(lat0), ky = 110570;
    return Math.hypot((c2[0] - c1[0]) * kx, (c2[1] - c1[1]) * ky);
  }

  const Sim = {
    active: false,
    routeKey: 'E-1',
    routeFeature: null,
    fleetCount: 9,
    distPeri: 200,      // m
    distCentro: 350,    // m
    speedPeri: 22,      // km/h
    speedCentro: 16,    // km/h
    dwellTime: 20,      // s
    timeSpeed: 15,      // multiplicador de velocidad
    currentTime: 25200, // 07:00:00 (segundos desde las 00:00)
    startTime: 21600,   // 06:00:00
    endTime: 46800,     // 13:00:00
    isPlaying: true,
    rafId: null,
    lastTs: 0,
    showStops: true,
    showCentroArea: true,
    stopsMode: 'teoricas', // 'teoricas' | 'reales'

    // Geometría y paradas
    totalMeters: 0,
    periMeters: 0,
    centroMeters: 0,
    stops: [],
    cumDists: [],
    coords: [],

    // Capas de mapa Leaflet
    layerGroup: L.layerGroup().addTo(map),
    layerRoute: null,
    layerStops: L.layerGroup(),
    layerBuses: L.layerGroup(),
    layerCentroArea: null,

    // Unidades
    buses: [],
    selectedBusId: null
  };

  Sim.layerGroup.addLayer(Sim.layerStops);
  Sim.layerGroup.addLayer(Sim.layerBuses);

  // Inicializar polígono del área central (Macrocentro)
  const centroPolyCoords = [
    [CENTRO_BOUNDS.latMax, CENTRO_BOUNDS.lngMin],
    [CENTRO_BOUNDS.latMax, CENTRO_BOUNDS.lngMax],
    [CENTRO_BOUNDS.latMin, CENTRO_BOUNDS.lngMax],
    [CENTRO_BOUNDS.latMin, CENTRO_BOUNDS.lngMin]
  ];
  Sim.layerCentroArea = L.polygon(centroPolyCoords, {
    pane: 'sectores',
    color: '#ea580c',
    weight: 1.8,
    dashArray: '6 6',
    fillColor: '#f97316',
    fillOpacity: 0.08,
    interactive: true
  }).bindTooltip('Área Central / Macrocentro (Zona de Congestión · Paradas c/ 350m · 15-20 km/h)', { sticky: true });

  function getCoordAtDist(d) {
    const cum = Sim.cumDists, pts = Sim.coords;
    if (!cum.length || pts.length < 2) return { coord: [-65.20, -26.83], angle: 0, segIndex: 0 };
    const target = ((d % Sim.totalMeters) + Sim.totalMeters) % Sim.totalMeters;
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      cum[m] <= target ? lo = m : hi = m;
    }
    const span = (cum[hi] - cum[lo]) || 1;
    const t = Math.max(0, Math.min(1, (target - cum[lo]) / span));
    const a = pts[lo], b = pts[hi];
    const lng = a[0] + (b[0] - a[0]) * t;
    const lat = a[1] + (b[1] - a[1]) * t;
    const angle = Math.atan2((b[1] - a[1]) * 1.1, (b[0] - a[0])) * 180 / Math.PI;
    return { coord: [lng, lat], angle, segIndex: lo };
  }

  function setupRouteGeometry(feature) {
    Sim.routeFeature = feature;
    const parts = feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates];
    let allCoords = [];
    parts.forEach(p => { allCoords = allCoords.concat(p); });
    Sim.coords = allCoords;

    const cum = [0];
    let peri = 0, centro = 0;
    let maxLat = -999, maxLatIdx = 0;

    for (let i = 1; i < allCoords.length; i++) {
      const d = haversineM(allCoords[i - 1], allCoords[i]);
      cum.push(cum[i - 1] + d);
      const midLng = (allCoords[i - 1][0] + allCoords[i][0]) / 2;
      const midLat = (allCoords[i - 1][1] + allCoords[i][1]) / 2;
      if (isPointInCentro(midLng, midLat)) {
        centro += d;
      } else {
        peri += d;
      }
      if (allCoords[i][1] > maxLat) {
        maxLat = allCoords[i][1];
        maxLatIdx = i;
      }
    }
    Sim.cumDists = cum;
    Sim.totalMeters = cum[cum.length - 1] || 1;
    Sim.periMeters = peri;
    Sim.centroMeters = centro;
    Sim.dCentro = cum[maxLatIdx] || (Sim.totalMeters * 0.55);
    Sim.dVuelta = Sim.totalMeters - Sim.dCentro;
    Sim.originCoord = allCoords[0];
    Sim.apexCoord = allCoords[maxLatIdx];

    // Dibujar traza del recorrido en mapa con alto contraste y claridad
    if (Sim.layerRoute) Sim.layerGroup.removeLayer(Sim.layerRoute);
    const col = getPropColor(feature);
    const casing = L.geoJSON(feature, {
      pane: 'highlight',
      interactive: false,
      style: () => ({ color: '#ffffff', weight: 9.5, opacity: 0.98, lineCap: 'round', lineJoin: 'round' })
    });
    const mainLine = L.geoJSON(feature, {
      pane: 'highlight',
      interactive: true,
      style: () => ({ color: col, weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' })
    }).bindTooltip(`Recorrido: Línea ${feature.properties.Linea} · ${feature.properties.Recorrido}`, { sticky: true });

    // Marcadores visuales de las dos Cabeceras de Despacho (Origen y Destino)
    const barrioIcon = L.divIcon({
      className: 'sim-terminal-marker',
      iconSize: [220, 28],
      iconAnchor: [110, 14],
      html: `<div class="sim-terminal-pin barrio">🚩 Cabecera ${feature.properties.Recorrido} (65% flota)</div>`
    });
    const mBarrio = L.marker([Sim.originCoord[1], Sim.originCoord[0]], { icon: barrioIcon, pane: 'highlight' });

    const centroIcon = L.divIcon({
      className: 'sim-terminal-marker',
      iconSize: [220, 28],
      iconAnchor: [110, 14],
      html: `<div class="sim-terminal-pin centro">🏛️ Retorno Macrocentro (35% flota)</div>`
    });
    const mCentro = L.marker([Sim.apexCoord[1], Sim.apexCoord[0]], { icon: centroIcon, pane: 'highlight' });

    Sim.layerRoute = L.layerGroup([casing, mainLine, mBarrio, mCentro]);
    Sim.layerGroup.addLayer(Sim.layerRoute);
  }

  function projectRealStopsToRoute(realFeatures) {
    const cum = Sim.cumDists;
    const pts = Sim.coords;
    if (!cum || !cum.length || !pts || pts.length < 2) return [];

    const lat0 = pts[0][1] * Math.PI / 180;
    const kx = 111320 * Math.cos(lat0);
    const ky = 110570;

    const segments = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const ax = pts[i][0] * kx, ay = pts[i][1] * ky;
      const bx = pts[i + 1][0] * kx, by = pts[i + 1][1] * ky;
      const vx = bx - ax, vy = by - ay;
      const lenSq = vx * vx + vy * vy;
      segments.push({ i, ax, ay, bx, by, vx, vy, lenSq, cum0: cum[i], len: Math.sqrt(lenSq) });
    }

    const mapped = [];
    realFeatures.forEach((f, idx) => {
      const coords = f.geometry.coordinates;
      const px = coords[0] * kx, py = coords[1] * ky;

      let minDistSq = Infinity;
      let bestAlong = 0;

      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (seg.lenSq === 0) continue;
        const wx = px - seg.ax, wy = py - seg.ay;
        let t = (wx * seg.vx + wy * seg.vy) / seg.lenSq;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const projX = seg.ax + t * seg.vx;
        const projY = seg.ay + t * seg.vy;
        const dx = px - projX, dy = py - projY;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          bestAlong = seg.cum0 + t * seg.len;
        }
      }

      const isCentro = isPointInCentro(coords[0], coords[1]);
      const dir = f.properties.Direccion || `Parada #${idx + 1}`;

      mapped.push({
        id: idx + 1,
        coord: coords,
        distMeters: bestAlong,
        isCentro,
        direccion: dir,
        ramal: f.properties.Ramal,
        name: `${dir} (${isCentro ? 'Centro · Congestión' : 'Periferia / Barrio'}) · km ${(bestAlong / 1000).toFixed(2)}`
      });
    });

    mapped.sort((a, b) => a.distMeters - b.distMeters);
    mapped.forEach((s, i) => { s.index = i; s.id = i + 1; });
    return mapped;
  }

  function generateStops() {
    Sim.layerStops.clearLayers();
    let stops = [];

    const isRealAvail = isRouteWithRealStops(Sim.routeKey);
    const useReal = Sim.stopsMode === 'reales' && isRealAvail;

    if (useReal) {
      const realFeats = getRealStopsForRoute(Sim.routeKey);
      stops = projectRealStopsToRoute(realFeats);
    } else {
      const total = Sim.totalMeters;
      let curDist = 0;
      let stopIdx = 1;

      // Cabecera inicial (km 0.0)
      const origin = getCoordAtDist(0);
      const inCentroOrig = isPointInCentro(origin.coord[0], origin.coord[1]);
      stops.push({
        id: 1,
        index: 0,
        coord: origin.coord,
        distMeters: 0,
        isCentro: inCentroOrig,
        direccion: 'Cabecera Barrio',
        name: `Cabecera Barrio (km 0.0) · ${inCentroOrig ? 'Centro' : 'Periferia'}`
      });

      while (curDist < total - 60) {
        const pt = getCoordAtDist(curDist);
        const inCentro = isPointInCentro(pt.coord[0], pt.coord[1]);
        const stepDist = inCentro ? Sim.distCentro : Sim.distPeri;
        curDist += stepDist;
        if (curDist >= total - 60) break;

        const stopPt = getCoordAtDist(curDist);
        const stopInCentro = isPointInCentro(stopPt.coord[0], stopPt.coord[1]);
        stops.push({
          id: stopIdx + 1,
          index: stopIdx,
          coord: stopPt.coord,
          distMeters: curDist,
          isCentro: stopInCentro,
          direccion: `Parada P-${stopIdx + 1}`,
          name: `Parada P-${stopIdx + 1} (${stopInCentro ? 'Centro · Congestión' : 'Periferia / Barrio'}) · km ${(curDist / 1000).toFixed(2)}`
        });
        stopIdx++;
      }
    }

    Sim.stops = stops;

    if (Sim.showStops) {
      stops.forEach(s => {
        const marker = L.circleMarker([s.coord[1], s.coord[0]], {
          pane: 'highlight',
          radius: s.index === 0 ? 6.5 : (useReal ? 5 : 4.5),
          color: s.isCentro ? '#b45309' : '#0369a1',
          weight: 1.8,
          fillColor: s.isCentro ? '#f59e0b' : '#38bdf8',
          fillOpacity: 0.95
        }).bindTooltip(
          useReal ?
            `<b>🚏 ${s.direccion}</b><br><small>Parada real optimizada (GeoJSON)<br>km ${(s.distMeters / 1000).toFixed(2)} · ${s.isCentro ? 'Centro' : 'Periferia / Barrio'}</small>` :
            `<b>${s.name}</b><br><small>Esquema a prueba: ${s.isCentro ? Sim.distCentro + 'm (Centro)' : Sim.distPeri + 'm (Barrio)'}</small>`,
          { direction: 'top' }
        );
        Sim.layerStops.addLayer(marker);
      });
    }
  }

  function setupBuses() {
    Sim.layerBuses.clearLayers();
    Sim.buses = [];
    const count = Sim.fleetCount;

    // Criterio operativo de inicio de servicio:
    // 60-70% inicia en Cabecera de Periferia / Barrio (Sentido Ida: Barrio -> Centro)
    // 30-40% inicia en Punto Céntrico (Sentido Vuelta: Centro -> Barrio)
    const fleetPeri = Math.max(1, Math.round(count * 0.65));
    const fleetCentro = Math.max(1, count - fleetPeri);

    const dCentro = Sim.dCentro || (Sim.totalMeters * 0.55);
    const dVuelta = Sim.totalMeters - dCentro;

    // Actualizar indicador en UI
    const txtSplit = $('#simDispatchSplitTxt');
    if (txtSplit) {
      txtSplit.textContent = `${Math.round(fleetPeri / count * 100)}% Cabecera Barrio (${fleetPeri} coches) · ${Math.round(fleetCentro / count * 100)}% Punto Céntrico (${fleetCentro} coches)`;
    }

    // Progreso simulado según tiempo transcurrido desde inicio de servicio (06:00 = 21600s)
    const elapsedSec = Math.max(0, (Sim.currentTime || 21600) - (Sim.startTime || 21600));
    const avgSpeedMs = (((Sim.speedPeri || 22) + (Sim.speedCentro || 16)) / 2) * (1000 / 3600);
    const progressMeters = elapsedSec * avgSpeedMs;

    let busIndex = 0;

    // Grupo 1: Cabecera Periferia / Barrio (Ida)
    for (let k = 0; k < fleetPeri; k++) {
      busIndex++;
      const s0 = (k / fleetPeri) * dCentro;
      const s = (s0 + progressMeters) % Sim.totalMeters;
      const pos = getCoordAtDist(s);
      const inCentro = isPointInCentro(pos.coord[0], pos.coord[1]);
      const isIda = s < dCentro;
      const idNum = busIndex.toString().padStart(2, '0');

      const icon = L.divIcon({
        className: 'sim-bus-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `
          <div class="sim-bus-pin ${inCentro ? 'centro' : ''}" data-bus="${busIndex}" title="Unidad ${idNum} · ${isIda ? 'Ida (Barrio ➔ Centro)' : 'Vuelta (Centro ➔ Barrio)'}">
            <span>${idNum}</span>
          </div>
          <div class="sim-bus-status-tag" style="background:${isIda ? '#0284c7' : '#ea580c'};">${isIda ? 'Ida ➔ Centro' : 'Vuelta ➔ Barrio'}</div>
        `
      });

      const marker = L.marker([pos.coord[1], pos.coord[0]], {
        icon,
        pane: 'highlight',
        zIndexOffset: 1000 + busIndex
      });

      marker.on('click', () => {
        Sim.selectedBusId = busIndex;
        highlightBusInList(busIndex);
        map.panTo(marker.getLatLng(), { animate: true });
      });

      Sim.layerBuses.addLayer(marker);

      Sim.buses.push({
        id: busIndex,
        idStr: idNum,
        s,
        s0,
        leg: isIda ? 'ida' : 'vuelta',
        origin: 'Cabecera Barrio',
        state: 'driving',
        dwellTimer: 0,
        speed: inCentro ? Sim.speedCentro : Sim.speedPeri,
        isCentro: inCentro,
        marker
      });
    }

    // Grupo 2: Punto Céntrico / Macrocentro (Vuelta)
    for (let j = 0; j < fleetCentro; j++) {
      busIndex++;
      const s0 = dCentro + (j / fleetCentro) * dVuelta;
      const s = (s0 + progressMeters) % Sim.totalMeters;
      const pos = getCoordAtDist(s);
      const inCentro = isPointInCentro(pos.coord[0], pos.coord[1]);
      const isIda = s < dCentro;
      const idNum = busIndex.toString().padStart(2, '0');

      const icon = L.divIcon({
        className: 'sim-bus-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        html: `
          <div class="sim-bus-pin ${inCentro ? 'centro' : ''}" data-bus="${busIndex}" title="Unidad ${idNum} · ${isIda ? 'Ida (Barrio ➔ Centro)' : 'Vuelta (Centro ➔ Barrio)'}">
            <span>${idNum}</span>
          </div>
          <div class="sim-bus-status-tag" style="background:${isIda ? '#0284c7' : '#ea580c'};">${isIda ? 'Ida ➔ Centro' : 'Vuelta ➔ Barrio'}</div>
        `
      });

      const marker = L.marker([pos.coord[1], pos.coord[0]], {
        icon,
        pane: 'highlight',
        zIndexOffset: 1000 + busIndex
      });

      marker.on('click', () => {
        Sim.selectedBusId = busIndex;
        highlightBusInList(busIndex);
        map.panTo(marker.getLatLng(), { animate: true });
      });

      Sim.layerBuses.addLayer(marker);

      Sim.buses.push({
        id: busIndex,
        idStr: idNum,
        s,
        s0,
        leg: isIda ? 'ida' : 'vuelta',
        origin: 'Punto Céntrico',
        state: 'driving',
        dwellTimer: 0,
        speed: inCentro ? Sim.speedCentro : Sim.speedPeri,
        isCentro: inCentro,
        marker
      });
    }

    renderFleetList();
  }

  function updateKPIs() {
    const distTotalKm = Sim.totalMeters / 1000;
    const distPeriKm = Sim.periMeters / 1000;
    const distCentroKm = Sim.centroMeters / 1000;

    const numStopsPeri = Sim.stops.filter(s => !s.isCentro).length;
    const numStopsCentro = Sim.stops.filter(s => s.isCentro).length;
    const totalStops = Sim.stops.length;

    // Tiempos de marcha pura
    const timeDrivePeriMin = (distPeriKm / Sim.speedPeri) * 60;
    const timeDriveCentroMin = (distCentroKm / Sim.speedCentro) * 60;

    // Detención en paradas: ~60% de paradas con ascenso/descenso efectivo
    const activeStopsFactor = 0.65;
    const timeDwellMin = (totalStops * activeStopsFactor * Sim.dwellTime) / 60;

    // Regulación en cabecera (6% de colchón operativo)
    const timeBufferMin = (timeDrivePeriMin + timeDriveCentroMin + timeDwellMin) * 0.06;

    // Ciclo completo (vuelta redonda)
    const timeCycleMin = timeDrivePeriMin + timeDriveCentroMin + timeDwellMin + timeBufferMin;
    const headwayMin = timeCycleMin / Sim.fleetCount;
    const avgWaitMin = headwayMin / 2;
    const effectiveSpeedKmH = distTotalKm / ((timeCycleMin || 1) / 60);

    // Actualizar elementos DOM
    $('#simKpiHeadway').innerHTML = `${fmt(headwayMin, 1)} <span style="font-size:14px;font-weight:500;">min</span>`;
    $('#simKpiCycle').innerHTML = `${fmt(timeCycleMin, 0)} <span style="font-size:14px;font-weight:500;">min</span> <small style="font-size:11px;color:#64748b;font-weight:normal;">(${(timeCycleMin / 60).toFixed(1)} h)</small>`;
    $('#simKpiSpeed').innerHTML = `${fmt(effectiveSpeedKmH, 1)} <span style="font-size:14px;font-weight:500;">km/h</span>`;
    $('#simKpiWait').innerHTML = `${fmt(avgWaitMin, 1)} <span style="font-size:14px;font-weight:500;">min</span>`;

    // Barras proporcionales
    const totalTimeDriving = timeDrivePeriMin + timeDriveCentroMin;
    const pctPeri = Math.round((timeDrivePeriMin / (totalTimeDriving || 1)) * 100);
    const pctCentro = 100 - pctPeri;

    $('#simBarPeri').style.width = pctPeri + '%';
    $('#simBarCentro').style.width = pctCentro + '%';
    $('#simPeriStats').textContent = `${fmt(timeDrivePeriMin, 0)} min (${pctPeri}%) · ${numStopsPeri} paradas`;
    $('#simCentroStats').textContent = `${fmt(timeDriveCentroMin, 0)} min (${pctCentro}%) · ${numStopsCentro} paradas`;
    const isRealActive = Sim.stopsMode === 'reales' && isRouteWithRealStops(Sim.routeKey);
    if (isRealActive) {
      $('#simTotalStopsBadge').textContent = `${totalStops} paradas reales (${numStopsPeri} barrio / ${numStopsCentro} centro)`;
    } else {
      $('#simTotalStopsBadge').textContent = `${totalStops} paradas en ${(distTotalKm).toFixed(1)} km`;
    }

    // Criterio de despacho
    const fleetPeri = Math.max(1, Math.round(Sim.fleetCount * 0.65));
    const fleetCentro = Math.max(1, Sim.fleetCount - fleetPeri);
    const txtSplit = $('#simDispatchSplitTxt');
    if (txtSplit) {
      txtSplit.textContent = `${Math.round(fleetPeri / Sim.fleetCount * 100)}% Cabecera Barrio (${fleetPeri} coches) · ${Math.round(fleetCentro / Sim.fleetCount * 100)}% Punto Céntrico (${fleetCentro} coches)`;
    }
  }

  function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateClockDisplay(sec) {
    const clockEl = $('#simClock');
    if (clockEl) clockEl.textContent = formatTime(sec);

    const badge = $('#simPeriodBadge');
    if (badge) {
      if (sec >= 25200 && sec <= 34200) { // 07:00 a 09:30
        badge.textContent = '🔴 HORA PICO MAÑANA (07:00–09:30)';
        badge.className = 'sim-period-badge';
      } else if (sec > 34200 && sec < 43200) { // 09:30 a 12:00
        badge.textContent = '🟢 HORA VALLE MEDIA MAÑANA';
        badge.className = 'sim-period-badge valle';
      } else if (sec >= 43200 && sec <= 48600) { // 12:00 a 13:30
        badge.textContent = '🔴 HORA PICO MEDIODÍA';
        badge.className = 'sim-period-badge';
      } else {
        badge.textContent = '🟡 SERVICIO REGULAR';
        badge.className = 'sim-period-badge valle';
      }
    }
  }

  function renderFleetList() {
    const listEl = $('#simFleetList');
    if (!listEl) return;
    const html = Sim.buses.map(b => {
      const isSel = Sim.selectedBusId === b.id;
      const legBadge = b.state === 'stopped' ? '<span class="sim-unit-badge stop">En parada</span>' :
        b.leg === 'ida' ? '<span class="sim-unit-badge peri">Ida · A Centro</span>' : '<span class="sim-unit-badge centro">Vuelta · A Barrio</span>';
      const kmProg = (b.s / 1000).toFixed(1);
      return `
        <div class="sim-unit-card ${isSel ? 'active' : ''}" data-bus="${b.id}">
          <div class="sim-unit-id">
            <span>🚍 Coche ${b.idStr}</span>
            ${legBadge}
          </div>
          <div class="sim-unit-speed">
            <span>km ${kmProg} · ${b.origin} · ${b.state === 'stopped' ? '0 km/h' : Math.round(b.speed) + ' km/h'}</span>
          </div>
        </div>
      `;
    }).join('');
    listEl.innerHTML = html;
  }

  function highlightBusInList(id) {
    document.querySelectorAll('.sim-unit-card').forEach(c => {
      c.classList.toggle('active', parseInt(c.dataset.bus, 10) === id);
    });
  }

  $('#simFleetList')?.addEventListener('click', e => {
    const card = e.target.closest('.sim-unit-card');
    if (!card) return;
    const id = parseInt(card.dataset.bus, 10);
    Sim.selectedBusId = id;
    highlightBusInList(id);
    const bus = Sim.buses.find(b => b.id === id);
    if (bus) {
      map.panTo(bus.marker.getLatLng(), { animate: true });
    }
  });

  function simStep(dt) {
    Sim.currentTime += dt;
    if (Sim.currentTime > Sim.endTime) {
      Sim.currentTime = Sim.startTime;
    }

    updateClockDisplay(Sim.currentTime);

    const slider = $('#simTimeline');
    if (slider && document.activeElement !== slider) {
      slider.value = Sim.currentTime;
    }

    const dCentro = Sim.dCentro || (Sim.totalMeters * 0.55);

    // Actualizar movimiento de cada colectivo
    Sim.buses.forEach(bus => {
      if (bus.state === 'stopped') {
        bus.dwellTimer -= dt;
        if (bus.dwellTimer <= 0) {
          bus.state = 'driving';
          bus.dwellTimer = 0;
        }
      } else {
        // Regulación anti-bunching: verificar separación con la unidad que precede
        let tooClose = false;
        for (const other of Sim.buses) {
          if (other.id === bus.id) continue;
          const gap = (other.s - bus.s + Sim.totalMeters) % Sim.totalMeters;
          if (gap > 0 && gap < 90) {
            tooClose = true;
            break;
          }
        }

        const pt = getCoordAtDist(bus.s);
        bus.isCentro = isPointInCentro(pt.coord[0], pt.coord[1]);
        const baseSpeed = bus.isCentro ? Sim.speedCentro : Sim.speedPeri;
        bus.speed = tooClose ? Math.max(4, baseSpeed * 0.35) : baseSpeed;

        const speedMs = bus.speed * (1000 / 3600);
        const ds = speedMs * dt;
        const prevS = bus.s;
        const nextS = (bus.s + ds) % Sim.totalMeters;

        // Sentido de recorrido dinámico: Ida (0 -> dCentro) o Vuelta (dCentro -> total)
        bus.leg = (nextS < dCentro) ? 'ida' : 'vuelta';

        // Comprobar si cruza una parada
        const crossedStop = Sim.stops.find(s => {
          if (nextS >= prevS) {
            return s.distMeters >= prevS && s.distMeters < nextS;
          } else {
            return s.distMeters >= prevS || s.distMeters < nextS;
          }
        });

        // Detención probabilística en paradas con pasajeros
        if (crossedStop && Math.random() < 0.65) {
          bus.state = 'stopped';
          bus.dwellTimer = Sim.dwellTime;
          bus.s = crossedStop.distMeters;
          bus.currentStopName = crossedStop.direccion || crossedStop.name;
        } else {
          bus.s = nextS;
        }
      }

      // Actualizar posición exacta de marcador en Leaflet
      const pos = getCoordAtDist(bus.s);
      bus.marker.setLatLng([pos.coord[1], pos.coord[0]]);

      const el = bus.marker.getElement();
      if (el) {
        const pin = el.querySelector('.sim-bus-pin');
        const tag = el.querySelector('.sim-bus-status-tag');
        if (pin) {
          pin.classList.toggle('centro', bus.isCentro);
          pin.classList.toggle('stopped', bus.state === 'stopped');
        }
        if (tag) {
          if (bus.state === 'stopped') {
            const stopLabel = bus.currentStopName ? `🚏 ${bus.currentStopName}` : '🚏 En parada';
            tag.textContent = `${stopLabel} (${Math.ceil(bus.dwellTimer)}s)`;
            tag.style.background = '#dc2626';
          } else {
            const dirLabel = bus.leg === 'ida' ? 'Ida ➔ Centro' : 'Vuelta ➔ Barrio';
            tag.textContent = `${dirLabel} · ${Math.round(bus.speed)}km/h`;
            tag.style.background = bus.leg === 'ida' ? '#0284c7' : '#ea580c';
          }
        }
      }
    });

    if (Math.random() < 0.25) {
      renderFleetList();
    }
  }

  function simLoop(ts) {
    if (!Sim.active) return;
    if (Sim.isPlaying) {
      if (!Sim.lastTs) Sim.lastTs = ts;
      const realDt = Math.min(0.1, (ts - Sim.lastTs) / 1000 || 0);
      Sim.lastTs = ts;
      const simDt = realDt * Sim.timeSpeed;
      simStep(simDt);
    } else {
      Sim.lastTs = ts;
    }
    Sim.rafId = requestAnimationFrame(simLoop);
  }

  function startSimulation() {
    if (!Sim.active) return;
    Sim.isPlaying = true;
    $('#simIconPlay').style.display = 'none';
    $('#simIconPause').style.display = '';
    if (!Sim.rafId) {
      Sim.lastTs = performance.now();
      Sim.rafId = requestAnimationFrame(simLoop);
    }
  }

  function pauseSimulation() {
    Sim.isPlaying = false;
    $('#simIconPlay').style.display = '';
    $('#simIconPause').style.display = 'none';
  }

  function resetSimulation() {
    Sim.currentTime = 23400; // 06:30:00
    setupBuses();
    updateClockDisplay(Sim.currentTime);
    const slider = $('#simTimeline');
    if (slider) slider.value = Sim.currentTime;
    updateKPIs();
  }

  function selectSimRoute(routeKey, fitMap = true) {
    Sim.routeKey = routeKey;
    const feat = D.propuesta.features.find(f => getPropKey(f) === routeKey);
    if (!feat) return;

    // Actualizar unidades sugeridas
    const optimalFleet = UNIDADES_OPTIMAS[routeKey] || Math.max(1, Math.round(feat.properties.Longitud / 2.5));
    Sim.fleetCount = optimalFleet;
    const fleetInput = $('#simFleetInput');
    if (fleetInput) {
      fleetInput.value = optimalFleet;
      $('#simFleetVal').textContent = `${optimalFleet} unidades`;
    }

    // Actualizar estado del switch de paradas reales según recorrido
    updateStopsSourceUI();

    // Configurar geometría y mapa
    setupRouteGeometry(feat);
    generateStops();
    setupBuses();
    updateKPIs();

    if (fitMap && Sim.layerRoute) {
      map.fitBounds(Sim.layerRoute.getBounds(), { padding: [50, 50], maxZoom: 15 });
    }

    const selectEl = $('#simRouteSelect');
    if (selectEl && selectEl.value !== routeKey) {
      selectEl.value = routeKey;
    }
  }

  function updateStopsSourceUI() {
    const isRealAvail = isRouteWithRealStops(Sim.routeKey);
    const btnReales = $('#btnStopsReales');
    const btnTeo = $('#btnStopsTeo');
    const badge = $('#simBadgeSource');
    const note = $('#simStopsNote');
    const theoBox = $('#simTheoreticalInputsBox');
    const realBox = $('#simRealStopsBox');

    if (!isRealAvail) {
      Sim.stopsMode = 'teoricas';
      if (btnReales) {
        btnReales.disabled = true;
        btnReales.title = 'Solo disponible para Manantial Sur y San Alberto (Sector 5 - Línea E)';
      }
      if (note) {
        note.innerHTML = '<span style="color:#94a3b8">ℹ️ Paradas reales relevadas disponibles solo para Manantial Sur y San Alberto (Sector 5).</span>';
      }
    } else {
      if (btnReales) {
        btnReales.disabled = false;
        btnReales.title = 'Usar puntos de paradas optimizados reales del GeoJSON';
      }
      const count = getRealStopsForRoute(Sim.routeKey).length;
      if (note) {
        if (Sim.stopsMode === 'reales') {
          note.innerHTML = `<span style="color:#15803d;font-weight:600;">✓ Utilizando ${count} paradas reales optimizadas del GeoJSON.</span>`;
        } else {
          note.innerHTML = `Esquema paramétrico según distancia en metros. <a href="#" id="lnkSwitchReal" style="color:var(--blue);font-weight:600;text-decoration:underline;">Cambiar a ${count} paradas reales</a>`;
        }
      }
      const lnk = $('#lnkSwitchReal');
      if (lnk) {
        lnk.onclick = e => {
          e.preventDefault();
          setStopsMode('reales');
        };
      }
    }

    const isReal = Sim.stopsMode === 'reales' && isRealAvail;
    if (btnTeo) btnTeo.classList.toggle('on', !isReal);
    if (btnReales) btnReales.classList.toggle('on', isReal);
    if (badge) {
      badge.textContent = isReal ? 'Reales' : 'Teóricas';
      badge.className = 'sim-badge-source' + (isReal ? ' reales' : '');
    }

    if (theoBox) theoBox.style.display = isReal ? 'none' : '';
    if (realBox) {
      realBox.style.display = isReal ? '' : 'none';
      if (isReal) {
        const count = getRealStopsForRoute(Sim.routeKey).length;
        const countTxt = $('#simRealStopsCountTxt');
        if (countTxt) countTxt.textContent = `${count} paradas reales optimizadas`;
        const descTxt = $('#simRealStopsDescTxt');
        if (descTxt) descTxt.textContent = `Puntos del GeoJSON vinculados al ramal ${Sim.routeKey === 'E-1' ? 'Manantial Sur' : 'San Alberto'} de la Línea E`;
      }
    }
  }

  function setStopsMode(mode) {
    if (mode === 'reales' && !isRouteWithRealStops(Sim.routeKey)) return;
    Sim.stopsMode = mode;
    updateStopsSourceUI();
    generateStops();
    setupBuses();
    updateKPIs();
  }

  function setSimulationMode(enabled) {
    Sim.active = enabled;
    const cockpit = $('#simCockpit');
    const btnModeMap = $('#btnModeMap');
    const btnModeSim = $('#btnModeSim');

    if (enabled) {
      if (cockpit) cockpit.style.display = '';
      if (btnModeMap) btnModeMap.classList.remove('on');
      if (btnModeSim) btnModeSim.classList.add('on');

      // Añadir polígono de centro si está tildado
      if (Sim.showCentroArea && Sim.layerCentroArea && !map.hasLayer(Sim.layerCentroArea)) {
        Sim.layerCentroArea.addTo(map);
      }

      selectSimRoute(Sim.routeKey, true);
      startSimulation();
    } else {
      pauseSimulation();
      if (Sim.rafId) {
        cancelAnimationFrame(Sim.rafId);
        Sim.rafId = null;
      }
      if (cockpit) cockpit.style.display = 'none';
      if (btnModeMap) btnModeMap.classList.add('on');
      if (btnModeSim) btnModeSim.classList.remove('on');

      // Limpiar capas temporales de simulación
      Sim.layerStops.clearLayers();
      Sim.layerBuses.clearLayers();
      if (Sim.layerRoute) Sim.layerGroup.removeLayer(Sim.layerRoute);
      if (Sim.layerCentroArea && map.hasLayer(Sim.layerCentroArea)) {
        map.removeLayer(Sim.layerCentroArea);
      }
    }
  }

  // Inicializar UI y listeners de simulación
  function initSimulationUI() {
    const routeSelect = $('#simRouteSelect');
    if (routeSelect) {
      const options = D.propuesta.features.map(f => {
        const key = getPropKey(f);
        const hasStops = isRouteWithRealStops(key);
        const tagReal = hasStops ? ' ★ [Paradas Reales GeoJSON]' : '';
        return `<option value="${key}">Línea ${f.properties.Linea} · ${f.properties.Recorrido}${tagReal} (${fmt(f.properties.Longitud, 1)} km · Sector ${f.properties.sector})</option>`;
      });
      routeSelect.innerHTML = options.join('');
      routeSelect.addEventListener('change', e => {
        selectSimRoute(e.target.value, true);
      });
    }

    // Toggle modo de paradas teóricas vs reales
    $('#btnStopsTeo')?.addEventListener('click', () => setStopsMode('teoricas'));
    $('#btnStopsReales')?.addEventListener('click', () => setStopsMode('reales'));

    // Play/Pause
    $('#simBtnPlay')?.addEventListener('click', () => {
      if (Sim.isPlaying) pauseSimulation(); else startSimulation();
    });

    // Reset
    $('#simBtnReset')?.addEventListener('click', resetSimulation);

    // Botones de velocidad de simulación
    document.querySelectorAll('.sim-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sim-speed-btn').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        Sim.timeSpeed = parseFloat(btn.dataset.spd) || 15;
      });
    });

    // Slider de tiempo (Timeline scrubber)
    const timeline = $('#simTimeline');
    if (timeline) {
      timeline.addEventListener('input', e => {
        Sim.currentTime = parseFloat(e.target.value);
        updateClockDisplay(Sim.currentTime);
        // Distribuir unidades al nuevo instante temporal
        setupBuses();
      });
    }

    // Flota slider
    $('#simFleetInput')?.addEventListener('input', e => {
      Sim.fleetCount = parseInt(e.target.value, 10);
      $('#simFleetVal').textContent = `${Sim.fleetCount} unidades`;
      setupBuses();
      updateKPIs();
    });

    // Dwell slider
    $('#simDwellInput')?.addEventListener('input', e => {
      Sim.dwellTime = parseInt(e.target.value, 10);
      $('#simDwellVal').textContent = `${Sim.dwellTime} seg`;
      updateKPIs();
    });

    // Distancias de paradas
    $('#simDistPeri')?.addEventListener('change', e => {
      Sim.distPeri = Math.max(80, parseInt(e.target.value, 10) || 200);
      generateStops();
      updateKPIs();
    });

    $('#simDistCentro')?.addEventListener('change', e => {
      Sim.distCentro = Math.max(100, parseInt(e.target.value, 10) || 350);
      generateStops();
      updateKPIs();
    });

    // Velocidades comerciales
    $('#simSpeedPeri')?.addEventListener('change', e => {
      Sim.speedPeri = Math.max(5, parseFloat(e.target.value) || 22);
      updateKPIs();
    });

    $('#simSpeedCentro')?.addEventListener('change', e => {
      Sim.speedCentro = Math.max(5, parseFloat(e.target.value) || 16);
      updateKPIs();
    });

    // Toggles de visualización
    $('#simCheckStops')?.addEventListener('change', e => {
      Sim.showStops = e.target.checked;
      if (Sim.showStops) {
        if (!Sim.layerGroup.hasLayer(Sim.layerStops)) Sim.layerGroup.addLayer(Sim.layerStops);
        generateStops();
      } else {
        Sim.layerStops.clearLayers();
      }
    });

    $('#simCheckCentroArea')?.addEventListener('change', e => {
      Sim.showCentroArea = e.target.checked;
      if (Sim.showCentroArea) {
        if (!map.hasLayer(Sim.layerCentroArea)) Sim.layerCentroArea.addTo(map);
      } else {
        if (map.hasLayer(Sim.layerCentroArea)) map.removeLayer(Sim.layerCentroArea);
      }
    });

    // Toggle drawer directiva
    $('#simBtnToggleDrawer')?.addEventListener('click', () => {
      const drawer = $('#simDrawer');
      const btn = $('#simBtnToggleDrawer');
      const btnTxt = $('#simDrawerBtnTxt');
      if (drawer) {
        const isOpen = drawer.classList.toggle('open');
        if (btn) btn.classList.toggle('on', isOpen);
        if (btnTxt) btnTxt.textContent = isOpen ? 'Ocultar Panel' : 'Panel Directiva';
      }
    });

    // Botón cerrar simulación
    $('#simBtnClose')?.addEventListener('click', () => {
      setSimulationMode(false);
    });

    // Selector de modo superior
    $('#btnModeSim')?.addEventListener('click', () => {
      setSimulationMode(true);
      const el = document.getElementById('mapa');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });

    $('#btnModeMap')?.addEventListener('click', () => {
      setSimulationMode(false);
    });

    $('#navSimLink')?.addEventListener('click', e => {
      e.preventDefault();
      setSimulationMode(true);
      const el = document.getElementById('mapa');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });

    // Copiar Ficha de Simulación para Directiva
    $('#simBtnCopyReport')?.addEventListener('click', () => {
      const f = Sim.routeFeature;
      if (!f) return;
      const distTotalKm = (Sim.totalMeters / 1000).toFixed(2);
      const distPeriKm = (Sim.periMeters / 1000).toFixed(2);
      const distCentroKm = (Sim.centroMeters / 1000).toFixed(2);
      const pctPeri = ((Sim.periMeters / Sim.totalMeters) * 100).toFixed(1);
      const pctCentro = ((Sim.centroMeters / Sim.totalMeters) * 100).toFixed(1);
      const numStopsPeri = Sim.stops.filter(s => !s.isCentro).length;
      const numStopsCentro = Sim.stops.filter(s => s.isCentro).length;

      const timeDrivePeriMin = (distPeriKm / Sim.speedPeri) * 60;
      const timeDriveCentroMin = (distCentroKm / Sim.speedCentro) * 60;
      const timeDwellMin = (Sim.stops.length * 0.65 * Sim.dwellTime) / 60;
      const timeCycleMin = (timeDrivePeriMin + timeDriveCentroMin + timeDwellMin) * 1.06;
      const headwayMin = timeCycleMin / Sim.fleetCount;
      const avgWaitMin = headwayMin / 2;
      const effectiveSpeedKmH = distTotalKm / (timeCycleMin / 60);

      const reportText = `===============================================================
PLAN PILOTO DE REORDENAMIENTO DEL TRANSPORTE PÚBLICO
FICHA TÉCNICA Y DICTAMEN DE SIMULACIÓN OPERATIVA
Secretaría de Movilidad Urbana · Municipalidad de San Miguel de Tucumán
===============================================================
• Recorrido Evaluado: Línea ${f.properties.Linea} · ${f.properties.Recorrido} (Sector ${f.properties.sector})
• Longitud Total del Circuito: ${distTotalKm} km (Ida y Vuelta)
  - Tramo en Barrios/Periferia: ${distPeriKm} km (${pctPeri}%)
  - Tramo en Macrocentro (Congestión): ${distCentroKm} km (${pctCentro}%)

PARÁMETROS OPERATIVOS INGRESADOS:
• Flota Asignada en Servicio: ${Sim.fleetCount} unidades
• Esquema de Paradas a Prueba:
  - En Periferia / Barrios: cada ${Sim.distPeri} metros (${numStopsPeri} paradas)
  - En Centro (Congestión): cada ${Sim.distCentro} metros (${numStopsCentro} paradas)
  - Total de Paradas del Circuito: ${Sim.stops.length} paradas
• Velocidades Comerciales Ingresadas:
  - En Periferia / Barrios: ${Sim.speedPeri.toFixed(1)} km/h
  - En Macrocentro: ${Sim.speedCentro.toFixed(1)} km/h
  - Tiempo de Detención por Parada (Dwell time): ${Sim.dwellTime} segundos

RESULTADOS DEL MODELO PREDICTIVO (MÉTRICAS PARA LA DIRECTIVA):
• Frecuencia Promedio de Paso (Headway): ${headwayMin.toFixed(1)} minutos
• Tiempo Medio de Espera del Usuario en Parada: ${avgWaitMin.toFixed(1)} minutos
• Tiempo de Ciclo Completo (Vuelta Total): ${timeCycleMin.toFixed(0)} minutos (${(timeCycleMin / 60).toFixed(1)} h)
  - Tiempo en tramo barrial: ${timeDrivePeriMin.toFixed(0)} min (${pctPeri}%)
  - Tiempo en tramo céntrico: ${timeDriveCentroMin.toFixed(0)} min (${pctCentro}%)
• Velocidad Comercial Global Resultante: ${effectiveSpeedKmH.toFixed(1)} km/h
===============================================================`;

      navigator.clipboard.writeText(reportText).then(() => {
        const badge = $('#simReportCopied');
        if (badge) {
          badge.style.display = 'inline';
          setTimeout(() => { badge.style.display = 'none'; }, 3500);
        }
      });
    });
  }

  // Método expuesto globalmente para iniciar simulación de un recorrido puntual
  window.startSimulationForRoute = function (routeKey) {
    setSimulationMode(true);
    selectSimRoute(routeKey, true);
    const el = document.getElementById('mapa');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // CONTROL DE PANTALLA COMPLETA (PROYECCIÓN PARA REUNIONES Y DIRECTIVA)
  const mapShell = document.getElementById('mapShell');
  const btnToggleFs = document.getElementById('btnToggleFullscreen');
  const btnFloatingFs = document.getElementById('btnFloatingFullscreen');
  const txtFs = document.getElementById('txtBtnFullscreen');

  function updateFullscreenUI(isFs) {
    [btnToggleFs, btnFloatingFs].forEach(b => {
      if (!b) return;
      b.classList.toggle('on', isFs);
      const exp = b.querySelector('.icon-expand');
      const comp = b.querySelector('.icon-compress');
      if (exp) exp.style.display = isFs ? 'none' : '';
      if (comp) comp.style.display = isFs ? '' : 'none';
    });
    if (txtFs) txtFs.textContent = isFs ? 'Salir Pantalla Completa' : 'Pantalla Completa';
    if (mapShell) mapShell.classList.toggle('is-fullscreen', isFs);
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 180);
  }

  function toggleFullscreen() {
    if (!mapShell) return;
    const isCurrentlyFs = document.fullscreenElement === mapShell || mapShell.classList.contains('is-fullscreen');

    if (!isCurrentlyFs) {
      if (mapShell.requestFullscreen) {
        mapShell.requestFullscreen().catch(() => {
          updateFullscreenUI(true);
        });
      } else {
        updateFullscreenUI(true);
      }
    } else {
      if (document.exitFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      updateFullscreenUI(false);
    }
  }

  btnToggleFs?.addEventListener('click', toggleFullscreen);
  btnFloatingFs?.addEventListener('click', toggleFullscreen);

  document.addEventListener('fullscreenchange', () => {
    const isFs = document.fullscreenElement === mapShell;
    updateFullscreenUI(isFs);
  });

  initSimulationUI();

  window.addEventListener('load', () => setTimeout(() => map.invalidateSize(), 300));
})();
