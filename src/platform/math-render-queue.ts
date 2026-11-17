import type { MathJob, MathResult } from '../domain/math-render-protocol';
type Work = Omit<MathJob, 'id'>;
type Job = { key: string; work: Work; priority: number };

// Keep one batch of compilations in flight, sized to about BATCH_MS of work. Unstarted work remains here,
// where the visible view can take precedence over earlier background requests.
const BATCH_MS = 8, BATCH_MAX = 64;
// Results are bounded by their markup's size rather than their count: a table or drawing with thousands of
// formulae must not drop the first ones before its last redraw asks for them again.
const RESULT_CHARS = 24e6, RESULT_COUNT = 16384;
// Publishing calls every view back; it starts at PUBLISH_MIN a frame and grows while the views keep up.
// A round also has a fixed cost (the views' bookkeeping, a layout and a paint) that a small round pays as
// much as a big one, so rounds are spaced by their own cost (PUBLISH_REST times it) rather than shrunk to a
// trickle that pays it for every formula: the page stays free for input most of the time either way.
const PUBLISH_MIN = 2, PUBLISH_MAX = 512, PUBLISH_CHEAP_MS = 8, PUBLISH_DEAR_MS = 24, PUBLISH_REST = 2;
export class MathRenderQueue {
  readonly results = new Map<string, MathResult>();
  private resultChars = 0;
  private deferred = new Map<string, MathResult>();
  private jobs = new Map<number, Job>();
  private keys = new Map<string, number>();
  private waiting = new Map<number, Set<number>>();
  private completed = new Map<number, MathResult>();
  private worker: Worker | null = null;
  private unavailable = location.protocol === 'file:';
  private nextId = 0;
  private active = new Set<number>();
  private batchSent = 0;
  private perJob = 1;
  private perFrame = PUBLISH_MIN;
  private scheduled = false;
  private generation = 0;
  private timer = 0;
  private frame = 0;
  private rest = 0;
  private notBefore = 0;
  private waiters: (() => void)[] = [];
  constructor(private fallback: (work: Work) => Omit<MathResult, 'id'>, private changed: (ids: number[]) => void) {}
  get pending() { return this.jobs.size; }
  // least recently stored goes first
  remember(key: string, result: MathResult): void {
    const old = this.results.get(key);
    if (old) { this.results.delete(key); this.resultChars -= old.html.length; }
    this.results.set(key, result); this.resultChars += result.html.length;
    while (this.results.size > 1 && (this.results.size > RESULT_COUNT || this.resultChars > RESULT_CHARS)) {
      const [oldest, gone] = this.results.entries().next().value!;
      this.results.delete(oldest); this.resultChars -= gone.html.length;
    }
  }
  has(id: number) { return this.jobs.has(id); }
  get usingWorker() { return !!this.worker; }
  cached(key: string) { return this.results.get(key) || this.deferred.get(key); }
  deferCached(prefix: string): void {
    for (const [key, result] of this.results) if (key.startsWith(prefix)) {
      this.deferred.set(key, result); this.results.delete(key); this.resultChars -= result.html.length;
    }
  }
  promote(ids: number[], priority: number): void {
    for (const id of ids) {
      const job = this.jobs.get(id); if (!job || priority >= job.priority) continue;
      const queued = this.removeWaiting(id, job.priority);
      job.priority = priority;
      if (queued) this.addWaiting(id, priority);
    }
  }
  request(key: string, work: Work, priority = 2): number {
    const existing = this.keys.get(key);
    if (existing) { this.promote([existing], priority); return existing; }
    const id = ++this.nextId;
    this.jobs.set(id, { key, work, priority }); this.keys.set(key, id);
    const cached = this.deferred.get(key);
    if (cached) {
      this.deferred.delete(key); this.complete({ ...cached, id }); return id;
    }
    if (!this.worker && !this.unavailable) {
      try {
        const worker = this.worker = new Worker(new URL('math-render-worker.js', document.baseURI));
        worker.onmessage = ({ data }: MessageEvent<MathResult | MathResult[]>) => {
          if (this.worker !== worker) return;
          const list = Array.isArray(data) ? data : [data];
          if (this.active.size && list.length) this.perJob = Math.max(0.05, (performance.now() - this.batchSent) / list.length);
          for (const result of list) this.active.delete(result.id);
          for (const result of list) this.complete(result);
        };
        worker.onerror = event => { event.preventDefault(); if (this.worker === worker) this.failWorker(); };
      } catch { this.unavailable = true; }
    }
    this.addWaiting(id, priority); this.scheduleWork(); this.notify(); return id;
  }
  private ordered(ids: Iterable<number>): number[] {
    return [...ids].sort((a, b) => (this.jobs.get(a)?.priority ?? 2) - (this.jobs.get(b)?.priority ?? 2) || a - b);
  }
  private addWaiting(id: number, priority: number): void {
    let bucket = this.waiting.get(priority);
    if (!bucket) this.waiting.set(priority, bucket = new Set());
    bucket.add(id);
  }
  private removeWaiting(id: number, priority: number): boolean {
    const bucket = this.waiting.get(priority), removed = bucket?.delete(id) || false;
    if (bucket && !bucket.size) this.waiting.delete(priority);
    return removed;
  }
  private next(): [number, Job] | undefined {
    if (!this.waiting.size) return;
    const priority = Math.min(...this.waiting.keys());
    const id = this.waiting.get(priority)!.values().next().value!;
    return [id, this.jobs.get(id)!];
  }
  private scheduleWork(): void {
    if (this.unavailable) { this.scheduleFallback(); return; }
    if (this.scheduled || this.active.size || !this.worker) return;
    this.scheduled = true;
    const generation = this.generation;
    // Collect the synchronous view's requests before dispatching the first one.
    queueMicrotask(() => {
      if (generation !== this.generation) return;
      this.scheduled = false;
      if (!this.worker || this.active.size) return;
      const batch = [], size = Math.max(1, Math.min(BATCH_MAX, Math.floor(BATCH_MS / this.perJob)));
      for (let next = this.next(); next && batch.length < size; next = this.next()) {
        const [id, job] = next; this.removeWaiting(id, job.priority); this.active.add(id);
        batch.push({ id, ...job.work });
      }
      if (!batch.length) return;
      this.batchSent = performance.now();
      try { this.worker.postMessage(batch); } catch { this.failWorker(); }
    });
  }
  private failWorker(): void {
    for (const id of this.active) { const job = this.jobs.get(id); if (job && !this.completed.has(id)) this.addWaiting(id, job.priority); }
    this.worker?.terminate(); this.worker = null; this.active.clear(); this.unavailable = true; this.scheduleFallback();
  }
  private scheduleFallback(): void {
    if (this.timer || !this.next()) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      const next = this.next();
      if (next) {
        const [id, { work, priority }] = next; this.removeWaiting(id, priority);
        try { this.complete({ id, ...this.fallback(work) }); }
        catch (error) { this.complete({ id, html: '', error: String(error) }); }
      }
      this.scheduleFallback();
    }, 0);
  }
  private complete(result: MathResult): void {
    if (!this.jobs.has(result.id) || this.completed.has(result.id)) return;
    this.removeWaiting(result.id, this.jobs.get(result.id)!.priority);
    this.completed.set(result.id, result); this.notify(); this.scheduleWork();
  }
  private notify(): void {
    if (this.frame || this.rest) return;
    const wait = this.notBefore - performance.now();
    if (wait > 1) { this.rest = window.setTimeout(() => { this.rest = 0; this.notify(); }, wait); return; }
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const published: number[] = [];
      // Cached results also publish in view priority order, as many a frame as the views keep up with.
      for (const id of this.ordered(this.completed.keys()).slice(0, this.perFrame)) {
        const result = this.completed.get(id)!, job = this.jobs.get(id);
        this.completed.delete(id);
        if (!job) continue;
        this.jobs.delete(id); this.keys.delete(job.key);
        this.remember(job.key, result);
        published.push(id);
      }
      const start = performance.now();
      try { this.changed(published); } finally {
        const took = performance.now() - start;
        if (took < PUBLISH_CHEAP_MS && published.length >= this.perFrame) this.perFrame = Math.min(PUBLISH_MAX, this.perFrame * 2);
        else if (took > PUBLISH_DEAR_MS) this.perFrame = Math.max(PUBLISH_MIN, this.perFrame >> 1);
        this.notBefore = performance.now() + took * PUBLISH_REST;
        if (this.completed.size) this.notify();
        if (!this.jobs.size && !this.frame && !this.rest) this.waiters.splice(0).forEach(resolve => resolve());
      }
    });
  }
  ready(): Promise<void> {
    return this.jobs.size || this.frame || this.rest ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve();
  }
  cancel(): void {
    this.generation++; this.scheduled = false; this.active.clear();
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer); this.timer = 0;
    for (const [key, result] of this.deferred) this.remember(key, result);
    this.deferred.clear();
    this.jobs.clear(); this.keys.clear(); this.waiting.clear(); this.completed.clear();
    cancelAnimationFrame(this.frame); this.frame = 0; clearTimeout(this.rest); this.rest = 0;
    this.waiters.splice(0).forEach(resolve => resolve());
  }
}
