import maplibregl from 'maplibre-gl';
import { LINE_COLORS, LINE_NAMES } from '../config';
import { lerp, TrainStore } from '../tracker/store';
import type { Train } from '../types';
import { LAYER_TRAIN_CORE, type TubeMap } from './map';

/** Position-smoothing time constant: poll corrections glide over ~a second. */
const TWEEN_TAU_MS = 1200;
const FADE_IN_MS = 600;
const FADE_OUT_MS = 450;
/** Corrections larger than this (degrees, ~2km) snap instead of glide. */
const SNAP_DISTANCE_DEG = 0.02;
/** setData cadence; rendering is GPU-side, data uploads needn't exceed this. */
const MIN_FRAME_MS = 33;

function targetPoint(train: Train): [number, number] {
  return lerp(train.target.from, train.target.to, train.progress);
}

function popupHtml(train: Train): string {
  const { meta } = train.target;
  const remaining = Math.max(0, Math.round((1 - train.progress) * train.target.segSeconds));
  const next =
    train.progress >= 1
      ? `At ${train.target.toName}`
      : `Next: ${train.target.toName} · ${remaining}s`;
  const where =
    train.target.fromName === train.target.toName
      ? meta.currentLocation || `At ${train.target.toName}`
      : meta.currentLocation || `Between ${train.target.fromName} and ${train.target.toName}`;
  return `
    <div class="train-popup" style="--line-color:${LINE_COLORS[train.lineId]}">
      <div class="train-popup-line">${LINE_NAMES[train.lineId]} line</div>
      <div class="train-popup-dest">${escapeHtml(meta.destination || meta.towards || '—')}</div>
      <div class="train-popup-row">${escapeHtml(where)}</div>
      <div class="train-popup-row">${escapeHtml(next)}</div>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export class TrainAnimator {
  private lastFrame = 0;
  private lastSetData = 0;
  private rafId = 0;
  private running = false;
  private selectedKey: string | null = null;
  private readonly popup: maplibregl.Popup;

  constructor(
    private readonly tubeMap: TubeMap,
    private readonly store: TrainStore,
  ) {
    this.popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      className: 'train-popup-wrap',
      offset: 10,
      maxWidth: '260px',
    });
    this.wireInteractions();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Skip tweening on the next frame — used after the tab was hidden. */
  snapAll(): void {
    for (const train of this.store.trains.values()) {
      train.pos = targetPoint(train);
    }
    this.lastFrame = performance.now();
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(now - this.lastFrame, 1000);
    this.lastFrame = now;

    const smoothing = 1 - Math.exp(-dt / TWEEN_TAU_MS);
    const dead: string[] = [];

    for (const train of this.store.trains.values()) {
      if (train.state === 'leaving') {
        train.opacity -= dt / FADE_OUT_MS;
        if (train.opacity <= 0) {
          dead.push(train.key);
          continue;
        }
      } else if (train.opacity < 1) {
        train.opacity = Math.min(1, train.opacity + dt / FADE_IN_MS);
        if (train.opacity >= 1 && train.state === 'entering') train.state = 'live';
      }

      train.progress = Math.min(1, train.progress + dt / 1000 / train.target.segSeconds);
      const goal = targetPoint(train);
      const dx = goal[0] - train.pos[0];
      const dy = goal[1] - train.pos[1];
      if (Math.abs(dx) > SNAP_DISTANCE_DEG || Math.abs(dy) > SNAP_DISTANCE_DEG) {
        train.pos = goal;
      } else {
        train.pos = [train.pos[0] + dx * smoothing, train.pos[1] + dy * smoothing];
      }
    }
    for (const key of dead) {
      this.store.delete(key);
      if (this.selectedKey === key) this.closePopup();
    }

    if (now - this.lastSetData >= MIN_FRAME_MS) {
      this.lastSetData = now;
      this.tubeMap.setTrainData(this.buildFeatureCollection());
      this.followSelected();
    }

    this.rafId = requestAnimationFrame(this.frame);
  };

  private buildFeatureCollection(): GeoJSON.FeatureCollection {
    const features: GeoJSON.Feature[] = [];
    for (const train of this.store.trains.values()) {
      features.push({
        type: 'Feature',
        properties: {
          key: train.key,
          lineId: train.lineId,
          color: LINE_COLORS[train.lineId],
          opacity: Number(train.opacity.toFixed(2)),
        },
        geometry: { type: 'Point', coordinates: train.pos },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  private wireInteractions(): void {
    const { map } = this.tubeMap;
    map.on('mouseenter', LAYER_TRAIN_CORE, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LAYER_TRAIN_CORE, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('click', LAYER_TRAIN_CORE, (e) => {
      const feature = e.features?.[0];
      const key = feature?.properties?.key as string | undefined;
      if (!key) return;
      this.selectedKey = key;
      const train = this.store.trains.get(key);
      if (train) {
        this.popup.setLngLat(train.pos).setHTML(popupHtml(train)).addTo(map);
      }
    });
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: [LAYER_TRAIN_CORE] });
      if (hits.length === 0) this.closePopup();
    });
  }

  /** Refresh pinned popup text after a poll updated the train's target. */
  refreshPopup(): void {
    if (!this.selectedKey) return;
    const train = this.store.trains.get(this.selectedKey);
    if (train) this.popup.setHTML(popupHtml(train));
  }

  private followSelected(): void {
    if (!this.selectedKey) return;
    const train = this.store.trains.get(this.selectedKey);
    if (train) this.popup.setLngLat(train.pos);
  }

  private closePopup(): void {
    this.selectedKey = null;
    this.popup.remove();
  }
}
