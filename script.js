'use strict';

(() => {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  const STORAGE_KEY   = 'murali_gis_v11';
  const BHUVAN_URL    = 'https://bhuvan-panchayat3.nrsc.gov.in/geoserver/gwc/service/wms';
  const KSREC_URL     = 'https://ksrec.in/geoserver/Kerala/wms';
  const DEFAULT_VIEW  = { lat: 11.196, lng: 76.227, zoom: 16 };

  const Toast = (() => {
    const root = document.getElementById('toast-root');
    const ICONS = { info:'fa-circle-info', ok:'fa-circle-check', warn:'fa-triangle-exclamation', error:'fa-circle-xmark' };
    return {
      show(msg, type = 'info', dur = 4000) {
        const el = document.createElement('div'); el.className = `toast ${type}`;
        el.innerHTML = `<i class="fa-solid ${ICONS[type]} toast-icon"></i><span class="toast-msg">${msg}</span>`;
        root.appendChild(el);
        setTimeout(() => { el.classList.add('out'); el.addEventListener('animationend', () => el.remove()); }, dur);
      }
    };
  })();

  const Modal = (() => {
    const bd = document.getElementById('modalBackdrop');
    const title = document.getElementById('modalTitle'), body = document.getElementById('modalBody');
    const btnOK = document.getElementById('modalConfirm'), btnCancel = document.getElementById('modalCancel');
    let _resolve;
    btnOK.addEventListener('click', () => { bd.classList.remove('open'); _resolve(true); });
    btnCancel.addEventListener('click', () => { bd.classList.remove('open'); _resolve(false); });
    return { confirm(t, b) { title.textContent = t || 'Confirm'; body.textContent = b || 'Are you sure?'; bd.classList.add('open'); return new Promise(r => _resolve = r); } };
  })();

  const Ribbon = {
    activeTool: null, activeLayers: ['Hybrid'],
    update() {
      const r = document.getElementById('statusRibbon'), t = document.getElementById('ribbonText'), ind = document.getElementById('ribbonIndicator');
      if (this.activeTool) { t.innerHTML = `Active Tool: <span style="color:var(--accent)">${this.activeTool}</span>`; ind.style.background = 'var(--accent)'; r.classList.add('active'); }
      else if (this.activeLayers.length > 0) { t.innerHTML = `Layer: <span style="color:var(--saffron)">${this.activeLayers.join(' + ')}</span>`; ind.style.background = 'var(--saffron)'; r.classList.add('active'); }
      else { r.classList.remove('active'); }
    },
    setTool(tool) { this.activeTool = tool; this.update(); },
    addLayer(layer) { if(!this.activeLayers.includes(layer)) this.activeLayers.push(layer); this.update(); },
    removeLayer(layer) { this.activeLayers = this.activeLayers.filter(l => l !== layer); this.update(); },
    setBaseLayer(layer) { if (this.activeLayers.length > 0) this.activeLayers[0] = layer; else this.activeLayers.push(layer); this.update(); }
  };

  let uiTimer = null;
  const showUI = () => {
    document.body.classList.add('show-ui');
    clearTimeout(uiTimer);
    uiTimer = setTimeout(() => {
      if (!State.drawing && !State.touchMove && !State.eraseMode && !State.editMode) document.body.classList.remove('show-ui');
    }, 5500);
  };

  const State = { drawing: false, eraseMode: false, editMode: false, touchMove: false, draggingVertex: false, routeMode: false, userLatLng: null };

  const tileSrc = { hybrid: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', road: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' };
  const googleSubs = { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] };
  const baseLayers = { hybrid: L.tileLayer(tileSrc.hybrid, googleSubs), road: L.tileLayer(tileSrc.road, googleSubs), osm: L.tileLayer(tileSrc.osm, { maxZoom:22 }) };

  const map = L.map('map', { center:[DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], zoom:DEFAULT_VIEW.zoom, layers:[baseLayers.hybrid], zoomControl:false, tap:false });

  map.pm.setGlobalOptions({ snappable:true, snapDistance:25, snapMiddle:true, layerGroup:map, hintMarkerStyle: { opacity: 0, fillOpacity: 0 }, templineStyle: { color: '#FF9933' } });

  map.createPane('cadastralPane'); Object.assign(map.getPane('cadastralPane').style, { zIndex:'600', pointerEvents:'none' });

  const WMS_BASE = { format:'image/png', transparent:true, maxZoom:22, tileSize:512, zoomOffset:-1, pane:'cadastralPane' };
  const wmsLayers = {
    village: L.tileLayer.wms(BHUVAN_URL, { ...WMS_BASE, layers:'v3:village', className:'parcel-red' }),
    cadastral: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:Cadastry_Kerala', className:'parcel-red' }),
    parcelKCH: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KCH_Survey_Parcel_acpc', className:'parcel-red' }),
    parcelKKD: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KKD_Survey_Parcel_acpc', className:'parcel-red' }),
    parcelKLM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KLM_Survey_Parcel_acpc', className:'parcel-red' }),
    parcelTCR: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TCR_Survey_Parcel_acpc', className:'parcel-red' }),
    parcelTVM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TVM_Survey_Parcel_acpc', className:'parcel-red' }),
  };
  map.addLayer(wmsLayers.cadastral); Ribbon.addLayer('Cadastral');

  const mini = L.map('zoomBox', { attributionControl:false, zoomControl:false, dragging:false, touchZoom:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, layers:[L.tileLayer(tileSrc.hybrid, googleSubs)] });
  mini.createPane('miniCadastral'); Object.assign(mini.getPane('miniCadastral').style, { zIndex:'600', pointerEvents:'none' });
  const miniCadastral = L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, pane:'miniCadastral', layers:'Kerala:Cadastry_Kerala', className:'parcel-red' });
  mini.addLayer(miniCadastral);

  const drawnItems = new L.FeatureGroup().addTo(map);
  const drawnItemsMini = new L.FeatureGroup().addTo(mini);
  const vectorSync = {}; let routeLayer = null, routeLayerMini = null;

  const showMagnifier = () => { document.getElementById('zoomBox').classList.add('active'); };
  const hideMagnifier = () => { if (!State.draggingVertex && !State.drawing) document.getElementById('zoomBox').classList.remove('active'); };
  const mapContainer = map.getContainer();
  const updateMagnifierPosition = (domEvent) => {
    if (State.draggingVertex || State.drawing) {
      const touch = domEvent.touches ? domEvent.touches[0] : domEvent; if (!touch) return;
      const rect = mapContainer.getBoundingClientRect();
      const latlng = map.containerPointToLatLng(L.point(touch.clientX - rect.left, touch.clientY - rect.top));
      mini.setView(latlng, map.getZoom() + 4);
    }
  };

  mapContainer.addEventListener('touchstart', (e) => { if (State.draggingVertex || State.drawing) { showMagnifier(); updateMagnifierPosition(e); } }, { passive: true });
  mapContainer.addEventListener('touchmove', (e) => { if (State.draggingVertex || State.drawing) { showMagnifier(); updateMagnifierPosition(e); } }, { passive: true });
  mapContainer.addEventListener('touchend', hideMagnifier, { passive: true });
  mapContainer.addEventListener('mousedown', (e) => { if (State.draggingVertex || State.drawing) { showMagnifier(); updateMagnifierPosition(e); } });
  mapContainer.addEventListener('mousemove', (e) => { if (State.draggingVertex || State.drawing) updateMagnifierPosition(e); });
  mapContainer.addEventListener('mouseup', hideMagnifier);

  map.on('click', e => { if (State.routeMode) Draw.drawShortestRoute(e.latlng.lat, e.latlng.lng); if (State.drawing) mini.setView(e.latlng, map.getZoom() + 4); });
  map.on('dragstart zoomstart', () => { if (!State.drawing && !State.touchMove && !State.eraseMode && !State.editMode) document.body.classList.remove('show-ui'); });
  document.addEventListener('mousemove', showUI); document.addEventListener('touchstart', showUI); document.addEventListener('keydown', showUI);

  /* ── UI MODULE ── */
  const UI = {
    activeTab: null,
    openTab(tabId, title) {
      const panel = document.getElementById('toolPanel');
      document.getElementById('toolPanelTitle').textContent = title;
      
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tool-content').forEach(c => c.style.display = 'none');
      document.getElementById('exportMenu').classList.remove('active');
      
      if (this.activeTab === tabId) {
        panel.classList.remove('active');
        this.activeTab = null;
      } else {
        document.getElementById(`nav-${tabId}`).classList.add('active');
        document.getElementById(`content-${tabId}`).style.display = 'flex';
        panel.classList.add('active');
        this.activeTab = tabId;
      }
    },
    closeMenu() {
        document.getElementById('toolPanel').classList.remove('active');
        document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
        this.activeTab = null;
    },
    syncMinimize() { 
      const activeTool = !!(map.pm && map.pm.GlobalDrawMode) || State.editMode || State.routeMode || State.eraseMode || State.touchMove;
      if (activeTool) this.closeMenu();
    } 
  };

  const Layers = {
    _current: 'hybrid',
    setBase(key) {
      Object.values(baseLayers).forEach(l => map.removeLayer(l));
      map.addLayer(baseLayers[key]);
      this._current = key;
      const titles = { hybrid: 'Hybrid', road: 'Road', osm: 'OpenStreetMap' };
      document.querySelectorAll('#content-layers .mb').forEach(b => { if(['Hybrid','Road','OpenStreetMap'].includes(b.title)) b.classList.remove('on-saffron'); });
      const btn = document.querySelector(`#content-layers button[title="${titles[key]}"]`);
      if(btn) btn.classList.add('on-saffron');
      Ribbon.setBaseLayer(titles[key]);
      Toast.show(`Switched to <b>${key}</b> layer`, 'info', 2500);
    },
    toggleWms(type) {
      const layer = wmsLayers[type];
      const BTN_IDS = { village:'btnVil', cadastral:'btnCad', parcelKCH:'btnKCH', parcelKKD:'btnKKD', parcelKLM:'btnKLM', parcelTCR:'btnTCR', parcelTVM:'btnTVM' };
      const NAMES = { village:'Village', cadastral:'Cadastral', parcelKCH:'Kochi', parcelKKD:'Kozhikode', parcelKLM:'Kollam', parcelTCR:'Thrissur', parcelTVM:'Trivandrum' };
      const btn = document.getElementById(BTN_IDS[type]);
      if (map.hasLayer(layer)) {
        map.removeLayer(layer); btn.classList.remove('on-saffron'); Ribbon.removeLayer(NAMES[type]);
        Toast.show(`<b>${type}</b> WMS hidden`, 'info', 2000);
      } else {
        map.addLayer(layer); btn.classList.add('on-saffron'); Ribbon.addLayer(NAMES[type]);
        Toast.show(`<b>${type}</b> WMS active`, 'ok', 2000);
      }
    },
  };

  const Search = (() => {
    let marker = null;
    const execute = async () => {
      const raw = document.getElementById('searchInput').value.trim(); if (!raw) return;
      if (marker) { map.removeLayer(marker); marker = null; }
      const parts = raw.split(/[\s,]+/);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const [lat, lng] = parts.map(Number);
        map.setView([lat, lng], 17);
        marker = L.marker([lat, lng]).addTo(map).bindPopup(`<b>Coordinates</b><br><code>${lat.toFixed(6)}, ${lng.toFixed(6)}</code>`).openPopup();
        return;
      }
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(raw)}`);
        const data = await res.json();
        if (!data.length) { Toast.show('Place not found', 'warn'); return; }
        map.setView([+data[0].lat, +data[0].lon], 15);
        marker = L.marker([+data[0].lat, +data[0].lon]).addTo(map).bindPopup(`<b>${data[0].display_name}</b>`).openPopup();
      } catch { Toast.show('Search error — check internet', 'error'); }
    };
    document.getElementById('searchBtn').addEventListener('click', execute);
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') execute(); });
    const bar = document.getElementById('searchBar'), input = document.getElementById('searchInput');
    document.getElementById('searchToggleBtn').addEventListener('click', () => { bar.classList.remove('collapsed'); setTimeout(() => input.focus(), 50); });
    document.addEventListener('click', (e) => { if (!bar.contains(e.target) && !bar.classList.contains('collapsed') && !input.value.trim()) bar.classList.add('collapsed'); });
    return { execute };
  })();

  const GPS = (() => {
    let active = false, watchId = null, userMarker = null, ring = null, userMarkerMini = null, ringMini = null;
    const crossIcon = L.divIcon({ className:'blue-dot-container', html:'<div class="cross-v"></div><div class="cross-h"></div><div class="blue-dot"></div>', iconSize:[60,60], iconAnchor:[30,30] });
    const onLocationUpdate = (position) => {
      const { latitude:lat, longitude:lng, accuracy } = position.coords; const latlng = L.latLng(lat, lng);
      State.userLatLng = latlng; map.panTo(latlng);
      if (!userMarker) {
        userMarker = L.marker(latlng, { icon:crossIcon }).addTo(map); ring = L.circle(latlng, { radius:accuracy, color:'#60a5fa', weight:1, opacity:.3, fillOpacity:.04 }).addTo(map);
        userMarkerMini = L.marker(latlng, { icon:crossIcon }).addTo(mini); ringMini = L.circle(latlng, { radius:accuracy, color:'#60a5fa', weight:1, opacity:.3, fillOpacity:.04 }).addTo(mini);
      } else {
        userMarker.setLatLng(latlng); ring.setLatLng(latlng).setRadius(accuracy);
        userMarkerMini.setLatLng(latlng); ringMini.setLatLng(latlng).setRadius(accuracy);
      }
    };
    const onLocationError = (error) => { if (active && error.code === error.TIMEOUT) { restartTracking(); } else if (error.code === error.PERMISSION_DENIED) { Toast.show('ലൊക്കേഷൻ പെർമിഷൻ നിരസിക്കപ്പെട്ടു.', 'error'); stop(); } };
    const start = () => { if (navigator.geolocation) watchId = navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); };
    const stop = () => { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } if (userMarker) { map.removeLayer(userMarker); map.removeLayer(ring); mini.removeLayer(userMarkerMini); mini.removeLayer(ringMini); userMarker=null; ring=null; userMarkerMini=null; ringMini=null; } };
    const restartTracking = () => { if (!active) return; navigator.geolocation.clearWatch(watchId); start(); };
    const toggle = () => {
      const btn = document.getElementById('gpsBtn');
      if (!active) { active = true; btn.classList.add('on-blue'); start(); Toast.show('ഹൈ-ആക്യുറസി <b>GPS ട്രാക്കിംഗ്</b> ആരംഭിച്ചു', 'ok'); }
      else { active = false; btn.classList.remove('on-blue'); stop(); Toast.show('GPS ട്രാക്കിംഗ് <b>നിർത്തി</b>', 'info'); }
    };
    return { toggle, onLocationSuccess: (lat, lng, acc) => onLocationUpdate({ coords: { latitude: lat, longitude: lng, accuracy: acc } }), onLocationFailure: (msg) => onLocationError({ message: msg, code: 0 }) };
  })();

  const Draw = (() => {
    const savedNotes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const pinGroup = L.layerGroup().addTo(map), pinGroupMini = L.layerGroup().addTo(mini);
    map.pm.addControls({ drawMarker:false, drawPolygon:false, drawPolyline:false, editMode:false, dragMode:false, cutPolygon:false, removalMode:false });

    const renderNotes = () => {
      pinGroup.clearLayers(); pinGroupMini.clearLayers();
      savedNotes.forEach((p, i) => {
        L.marker([p.lat, p.lng]).addTo(pinGroup).bindPopup(`<b>📍 Note</b><br>${p.text}<button class="p-nav" style="background:var(--blue); margin-top:6px;" onclick="GIS.Draw.drawShortestRoute(${p.lat}, ${p.lng})">Show Route</button><button class="p-nav" style="background:#0b8043; margin-top:6px;" onclick="GIS.Draw.navigateExternal(${p.lat}, ${p.lng})">Navigate</button><button class="p-del" onclick="GIS.Draw._deleteNote(${i})">Delete</button>`);
        L.marker([p.lat, p.lng]).addTo(pinGroupMini);
      });
    }; renderNotes();

    const clearHighlights = () => ['lineBtn','polygonBtn','markerBtn'].forEach(id => { document.getElementById(id)?.classList.remove('on-accent'); });

    const trigger = (toolType) => {
      if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      const wasActive = map.pm.GlobalDrawMode === toolType; clearHighlights();
      document.querySelectorAll('#content-draw .mb').forEach(b => b.style.cssText = '');
      if (wasActive) { map.pm.disableDraw(); Ribbon.setTool(null); }
      else { map.pm.enableDraw(toolType, { hintMarkerStyle: { opacity: 0, fillOpacity: 0 } }); const id = { Line:'lineBtn', Polygon:'polygonBtn', Marker:'markerBtn' }[toolType]; document.getElementById(id).style.cssText = 'background:var(--accent);color:#fff'; Ribbon.setTool(`Draw ${toolType}`); }
      setTimeout(() => UI.syncMinimize(), 50);
    };

    map.on('pm:globaldrawmodetoggled', e => { if (!e.enabled) clearHighlights(); });
    let workingLayerMini = null;
    map.on('pm:drawstart', (e) => {
      State.drawing = true; document.body.classList.add('show-ui'); document.getElementById('zoomBox').classList.add('active');
      const wl = e.workingLayer;
      if (wl) {
        if (workingLayerMini) mini.removeLayer(workingLayerMini);
        const shape = map.pm.Draw.getActiveShape(), style = { color: '#FF9933', weight: 4, dashArray: '5, 5' };
        if (shape === 'Polygon' || shape === 'Rectangle') workingLayerMini = L.polygon([], style).addTo(mini); else if (shape === 'Line') workingLayerMini = L.polyline([], style).addTo(mini);
        const syncWorkingLayer = () => { if (workingLayerMini && wl.getLatLngs) { try { workingLayerMini.setLatLngs(wl.getLatLngs()); } catch (err) {} } };
        wl.on('pm:vertexadded', syncWorkingLayer); wl.on('pm:vertexremoved', syncWorkingLayer); map.on('mousemove', syncWorkingLayer);
      }
    });
    map.on('pm:drawend', () => { State.drawing = false; showUI(); document.getElementById('zoomBox').classList.remove('active'); if (workingLayerMini) { mini.removeLayer(workingLayerMini); workingLayerMini = null; } });
    map.on('mousemove', e => { if (State.draggingVertex || State.drawing) mini.setView(e.latlng, map.getZoom() + 4); });
    map.on('pm:snap', e => { if (State.drawing) mini.setView(e.latlng, map.getZoom() + 4); });

    map.on('pm:create', e => {
      const { layer, shape } = e;
      if (shape === 'Marker') {
        const txt = prompt('Save Note:');
        if (txt) { savedNotes.push({ lat:layer.getLatLng().lat, lng:layer.getLatLng().lng, text:txt }); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); Toast.show('Note saved', 'ok'); }
        map.removeLayer(layer); document.getElementById('markerBtn').style.cssText = ''; Ribbon.setTool(null); return;
      }
      drawnItems.addLayer(layer);
      if (shape === 'Polygon' || shape === 'Rectangle') layer.setStyle({ color: '#FF9933', fillColor: '#FF9933', fillOpacity: 0.15, weight: 2.5 });
      
      layer.on('pm:markerdragstart', (ev) => { State.draggingVertex = true; document.getElementById('zoomBox').classList.add('active'); document.body.classList.add('show-ui'); if (ev.marker) mini.setView(ev.marker.getLatLng(), map.getZoom() + 4); });
      layer.on('pm:markerdrag', (ev) => { if (State.draggingVertex) { if (ev.marker) mini.setView(ev.marker.getLatLng(), map.getZoom() + 4); const ml = drawnItemsMini.getLayer(vectorSync[L.stamp(layer)]); if (ml && layer.getLatLngs) ml.setLatLngs(layer.getLatLngs()); } });
      layer.on('pm:markerdragend', () => { State.draggingVertex = false; document.getElementById('zoomBox').classList.remove('active'); });

      if (shape === 'Polygon' || shape === 'Rectangle') {
        const updateAreaPopup = () => { const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]); const popupContent = `<b>Area</b><p class="area-label">${(area * 0.000247105).toFixed(3)} ac · ${(area * 0.0247105).toFixed(2)} cents</p>`; if (layer.getPopup()) layer.setPopupContent(popupContent); else layer.bindPopup(popupContent).openPopup(); };
        updateAreaPopup(); layer.on('pm:edit pm:markerdragend pm:vertexadded pm:vertexremoved', updateAreaPopup);
      }

      const origId = L.stamp(layer); const style = { color: shape === 'Line' ? (layer.options.color || '#FF9933') : '#FF9933', fillColor: '#FF9933', fillOpacity: 0.15, weight: layer.options.weight || 2.5 };
      let miniL; if (shape === 'Line') miniL = L.polyline(layer.getLatLngs(), { color: layer.options.color || '#FF9933', weight: layer.options.weight || 3 }).addTo(drawnItemsMini); else miniL = L.polygon(layer.getLatLngs(), style).addTo(drawnItemsMini);
      if (miniL) { vectorSync[origId] = L.stamp(miniL); layer.on('pm:edit', () => { const ml = drawnItemsMini.getLayer(vectorSync[L.stamp(layer)]); if (ml) ml.setLatLngs(layer.getLatLngs()); }); }
      Ribbon.setTool(null);
    });

    drawnItems.on('layerremove', e => { const oid = L.stamp(e.layer); const ml = drawnItemsMini.getLayer(vectorSync[oid]); if (ml) drawnItemsMini.removeLayer(ml); delete vectorSync[oid]; });

    const toggleErase = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalRemovalMode(); State.eraseMode = map.pm.globalRemovalModeEnabled(); const btn = document.getElementById('eraseModeBtn');
      if (State.eraseMode) { btn.style.cssText = 'background:var(--accent);color:#fff'; Ribbon.setTool('Eraser'); document.body.classList.add('show-ui'); Toast.show('Erase mode <b>ON</b> — tap a shape to delete it.', 'warn'); } 
      else { btn.style.cssText = ''; Ribbon.setTool(null); showUI(); } setTimeout(() => UI.syncMinimize(), 50);
    };

    const toggleEdit = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalEditMode(); State.editMode = map.pm.globalEditModeEnabled(); const btn = document.getElementById('editBtn');
      if (State.editMode) { btn.style.cssText = 'background:var(--accent);color:#fff'; Ribbon.setTool('Edit Shape'); document.body.classList.add('show-ui'); Toast.show('Edit mode <b>ON</b>.', 'info'); } 
      else { btn.style.cssText = ''; Ribbon.setTool(null); showUI(); } setTimeout(() => UI.syncMinimize(), 50);
    };

    const clearAll = async () => {
      const ok = await Modal.confirm('Clear all drawings?'); if (!ok) return;
      drawnItems.clearLayers(); drawnItemsMini.clearLayers(); Object.keys(vectorSync).forEach(k => delete vectorSync[k]);
      map.eachLayer(l => { if (l.pm && l instanceof L.Path) map.removeLayer(l); });
      if (State.eraseMode) toggleErase(); if (State.editMode) toggleEdit(); if (routeLayerMini) mini.removeLayer(routeLayerMini);
      Toast.show('Cleared', 'ok');
    };

    const _deleteNote = i => { savedNotes.splice(i, 1); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); };

    const toggleRouteMode = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase();
      State.routeMode = !State.routeMode; const btn = document.getElementById('routeModeBtn');
      if (State.routeMode) { btn.style.cssText = 'background:var(--accent);color:#fff'; Ribbon.setTool('Route Planner'); Toast.show('Route Planner <b>ACTIVE</b>', 'info'); } 
      else { btn.style.cssText = ''; Ribbon.setTool(null); if (routeLayer) map.removeLayer(routeLayer); if (routeLayerMini) mini.removeLayer(routeLayerMini); }
      setTimeout(() => UI.syncMinimize(), 50);
    };

    const drawShortestRoute = async (destLat, destLng) => {
      if (routeLayer) map.removeLayer(routeLayer); if (routeLayerMini) mini.removeLayer(routeLayerMini);
      let startLoc = State.userLatLng; if (!startLoc) { if (!document.getElementById('gpsBtn').classList.contains('on-blue')) GPS.toggle(); startLoc = map.getCenter(); }
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc.lng},${startLoc.lat};${destLng},${destLat}?overview=full&geometries=geojson`);
        const data = await res.json(); const route = data.routes[0]; const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const mkRoute = () => L.featureGroup([ L.polyline(coordinates, { color:'#ffffff', weight:7, opacity:.9 }), L.polyline(coordinates, { color:'#1d4ed8', weight:4, opacity:1 }) ]);
        routeLayer = mkRoute().addTo(map); routeLayerMini = mkRoute().addTo(mini); map.fitBounds(routeLayer.getBounds(), { padding:[50,50] });
        Toast.show(`Distance: ${(route.distance/1000).toFixed(2)} km<br>Duration: ${Math.round(route.duration/60)} mins`, 'ok');
      } catch (err) { Toast.show('Routing failed', 'error'); }
    };

    return { trigger, toggleErase, toggleEdit, clearAll, _deleteNote, toggleRouteMode, drawShortestRoute, navigateExternal: (lat, lng) => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank') };
  })();

  const FMB = (() => {
    let overlay = null, overlayMini = null, imgData = '';
    let lat = 0, lng = 0, w = 0.0025, h = 0.0025, angle = 0; let touchStart = null, pinchDist = 0, pinchCenter = null; let startLat = 0, startLng = 0, startW = 0, startH = 0;

    document.getElementById('uploadFMB').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return; e.target.value = '';
      try {
        if (file.type === 'application/pdf') {
          const buf = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument(new Uint8Array(buf)).promise; const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale:2 }); const cvs = Object.assign(document.createElement('canvas'), { width:vp.width, height:vp.height });
          await page.render({ canvasContext:cvs.getContext('2d'), viewport:vp }).promise; imgData = cvs.toDataURL('image/png');
        } else if (file.type.startsWith('image/')) {
          imgData = await new Promise((res, rej) => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.onerror = rej; r.readAsDataURL(file); });
        } else { Toast.show('Please provide JPG/PNG/PDF', 'warn'); return; }
      } catch (err) { Toast.show(`Error: ${err.message}`, 'error'); return; }
      const c = map.getCenter(); lat = c.lat; lng = c.lng; angle = 0; w = 0.0025; h = 0.0025; render();
      document.getElementById('fmbTools').style.display = 'flex'; Toast.show('FMB loaded', 'ok'); showUI();
    });

    const render = () => {
      if (!imgData) return;
      const bounds = L.latLngBounds([lat - h/2, lng - w/2], [lat + h/2, lng + w/2]);
      if (overlay) map.removeLayer(overlay); if (overlayMini) mini.removeLayer(overlayMini);
      const mkSvg = () => {
        const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('xmlns', ns); svg.setAttribute('viewBox', '0 0 100 100');
        const img = document.createElementNS(ns, 'image'); img.setAttribute('width','100'); img.setAttribute('height','100'); img.setAttributeNS('http://www.w3.org/1999/xlink','href',imgData); img.setAttribute('href', imgData); img.setAttribute('transform', `rotate(${angle} 50 50)`); svg.appendChild(img); return svg;
      };
      const op = parseFloat(document.getElementById('fmbOpacity').value);
      overlay = L.svgOverlay(mkSvg(), bounds, { pane:'overlayPane', opacity:op, interactive:false }).addTo(map);
      overlayMini = L.svgOverlay(mkSvg(), bounds, { opacity:op, interactive:false }).addTo(mini);
    };

    document.getElementById('fmbOpacity').addEventListener('input', e => { overlay?.setOpacity(+e.target.value); overlayMini?.setOpacity(+e.target.value); e.target.style.background = `linear-gradient(to right, var(--accent) ${e.target.value*100}%, var(--surface-3) ${e.target.value*100}%)`; });

    const ACTIONS = { up: () => lat += step(), down: () => lat -= step(), left: () => lng -= step(), right: () => lng += step(), zoomin: () => { w*=1.05; h*=1.05; }, zoomout: () => { w*=0.95; h*=0.95; }, rotL: () => angle -= 1.5, rotR: () => angle += 1.5 };
    const step = () => 0.000015 * Math.max(1, 22 - map.getZoom());
    const adjust = action => { if (!overlay) return; ACTIONS[action]?.(); render(); };
    const remove = async () => {
      if (!overlay) return; const ok = await Modal.confirm('Remove FMB?'); if (!ok) return;
      map.removeLayer(overlay); overlay = null; mini.removeLayer(overlayMini); overlayMini = null; imgData = ''; document.getElementById('fmbTools').style.display = 'none';
      if (State.touchMove) toggleTouch(); Toast.show('FMB removed', 'info'); setTimeout(() => UI.syncMinimize(), 50);
    };

    const toggleTouch = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); State.touchMove = !State.touchMove; const btn = document.getElementById('touchMoveBtn');
      if (State.touchMove) { map.dragging.disable(); map.touchZoom.disable(); btn.classList.add('on-accent'); Ribbon.setTool('FMB Move'); } 
      else { map.dragging.enable(); map.touchZoom.enable(); btn.classList.remove('on-accent'); Ribbon.setTool(null); }
      setTimeout(() => UI.syncMinimize(), 50);
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

    return { adjust, remove, toggleTouch, getGeoRef: () => overlay ? { lat, lng, w, h, angle } : null, getImageData: () => overlay ? imgData : null };
  })();

  const IO = (() => {
    const dataURLtoBlob = (dataURL) => { const [header, base64] = dataURL.split(','); const mimeMatch = header.match(/data:(.*?);base64/); const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg'; const binary = atob(base64); const arr = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i); return { blob: new Blob([arr], { type: mime }), mime }; };
    const buildTracedKmlBody = () => {
      let body = '';
      drawnItems.eachLayer(l => {
        const isPolygon = l instanceof L.Polygon; const rawLlngs = l.getLatLngs ? l.getLatLngs() : null; const pts = rawLlngs ? (Array.isArray(rawLlngs[0]) ? rawLlngs[0] : rawLlngs) : [l.getLatLng()];
        if (isPolygon) {
          const ring = [...pts, pts[0]]; body += '<Placemark><Style><PolyStyle><color>803399FF</color><fill>1</fill><outline>1</outline></PolyStyle><LineStyle><color>ff3399FF</color><width>2</width></LineStyle></Style><Polygon><outerBoundaryIs><LinearRing><coordinates>';
          ring.forEach(p => body += `${p.lng},${p.lat},0 `); body += '</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>';
        } else {
          body += '<Placemark><Style><LineStyle><color>ff3399FF</color><width>2</width></LineStyle></Style><LineString><coordinates>';
          pts.forEach(p => body += `${p.lng},${p.lat},0 `); body += '</coordinates></LineString></Placemark>';
        }
      }); return body;
    };
    return {
      exportKMZ: async () => {
        const fmbRef = FMB.getGeoRef(), imgData = FMB.getImageData(); if (!fmbRef || !imgData) { Toast.show('Load FMB first', 'warn'); return; }
        const { blob: imgBlob, mime } = dataURLtoBlob(imgData); const { lat, lng, w, h, angle } = fmbRef;
        const south = lat-h/2, north = lat+h/2, west = lng-w/2, east = lng+w/2;
        let kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>FMB Map</name><GroundOverlay><name>FMB GeoReference</name><Icon><href>files/fmb.png</href></Icon><LatLonBox><north>${north.toFixed(8)}</north><south>${south.toFixed(8)}</south><east>${east.toFixed(8)}</east><west>${west.toFixed(8)}</west><rotation>${(-angle).toFixed(4)}</rotation></LatLonBox></GroundOverlay>${buildTracedKmlBody()}</Document></kml>`;
        try { const zip = new JSZip(); zip.file('doc.kml', kml); zip.file('files/fmb.png', imgBlob); const content = await zip.generateAsync({ type: 'blob' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(content), download: 'Map.kmz' }); a.click(); Toast.show('KMZ exported', 'ok'); } catch (err) { Toast.show('Error', 'error'); }
      },
      exportGeoImage: async () => {
        const fmbRef = FMB.getGeoRef(), imgData = FMB.getImageData(); if (!fmbRef || !imgData) { Toast.show('Load FMB first', 'warn'); return; }
        try {
          const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = imgData; });
          const pxW = im.naturalWidth, pxH = im.naturalHeight, { lat, lng, w, h, angle } = fmbRef;
          const theta = angle * Math.PI / 180, A0 = w / pxW, E0 = -(h / pxH), cosT = Math.cos(theta), sinT = Math.sin(theta), ox = 0.5 - pxW / 2, oy = 0.5 - pxH / 2;
          const A = cosT*A0, D = -sinT*A0, B = sinT*E0, E = cosT*E0, C = lng + cosT*ox*A0 + sinT*oy*E0, F = lat + (-sinT*ox*A0 + cosT*oy*E0);
          const worldFile = [A, D, B, E, C, F].map(v => v.toFixed(12)).join('\n');
          const prj = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]';
          const { blob: imgBlob } = dataURLtoBlob(imgData);
          const zip = new JSZip(); zip.file(`FMB.png`, imgBlob); zip.file(`FMB.pgw`, worldFile); zip.file(`FMB.prj`, prj);
          const content = await zip.generateAsync({ type: 'blob' }); const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(content), download: 'GeoImage.zip' }); a.click(); Toast.show('Geo-JPEG exported', 'ok');
        } catch (err) { Toast.show('Error', 'error'); }
      },
      exportKML: () => {
        let kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>`;
        const fmbRef = FMB.getGeoRef();
        if (fmbRef) { const { lat, lng, w, h, angle } = fmbRef; kml += `<GroundOverlay><name>FMB</name><Icon><href>fmb.png</href></Icon><LatLonBox><north>${(lat+h/2).toFixed(8)}</north><south>${(lat-h/2).toFixed(8)}</south><east>${(lng+w/2).toFixed(8)}</east><west>${(lng-w/2).toFixed(8)}</west><rotation>${(-angle).toFixed(4)}</rotation></LatLonBox></GroundOverlay>`; }
        kml += buildTracedKmlBody() + '</Document></kml>';
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([kml], { type:'application/vnd.google-earth.kml+xml' })), download: 'Map.kml' }); a.click(); Toast.show('KML exported', 'ok');
      }
    };
  })();

  document.getElementById('uploadFile').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = ev => { try { if (file.name.endsWith('.kml')) { const k = omnivore.kml.parse(ev.target.result).addTo(map); k.on('ready', () => { map.fitBounds(k.getBounds()); Toast.show('Loaded', 'ok'); }); } else { const j = L.geoJSON(JSON.parse(ev.target.result)).addTo(map); map.fitBounds(j.getBounds()); Toast.show('Loaded', 'ok'); } } catch { Toast.show('Error', 'error'); } };
    reader.readAsText(file);
  });

  window.GIS = { Layers, Search, GPS, Draw, FMB, UI, IO };

  map.whenReady(() => {
    const splash = document.getElementById('splash'); splash.classList.add('gone'); setTimeout(() => splash.remove(), 400); showUI();
    const btn = document.querySelector(`#content-layers button[title="Hybrid"]`); if(btn) btn.classList.add('on-saffron');
    const cadBtn = document.getElementById('btnCad'); if(cadBtn) cadBtn.classList.add('on-saffron'); Ribbon.update();
    window.onBackPressed = function() {
      if (document.getElementById('toolPanel').classList.contains('active')) { UI.closeMenu(); return true; }
      if (map.pm && map.pm.GlobalDrawMode) { map.pm.disableDraw(); State.drawing = false; Ribbon.setTool(null); return true; }
      if (State.editMode) { Draw.toggleEdit(); return true; }
      if (State.eraseMode) { Draw.toggleErase(); return true; }
      if (State.routeMode) { Draw.toggleRouteMode(); return true; }
      if (State.touchMove) { FMB.toggleTouch(); return true; }
      return false;
    };
  });
})();