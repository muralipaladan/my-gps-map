'use strict';

(() => {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  const STORAGE_KEY   = 'murali_gis_v12';
  const BHUVAN_URL    = 'https://bhuvan-panchayat3.nrsc.gov.in/geoserver/gwc/service/wms';
  const KSREC_URL     = 'https://ksrec.in/geoserver/Kerala/wms';
  const DEFAULT_VIEW  = { lat: 11.2270173, lng: 76.2150992, zoom: 17 };

  const State = { drawing: false, eraseMode: false, editMode: false, touchMove: false, routeMode: false, userLatLng: null, activeLayer: 'Hybrid', activeTool: null, notesCount: 0 };

  const Toast = (() => {
    const root = document.getElementById('toast-root');
    const ICONS = { info:'fa-circle-info', ok:'fa-circle-check', warn:'fa-triangle-exclamation', error:'fa-circle-xmark' };
    return {
      show(msg, type = 'info', dur = 3000) {
        const el = document.createElement('div'); el.className = `toast ${type}`;
        el.innerHTML = `<i class="fa-solid ${ICONS[type]} toast-icon"></i><span class="toast-msg">${msg}</span>`;
        root.appendChild(el);
        setTimeout(() => { el.classList.add('out'); setTimeout(()=>el.remove(),300); }, dur);
      }
    };
  })();

  const Modal = (() => {
    const bd = document.getElementById('modalBackdrop'), title = document.getElementById('modalTitle'), body = document.getElementById('modalBody');
    let _resolve;
    document.getElementById('modalConfirm').onclick = () => { bd.classList.remove('open'); _resolve(true); };
    document.getElementById('modalCancel').onclick = () => { bd.classList.remove('open'); _resolve(false); };
    return { confirm(t, b) { title.textContent = t || 'Confirm'; body.textContent = b || 'Are you sure?'; bd.classList.add('open'); return new Promise(r => _resolve = r); } };
  })();

  const updateStatus = () => {
    document.getElementById('statusText').textContent = State.activeTool ? State.activeTool : State.activeLayer;
  };

  const map = L.map('map', { center:[DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], zoom:DEFAULT_VIEW.zoom, zoomControl:false, tap:false });
  const baseLayers = {
    hybrid: L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map),
    road: L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:22 })
  };

  map.pm.setGlobalOptions({ 
    tooltips: false,
    snappable:true, snapDistance:25, snapMiddle:true, layerGroup:map, 
    hintMarkerStyle: { opacity: 0, fillOpacity: 0 }, templineStyle: { color: '#FF9933' } 
  });
  
  // Remove default Geoman controls from map
  map.pm.removeControls();

  map.createPane('cadastralPane'); Object.assign(map.getPane('cadastralPane').style, { zIndex:'600', pointerEvents:'none' });

  // Applied orange recolor class for survey line and survey numbers
  const WMS_BASE = { format:'image/png', transparent:true, maxZoom:22, tileSize:512, zoomOffset:-1, pane:'cadastralPane', className:'parcel-orange' };
  const wmsLayers = {
    village: L.tileLayer.wms(BHUVAN_URL, { ...WMS_BASE, layers:'v3:village' }),
    cadastral: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:Cadastry_Kerala' }).addTo(map),
    parcelKCH: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KCH_Survey_Parcel_acpc' }),
    parcelKKD: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KKD_Survey_Parcel_acpc' }),
    parcelKLM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KLM_Survey_Parcel_acpc' }),
    parcelTCR: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TCR_Survey_Parcel_acpc' }),
    parcelTVM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TVM_Survey_Parcel_acpc' }),
  };
  State.activeLayer = 'CAD'; updateStatus();

  const mini = L.map('zoomBox', { attributionControl:false, zoomControl:false, dragging:false, touchZoom:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, layers:[L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] })] });
  mini.createPane('miniCadastral'); Object.assign(mini.getPane('miniCadastral').style, { zIndex:'600', pointerEvents:'none' });
  L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, pane:'miniCadastral', layers:'Kerala:Cadastry_Kerala' }).addTo(mini);

  const drawnItems = new L.FeatureGroup().addTo(map), drawnItemsMini = new L.FeatureGroup().addTo(mini);
  const vectorSync = {};

  const UI = {
    toggleMore() { document.getElementById('toolRibbon').classList.toggle('open'); },
    openRibbon() { document.getElementById('toolRibbon').classList.add('open'); },
    closeRibbon() { 
      document.getElementById('toolRibbon').classList.remove('open'); 
      document.getElementById('stepSliderPanel')?.classList.remove('open');
      UI.showRibbonPage('main');
    },
    showRibbonPage(pageName) {
      document.querySelectorAll('.ribbon-page').forEach(p => p.classList.remove('active'));
      const target = { main: 'pageMain', draw: 'pageDraw', fmb: 'pageFMB', layers: 'pageLayers' }[pageName];
      if (target) document.getElementById(target)?.classList.add('active');
    }
  };

  const Layers = {
    setBase(key) {
      Object.values(baseLayers).forEach(l => map.removeLayer(l)); map.addLayer(baseLayers[key]);
      const titles = { hybrid: 'HYB', road: 'ROD', osm: 'OSM' };
      document.querySelectorAll('#toolRibbon .basetile').forEach(b => b.classList.remove('on-saffron'));
      document.querySelector(`#toolRibbon .basetile[data-base="${key}"]`)?.classList.add('on-saffron');
      State.activeLayer = titles[key]; updateStatus(); Toast.show(`${titles[key]} Active`);
    },
    toggleWms(type) {
      const layer = wmsLayers[type];
      const NAMES = { village:'VIL', cadastral:'CAD', parcelKCH:'KCH', parcelKKD:'KKD', parcelKLM:'KLM', parcelTCR:'TCR', parcelTVM:'TVM' };
      const btn = document.querySelector(`button[onclick*="'${type}'"]`);
      if (map.hasLayer(layer)) { map.removeLayer(layer); btn?.classList.remove('on-saffron'); Toast.show(`${NAMES[type]} hidden`); } 
      else { map.addLayer(layer); btn?.classList.add('on-saffron'); State.activeLayer = NAMES[type]; updateStatus(); Toast.show(`${NAMES[type]} active`); }
    },
    inkMode: false,
    toggleInk() {
      Layers.inkMode = !Layers.inkMode;
      document.querySelectorAll('.parcel-orange').forEach(el => el.classList.toggle('parcel-ink', Layers.inkMode));
      document.getElementById('btnInk')?.classList.toggle('on-saffron', Layers.inkMode);
      if (Layers.inkMode) { State.activeLayer = 'INK'; Toast.show('Survey: Black number + White buffer', 'ok'); }
      else { State.activeLayer = 'CAD'; Toast.show('Survey: Orange restored', 'info'); }
      updateStatus();
    }
  };

  const Search = (() => {
    let marker = null;
    const execute = async () => {
      const raw = document.getElementById('searchInput').value.trim(); if (!raw) return;
      if (marker) map.removeLayer(marker);
      const parts = raw.split(/[\s,]+/);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const [lat, lng] = parts.map(Number); map.setView([lat, lng], 17);
        marker = L.marker([lat, lng]).addTo(map).bindPopup(`<b>${lat}, ${lng}</b>`).openPopup(); return;
      }
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}`);
        const data = await res.json(); if (!data.length) { Toast.show('Not found', 'warn'); return; }
        map.setView([+data[0].lat, +data[0].lon], 15);
        marker = L.marker([+data[0].lat, +data[0].lon]).addTo(map).bindPopup(`<b>${data[0].display_name}</b>`).openPopup();
      } catch { Toast.show('Search error', 'error'); }
    };
    document.getElementById('searchBtn').addEventListener('click', execute);
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') execute(); });
    return { execute };
  })();

  const GPS = (() => {
    // Leaflet.Locate plugin: blue dot + accuracy circle + heading cone, auto-start, follows until the user pans (like Google Maps)
    const dotIcon = L.divIcon({ className:'blue-dot-container', html:'<div class="blue-dot"></div>', iconSize:[20,20], iconAnchor:[10,10] });
    let dotMini = null, ringMini = null, weakShown = false;
    const locate = L.control.locate({
      position:'bottomright', setView:'untilPan', flyTo:true, keepCurrentZoomLevel:false, cacheLocation:true, showCompass:true,
      clickBehavior:{ inView:'stop', outOfView:'setView', inViewNotFollowing:'setView' },
      locateOptions:{ enableHighAccuracy:true, maximumAge:0, timeout:15000, maxZoom:19 },
      onLocationError: err => Toast.show('GPS ലഭ്യമല്ല: ' + (err.message || 'സ്ഥാനം കണ്ടെത്താനായില്ല'), 'warn'),
      onLocationOutsideMapBounds: () => {}
    }).addTo(map);
    const box = locate.getContainer(), btn = document.getElementById('gpsBtn'), icon = btn.querySelector('i');
    const sync = () => {
      const fol = box.classList.contains('following'), on = fol || box.classList.contains('active') || box.classList.contains('requesting');
      btn.classList.toggle('on-blue', on);
      icon.className = 'fa-solid ' + (on && !fol ? 'fa-location-dot' : 'fa-location-crosshairs');
      if (!on && dotMini) { mini.removeLayer(dotMini); mini.removeLayer(ringMini); dotMini = ringMini = null; weakShown = false; }
    };
    new MutationObserver(sync).observe(box, { attributes:true, attributeFilter:['class'] });
    map.on('locatelocationfound', e => {
      if (!dotMini) {
        dotMini = L.marker(e.latlng, { icon:dotIcon, interactive:false }).addTo(mini);
        ringMini = L.circle(e.latlng, { radius:e.accuracy, color:'#2563eb', weight:1, opacity:.4, fillOpacity:.08, interactive:false }).addTo(mini);
      } else { dotMini.setLatLng(e.latlng); ringMini.setLatLng(e.latlng).setRadius(e.accuracy); }
      if (e.accuracy > 100 && !weakShown) { weakShown = true; Toast.show(`GPS സിഗ്നൽ ദുർബലം (±${Math.round(e.accuracy)}m)`, 'warn', 3000); }
    });
    const toggle = () => box.querySelector('a').click();           // tap: start / re-centre / stop
    const stopFollow = () => { if (box.classList.contains('following')) locate.stopFollowing(); };
    locate.start();                                                  // auto-start on page load
    return { toggle, stopFollow };
  })();

  const Draw = (() => {
    const savedNotes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const pinGroup = L.layerGroup().addTo(map), pinGroupMini = L.layerGroup().addTo(mini);

    const renderNotes = () => {
      pinGroup.clearLayers(); pinGroupMini.clearLayers();
      savedNotes.forEach((p, i) => {
        L.marker([p.lat, p.lng]).addTo(pinGroup).bindPopup(`<b>📍 Note</b><br>${p.text}<button class="p-nav" style="background:#0b8043;" onclick="GIS.Draw.navigateExternal(${p.lat}, ${p.lng})">Navigate</button><button class="p-del" onclick="GIS.Draw._deleteNote(${i})">Delete</button>`);
        L.marker([p.lat, p.lng]).addTo(pinGroupMini);
      });
      State.notesCount = savedNotes.length;
    }; renderNotes();

    const clearHighlights = () => ['lineBtn','polygonBtn','markerBtn'].forEach(id => { document.getElementById(id)?.classList.remove('on-accent'); });

    const trigger = (toolType) => {
      if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      const wasActive = map.pm.GlobalDrawMode === toolType; clearHighlights();
      if (wasActive) { map.pm.disableDraw(); State.activeTool=null; }
      else { map.pm.enableDraw(toolType, { hintMarkerStyle: { opacity: 0, fillOpacity: 0 } }); const id = { Line:'lineBtn', Polygon:'polygonBtn', Marker:'markerBtn' }[toolType]; document.getElementById(id)?.classList.add('on-accent'); State.activeTool = toolType.toUpperCase(); }
      updateStatus();
    };

    map.on('pm:globaldrawmodetoggled', e => { if (!e.enabled) clearHighlights(); });
    let workingLayerMini = null, syncFn = null;
    map.on('pm:drawstart', (e) => {
      State.drawing = true;
      if (e.workingLayer) {
        if (workingLayerMini) mini.removeLayer(workingLayerMini);
        const shape = map.pm.Draw.getActiveShape(), style = { color: '#FF9933', weight: 4, dashArray: '5, 5' };
        if (shape === 'Polygon' || shape === 'Rectangle') workingLayerMini = L.polygon([], style).addTo(mini); else if (shape === 'Line') workingLayerMini = L.polyline([], style).addTo(mini);
        const syncWorkingLayer = () => { if (workingLayerMini && e.workingLayer.getLatLngs) { try { workingLayerMini.setLatLngs(e.workingLayer.getLatLngs()); } catch (err) {} } liveStatus(e.workingLayer); };
        e.workingLayer.on('pm:vertexadded pm:vertexremoved', syncWorkingLayer); if (syncFn) map.off('mousemove', syncFn); syncFn = syncWorkingLayer; map.on('mousemove', syncWorkingLayer);
      }
    });
    map.on('pm:drawend', () => { State.drawing = false; if (syncFn) { map.off('mousemove', syncFn); syncFn = null; } updateStatus(); if (workingLayerMini) { mini.removeLayer(workingLayerMini); workingLayerMini = null; } });
    
    // ── Metric measurements (m, km, m², Are, ha) ──
    const fmtLen = m => m >= 1000 ? `${(m/1000).toFixed(3)} km` : `${m.toFixed(2)} m`;
    const ringOf = l => { const r = l.getLatLngs(); return Array.isArray(r[0]) ? r[0] : r; };
    const lenOf = pts => { let t = 0; for (let i = 1; i < pts.length; i++) t += pts[i-1].distanceTo(pts[i]); return t; };
    const measureHtml = (layer, shape) => {
      const pts = ringOf(layer);
      if (shape === 'Line') return `<b>Length</b><br>${fmtLen(lenOf(pts))}`;
      const a = L.GeometryUtil.geodesicArea(pts);
      return `<b>Area</b><br>${a.toFixed(2)} m²<br>${(a/100).toFixed(3)} Are<br>${(a/10000).toFixed(4)} ha<br><b>Perimeter</b><br>${fmtLen(lenOf([...pts, pts[0]]))}`;
    };
    const liveStatus = wl => { try {
      const pts = ringOf(wl); if (pts.length < 2) return;
      document.getElementById('statusText').textContent = map.pm.Draw.getActiveShape() === 'Polygon' && pts.length > 2 ? `${L.GeometryUtil.geodesicArea(pts).toFixed(1)} m²` : fmtLen(lenOf(pts));
    } catch (err) {} };

    const eraseStack = [];
    map.on('pm:remove', e => { if (e.layer._gisShape) { eraseStack.push({ shape: e.layer._gisShape, latlngs: e.layer.getLatLngs() }); if (eraseStack.length > 20) eraseStack.shift(); drawnItems.removeLayer(e.layer); } });

    const mkMini = (layer, isLine) => {
      const st = isLine ? { color:'#FF9933', weight:3 } : { color:'#FF9933', fillColor:'#FF9933', fillOpacity:0.15, weight:2.5 };
      vectorSync[L.stamp(layer)] = L.stamp((isLine ? L.polyline : L.polygon)(layer.getLatLngs(), st).addTo(drawnItemsMini));
    };
    const register = (layer, shape) => {
      const isLine = shape === 'Line'; layer._gisShape = shape; drawnItems.addLayer(layer);
      layer.setStyle(isLine ? { color:'#FF9933', weight:3 } : { color:'#FF9933', fillColor:'#FF9933', fillOpacity:0.15, weight:2.5 });
      const upd = () => { const html = measureHtml(layer, shape); if (layer.getPopup()) layer.setPopupContent(html); else layer.bindPopup(html).openPopup(); };
      upd(); layer.on('pm:edit pm:markerdrag pm:markerdragend pm:vertexadded pm:vertexremoved', upd);
      mkMini(layer, isLine);
      layer.on('pm:edit pm:markerdrag', () => { const ml = drawnItemsMini.getLayer(vectorSync[L.stamp(layer)]); if (ml) ml.setLatLngs(layer.getLatLngs()); });
    };

    map.on('pm:create', e => {
      const { layer, shape } = e;
      if (shape === 'Marker') {
        const txt = prompt('Save Note:');
        if (txt) { savedNotes.push({ lat:layer.getLatLng().lat, lng:layer.getLatLng().lng, text:txt }); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); Toast.show('Note saved', 'ok'); }
        map.removeLayer(layer); document.getElementById('markerBtn')?.classList.remove('on-accent'); State.activeTool=null; updateStatus(); return;
      }
      register(layer, shape);
      document.getElementById('lineBtn')?.classList.remove('on-accent'); document.getElementById('polygonBtn')?.classList.remove('on-accent'); State.activeTool=null; updateStatus();
    });

    // ── Snap on/off (works mid-drawing too), undo last point, finish, undo erase ──
    let snapOn = true;
    const toggleSnap = () => {
      snapOn = !snapOn; map.pm.setGlobalOptions({ snappable: snapOn });
      document.getElementById('snapBtn')?.classList.toggle('on-accent', snapOn);
      Toast.show(`Snap ${snapOn ? 'ON' : 'OFF'}`, snapOn ? 'ok' : 'warn', 1500);
    };
    const activeDraw = () => { const sh = map.pm.Draw.getActiveShape(); return sh && map.pm.Draw[sh]; };
    const undoPoint = () => { const d = activeDraw(); if (d && d._removeLastVertex) d._removeLastVertex(); else Toast.show('Start a line/polygon first', 'info'); };
    const finish = () => { const d = activeDraw(); if (d && d._finishShape) d._finishShape(); };
    const undoErase = () => {
      const st = eraseStack.pop(); if (!st) { Toast.show('Nothing to undo', 'info'); return; }
      register((st.shape === 'Line' ? L.polyline : L.polygon)(st.latlngs), st.shape); Toast.show('Restored', 'ok');
    };

    drawnItems.on('layerremove', e => { const oid = L.stamp(e.layer); const ml = drawnItemsMini.getLayer(vectorSync[oid]); if (ml) drawnItemsMini.removeLayer(ml); delete vectorSync[oid]; });

    const toggleErase = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalRemovalMode(); State.eraseMode = map.pm.globalRemovalModeEnabled(); const btn = document.getElementById('eraseModeBtn');
      if (State.eraseMode) { btn?.classList.add('on-accent'); State.activeTool='ERASE'; Toast.show('Tap shape to erase', 'warn'); } 
      else { btn?.classList.remove('on-accent'); State.activeTool=null; } updateStatus();
    };

    const toggleEdit = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalEditMode(); State.editMode = map.pm.globalEditModeEnabled(); const btn = document.getElementById('editBtn');
      if (State.editMode) { btn?.classList.add('on-accent'); State.activeTool='EDIT'; Toast.show('Drag nodes to reshape', 'info'); } 
      else { btn?.classList.remove('on-accent'); State.activeTool=null; } updateStatus();
    };

    const clearAll = async () => {
      const ok = await Modal.confirm('Clear all drawings?'); if (!ok) return;
      eraseStack.length = 0; drawnItems.clearLayers(); drawnItemsMini.clearLayers(); Object.keys(vectorSync).forEach(k => delete vectorSync[k]);
      map.eachLayer(l => { if (l.pm && l instanceof L.Path) map.removeLayer(l); });
      if (State.eraseMode) toggleErase(); if (State.editMode) toggleEdit();
      Toast.show('Cleared', 'ok');
    };

    const toggleRouteMode = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase();
      State.routeMode = !State.routeMode; const btn = document.getElementById('routeModeBtn');
      if (State.routeMode) { btn?.classList.add('on-accent'); State.activeTool='NAVIGATE'; Toast.show('Tap map to navigate', 'info'); } 
      else { btn?.classList.remove('on-accent'); State.activeTool=null; }
      updateStatus();
    };

    const navigateExternal = (lat, lng) => {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
    };

    return { trigger, toggleSnap, undoPoint, finish, undoErase, toggleErase, toggleEdit, clearAll, _deleteNote: i => { savedNotes.splice(i, 1); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); }, toggleRouteMode, navigateExternal };
  })();

  const FMB = (() => {
    let overlay = null, overlayMini = null, imgData = '', dims = null;
    let lat = 0, lng = 0, w = 0.0025, h = 0.0025, angle = 0, currentOpacity = 0.6;
    let touchStart = null, pinchDist = 0, pinchCenter = null; let startLat = 0, startLng = 0, startW = 0, startH = 0;

    document.getElementById('uploadFMB').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return; e.target.value = '';
      try {
        if (file.type === 'application/pdf') {
          const buf = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument(new Uint8Array(buf)).promise; const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale:2 }); const cvs = Object.assign(document.createElement('canvas'), { width:vp.width, height:vp.height });
          await page.render({ canvasContext:cvs.getContext('2d'), viewport:vp }).promise; imgData = cvs.toDataURL('image/png'); dims = { w:vp.width, h:vp.height };
        } else if (file.type.startsWith('image/')) {
          imgData = await new Promise((res, rej) => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.onerror = rej; r.readAsDataURL(file); });
        } else { Toast.show('Provide JPG/PNG/PDF', 'warn'); return; }
      } catch (err) { Toast.show(`Error: ${err.message}`, 'error'); return; }
      if (!dims || file.type !== 'application/pdf') dims = await new Promise(res => { const im = new Image(); im.onload = () => res({ w:im.naturalWidth, h:im.naturalHeight }); im.onerror = () => res({ w:1, h:1 }); im.src = imgData; });
      if (overlay) { map.removeLayer(overlay); mini.removeLayer(overlayMini); overlay = overlayMini = null; }
      const c = map.getCenter(); lat = c.lat; lng = c.lng; angle = 0;
      const asp = dims.w / dims.h, big = 0.0025 * 111320; // longer side ≈ 278 m, real aspect kept
      w = (asp >= 1 ? big : big*asp) / (111320 * Math.cos(lat*Math.PI/180)); h = (asp >= 1 ? big/asp : big) / 111320;
      render(); if (!State.touchMove) toggleTouch();
      GIS.UI.showRibbonPage('fmb'); GIS.UI.openRibbon(); Toast.show('FMB loaded', 'ok');
    });

    const changeOpacity = (val) => { currentOpacity = Math.max(0.1, Math.min(1.0, currentOpacity + val)); if(overlay) overlay.setOpacity(currentOpacity); if(overlayMini) overlayMini.setOpacity(currentOpacity); };

    // Image fills the bounds (no letterbox); viewBox follows the on-screen aspect so rotation never skews.
    let svgA = null, svgB = null;
    const mkSvg = () => {
      const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), img = document.createElementNS(ns, 'image');
      svg.setAttribute('xmlns', ns); svg.setAttribute('preserveAspectRatio', 'none'); svg.style.overflow = 'visible';
      img.setAttribute('preserveAspectRatio', 'none'); img.setAttribute('href', imgData); img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', imgData);
      svg.appendChild(img); return { svg, img };
    };
    const ratio = () => { const p = map.project([lat + h/2, lng - w/2], 18), q = map.project([lat - h/2, lng + w/2], 18); return Math.abs((q.x - p.x) / (q.y - p.y)) || 1; };
    const geom = o => { const W = ratio() * 100; o.svg.setAttribute('viewBox', `0 0 ${W} 100`); o.img.setAttribute('width', W); o.img.setAttribute('height', 100); o.img.setAttribute('transform', `rotate(${angle} ${W/2} 50)`); };
    const render = () => {
      if (!imgData) return; const bounds = L.latLngBounds([lat - h/2, lng - w/2], [lat + h/2, lng + w/2]);
      if (!overlay) {
        svgA = mkSvg(); svgB = mkSvg();
        overlay = L.svgOverlay(svgA.svg, bounds, { pane:'overlayPane', opacity:currentOpacity, interactive:false }).addTo(map);
        overlayMini = L.svgOverlay(svgB.svg, bounds, { opacity:currentOpacity, interactive:false }).addTo(mini);
      } else { overlay.setBounds(bounds); overlayMini.setBounds(bounds); }
      geom(svgA); geom(svgB); placeHandles();
    };

    // ── MS-Office style handles: corners = proportional, sides = stretch one axis (Shift on corner = free), green dot = rotate ──
    const hl = document.createElement('div'); hl.id = 'fmbHandles'; document.body.appendChild(hl);
    const hbox = document.createElement('div'); hbox.className = 'fh-box'; hl.appendChild(hbox);
    const rot = (x, y, deg) => { const t = deg*Math.PI/180, c = Math.cos(t), s = Math.sin(t); return { x: x*c - y*s, y: x*s + y*c }; };
    const box = () => { const p = map.latLngToContainerPoint([lat + h/2, lng - w/2]), q = map.latLngToContainerPoint([lat - h/2, lng + w/2]); return { cx:(p.x+q.x)/2, cy:(p.y+q.y)/2, pw:q.x-p.x, ph:q.y-p.y }; };
    const HD = [['nw',-1,-1],['n',0,-1],['ne',1,-1],['e',1,0],['se',1,1],['s',0,1],['sw',-1,1],['w',-1,0],['rot',0,-2]];
    const handles = HD.map(([k, sx, sy]) => { const el = document.createElement('div'); el.className = 'fh fh-' + k; hl.appendChild(el); el.addEventListener('pointerdown', e => startDrag(e, el, k, sx, sy)); return { el, sx, sy }; });
    const placeHandles = () => {
      const on = State.touchMove && overlay; hl.style.display = on ? 'block' : 'none'; if (!on) return;
      const { cx, cy, pw, ph } = box(), r = map.getContainer().getBoundingClientRect();
      Object.assign(hbox.style, { left:(r.left+cx)+'px', top:(r.top+cy)+'px', width:pw+'px', height:ph+'px', transform:`translate(-50%,-50%) rotate(${angle}deg)` });
      handles.forEach(({ el, sx, sy }) => { const o = rot(sx*pw/2, sy === -2 ? -ph/2 - 30 : sy*ph/2, angle); el.style.left = (r.left+cx+o.x)+'px'; el.style.top = (r.top+cy+o.y)+'px'; });
    };
    map.on('move zoom zoomend viewreset resize', placeHandles);
    const startDrag = (e, el, k, sx, sy) => {
      e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId);
      const r = map.getContainer().getBoundingClientRect(), g = box(), ang = angle;
      const o0 = rot(sx*g.pw/2, sy*g.ph/2, ang), A = { x: g.cx - o0.x, y: g.cy - o0.y }; // opposite corner/side stays fixed
      const move = ev => {
        const px = ev.clientX - r.left, py = ev.clientY - r.top;
        if (k === 'rot') { angle = Math.atan2(px - g.cx, -(py - g.cy)) * 180 / Math.PI; if (ev.shiftKey) angle = Math.round(angle/5)*5; render(); return; }
        const d = rot(px - A.x, py - A.y, -ang);
        let nw = sx ? Math.max(12, sx*d.x) : g.pw, nh = sy ? Math.max(12, sy*d.y) : g.ph;
        if (sx && sy && !ev.shiftKey) { const f = Math.max(nw/g.pw, nh/g.ph); nw = g.pw*f; nh = g.ph*f; }
        const o = rot(sx*nw/2, sy*nh/2, ang), c = { x: A.x + o.x, y: A.y + o.y };
        const tl = map.containerPointToLatLng([c.x - nw/2, c.y - nh/2]), br = map.containerPointToLatLng([c.x + nw/2, c.y + nh/2]);
        lat = (tl.lat + br.lat)/2; lng = (tl.lng + br.lng)/2; h = tl.lat - br.lat; w = br.lng - tl.lng; render();
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };

    // Step values set by the slider panel (MOVE / ZOOM / ROT chips)
    const stepVals = { move: 1, zoom: 1, rot: 0.01 };
    // Accurate movement: meter-based step
    const getMoveStepDeg = () => {
      const m = stepVals.move;
      const latRad = (lat * Math.PI) / 180;
      return { dLat: m / 111320, dLng: m / (111320 * Math.max(0.2, Math.cos(latRad))) };
    };
    const getRotStep = () => stepVals.rot;
    const getZoomFactor = () => 1 + stepVals.zoom / 100;
    const ACTIONS = {
      up:    () => { const s = getMoveStepDeg(); lat += s.dLat; },
      down:  () => { const s = getMoveStepDeg(); lat -= s.dLat; },
      left:  () => { const s = getMoveStepDeg(); lng -= s.dLng; },
      right: () => { const s = getMoveStepDeg(); lng += s.dLng; },
      zoomin:  () => { const f = getZoomFactor(); w*=f; h*=f; },
      zoomout: () => { const f = getZoomFactor(); w/=f; h/=f; },
      rotL: () => angle -= getRotStep(),
      rotR: () => angle += getRotStep(),
      opPlus:  () => changeOpacity(0.1),
      opMinus: () => changeOpacity(-0.1)
    };

    // ── STEP SLIDER PANEL (appears beside ribbon, hides after set) ──
    const SLIDER_CFG = {
      move: { min: 0.1, max: 5, step: 0.1, title: 'MOVE STEP',  icon: 'fa-arrows-up-down-left-right',           fmt: v => `${v.toFixed(1)} m` },
      zoom: { min: 0.1, max: 5, step: 0.1, title: 'ZOOM STEP',  icon: 'fa-up-right-and-down-left-from-center',  fmt: v => `${v.toFixed(1)} %` },
      rot:  { min: 0.001, max: 1, step: 0.001, title: 'ROTATION', icon: 'fa-rotate-right',                      fmt: v => `${v.toFixed(3)}°` }
    };
    const ssp = document.getElementById('stepSliderPanel'),
          sSlider = document.getElementById('stepSlider'),
          sTitle = document.getElementById('sspTitle'),
          sValue = document.getElementById('sspValue'),
          sIcon = document.getElementById('sspIcon');
    let sspKey = null;
    const openStepSlider = (key) => {
      const cfg = SLIDER_CFG[key]; if (!cfg) return;
      sspKey = key;
      sSlider.min = cfg.min; sSlider.max = cfg.max; sSlider.step = cfg.step;
      sSlider.value = stepVals[key];
      sTitle.textContent = cfg.title;
      sIcon.className = `fa-solid ${cfg.icon}`;
      sValue.textContent = cfg.fmt(stepVals[key]);
      ssp.classList.add('open');
    };
    sSlider.addEventListener('input', () => {
      if (!sspKey) return;
      const cfg = SLIDER_CFG[sspKey];
      stepVals[sspKey] = parseFloat(sSlider.value);
      sValue.textContent = cfg.fmt(stepVals[sspKey]);
    });
    sSlider.addEventListener('change', () => { ssp.classList.remove('open'); Toast.show(`${SLIDER_CFG[sspKey].title}: ${SLIDER_CFG[sspKey].fmt(stepVals[sspKey])}`, 'ok', 1500); });
    const adjust = action => { if (!overlay) return; ACTIONS[action]?.(); render(); };
    const remove = async () => {
      if (!overlay) return; const ok = await Modal.confirm('Remove FMB?'); if (!ok) return;
      map.removeLayer(overlay); overlay = null; mini.removeLayer(overlayMini); overlayMini = null; imgData = '';
      if (State.touchMove) toggleTouch(); Toast.show('FMB removed', 'info'); GIS.UI.showRibbonPage('main');
    };

    const toggleTouch = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); State.touchMove = !State.touchMove; const btn = document.getElementById('touchMoveBtn');
      if (State.touchMove) { map.dragging.disable(); map.touchZoom.disable(); btn?.classList.add('on-accent'); State.activeTool='MOVE FMB'; GPS.stopFollow(); } 
      else { map.dragging.enable(); map.touchZoom.enable(); btn?.classList.remove('on-accent'); State.activeTool=null; }
      updateStatus(); placeHandles();
    };

    const mc = map.getContainer();
    mc.addEventListener('touchstart', e => {
      if (!State.touchMove || !overlay) return; e.preventDefault();
      if (e.touches.length === 1) { touchStart = { x:e.touches[0].clientX, y:e.touches[0].clientY }; startLat = lat; startLng = lng; } 
      else if (e.touches.length === 2) {
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchCenter = { x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2 }; startLat = lat; startLng = lng; startW = w; startH = h;
      }
    }, { passive:false });

    mc.addEventListener('touchmove', e => {
      if (!State.touchMove || !overlay) return; e.preventDefault();
      if (e.touches.length === 1 && touchStart) {
        const p = map.latLngToContainerPoint([startLat, startLng]);
        const nl = map.containerPointToLatLng(L.point(p.x+(e.touches[0].clientX-touchStart.x), p.y+(e.touches[0].clientY-touchStart.y))); lat = nl.lat; lng = nl.lng;
      } else if (e.touches.length === 2 && pinchDist > 0) {
        const sc = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) / pinchDist; w = startW * sc; h = startH * sc;
        const cc = { x:(e.touches[0].clientX+e.touches[1].clientX)/2, y:(e.touches[0].clientY+e.touches[1].clientY)/2 };
        const p = map.latLngToContainerPoint([startLat, startLng]);
        const nl = map.containerPointToLatLng(L.point(p.x+cc.x-pinchCenter.x, p.y+cc.y-pinchCenter.y)); lat = nl.lat; lng = nl.lng;
      } render();
    }, { passive:false });
    mc.addEventListener('touchend', () => { touchStart = null; pinchDist = 0; }, { passive:false });

    let mouseStart = null;
    mc.addEventListener('mousedown', e => { if (!State.touchMove || !overlay || e.button!==0) return; e.preventDefault(); mouseStart = { x:e.clientX, y:e.clientY }; startLat = lat; startLng = lng; });
    document.addEventListener('mousemove', e => { if (!State.touchMove || !overlay || !mouseStart) return; e.preventDefault(); const p = map.latLngToContainerPoint([startLat, startLng]); const nl = map.containerPointToLatLng(L.point(p.x+(e.clientX-mouseStart.x), p.y+(e.clientY-mouseStart.y))); lat = nl.lat; lng = nl.lng; render(); });
    document.addEventListener('mouseup', () => mouseStart = null);
    mc.addEventListener('wheel', e => { if (!State.touchMove || !overlay) return; e.preventDefault(); if (e.deltaY < 0) { w*=1.03; h*=1.03; } else { w*=0.97; h*=0.97; } render(); }, { passive: false });
    
    return { adjust, remove, toggleTouch, openStepSlider, getGeoRef: () => overlay ? { lat, lng, w, h, angle } : null, getImageData: () => overlay ? imgData : null };
  })();

  const IO = (() => {
    const dataURLtoBlob = (dataURL) => {
      const arr = dataURL.split(','); const mime = arr[0].match(/:(.*?);/)[1]; const bstr = atob(arr[1]);
      let n = bstr.length; const u8arr = new Uint8Array(n);
      while(n--){ u8arr[n] = bstr.charCodeAt(n); }
      return new Blob([u8arr], {type:mime});
    };

    const buildTracedKmlBody = () => {
      let body = '';
      drawnItems.eachLayer(l => {
        const isPolygon = l instanceof L.Polygon; 
        const rawLlngs = l.getLatLngs ? l.getLatLngs() : null; 
        const pts = rawLlngs ? (Array.isArray(rawLlngs[0]) ? rawLlngs[0] : rawLlngs) : [l.getLatLng()];
        if (isPolygon) {
          const ring = [...pts, pts[0]]; 
          body += '<Placemark><Style><PolyStyle><color>803399FF</color><fill>1</fill><outline>1</outline></PolyStyle><LineStyle><color>ff3399FF</color><width>2</width></LineStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>';
          ring.forEach(p => body += `${p.lng},${p.lat},0 `); 
          body += '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
        } else {
          body += '<Placemark><Style><LineStyle><color>ff3399FF</color><width>2</width></LineStyle></Style><LineString><coordinates>';
          pts.forEach(p => body += `${p.lng},${p.lat},0 `); 
          body += '</coordinates></LineString></Placemark>';
        }
      }); 
      return body;
    };

    const uploadFile = async (file) => {
      try {
        if (file.name.toLowerCase().endsWith('.kmz')) {
          Toast.show('Loading KMZ...', 'info');
          const zip = await JSZip.loadAsync(file);
          let kmlFile = null;
          for (let relativePath in zip.files) {
            if (relativePath.toLowerCase().endsWith('.kml')) { kmlFile = zip.files[relativePath]; break; }
          }
          if (kmlFile) {
            const kmlText = await kmlFile.async('text');
            const k = omnivore.kml.parse(kmlText).addTo(map);
            k.on('ready', () => { map.fitBounds(k.getBounds()); Toast.show('KMZ Loaded', 'ok'); });
          } else { Toast.show('No KML found inside KMZ', 'warn'); }
        } else if (file.name.toLowerCase().endsWith('.kml')) {
          const reader = new FileReader();
          reader.onload = ev => {
            const k = omnivore.kml.parse(ev.target.result).addTo(map);
            k.on('ready', () => { map.fitBounds(k.getBounds()); Toast.show('KML Loaded', 'ok'); });
          };
          reader.readAsText(file);
        } else {
          const reader = new FileReader();
          reader.onload = ev => {
            const j = L.geoJSON(JSON.parse(ev.target.result)).addTo(map);
            map.fitBounds(j.getBounds()); Toast.show('JSON Loaded', 'ok');
          };
          reader.readAsText(file);
        }
      } catch (err) { Toast.show('Error loading file', 'error'); }
    };

    return { 
      exportKMZ: async () => {
        Toast.show('Creating KMZ...', 'info');
        const fmbRef = FMB.getGeoRef(), imgData = FMB.getImageData(); 
        let kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Sodestus Project</name>`;
        const zip = new JSZip();

        if (fmbRef && imgData) {
          const imgBlob = dataURLtoBlob(imgData); const { lat, lng, w, h, angle } = fmbRef;
          const south = lat-h/2, north = lat+h/2, west = lng-w/2, east = lng+w/2;
          kml += `<GroundOverlay><name>FMB GeoReference</name><Icon><href>files/fmb.png</href></Icon><LatLonBox><north>${north.toFixed(8)}</north><south>${south.toFixed(8)}</south><east>${east.toFixed(8)}</east><west>${west.toFixed(8)}</west><rotation>${(-angle).toFixed(4)}</rotation></LatLonBox></GroundOverlay>`;
          zip.file('files/fmb.png', imgBlob);
        }
        
        kml += buildTracedKmlBody() + '</Document></kml>';
        zip.file('doc.kml', kml);

        try { 
          const content = await zip.generateAsync({ type: 'blob' }); 
          const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(content), download: 'Sodestus_Export.kmz' }); 
          a.click(); Toast.show('KMZ exported', 'ok'); 
        } catch (err) { Toast.show('Export Error', 'error'); }
      },
      uploadFile 
    };
  })();

  document.getElementById('uploadFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) { GIS.IO.uploadFile(file); e.target.value = ''; document.getElementById('exportMenu').classList.remove('active'); }
  });

  map.on('click', e => { 
    UI.closeRibbon();
    document.getElementById('exportMenu')?.classList.remove('active');

    if (State.routeMode) {
      GIS.Draw.navigateExternal(e.latlng.lat, e.latlng.lng);
      GIS.Draw.toggleRouteMode();
    } 
  });

  const MapCtrl = { zoomIn: () => map.zoomIn(), zoomOut: () => map.zoomOut() };

  const Voice = (() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null, listening = false;
    if (SR) {
      rec = new SR(); rec.continuous = false; rec.interimResults = false; rec.lang = 'en-IN';
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript;
        document.getElementById('searchInput').value = text;
        Search.execute();
      };
      rec.onerror = () => Toast.show('Voice search error', 'warn');
      rec.onend = () => { listening = false; document.getElementById('micBtn')?.classList.remove('on-accent'); };
    }
    return {
      toggle() {
        if (!SR) { Toast.show('Voice search not supported', 'warn'); return; }
        if (listening) { rec.stop(); listening = false; return; }
        listening = true; document.getElementById('micBtn')?.classList.add('on-accent'); rec.start();
      }
    };
  })();

  window.GIS = { Layers, Search, GPS, Draw, FMB, UI, IO, MapCtrl, Voice };

})();