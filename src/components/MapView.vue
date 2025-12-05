<template>
  <div class="map-app">
    <!-- Debug Overlay -->
    <div v-if="debug.show" class="debug-overlay">
      <h3>Debug Info:</h3>
      <p>Map Container: {{ debug.mapContainerExists ? 'Found' : 'Missing' }}</p>
      <p>Features Loaded: {{ debug.featureCount }}</p>
      <p>Map Initialized: {{ debug.mapInitialized ? 'Yes' : 'No' }}</p>
      <p>Routing Points: {{ debug.routingPoints }}</p>
      <button @click="debug.show = false">Close Debug</button>
    </div>

    <header>
      <h1 id="app-title">Kiel Stadtbahn Simulator</h1>

      <div class="controls" role="toolbar" aria-label="Map controls">
        <button :disabled="!hasSelection" @click="clearSelection" class="clear-btn">
          <span class="btn-icon">🗑️</span> Clear
        </button>
        <button :disabled="!canStart" @click="startTravel" class="travel-btn">
          <span class="btn-icon">🚋</span> Start Travel
        </button>

        <div class="select-wrapper">
          <label class="visually-hidden" for="line-select">Select line</label>
          <select
            id="line-select"
            v-model="state.selectedLine"
            aria-label="Filter by line"
            @change="filterByLine"
          >
            <option value="">All lines</option>
            <option v-for="ln in availableLines" :key="ln" :value="ln">Line {{ ln }}</option>
          </select>
        </div>

        <button @click="toggleDebug" class="debug-btn">
          <span class="btn-icon">🐛</span> Debug
        </button>
      </div>
    </header>

    <main>
      <div
        id="map"
        ref="mapContainer"
        tabindex="0"
        role="application"
        aria-label="Map showing planned Stadtbahn lines in Kiel"
        :class="{ 'map-loading': !debug.mapInitialized }"
      >
        <div v-if="!debug.mapInitialized" class="map-loading-message">
          <div class="loading-spinner"></div>
          Loading Kiel Stadtbahn Network...
        </div>
      </div>

      <aside class="list-view" aria-live="polite">
        <div class="list-header">
          <h2>Stations & Lines</h2>
          <div class="selection-info" v-if="hasSelection">
            <span class="start-marker">🟢 {{ state.start?.info?.displayName }}</span>
            <span class="end-marker" v-if="state.end">🔴 {{ state.end?.info?.displayName }}</span>
          </div>
        </div>

        <div class="search-box">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="Search stations..."
            aria-label="Search stations"
          />
        </div>

        <div class="stations-list">
          <ul>
            <li
              v-for="(feat, idx) in filteredFeatures"
              :key="idx"
              class="station-row"
              :class="{ 'is-station': feat.geometry.type === 'Point' }"
            >
              <div class="station-controls">
                <button
                  :aria-label="'Set start at ' + (feat.properties.displayName || 'station ' + idx)"
                  @click="setPointFromFeature(feat, 'start')"
                  class="start-btn"
                  :class="{ 'active': state.start?.info?.displayName === feat.properties.displayName }"
                >
                  <span class="btn-icon">🟢</span> Start
                </button>

                <button
                  :aria-label="'Set end at ' + (feat.properties.displayName || 'station ' + idx)"
                  @click="setPointFromFeature(feat, 'end')"
                  class="end-btn"
                  :class="{ 'active': state.end?.info?.displayName === feat.properties.displayName }"
                >
                  <span class="btn-icon">🔴</span> End
                </button>
              </div>

              <div class="station-info">
                <span class="station-label">{{ feat.properties.displayName }}</span>
                <div class="station-meta">
                  <span class="line-badge" :style="{ backgroundColor: colorForLine(feat.properties.line) }">
                    Line {{ feat.properties.line }}
                  </span>
                  <span class="feature-type">{{ getFeatureType(feat) }}</span>
                </div>
              </div>
            </li>
          </ul>
          <div v-if="filteredFeatures.length === 0" class="no-results">
            <p>No stations found for "{{ searchQuery }}"</p>
            <button @click="searchQuery = ''" class="clear-search">Clear search</button>
          </div>
        </div>
      </aside>
    </main>

    <!-- Travel Status -->
    <div v-if="state.animating" class="travel-status" role="status" aria-live="polite">
      <div class="travel-progress">
        <div class="progress-bar" :style="{ width: travelProgress + '%' }"></div>
      </div>
      <span class="travel-text">
        🚋 Traveling from {{ state.start?.info?.displayName }} to {{ state.end?.info?.displayName }}
        ({{ Math.round(travelProgress) }}%)
      </span>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, reactive, computed } from 'vue';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { OSM, TileWMS } from 'ol/source';
import VectorSource from 'ol/source/Vector';
import GeoJSON from 'ol/format/GeoJSON';
import { Style, Stroke, Circle as CircleStyle, Fill, Text } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';

