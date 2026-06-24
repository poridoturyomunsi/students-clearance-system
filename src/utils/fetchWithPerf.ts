import { reportMetric } from '../perf/perf';

export async function fetchWithPerf(input: RequestInfo, init?: RequestInit) {
  const start = performance.now();
  try {
    const res = await fetch(input, init);
    const end = performance.now();
    reportMetric('fetch.duration', Math.round(end - start), { url: typeof input === 'string' ? input : (input as Request).url, status: res.status });
    return res;
  } catch (e: any) {
    const end = performance.now();
    reportMetric('fetch.error.duration', Math.round(end - start), { url: typeof input === 'string' ? input : (input as Request).url, error: e && e.message });
    throw e;
  }
}
