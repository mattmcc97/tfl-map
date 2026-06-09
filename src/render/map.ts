import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  BASEMAP_STYLE_URL,
  LINE_COLORS,
  MAP_CENTER,
  MAP_MAX_BOUNDS,
  MAP_MIN_ZOOM,
  MAP_ZOOM,
  type LineId,
} from '../config';
import type { NetworkModel } from '../types';

const SRC_LINES = 'tube-lines';
const SRC_STATIONS = 'tube-stations';
const SRC_TRAINS = 'tube-trains';

export const LAYER_TRAIN_CORE = 'train-core';

type FC = GeoJSON.FeatureCollection;

const EMPTY_FC: FC = { type: 'FeatureCollection', features: [] };

/** One MultiLineString per line, built from de-duplicated station-to-station segments. */
function buildLineGeoJson(network: NetworkModel): FC {
  const features: GeoJSON.Feature[] = [];
  for (const line of network.lines.values()) {
    const segments = new Map<string, [[number, number], [number, number]]>();
    for (const dir of ['inbound', 'outbound'] as const) {
      for (const branch of line.directions[dir]) {
        for (let i = 0; i < branch.stops.length - 1; i++) {
          const a = branch.stops[i];
          const b = branch.stops[i + 1];
          const key = a.naptanId < b.naptanId ? `${a.naptanId}|${b.naptanId}` : `${b.naptanId}|${a.naptanId}`;
          if (!segments.has(key)) segments.set(key, [a.lngLat, b.lngLat]);
        }
      }
    }
    features.push({
      type: 'Feature',
      properties: { lineId: line.id, color: line.color },
      geometry: { type: 'MultiLineString', coordinates: [...segments.values()] },
    });
  }
  return { type: 'FeatureCollection', features };
}

function buildStationGeoJson(network: NetworkModel, active: ReadonlySet<LineId>): FC {
  const servedBy = new Map<string, Set<LineId>>();
  for (const line of network.lines.values()) {
    for (const dir of ['inbound', 'outbound'] as const) {
      for (const branch of line.directions[dir]) {
        for (const stop of branch.stops) {
          let set = servedBy.get(stop.naptanId);
          if (!set) servedBy.set(stop.naptanId, (set = new Set()));
          set.add(line.id);
        }
      }
    }
  }
  const features: GeoJSON.Feature[] = [];
  for (const [naptanId, lineIds] of servedBy) {
    if (![...lineIds].some((id) => active.has(id))) continue;
    const stop = network.stations.get(naptanId)!;
    features.push({
      type: 'Feature',
      properties: { name: stop.name, interchange: lineIds.size > 1 ? 1 : 0 },
      geometry: { type: 'Point', coordinates: stop.lngLat },
    });
  }
  return { type: 'FeatureCollection', features };
}

export interface TubeMap {
  map: maplibregl.Map;
  setActiveLines(active: ReadonlySet<LineId>): void;
  setTrainData(fc: FC): void;
}

export function createMap(container: HTMLElement, network: NetworkModel): Promise<TubeMap> {
  const map = new maplibregl.Map({
    container,
    style: BASEMAP_STYLE_URL,
    center: MAP_CENTER,
    zoom: MAP_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxBounds: MAP_MAX_BOUNDS,
    attributionControl: false,
    fadeDuration: 100,
  });

  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Powered by TfL Open Data',
    }),
    'bottom-right',
  );
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  return new Promise((resolve) => {
    map.on('load', () => {
      map.addSource(SRC_LINES, { type: 'geojson', data: buildLineGeoJson(network) });
      map.addSource(SRC_STATIONS, {
        type: 'geojson',
        data: buildStationGeoJson(network, new Set(Object.keys(LINE_COLORS) as LineId[])),
      });
      map.addSource(SRC_TRAINS, { type: 'geojson', data: EMPTY_FC });

      const lineWidth: maplibregl.ExpressionSpecification = [
        'interpolate',
        ['linear'],
        ['zoom'],
        9,
        1.4,
        12,
        2.4,
        14,
        4,
      ];

      map.addLayer({
        id: 'line-casing',
        type: 'line',
        source: SRC_LINES,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#43434a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 2.6, 12, 4, 14, 6],
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'line-colour',
        type: 'line',
        source: SRC_LINES,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': lineWidth,
        },
      });
      map.addLayer({
        id: 'stations',
        type: 'circle',
        source: SRC_STATIONS,
        minzoom: 11,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            ['case', ['==', ['get', 'interchange'], 1], 2.4, 1.8],
            14,
            ['case', ['==', ['get', 'interchange'], 1], 4, 3],
          ],
          'circle-color': '#0e0e10',
          'circle-stroke-color': '#a0a2aa',
          'circle-stroke-width': 1.2,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 11.8, 1],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 11.8, 1],
        },
      });
      map.addLayer({
        id: 'station-labels',
        type: 'symbol',
        source: SRC_STATIONS,
        minzoom: 12.5,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Montserrat Regular'],
          'text-size': 10.5,
          'text-offset': [0, 0.9],
          'text-anchor': 'top',
          'text-max-width': 7,
        },
        paint: {
          'text-color': '#8b8d94',
          'text-halo-color': '#0e0e10',
          'text-halo-width': 1.2,
        },
      });
      map.addLayer({
        id: 'train-glow',
        type: 'circle',
        source: SRC_TRAINS,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 7, 12, 11, 14, 16],
          'circle-color': ['get', 'color'],
          'circle-blur': 1,
          'circle-opacity': ['*', 0.4, ['get', 'opacity']],
        },
      });
      map.addLayer({
        id: LAYER_TRAIN_CORE,
        type: 'circle',
        source: SRC_TRAINS,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 12, 4.5, 14, 6],
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.25,
          'circle-stroke-opacity': ['*', 0.9, ['get', 'opacity']],
          'circle-opacity': ['get', 'opacity'],
        },
      });

      const trainSource = map.getSource(SRC_TRAINS) as maplibregl.GeoJSONSource;
      const stationSource = map.getSource(SRC_STATIONS) as maplibregl.GeoJSONSource;

      resolve({
        map,
        setActiveLines(active) {
          const filter: maplibregl.FilterSpecification = [
            'in',
            ['get', 'lineId'],
            ['literal', [...active]],
          ];
          map.setFilter('line-casing', filter);
          map.setFilter('line-colour', filter);
          map.setFilter('train-glow', filter);
          map.setFilter(LAYER_TRAIN_CORE, filter);
          stationSource.setData(buildStationGeoJson(network, active));
        },
        setTrainData(fc) {
          trainSource.setData(fc);
        },
      });
    });
  });
}