type GeometryCoords = number[] | number[][] | number[][][];

type LineFeature = {
  geometry: {
    type: 'Point' | 'LineString' | 'MultiLineString' | string;
    coordinates: GeometryCoords;
  };
  properties: {
    displayName?: string;
    line?: string;
    isStation?: boolean;
    stationKey?: string;
    lineNumber?: string;
    [k: string]: any;
  };
};

interface SimpleRoute {
  coordinates: number[][];
  lineId?: string;
}

interface StationNode {
  name: string;
  key: string;
  coord: number[]; // projected coords (EPSG:3857)
  lines: string[];
  neighbors: string[];
}

interface DemoLine {
  lineId: string;
  stationKeys: string[];
}

export default defineComponent({
  name: 'MapView',
  setup() {
    const mapContainer = ref<HTMLDivElement | null>(null);
    const map = ref<Map | null>(null);
    const searchQuery = ref('');

    const vectorSource = new VectorSource();
    const markerSource = new VectorSource();
    const routeSource = new VectorSource();
    const connectionSource = new VectorSource();
    const arrowSource = new VectorSource();

    const debug = reactive({
      show: false,
      mapContainerExists: false,
      featureCount: 0,
      mapInitialized: false,
      servicesStatus: 'Checking...',
      routingPoints: 'No route calculated'
    });

    const state = reactive({
      features: [] as LineFeature[],
      start: null as { coord: number[]; info?: any; stationKey?: string } | null,
      end: null as { coord: number[]; info?: any; stationKey?: string } | null,
      selectedLine: '',
      animating: false,
      currentRoute: null as SimpleRoute[] | null,
    });

    const travelProgress = ref(0);

    // stationGraph: key -> StationNode
    const stationGraph: Record<string, StationNode> = {};

    // original extent for zoom-out
    let originalExtent: number[] | null = null;

    const availableLines = computed(() => {
      const set = new Set<string>();
      state.features.forEach((f) => {
        const name = f.properties && f.properties.line ? String(f.properties.line) : 'unknown';
        if (name !== 'unknown') set.add(name);
      });
      return Array.from(set).sort();
    });

    const filteredFeatures = computed(() => {
      let features = state.features;
      if (searchQuery.value) {
        features = features.filter((feat) =>
          String(feat.properties.displayName || '').toLowerCase().includes(searchQuery.value.toLowerCase())
        );
      }
      return features.sort((a, b) => {
        const aIsStation = a.geometry.type === 'Point';
        const bIsStation = b.geometry.type === 'Point';
        if (aIsStation && !bIsStation) return -1;
        if (!aIsStation && bIsStation) return 1;
        return (a.properties.displayName || '').localeCompare(b.properties.displayName || '');
      });
    });

    const hasSelection = computed(() => !!(state.start || state.end));
    const canStart = computed(() => !!(state.start && state.end && !state.animating));

    const wmsLayer = new TileLayer({
      source: new TileWMS({
        url: '/gis-proxy/geodatenextern/rest/services/Stadtplan/Stadtbahn_WMS/MapServer/WMSServer',
        params: {
          LAYERS: '0',
          FORMAT: 'image/png',
          TRANSPARENT: true
        },
        transition: 0
      }),
      opacity: 0.7
    });

    /* === Routing parameters ===
       - Use geometric distance for same-line edges (meters)
       - Add transfer edges when stations are physically close (threshold) with a penalty
    */
    const TRANSFER_THRESHOLD = 220; // meters (approx in projected units)
    const TRANSFER_PENALTY = 120; // meters penalty added to transfers (tune to prefer staying on line)

    type WeightedEdge = { to: string; weight: number };

    function buildWeightedGraph(): Record<string, WeightedEdge[]> {
      const graph: Record<string, WeightedEdge[]> = {};
      Object.keys(stationGraph).forEach((k) => (graph[k] = []));

      // same-line neighbor edges: weight = euclidean distance (meters)
      Object.values(stationGraph).forEach((node) => {
        node.neighbors.forEach((nbrKey) => {
          const nbr = stationGraph[nbrKey];
          if (!nbr) return;
          const dx = node.coord[0] - nbr.coord[0];
          const dy = node.coord[1] - nbr.coord[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          graph[node.key].push({ to: nbrKey, weight: dist });
        });
      });

      // transfer edges between close stations (if not already neighbors)
      const keys = Object.keys(stationGraph);
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const aKey = keys[i];
          const bKey = keys[j];
          const a = stationGraph[aKey];
          const b = stationGraph[bKey];
          if (!a || !b) continue;

          // already neighbors? skip
          if (a.neighbors.includes(bKey) || b.neighbors.includes(aKey)) continue;

          const dx = a.coord[0] - b.coord[0];
          const dy = a.coord[1] - b.coord[1];
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist <= TRANSFER_THRESHOLD) {
            // transfer weight: physical distance + penalty (to bias against transfers)
            const w = dist + TRANSFER_PENALTY;
            graph[aKey].push({ to: bKey, weight: w });
            graph[bKey].push({ to: aKey, weight: w });
          }
        }
      }

      return graph;
    }

    function dijkstraShortestPath(startKey: string, endKey: string): string[] | null {
      if (!stationGraph[startKey] || !stationGraph[endKey]) return null;
      const graph = buildWeightedGraph();

      const dist: Record<string, number> = {};
      const prev: Record<string, string | null> = {};
      const visited = new Set<string>();

      Object.keys(graph).forEach((k) => {
        dist[k] = Infinity;
        prev[k] = null;
      });
      dist[startKey] = 0;

      while (true) {
        let u: string | null = null;
        let best = Infinity;
        for (const k of Object.keys(graph)) {
          if (!visited.has(k) && dist[k] < best) {
            best = dist[k];
            u = k;
          }
        }

        if (u === null) break;
        if (u === endKey) break;

        visited.add(u);
        const edges = graph[u] || [];
        for (const edge of edges) {
          if (visited.has(edge.to)) continue;
          const alt = dist[u] + edge.weight;
          if (alt < dist[edge.to]) {
            dist[edge.to] = alt;
            prev[edge.to] = u;
          }
        }
      }

      if (dist[endKey] === Infinity) return null;

      const path: string[] = [];
      let cur: string | null = endKey;
      while (cur) {
        path.push(cur);
        cur = prev[cur] ?? null;
      }
      return path.reverse();
    }

    /* === Styles & Layers === */

    function colorForLine(id: string | undefined): string {
      const colorMap: { [key: string]: string } = {
        '1': '#FF0000',
        '2': '#008000',
        '3': '#0000FF',
        '4': '#800080',
        '5': '#FFA500',
        '6': '#FFC0CB',
        '7': '#A52A2A',
        '8': '#808080',
        '9': '#00FFFF',
        '10': '#FFD700'
      };
      return (id && colorMap[id]) || '#0074D9';
    }

    const arrowLayer = new VectorLayer({
      source: arrowSource,
      style: new Style({
        image: new CircleStyle({
          radius: 15,
          fill: new Fill({ color: '#FF0000' }),
          stroke: new Stroke({ color: '#FFFFFF', width: 4 })
        }),
        text: new Text({
          text: '➤',
          font: 'bold 24px Arial',
          fill: new Fill({ color: '#FFFFFF' }),
          offsetY: 2
        })
      })
    });

    const routeLayer = new VectorLayer({
      source: routeSource,
      style: new Style({
        stroke: new Stroke({
          color: 'rgba(255,255,0,0)',
          width: 0
        })
      })
    });

    const styledVectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature: any) => {
        const props = feature.getProperties ? feature.getProperties() : feature.properties || {};
        const lineId = props?.line ?? props?.properties?.line ?? props?.lineNumber ?? '1';
        const color = colorForLine(String(lineId));
        const isStation = props?.isStation ?? props?.properties?.isStation;

        if (isStation) {
          return new Style({
            image: new CircleStyle({
              radius: 6,
              fill: new Fill({ color }),
              stroke: new Stroke({ color: '#fff', width: 2 })
            }),
            text: new Text({
              text: props.properties?.displayName || props.displayName,
              font: 'bold 12px Arial',
              fill: new Fill({ color: '#2c3e50' }),
              stroke: new Stroke({ color: '#fff', width: 3 }),
              offsetY: -10,
              overflow: true
            })
          });
        }

        const isFilteredByDropdown = state.selectedLine && state.selectedLine !== lineId;
        const hasRoute = !!state.currentRoute && state.currentRoute.length > 0;

        if (state.animating || state.currentRoute) {
          if (!hasRoute) {
            return new Style({
              stroke: new Stroke({
                color: 'rgba(200,200,200,0.25)',
                width: 3
              })
            });
          }
          return new Style({
            stroke: new Stroke({
              color,
              width: 6,
              lineCap: 'round',
              lineJoin: 'round'
            })
          });
        }

        if (isFilteredByDropdown) {
          return new Style({
            stroke: new Stroke({
              color: 'rgba(200,200,200,0.3)',
              width: 3
            })
          });
        }

        return new Style({
          stroke: new Stroke({
            color,
            width: 6,
            lineCap: 'round',
            lineJoin: 'round'
          }),
          text: new Text({
            text: `Line ${lineId}`,
            font: 'bold 14px Arial',
            fill: new Fill({ color }),
            stroke: new Stroke({ color: '#fff', width: 3 }),
            offsetY: -15,
            textAlign: 'center',
            placement: 'line'
          })
        });
      }
    });

    const markerLayer = new VectorLayer({
      source: markerSource,
      style: (f: any) => {
        const p = f.getProperties ? f.getProperties() : f.properties || {};
        const isStart = p.type === 'start';
        return new Style({
          image: new CircleStyle({
            radius: 10,
            fill: new Fill({ color: isStart ? '#27ae60' : '#e74c3c' }),
            stroke: new Stroke({ color: '#fff', width: 3 })
          }),
          text: new Text({
            text: isStart ? 'START' : 'END',
            font: 'bold 12px Arial',
            fill: new Fill({ color: '#fff' }),
            stroke: new Stroke({ color: '#000', width: 2 }),
            offsetY: -20
          })
        });
      }
    });

    const connectionLayer = new VectorLayer({
      source: connectionSource,
      style: new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: '#8E44AD' }),
          stroke: new Stroke({ color: '#fff', width: 2 })
        }),
        text: new Text({
          text: 'Transfer',
          font: 'bold 10px Arial',
          fill: new Fill({ color: '#8E44AD' }),
          offsetY: -15
        })
      })
    });

    /* === Initialization === */

    onMounted(async () => {
      if (!mapContainer.value) return;
      debug.mapContainerExists = true;

      try {
        markerSource.clear();

        map.value = new Map({
          target: mapContainer.value,
          layers: [
            new TileLayer({
              source: new OSM(),
              opacity: 0.9
            }),
            wmsLayer,
            styledVectorLayer,
            connectionLayer,
            routeLayer,
            arrowLayer,
            markerLayer
          ],
          view: new View({
            center: fromLonLat([10.133, 54.3233]),
            zoom: 12,
            minZoom: 10,
            maxZoom: 18
          })
        });

        debug.mapInitialized = true;

        setTimeout(() => {
          map.value?.updateSize();
        }, 100);

        await loadStadtbahnGeoJSON(vectorSource);

        // store full extent for later zooming
        const extent = vectorSource.getExtent();
        if (extent) originalExtent = extent;
      } catch {
        debug.servicesStatus = 'Initialization failed';
        createDemoData(vectorSource);
      }
    });

    async function loadStadtbahnGeoJSON(vecSource: VectorSource) {
      try {
        const serviceUrls = [
          '/gis-proxy/geodatenextern/rest/services/Stadtplan/Stadtbahn_WMS/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson',
          '/gis-proxy/geodatenextern/rest/services/Stadtplan/Stadtbahn/MapServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson'
        ];

        let loaded = false;

        for (const url of serviceUrls) {
          try {
            const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
            if (res.ok) {
              const gj = await res.json();
              if (gj.features && gj.features.length > 0) {
                processGeoJSONData(gj, vecSource);
                loaded = true;
                debug.servicesStatus = `Loaded ${gj.features.length} features`;
                break;
              }
            }
          } catch {
            // ignore
          }
        }

        if (!loaded) {
          createDemoData(vecSource);
          debug.servicesStatus = 'Using demo data';
        }

        debug.featureCount = vecSource.getFeatures().length;
      } catch {
        createDemoData(vecSource);
        debug.servicesStatus = 'Using demo data after failure';
      }
    }

    function processGeoJSONData(gj: any, vecSource: VectorSource) {
      const normalizedFeatures: LineFeature[] = gj.features.map((f: any) => {
        const p = f.properties || {};
        const lineNr =
          p.LINIENNR !== undefined
            ? String(p.LINIENNR)
            : p.line !== undefined
            ? String(p.line)
            : p.LINE_NAME !== undefined
            ? String(p.LINE_NAME)
            : p.name !== undefined
            ? String(p.name)
            : '1';

        const displayName = p.NAME || p.Name || p.name || p.RefName || `Line ${lineNr} Segment`;

        const newProps = {
          ...p,
          displayName,
          line: lineNr
        };

        return { ...f, properties: newProps };
      });

      const format = new GeoJSON();
      const feats = format.readFeatures(
        { type: 'FeatureCollection', features: normalizedFeatures as any },
        { featureProjection: 'EPSG:3857' }
      );

      vecSource.clear();
      vecSource.addFeatures(feats);
      state.features = normalizedFeatures;

      const extent = vecSource.getExtent();
      if (extent && map.value) {
        map.value.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          maxZoom: 14,
          duration: 1000
        });
      }
    }

    /* === Demo data (restored) === */

    function createDemoData(vecSource: VectorSource) {
      const stations: Record<string, number[]> = {
        rungholtplatz: fromLonLat([10.085, 54.345]),
        sylterbogen: fromLonLat([10.095, 54.340]),
        schneiderkamp: fromLonLat([10.105, 54.335]),
        suchsdorf: fromLonLat([10.115, 54.330]),
        rehbenitzwinkel: fromLonLat([10.125, 54.325]),
        wikkanal: fromLonLat([10.090, 54.355]),
        auberg: fromLonLat([10.100, 54.350]),
        knorrstrasse: fromLonLat([10.110, 54.345]),
        elendsredder: fromLonLat([10.120, 54.340]),
        hanssenstrasse: fromLonLat([10.130, 54.335]),
        belvedere: fromLonLat([10.140, 54.330]),
        schauspielhaus: fromLonLat([10.135, 54.320]),
        ansgarkirche: fromLonLat([10.145, 54.315]),
        schauenburgerstrasse: fromLonLat([10.155, 54.310]),
        dreiecksplatz: fromLonLat([10.145, 54.305]),
        lorentzendamm: fromLonLat([10.135, 54.300]),
        martensdamm: fromLonLat([10.125, 54.295]),
        kronshagen: fromLonLat([10.070, 54.335]),
        dehnckestrasse: fromLonLat([10.080, 54.330]),
        westring: fromLonLat([10.090, 54.325]),
        wilhelmsplatz: fromLonLat([10.100, 54.320]),
        eserzieplatz: fromLonLat([10.110, 54.315]),
        ziegelreich: fromLonLat([10.120, 54.310]),
        hauptbahnhof: fromLonLat([10.132, 54.315]),
        projensdorf: fromLonLat([10.160, 54.350]),
        torfende: fromLonLat([10.150, 54.345]),
        bremerskamp: fromLonLat([10.140, 54.340]),
        leibnizstrasse: fromLonLat([10.130, 54.335]),
        unisportstatten: fromLonLat([10.125, 54.330]),
        uniipn: fromLonLat([10.120, 54.325]),
        uniaudimax: fromLonLat([10.115, 54.320]),
        samwerstrasse: fromLonLat([10.110, 54.315])
      };

      const demoLines: DemoLine[] = [
        {
          lineId: '1',
          stationKeys: [
            'rungholtplatz',
            'sylterbogen',
            'schneiderkamp',
            'suchsdorf',
            'uniipn',
            'rehbenitzwinkel',
            'hauptbahnhof'
          ]
        },
        {
          lineId: '2',
          stationKeys: [
            'wikkanal',
            'auberg',
            'knorrstrasse',
            'elendsredder',
            'hanssenstrasse',
            'belvedere',
            'schauspielhaus',
            'hauptbahnhof',
            'ansgarkirche',
            'schauenburgerstrasse',
            'dreiecksplatz',
            'lorentzendamm',
            'martensdamm'
          ]
        },
        {
          lineId: '3',
          stationKeys: [
            'kronshagen',
            'dehnckestrasse',
            'westring',
            'wilhelmsplatz',
            'samwerstrasse',
            'eserzieplatz',
            'ziegelreich',
            'hauptbahnhof'
          ]
        },
        {
          lineId: '4',
          stationKeys: [
            'projensdorf',
            'torfende',
            'bremerskamp',
            'leibnizstrasse',
            'unisportstatten',
            'uniipn',
            'uniaudimax',
            'samwerstrasse'
          ]
        }
      ];

      vecSource.clear();
      state.features = [];
      Object.keys(stationGraph).forEach((k) => delete stationGraph[k]);

      // add line polylines
      demoLines.forEach((lineCfg) => {
        const coords = lineCfg.stationKeys
          .map((k) => stations[k])
          .filter((c): c is number[] => Array.isArray(c) && c.length === 2);

        const line = new LineString(coords);
        const feature = new Feature({
          geometry: line,
          displayName: `Line ${lineCfg.lineId}`,
          line: lineCfg.lineId
        });
        vecSource.addFeature(feature);

        state.features.push({
          geometry: { type: 'LineString', coordinates: coords },
          properties: { displayName: `Line ${lineCfg.lineId}`, line: lineCfg.lineId }
        });
      });

      // add station points
      Object.entries(stations).forEach(([key, coord]) => {
        const displayName = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (str) => str.toUpperCase());

        const linesForStation = demoLines
          .filter((dl) => dl.stationKeys.includes(key))
          .map((dl) => dl.lineId);

        const point = new Point(coord);
        const feat = new Feature({
          geometry: point,
          properties: {
            displayName,
            line: linesForStation[0] || '1',
            isStation: true,
            lineNumber: linesForStation[0] || '1',
            stationKey: key
          }
        });
        vecSource.addFeature(feat);

        state.features.push({
          geometry: { type: 'Point', coordinates: coord },
          properties: {
            displayName,
            line: linesForStation[0] || '1',
            isStation: true,
            lineNumber: linesForStation[0] || '1',
            stationKey: key
          }
        });

        stationGraph[key] = {
          name: displayName,
          key,
          coord,
          lines: linesForStation,
          neighbors: []
        };
      });

      // build adjacency from line sequences (bidirectional)
      demoLines.forEach((lineCfg) => {
        const keys = lineCfg.stationKeys;
        for (let i = 0; i < keys.length - 1; i++) {
          const a = keys[i];
          const b = keys[i + 1];
          if (a && b && stationGraph[a] && stationGraph[b]) {
            if (!stationGraph[a].neighbors.includes(b)) stationGraph[a].neighbors.push(b);
            if (!stationGraph[b].neighbors.includes(a)) stationGraph[b].neighbors.push(a);
          }
        }
      });

      if (map.value) {
        const extent = vecSource.getExtent();
        map.value.getView().fit(extent, {
          padding: [50, 50, 50, 50],
          maxZoom: 12,
          duration: 1500
        });
        map.value.updateSize();
        originalExtent = vecSource.getExtent();
      }
    }

    /* === set start/end from a feature === */

    function setPointFromFeature(featureGeo: LineFeature | any, which: 'start' | 'end') {
      const geom = featureGeo.geometry;
      let finalCoords: number[] = fromLonLat([10.133, 54.3233]);

      try {
        if (geom && geom.coordinates) {
          let coordinates: number[] | undefined;

          if (geom.type === 'LineString') {
            const coords = geom.coordinates as number[][];
            if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0])) {
              coordinates = coords[0] as number[];
            }
          } else if (geom.type === 'Point') {
            const coords = geom.coordinates as number[];
            if (Array.isArray(coords) && coords.length >= 2) coordinates = coords;
          } else if (geom.type === 'MultiLineString') {
            const coords = geom.coordinates as number[][][];
            if (Array.isArray(coords) && coords.length > 0 && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
              coordinates = coords[0][0] as number[];
            }
          } else {
            coordinates = undefined;
          }

          if (
            !coordinates ||
            coordinates.length < 2 ||
            coordinates[0] === undefined ||
            coordinates[1] === undefined
          ) {
            return;
          }

          finalCoords = [coordinates[0] as number, coordinates[1] as number];

          const point = {
            coord: finalCoords,
            info: featureGeo.properties,
            stationKey: featureGeo.properties?.stationKey as string | undefined
          };

          if (which === 'start') state.start = point;
          else state.end = point;

          markerSource.getFeatures().slice().forEach((f) => {
            try {
              if (f.get('type') === which) markerSource.removeFeature(f);
            } catch {
              // ignore
            }
          });

          const markerFeature = new Feature({
            geometry: new Point(finalCoords),
            type: which
          });
          markerSource.addFeature(markerFeature);

          if (map.value) {
            map.value.getView().animate({
              center: finalCoords,
              zoom: 16,
              duration: 800
            });
          }

          if (state.start && state.end) {
            calculateOptimalRoute();
          }
        }
      } catch {
        // ignore
      }
    }

    /* === Calculate optimal route (Dijkstra) === */

    function calculateOptimalRoute() {
      if (!state.start || !state.end) return;

      const startKey = state.start.stationKey;
      const endKey = state.end.stationKey;

      // fallback: if either is not a station, show nearest single line
      if (!startKey || !endKey || !stationGraph[startKey] || !stationGraph[endKey]) {
        const src = styledVectorLayer.getSource() as VectorSource;
        const features = src.getFeatures();
        const lineFeatures: Feature<LineString>[] = features.filter(
          (f): f is Feature<LineString> => !!f.getGeometry && f.getGeometry()?.getType() === 'LineString'
        );
        if (!lineFeatures.length) return;

        const startCoord = state.start?.coord ?? state.end?.coord ?? fromLonLat([10.133, 54.3233]);
        let bestLine: Feature<LineString> | null = null;
        let bestDist = Infinity;
        for (const lf of lineFeatures) {
          const geom = lf.getGeometry() as LineString;
          const coords = geom.getCoordinates();
          if (coords && coords.length) {
            const dx = coords[0][0] - startCoord[0];
            const dy = coords[0][1] - startCoord[1];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < bestDist) {
              bestDist = d;
              bestLine = lf;
            }
          }
        }
        if (!bestLine) return;

        const simpleRoute: SimpleRoute = {
          coordinates: (bestLine.getGeometry() as LineString).getCoordinates(),
          lineId: bestLine.get('line') || '1'
        };
        state.currentRoute = [simpleRoute];
        visualizeRoute(state.currentRoute);
        debug.routingPoints = 'Fallback route (non-station click)';
        return;
      }

      // Dijkstra: returns station key path using distance-based weights
      const pathKeys = dijkstraShortestPath(startKey, endKey);
      if (!pathKeys || pathKeys.length === 0) return;

      // Now group into line segments, preferring a common line between consecutive stations
      const segments: SimpleRoute[] = [];
      for (let i = 0; i < pathKeys.length - 1; i++) {
        const aKey = pathKeys[i];
        const bKey = pathKeys[i + 1];
        const a = stationGraph[aKey];
        const b = stationGraph[bKey];
        if (!a || !b) continue;

        const commonLines = a.lines.filter((l) => b.lines.includes(l));
        const lineId = commonLines[0] ?? a.lines[0] ?? '1';

        if (!segments.length || segments[segments.length - 1].lineId !== lineId) {
          segments.push({
            lineId,
            coordinates: [a.coord, b.coord]
          });
        } else {
          segments[segments.length - 1].coordinates.push(b.coord);
        }
      }

      state.currentRoute = segments;
      visualizeRoute(state.currentRoute);
      debug.routingPoints = `Stations: ${pathKeys.join(' -> ')}`;
    }

    /* === visualize route === */

    function visualizeRoute(route: SimpleRoute[] | null) {
      routeSource.clear();
      if (!route || !route.length) return;

      route.forEach((seg) => {
        try {
          const ls = new LineString(seg.coordinates);
          const f = new Feature({
            geometry: ls,
            line: seg.lineId || '1'
          });
          routeSource.addFeature(f);
        } catch {
          // ignore malformed
        }
      });
    }

    /* === build coords for animation === */

    async function buildRouteCoordinates(): Promise<number[][]> {
      if (!state.currentRoute) {
        return state.start && state.end ? [state.start.coord, state.end.coord] : [];
      }

      const allCoords: number[][] = [];
      state.currentRoute.forEach((segment) => {
        segment.coordinates.forEach((c) => {
          if (Array.isArray(c) && c.length >= 2) {
            allCoords.push(c);
          }
        });
      });

      // dedupe consecutive identical coords
      const dedup: number[][] = [];
      for (const c of allCoords) {
        const prev = dedup[dedup.length - 1];
        if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) dedup.push(c);
      }
      return dedup;
    }

    function fitToOriginalExtent() {
      if (map.value && originalExtent) {
        try {
          map.value.getView().fit(originalExtent, {
            padding: [50, 50, 50, 50],
            maxZoom: 12,
            duration: 1000
          });
        } catch {
          // ignore
        }
      }
    }

    function animateAlongCoordinates(coords: number[][]) {
      return new Promise<void>((resolve) => {
        if (!map.value || !coords || coords.length === 0) {
          resolve();
          return;
        }

        const view = map.value.getView();
        const totalPoints = coords.length;
        let currentPoint = 0;

        travelProgress.value = 0;
        arrowSource.clear();

        const animateStep = () => {
          if (currentPoint >= totalPoints) {
            setTimeout(() => {
              arrowSource.clear();
              travelProgress.value = 100;
              // auto-zoom out when finished
              fitToOriginalExtent();
              resolve();
            }, 800);
            return;
          }

          const currentCoord = coords[currentPoint];

          if (!currentCoord || currentCoord.length < 2) {
            currentPoint++;
            setTimeout(animateStep, 200);
            return;
          }

          arrowSource.clear();
          const arrowFeature = new Feature({
            geometry: new Point(currentCoord)
          });
          arrowSource.addFeature(arrowFeature);

          view.animate(
            {
              center: currentCoord,
              zoom: 15,
              duration: 700
            },
            () => {
              currentPoint++;
              travelProgress.value = (currentPoint / totalPoints) * 100;

              if (currentPoint < totalPoints) {
                setTimeout(animateStep, 160);
              } else {
                travelProgress.value = 100;
                setTimeout(() => {
                  fitToOriginalExtent();
                  resolve();
                }, 400);
              }
            }
          );
        };

        animateStep();
      });
    }

    async function startTravel() {
      if (!state.start || !state.end || !map.value || state.animating) return;

      state.animating = true;
      travelProgress.value = 0;
      arrowSource.clear();

      try {
        const coords = await buildRouteCoordinates();
        if (coords.length > 1) {
          await animateAlongCoordinates(coords);
        } else {
          setTimeout(() => fitToOriginalExtent(), 400);
        }

        setTimeout(() => {
          arrowSource.clear();
        }, 2000);
      } finally {
        state.animating = false;
        travelProgress.value = 0;
      }
    }

    /* === controls and helpers === */

    function clearSelection() {
      state.start = null;
      state.end = null;
      state.currentRoute = null;
      state.selectedLine = '';
      state.animating = false;

      markerSource.clear();
      connectionSource.clear();
      arrowSource.clear();
      routeSource.clear();

      const src = styledVectorLayer.getSource() as VectorSource;
      src.changed();

      travelProgress.value = 0;
      debug.routingPoints = 'No route calculated';

      // zoom back to original extent
      fitToOriginalExtent();
    }

    function filterByLine() {
      const src = styledVectorLayer.getSource() as VectorSource;
      src.changed();
    }

    function getFeatureType(feature: LineFeature): string {
      return feature.geometry.type === 'Point' ? 'Station' : 'Line Segment';
    }

    function toggleDebug() {
      debug.show = !debug.show;
    }

    return {
      mapContainer,
      state,
      debug,
      searchQuery,
      travelProgress,
      availableLines,
      filteredFeatures,
      hasSelection,
      canStart,
      setPointFromFeature,
      clearSelection,
      startTravel,
      filterByLine,
      colorForLine,
      getFeatureType,
      toggleDebug
    };
  }
});
</script>

