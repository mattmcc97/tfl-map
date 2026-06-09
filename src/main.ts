import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import './styles.css';

import { POLL_MS, STATUS_EVERY_N_POLLS } from './config';
import { getArrivals, getStatus } from './api/tfl';
import { loadNetwork } from './data/network';
import { createMap } from './render/map';
import { TrainAnimator } from './render/trains';
import { estimateTargets } from './tracker/estimator';
import { TrainStore } from './tracker/store';
import { createClock, createLegend, createStatusStrip } from './ui/panel';

const MAX_BACKOFF_MS = 120_000;

async function boot(): Promise<void> {
  const loading = document.getElementById('loading')!;
  const network = await loadNetwork();
  const tubeMap = await createMap(document.getElementById('map')!, network);

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__map = tubeMap.map;
  }

  const store = new TrainStore();
  const animator = new TrainAnimator(tubeMap, store);
  const clock = createClock(document.getElementById('clock')!);
  const setStatuses = createStatusStrip(document.getElementById('status-strip')!);
  const legend = createLegend(document.getElementById('legend')!, (active) => {
    tubeMap.setActiveLines(active);
  });

  let pollCount = 0;
  let backoffMs = POLL_MS;
  let pollTimer = 0;

  const refreshStatus = () => {
    getStatus().then(setStatuses).catch(() => {
      // Keep the previous strip; staleness is signalled by the clock.
    });
  };

  const poll = async () => {
    try {
      const predictions = await getArrivals();
      const { targets, untracked, countsByLine } = estimateTargets(predictions, network);
      store.reconcile(targets);
      animator.refreshPopup();
      legend.setCounts(countsByLine, untracked);
      clock.markUpdated();
      backoffMs = POLL_MS;
      if (pollCount % STATUS_EVERY_N_POLLS === 0) refreshStatus();
      pollCount++;
    } catch (err) {
      console.warn('arrivals poll failed', err);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    } finally {
      loading.remove();
      window.clearTimeout(pollTimer);
      if (!document.hidden) pollTimer = window.setTimeout(poll, backoffMs);
    }
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      animator.stop();
      window.clearTimeout(pollTimer);
    } else {
      animator.snapAll();
      animator.start();
      void poll();
    }
  });

  animator.start();
  await poll();
}

boot().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.innerHTML = '<span class="loading-text">Could not reach TfL. Refresh to retry.</span>';
  }
});
