export interface PerfMetric { name: string; value: number; meta?: any }

const metrics: PerfMetric[] = [];

export function reportMetric(name: string, value: number, meta?: any) {
  try {
    metrics.push({ name, value, meta });
    // expose for debugging
    (window as any).__appPerf = (window as any).__appPerf || [];
    (window as any).__appPerf.push({ name, value, meta, ts: Date.now() });
    // also console.log lightly
    console.debug(`[perf] ${name}: ${value}ms`, meta || '');
  } catch (e) {
    // swallow
  }
}

export function getMetrics() {
  return metrics.slice();
}

export default { reportMetric, getMetrics };