<style scoped>
/* styles unchanged from your file (kept as-is) */
.map-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  font-family: system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background: #2c3e50;
  color: white;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  flex-shrink: 0;
  min-height: 80px;
}

#app-title {
  font-size: 2rem;
  margin: 0;
  font-weight: 700;
}

.controls {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.controls > * {
  margin: 0;
}

button {
  background: #3498db;
  color: white;
  border-radius: 8px;
  padding: 0.75rem 1.5rem;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 600;
  transition: all 0.2s ease;
  border: 2px solid #2980b9;
}

button:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

button:disabled {
  background: #95a5a6;
  border-color: #7f8c8d;
  cursor: not-allowed;
  transform: none;
}

button:focus {
  outline: 3px solid #e74c3c;
  outline-offset: 2px;
}

select {
  padding: 0.75rem;
  border-radius: 8px;
  border: 2px solid #3498db;
  font-size: 1rem;
  background: white;
  color: #2c3e50;
  min-width: 150px;
  cursor: pointer;
  transition: all 0.2s ease;
}

select:hover {
  border-color: #2980b9;
  background: #f8f9fa;
}

select:focus {
  outline: none;
  border-color: #e74c3c;
  box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.1);
}

select option {
  background: white;
  color: #2c3e50;
  padding: 0.5rem;
}

