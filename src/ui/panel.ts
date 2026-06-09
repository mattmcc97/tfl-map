import { LINE_IDS, LINE_COLORS, LINE_NAMES, STALE_AFTER_MS, type LineId } from '../config';
import type { TflLineStatus } from '../types';

export interface Legend {
  active: ReadonlySet<LineId>;
  setCounts(counts: ReadonlyMap<LineId, number>, untracked: number): void;
}

export function createLegend(
  container: HTMLElement,
  onChange: (active: ReadonlySet<LineId>) => void,
): Legend {
  const active = new Set<LineId>(LINE_IDS);
  const countEls = new Map<LineId, HTMLElement>();
  const rowEls = new Map<LineId, HTMLElement>();

  const heading = document.createElement('div');
  heading.className = 'panel-heading';
  heading.textContent = 'Lines';
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'legend-list';
  container.appendChild(list);

  for (const lineId of LINE_IDS) {
    const row = document.createElement('li');
    row.className = 'legend-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'legend-toggle';
    button.setAttribute('aria-pressed', 'true');
    button.innerHTML = `
      <span class="legend-pill" style="background:${LINE_COLORS[lineId]}"></span>
      <span class="legend-name">${LINE_NAMES[lineId]}</span>
      <span class="legend-count">–</span>`;
    button.addEventListener('click', () => {
      if (active.has(lineId)) active.delete(lineId);
      else active.add(lineId);
      const on = active.has(lineId);
      button.setAttribute('aria-pressed', String(on));
      row.classList.toggle('is-off', !on);
      onChange(active);
    });

    row.appendChild(button);
    list.appendChild(row);
    rowEls.set(lineId, row);
    countEls.set(lineId, button.querySelector('.legend-count')!);
  }

  const footer = document.createElement('div');
  footer.className = 'legend-footer';
  container.appendChild(footer);

  return {
    active,
    setCounts(counts, untracked) {
      let total = 0;
      for (const lineId of LINE_IDS) {
        const n = counts.get(lineId) ?? 0;
        total += n;
        countEls.get(lineId)!.textContent = String(n);
      }
      footer.textContent =
        untracked > 0 ? `${total} trains · +${untracked} untracked` : `${total} trains`;
    },
  };
}

export function createStatusStrip(el: HTMLElement): (statuses: TflLineStatus[]) => void {
  return (statuses) => {
    const disrupted = statuses
      .map((s) => ({
        name: s.name,
        worst: s.lineStatuses.reduce(
          (acc, cur) => (cur.statusSeverity < acc.statusSeverity ? cur : acc),
          s.lineStatuses[0] ?? { statusSeverity: 10, statusSeverityDescription: 'Good Service' },
        ),
      }))
      .filter((s) => s.worst.statusSeverity !== 10);

    if (disrupted.length === 0) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }

    const byDescription = new Map<string, string[]>();
    for (const s of disrupted) {
      const list = byDescription.get(s.worst.statusSeverityDescription) ?? [];
      list.push(s.name);
      byDescription.set(s.worst.statusSeverityDescription, list);
    }

    el.hidden = false;
    el.innerHTML = [...byDescription]
      .map(
        ([description, names]) =>
          `<span class="status-item"><span class="status-dot"></span>${description} — ${names.join(' · ')}</span>`,
      )
      .join('');
  };
}

export interface Clock {
  markUpdated(): void;
}

export function createClock(el: HTMLElement): Clock {
  let lastUpdate = 0;

  const time = document.createElement('span');
  time.className = 'clock-time';
  const updated = document.createElement('span');
  updated.className = 'clock-updated';
  el.append(time, updated);

  const tick = () => {
    time.textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
    if (lastUpdate === 0) {
      updated.textContent = 'connecting…';
    } else {
      const seconds = Math.round((Date.now() - lastUpdate) / 1000);
      const stale = Date.now() - lastUpdate > STALE_AFTER_MS;
      updated.textContent = stale ? `stale · ${seconds}s` : `updated ${seconds}s ago`;
      el.classList.toggle('is-stale', stale);
    }
  };
  tick();
  setInterval(tick, 1000);

  return {
    markUpdated() {
      lastUpdate = Date.now();
      tick();
    },
  };
}
