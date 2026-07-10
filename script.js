'use strict';

(() => {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

  const STORAGE_KEY   = 'murali_gis_v12';
  const BHUVAN_URL    = 'https://bhuvan-panchayat3.nrsc.gov.in/geoserver/gwc/service/wms';
  const KSREC_URL     = 'https://ksrec.in/geoserver/Kerala/wms';
  const DEFAULT_VIEW  = { lat: 11.196, lng: 76.227, zoom: 16 };

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

  const State = { drawing: false, eraseMode: false, editMode: false, touchMove: false, routeMode: false, userLatLng: null, activeLayer: 'Hybrid', activeTool: null };

  const updateStatus = () => {
    document.getElementById('statusText').textContent = State.activeTool ? State.activeTool : State.activeLayer;
  };

  const map = L.map('map', { center:[DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], zoom:DEFAULT_VIEW.zoom, zoomControl:false, tap:false });
  const baseLayers = {
    hybrid: L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map),
    road: L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] }),
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:22 })
  };

  map.pm.setGlobalOptions({ snappable:true, snapDistance:25, snapMiddle:true, layerGroup:map, hintMarkerStyle: { opacity: 0, fillOpacity: 0 }, templineStyle: { color: '#FF9933' } });
  map.createPane('cadastralPane'); Object.assign(map.getPane('cadastralPane').style, { zIndex:'600', pointerEvents:'none' });

  const WMS_BASE = { format:'image/png', transparent:true, maxZoom:22, tileSize:512, zoomOffset:-1, pane:'cadastralPane', className:'parcel-red' };
  const wmsLayers = {
    village: L.tileLayer.wms(BHUVAN_URL, { ...WMS_BASE, layers:'v3:village' }),
    cadastral: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:Cadastry_Kerala' }).addTo(map),
    parcelKCH: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KCH_Survey_Parcel_acpc' }),
    parcelKKD: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KKD_Survey_Parcel_acpc' }),
    parcelKLM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_KLM_Survey_Parcel_acpc' }),
    parcelTCR: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TCR_Survey_Parcel_acpc' }),
    parcelTVM: L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, layers:'Kerala:KSUDP_TVM_Survey_Parcel_acpc' }),
  };
  State.activeLayer = 'Cadastral'; updateStatus();

  const mini = L.map('zoomBox', { attributionControl:false, zoomControl:false, dragging:false, touchZoom:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, layers:[L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom:22, subdomains:['mt0','mt1','mt2','mt3'] })] });
  mini.createPane('miniCadastral'); Object.assign(mini.getPane('miniCadastral').style, { zIndex:'600', pointerEvents:'none' });
  L.tileLayer.wms(KSREC_URL, { ...WMS_BASE, pane:'miniCadastral', layers:'Kerala:Cadastry_Kerala' }).addTo(mini);

  const drawnItems = new L.FeatureGroup().addTo(map), drawnItemsMini = new L.FeatureGroup().addTo(mini);
  const vectorSync = {}; let routeLayer = null, routeLayerMini = null;

  /* ── UI MODULE (Vertical Sidebar Accordion) ── */
  const UI = {
    toggleCat(id) {
      const sub = document.getElementById('sub-'+id);
      const cat = document.getElementById('cat-'+id);
      const isOpen = sub.classList.contains('open');
      
      document.querySelectorAll('.menu-sub').forEach(el => el.classList.remove('open'));
      document.querySelectorAll('.menu-cat').forEach(el => el.classList.remove('active'));
      
      if (!isOpen) { sub.classList.add('open'); cat.classList.add('active'); }
    }
  };

  const Layers = {
    setBase(key) {
      Object.values(baseLayers).forEach(l => map.removeLayer(l)); map.addLayer(baseLayers[key]);
      const titles = { hybrid: 'HYB', road: 'ROD', osm: 'OSM' };
      document.querySelectorAll('#sub-layers .mb').forEach(b => { if(['HYB','ROD','OSM'].includes(b.textContent)) b.classList.remove('on-saffron'); });
      document.querySelector(`#sub-layers button[title="${document.querySelector(`button[onclick*="'${key}'"]`).title}"]`).classList.add('on-saffron');
      State.activeLayer = titles[key]; updateStatus(); Toast.show(`${titles[key]} Layer Active`);
    },
    toggleWms(type) {
      const layer = wmsLayers[type];
      const NAMES = { village:'VIL', cadastral:'CAD', parcelKCH:'KCH', parcelKKD:'KKD', parcelKLM:'KLM', parcelTCR:'TCR', parcelTVM:'TVM' };
      const btn = document.querySelector(`button[onclick*="'${type}'"]`);
      if (map.hasLayer(layer)) { map.removeLayer(layer); btn.classList.remove('on-saffron'); Toast.show(`${NAMES[type]} hidden`); } 
      else { map.addLayer(layer); btn.classList.add('on-saffron'); State.activeLayer = NAMES[type]; updateStatus(); Toast.show(`${NAMES[type]} active`); }
    }
  };

  const Search = (() => {
    let marker = null;
    const execute = async () => {
      const raw = document.getElementById('searchInput').value.trim(); if (!raw) return;
      if (marker) map.removeLayer(marker); document.getElementById('searchBar').classList.add('collapsed');
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
    const start = () => { if (navigator.geolocation) watchId = navigator.geolocation.watchPosition(onLocationUpdate, ()=>{}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }); };
    const stop = () => { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } if (userMarker) { map.removeLayer(userMarker); map.removeLayer(ring); mini.removeLayer(userMarkerMini); mini.removeLayer(ringMini); userMarker=null; ring=null; userMarkerMini=null; ringMini=null; } };
    const toggle = () => {
      const btn = document.getElementById('gpsBtn');
      if (!active) { active = true; btn.classList.add('on-blue'); start(); Toast.show('GPS Active', 'ok'); }
      else { active = false; btn.classList.remove('on-blue'); stop(); Toast.show('GPS Stopped', 'info'); }
    };
    return { toggle };
  })();

  const Draw = (() => {
    const savedNotes = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const pinGroup = L.layerGroup().addTo(map), pinGroupMini = L.layerGroup().addTo(mini);
    map.pm.addControls({ drawMarker:false, drawPolygon:false, drawPolyline:false, editMode:false, dragMode:false, cutPolygon:false, removalMode:false });

    const renderNotes = () => {
      pinGroup.clearLayers(); pinGroupMini.clearLayers();
      savedNotes.forEach((p, i) => {
        L.marker([p.lat, p.lng]).addTo(pinGroup).bindPopup(`<b>📍 Note</b><br>${p.text}<button class="p-nav" style="background:var(--blue);" onclick="GIS.Draw.drawShortestRoute(${p.lat}, ${p.lng})">Route</button><button class="p-del" onclick="GIS.Draw._deleteNote(${i})">Delete</button>`);
        L.marker([p.lat, p.lng]).addTo(pinGroupMini);
      });
    }; renderNotes();

    const clearHighlights = () => ['lineBtn','polygonBtn','markerBtn'].forEach(id => { document.getElementById(id)?.classList.remove('on-accent'); });

    const trigger = (toolType) => {
      if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      const wasActive = map.pm.GlobalDrawMode === toolType; clearHighlights();
      if (wasActive) { map.pm.disableDraw(); State.activeTool=null; }
      else { map.pm.enableDraw(toolType, { hintMarkerStyle: { opacity: 0, fillOpacity: 0 } }); const id = { Line:'lineBtn', Polygon:'polygonBtn', Marker:'markerBtn' }[toolType]; document.getElementById(id).classList.add('on-accent'); State.activeTool = toolType.toUpperCase(); }
      updateStatus();
    };

    map.on('pm:globaldrawmodetoggled', e => { if (!e.enabled) clearHighlights(); });
    let workingLayerMini = null;
    map.on('pm:drawstart', (e) => {
      State.drawing = true;
      if (e.workingLayer) {
        if (workingLayerMini) mini.removeLayer(workingLayerMini);
        const shape = map.pm.Draw.getActiveShape(), style = { color: '#FF9933', weight: 4, dashArray: '5, 5' };
        if (shape === 'Polygon' || shape === 'Rectangle') workingLayerMini = L.polygon([], style).addTo(mini); else if (shape === 'Line') workingLayerMini = L.polyline([], style).addTo(mini);
        const syncWorkingLayer = () => { if (workingLayerMini && e.workingLayer.getLatLngs) { try { workingLayerMini.setLatLngs(e.workingLayer.getLatLngs()); } catch (err) {} } };
        e.workingLayer.on('pm:vertexadded pm:vertexremoved', syncWorkingLayer); map.on('mousemove', syncWorkingLayer);
      }
    });
    map.on('pm:drawend', () => { State.drawing = false; if (workingLayerMini) { mini.removeLayer(workingLayerMini); workingLayerMini = null; } });
    
    map.on('pm:create', e => {
      const { layer, shape } = e;
      if (shape === 'Marker') {
        const txt = prompt('Save Note:');
        if (txt) { savedNotes.push({ lat:layer.getLatLng().lat, lng:layer.getLatLng().lng, text:txt }); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); Toast.show('Note saved', 'ok'); }
        map.removeLayer(layer); document.getElementById('markerBtn').classList.remove('on-accent'); State.activeTool=null; updateStatus(); return;
      }
      drawnItems.addLayer(layer);
      if (shape === 'Polygon' || shape === 'Rectangle') {
        layer.setStyle({ color: '#FF9933', fillColor: '#FF9933', fillOpacity: 0.15, weight: 2.5 });
        const updateAreaPopup = () => { const area = L.GeometryUtil.geodesicArea(layer.getLatLngs()[0]); const popupContent = `<b>Area</b><br>${(area * 0.000247105).toFixed(3)} ac`; if (layer.getPopup()) layer.setPopupContent(popupContent); else layer.bindPopup(popupContent).openPopup(); };
        updateAreaPopup(); layer.on('pm:edit pm:markerdragend pm:vertexadded pm:vertexremoved', updateAreaPopup);
      }

      const origId = L.stamp(layer); const style = { color: shape === 'Line' ? (layer.options.color || '#FF9933') : '#FF9933', fillColor: '#FF9933', fillOpacity: 0.15, weight: layer.options.weight || 2.5 };
      let miniL; if (shape === 'Line') miniL = L.polyline(layer.getLatLngs(), { color: layer.options.color || '#FF9933', weight: layer.options.weight || 3 }).addTo(drawnItemsMini); else miniL = L.polygon(layer.getLatLngs(), style).addTo(drawnItemsMini);
      if (miniL) { vectorSync[origId] = L.stamp(miniL); layer.on('pm:edit pm:markerdrag', () => { const ml = drawnItemsMini.getLayer(vectorSync[L.stamp(layer)]); if (ml) ml.setLatLngs(layer.getLatLngs()); }); }
      document.getElementById('lineBtn').classList.remove('on-accent'); document.getElementById('polygonBtn').classList.remove('on-accent'); State.activeTool=null; updateStatus();
    });

    drawnItems.on('layerremove', e => { const oid = L.stamp(e.layer); const ml = drawnItemsMini.getLayer(vectorSync[oid]); if (ml) drawnItemsMini.removeLayer(ml); delete vectorSync[oid]; });

    const toggleErase = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalRemovalMode(); State.eraseMode = map.pm.globalRemovalModeEnabled(); const btn = document.getElementById('eraseModeBtn');
      if (State.eraseMode) { btn.classList.add('on-accent'); State.activeTool='ERASE'; Toast.show('Tap shape to erase', 'warn'); } 
      else { btn.classList.remove('on-accent'); State.activeTool=null; } updateStatus();
    };

    const toggleEdit = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.eraseMode) toggleErase(); if (State.routeMode) toggleRouteMode();
      map.pm.toggleGlobalEditMode(); State.editMode = map.pm.globalEditModeEnabled(); const btn = document.getElementById('editBtn');
      if (State.editMode) { btn.classList.add('on-accent'); State.activeTool='EDIT'; Toast.show('Drag nodes to reshape', 'info'); } 
      else { btn.classList.remove('on-accent'); State.activeTool=null; } updateStatus();
    };

    const clearAll = async () => {
      const ok = await Modal.confirm('Clear all drawings?'); if (!ok) return;
      drawnItems.clearLayers(); drawnItemsMini.clearLayers(); Object.keys(vectorSync).forEach(k => delete vectorSync[k]);
      map.eachLayer(l => { if (l.pm && l instanceof L.Path) map.removeLayer(l); });
      if (State.eraseMode) toggleErase(); if (State.editMode) toggleEdit(); if (routeLayerMini) mini.removeLayer(routeLayerMini);
      Toast.show('Cleared', 'ok');
    };

    const toggleRouteMode = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); if (State.editMode) toggleEdit(); if (State.eraseMode) toggleErase();
      State.routeMode = !State.routeMode; const btn = document.getElementById('routeModeBtn');
      if (State.routeMode) { btn.classList.add('on-accent'); State.activeTool='ROUTE'; Toast.show('Tap map to route', 'info'); } 
      else { btn.classList.remove('on-accent'); State.activeTool=null; if (routeLayer) map.removeLayer(routeLayer); if (routeLayerMini) mini.removeLayer(routeLayerMini); }
      updateStatus();
    };

    const drawShortestRoute = async (destLat, destLng) => {
      if (routeLayer) map.removeLayer(routeLayer); if (routeLayerMini) mini.removeLayer(routeLayerMini);
      let startLoc = State.userLatLng; if (!startLoc) { if (!document.getElementById('gpsBtn').classList.contains('on-blue')) GPS.toggle(); startLoc = map.getCenter(); }
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${startLoc.lng},${startLoc.lat};${destLng},${destLat}?overview=full&geometries=geojson`);
        const data = await res.json(); const route = data.routes[0]; const coordinates = route.geometry.coordinates.map(c => [c[1], c[0]]);
        const mkRoute = () => L.featureGroup([ L.polyline(coordinates, { color:'#ffffff', weight:7 }), L.polyline(coordinates, { color:'#1d4ed8', weight:4 }) ]);
        routeLayer = mkRoute().addTo(map); routeLayerMini = mkRoute().addTo(mini); map.fitBounds(routeLayer.getBounds(), { padding:[50,50] });
        Toast.show(`${(route.distance/1000).toFixed(2)} km · ${Math.round(route.duration/60)} mins`, 'ok');
      } catch (err) { Toast.show('Routing failed', 'error'); }
    };

    return { trigger, toggleErase, toggleEdit, clearAll, _deleteNote: i => { savedNotes.splice(i, 1); localStorage.setItem(STORAGE_KEY, JSON.stringify(savedNotes)); renderNotes(); }, toggleRouteMode, drawShortestRoute };
  })();

  const FMB = (() => {
    let overlay = null, overlayMini = null, imgData = '';
    let lat = 0, lng = 0, w = 0.0025, h = 0.0025, angle = 0, currentOpacity = 0.6;
    let touchStart = null, pinchDist = 0, pinchCenter = null; let startLat = 0, startLng = 0, startW = 0, startH = 0;

    document.getElementById('uploadFMB').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return; e.target.value = '';
      try {
        if (file.type === 'application/pdf') {
          const buf = await file.arrayBuffer(); const pdf = await pdfjsLib.getDocument(new Uint8Array(buf)).promise; const page = await pdf.getPage(1);
          const vp = page.getViewport({ scale:2 }); const cvs = Object.assign(document.createElement('canvas'), { width:vp.width, height:vp.height });
          await page.render({ canvasContext:cvs.getContext('2d'), viewport:vp }).promise; imgData = cvs.toDataURL('image/png');
        } else if (file.type.startsWith('image/')) {
          imgData = await new Promise((res, rej) => { const r = new FileReader(); r.onload = ev => res(ev.target.result); r.onerror = rej; r.readAsDataURL(file); });
        } else { Toast.show('Provide JPG/PNG/PDF', 'warn'); return; }
      } catch (err) { Toast.show(`Error: ${err.message}`, 'error'); return; }
      const c = map.getCenter(); lat = c.lat; lng = c.lng; angle = 0; w = 0.0025; h = 0.0025; render();
      document.getElementById('fmbTools').style.display = 'flex'; Toast.show('FMB loaded', 'ok');
    });

    const changeOpacity = (val) => { currentOpacity = Math.max(0.1, Math.min(1.0, currentOpacity + val)); if(overlay) overlay.setOpacity(currentOpacity); if(overlayMini) overlayMini.setOpacity(currentOpacity); };

    const render = () => {
      if (!imgData) return; const bounds = L.latLngBounds([lat - h/2, lng - w/2], [lat + h/2, lng + w/2]);
      if (overlay) map.removeLayer(overlay); if (overlayMini) mini.removeLayer(overlayMini);
      const mkSvg = () => {
        const ns = 'http://www.w3.org/2000/svg'; const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('xmlns', ns); svg.setAttribute('viewBox', '0 0 100 100');
        const img = document.createElementNS(ns, 'image'); img.setAttribute('width','100'); img.setAttribute('height','100'); img.setAttributeNS('http://www.w3.org/1999/xlink','href',imgData); img.setAttribute('href', imgData); img.setAttribute('transform', `rotate(${angle} 50 50)`); svg.appendChild(img); return svg;
      };
      overlay = L.svgOverlay(mkSvg(), bounds, { pane:'overlayPane', opacity:currentOpacity, interactive:false }).addTo(map);
      overlayMini = L.svgOverlay(mkSvg(), bounds, { opacity:currentOpacity, interactive:false }).addTo(mini);
    };

    const ACTIONS = { up: () => lat += step(), down: () => lat -= step(), left: () => lng -= step(), right: () => lng += step(), zoomin: () => { w*=1.05; h*=1.05; }, zoomout: () => { w*=0.95; h*=0.95; }, rotL: () => angle -= 1.5, rotR: () => angle += 1.5, opPlus: () => changeOpacity(0.1), opMinus: () => changeOpacity(-0.1) };
    const step = () => 0.000015 * Math.max(1, 22 - map.getZoom());
    const adjust = action => { if (!overlay) return; ACTIONS[action]?.(); render(); };
    const remove = async () => {
      if (!overlay) return; const ok = await Modal.confirm('Remove FMB?'); if (!ok) return;
      map.removeLayer(overlay); overlay = null; mini.removeLayer(overlayMini); overlayMini = null; imgData = ''; document.getElementById('fmbTools').style.display = 'none';
      if (State.touchMove) toggleTouch(); Toast.show('FMB removed', 'info');
    };

    const toggleTouch = () => {
      if (map.pm.GlobalDrawMode) map.pm.disableDraw(); State.touchMove = !State.touchMove; const btn = document.getElementById('touchMoveBtn');
      if (State.touchMove) { map.dragging.disable(); map.touchZoom.disable(); btn.classList.add('on-accent'); State.activeTool='MOVE FMB'; } 
      else { map.dragging.enable(); map.touchZoom.enable(); btn.classList.remove('on-accent'); State.activeTool=null; }
      updateStatus();
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
    
    return { adjust, remove, toggleTouch, getGeoRef: () => overlay ? { lat, lng, w, h, angle } : null, getImageData: () => overlay ? imgData : null };
  })();

  const IO = (() => {
    return {
      exportKML: () => { Toast.show('KML Download feature currently mapped to native code.', 'info'); }
    };
  })();

  window.GIS = { Layers, Search, GPS, Draw, FMB, UI, IO };

  map.whenReady(() => {
    document.getElementById('cat-layers').click();
  });
})();