select option:hover {
  background: #3498db !important;
  color: white !important;
}

.debug-btn {
  background: #e74c3c;
  border-color: #c0392b;
}

.debug-btn:hover:not(:disabled) {
  background: #c0392b;
}

.start-btn {
  background: #27ae60;
  border-color: #229954;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.start-btn:hover:not(:disabled) {
  background: #229954;
}

.end-btn {
  background: #e74c3c;
  border-color: #c0392b;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.end-btn:hover:not(:disabled) {
  background: #c0392b;
}

main {
  display: flex;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

#map {
  flex: 1;
  min-height: 100%;
  width: 70%;
  position: relative;
  background: #f8f9fa;
  border: 3px solid #3498db !important;
}

#map:empty::before {
  content: "MAP CONTAINER - If you see this, map failed to load";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: red;
  font-weight: bold;
  font-size: 1.2rem;
  z-index: 1000;
}

.map-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
}

.map-loading-message {
  color: white;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  padding: 2rem;
}

.loading-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 2s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.list-view {
  width: 30%;
  min-width: 350px;
  overflow: auto;
  padding: 1.5rem;
  background: #ecf0f1;
  border-left: 3px solid #34495e;
  box-shadow: -2px 0 10px rgba(0,0,0,0.1);
}

.list-view h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: #2c3e50;
  border-bottom: 2px solid #bdc3c7;
  padding-bottom: 0.5rem;
}

