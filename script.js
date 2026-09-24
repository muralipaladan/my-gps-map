const GIS = {
  map: null,

  init: function () {
    // Initialize Leaflet Map
    this.map = L.map('map', { zoomControl: false }).setView([11.1926, 76.2236], 15);

    // Base Layers
    this.Layers.baseLayers = {
      hybrid: L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 22 }),
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
    };
    this.Layers.baseLayers.hybrid.addTo(this.map);

    // WMS Cadastral Layer Setup with Dark Black Text Filter
    this.Layers.cadastralLayer = L.tileLayer.wms('https://bhuvan-vec1.nrsc.gov.in/bhuvan/gwc/service/wms', {
      layers: 'kerala:kerala_cadastral',
      format: 'image/png',
      transparent: true,
      className: 'wms-black-layer',
      maxZoom: 22
    });

    // Initialize Geoman Controls
    this.map.pm.addControls({
      position: 'topleft',
      drawCircleMarker: false,
      rotateMode: false
    });
    this.map.pm.toggleControls(); // Hidden by default, triggered via ribbon
  }
};

/* MAP CONTROLS MODULE */
GIS.MapCtrl = {
  zoomIn: () => GIS.map.zoomIn(),
  zoomOut: () => GIS.map.zoomOut(),
  searchLocation: function () {
    const q = document.getElementById('searchInput').value;
    if (!q) return;
    if (q.includes(',')) {
      const [lat, lng] = q.split(',').map(n => parseFloat(n.trim()));
      if (!isNaN(lat) && !isNaN(lng)) {
        GIS.map.setView([lat, lng], 18);
      }
    }
  }
};

/* UI MODULE */
GIS.UI = {
  toggleMore: function () {
    const rb = document.getElementById('toolRibbon');
    rb.style.display = rb.style.display === 'none' ? 'flex' : 'none';
  },
  showRibbonPage: function (pageId) {
    document.querySelectorAll('.ribbon-page').forEach(p => p.classList.remove('active'));
    if (pageId === 'main') document.getElementById('pageMain').classList.add('active');
    if (pageId === 'draw') document.getElementById('pageDraw').classList.add('active');
    if (pageId === 'fmb') document.getElementById('pageFMB').classList.add('active');
    if (pageId === 'layers') document.getElementById('pageLayers').classList.add('active');
  }
};

/* LAYERS MODULE */
GIS.Layers = {
  baseLayers: {},
  cadastralLayer: null,
  isCadVisible: false,

  setBase: function (type) {
    Object.values(this.baseLayers).forEach(l => GIS.map.removeLayer(l));
    if (this.baseLayers[type]) this.baseLayers[type].addTo(GIS.map);
  },

  toggleCadastral: function () {
    if (this.isCadVisible) {
      GIS.map.removeLayer(this.cadastralLayer);
      this.isCadVisible = false;
    } else {
      this.cadastralLayer.addTo(GIS.map);
      this.isCadVisible = true;
    }
  }
};

/* FMB PRECISION ENGINE */
GIS.FMB = {
  overlay: null,
  center: null,
  angle: 0,
  scale: 1,
  opacity: 0.85,

  // Micro Precision Steps
  rotStep: 0.1,        // Default 0.1 degree
  moveStep: 0.00001,   // Default ~1 meter

  setRotStep: function (val) {
    this.rotStep = parseFloat(val);
  },

  setMoveStep: function (val) {
    this.moveStep = parseFloat(val);
  },

  handleFileUpload: function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imgUrl = event.target.result;
      this.center = GIS.map.getCenter();
      
      const bounds = this.getCalculatedBounds();
      if (this.overlay) GIS.map.removeLayer(this.overlay);

      this.overlay = L.imageOverlay(imgUrl, bounds, { opacity: this.opacity, interactive: true }).addTo(GIS.map);
      this.angle = 0;
      this.scale = 1;
      this.updateTransform();
      GIS.UI.showRibbonPage('fmb');
    };
    reader.readAsDataURL(file);
  },

  adjust: function (action) {
    if (!this.overlay) return;

    switch (action) {
      // High Precision Rotations
      case 'rotL':
        this.angle = (this.angle - this.rotStep + 360) % 360;
        break;
      case 'rotR':
        this.angle = (this.angle + this.rotStep) % 360;
        break;

      // Micro Position Shift
      case 'up':
        this.center.lat += this.moveStep;
        break;
      case 'down':
        this.center.lat -= this.moveStep;
        break;
      case 'left':
        this.center.lng -= this.moveStep;
        break;
      case 'right':
        this.center.lng += this.moveStep;
        break;

      // Scale & Opacity
      case 'zoomin':
        this.scale *= 1.01;
        break;
      case 'zoomout':
        this.scale /= 1.01;
        break;
      case 'opPlus':
        this.opacity = Math.min(1, this.opacity + 0.05);
        break;
      case 'opMinus':
        this.opacity = Math.max(0.1, this.opacity - 0.05);
        break;
    }

    this.updateTransform();
  },

  updateTransform: function () {
    if (!this.overlay) return;

    // Update Bounds based on Shift
    this.overlay.setBounds(this.getCalculatedBounds());

    // Apply CSS Transform for Rotation & Scaling
    const imgElement = this.overlay.getElement();
    if (imgElement) {
      imgElement.style.transformOrigin = 'center center';
      imgElement.style.transform = `rotate(${this.angle}deg) scale(${this.scale})`;
      imgElement.style.opacity = this.opacity;
    }
  },

  getCalculatedBounds: function () {
    const span = 0.0015 * this.scale;
    return L.latLngBounds(
      [this.center.lat - span, this.center.lng - span],
      [this.center.lat + span, this.center.lng + span]
    );
  },

  remove: function () {
    if (this.overlay) {
      GIS.map.removeLayer(this.overlay);
      this.overlay = null;
    }
  }
};

/* DRAWING TOOLS MODULE */
GIS.Draw = {
  trigger: function (type) {
    if (type === 'Marker') GIS.map.pm.enableDraw('Marker');
    if (type === 'Line') GIS.map.pm.enableDraw('Line');
    if (type === 'Polygon') GIS.map.pm.enableDraw('Polygon');
  },
  clearAll: function () {
    GIS.map.eachLayer((layer) => {
      if (layer instanceof L.Path || layer instanceof L.Marker) {
        if (layer !== GIS.Layers.cadastralLayer) {
          GIS.map.removeLayer(layer);
        }
      }
    });
  }
};

/* GPS MODULE */
GIS.GPS = {
  active: false,
  watchId: null,

  toggle: function () {
    if (this.active) {
      navigator.geolocation.clearWatch(this.watchId);
      this.active = false;
      alert("GPS Turned Off");
    } else {
      this.watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          GIS.map.setView([latitude, longitude], 19);
        },
        (err) => alert("GPS Error: " + err.message),
        { enableHighAccuracy: true }
      );
      this.active = true;
    }
  }
};

// Initialize Map on Load
window.onload = () => GIS.init();