.search-box {
  margin-bottom: 1.5rem;
}

.search-box input {
  width: 100%;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  border: 1px solid #bdc3c7;
  font-size: 1rem;
}

.stations-list {
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}

.station-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.station-row.is-station {
  border-left: 4px solid #27ae60;
}

.station-controls {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.station-info {
  flex: 1;
  margin-left: 0.75rem;
}

.station-label {
  font-weight: 600;
  display: block;
  margin-bottom: 0.25rem;
}

.station-meta {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.85rem;
  color: #7f8c8d;
}

.line-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  color: white;
  font-weight: 600;
}

.feature-type {
  background: #ecf0f1;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
}

.no-results {
  text-align: center;
  margin-top: 1rem;
  color: #7f8c8d;
}

.clear-search {
  margin-top: 0.5rem;
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
}

.travel-status {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  background: rgba(44, 62, 80, 0.95);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.travel-progress {
  width: 120px;
  height: 6px;
  background: rgba(255,255,255,0.2);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #2ecc71;
  width: 0;
  transition: width 0.2s ease;
}

.travel-text {
  font-size: 0.95rem;
}

.debug-overlay {
  position: absolute;
  top: 90px;
  right: 20px;
  background: rgba(0,0,0,0.85);
  color: white;
  padding: 1rem;
  border-radius: 8px;
  z-index: 1000;
  max-width: 280px;
  font-size: 0.85rem;
}

.selection-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.start-marker {
  color: #27ae60;
}

.end-marker {
  color: #e74c3c;
}
</style>
