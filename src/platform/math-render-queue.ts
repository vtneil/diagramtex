import type { MathJob, MathResult } from '../domain/math-render-protocol';
type Work = Omit<MathJob, 'id'>;
type Job = { key: string; work: Work; priority: number };

// Keep just one compilation in flight. Unstarted work remains here, where the
// visible view can take precedence over earlier background requests.
export class MathRenderQueue {
  readonly results = new Map<string, MathResult>();
  private deferred = new Map<string, MathResult>();
  private jobs = new Map<number, Job>();
  private keys = new Map<string, number>();
  private waiting = new Map<number, Set<number>>();
  private completed = new Map<number, MathResult>();
  private worker: Worker | null = null;
  private unavailable = location.protocol === 'file:';
  private nextId = 0;
  private active = 0;
  private scheduled = false;
  private generation = 0;
  private timer = 0;
  private frame = 0;
  private waiters: (() => void)[] = [];
  constructor(private fallback: (work: Work) => Omit<MathResult, 'id'>, private changed: (ids: number[]) => void) {}
  get pending() { return this.jobs.size; }
  has(id: number) { return this.jobs.has(id); }
  get usingWorker() { return !!this.worker; }
  cached(key: string) { return this.results.get(key) || this.deferred.get(key); }
  deferCached(prefix: string): void {
    for (const [key, result] of this.results) if (key.startsWith(prefix)) {
      this.deferred.set(key, result); this.results.delete(key);
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
        worker.onmessage = ({ data }: MessageEvent<MathResult>) => { if (this.worker !== worker) return; if (this.active === data.id) this.active = 0; this.complete(data); };
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
    if (this.scheduled || this.active || !this.worker) return;
    this.scheduled = true;
    const generation = this.generation;
    // Collect the synchronous view's requests before dispatching the first one.
    queueMicrotask(() => {
      if (generation !== this.generation) return;
      this.scheduled = false;
      const next = this.next();
      if (!next || !this.worker || this.active) return;
      const [id, job] = next; this.removeWaiting(id, job.priority); this.active = id;
      try { this.worker.postMessage({ id, ...job.work }); } catch { this.failWorker(); }
    });
  }
  private failWorker(): void {
    const active = this.jobs.get(this.active);
    if (active && !this.completed.has(this.active)) this.addWaiting(this.active, active.priority);
    this.worker?.terminate(); this.worker = null; this.active = 0; this.unavailable = true; this.scheduleFallback();
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
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const published: number[] = [];
      // Cached results also publish in view priority order, at most two/frame.
      for (const id of this.ordered(this.completed.keys()).slice(0, 2)) {
        const result = this.completed.get(id)!, job = this.jobs.get(id);
        this.completed.delete(id);
        if (!job) continue;
        this.jobs.delete(id); this.keys.delete(job.key);
        this.results.delete(job.key); this.results.set(job.key, result);
        if (this.results.size > 1024) this.results.delete(this.results.keys().next().value!);
        published.push(id);
      }
      try { this.changed(published); } finally {
        if (this.completed.size) this.notify();
        if (!this.jobs.size && !this.frame) this.waiters.splice(0).forEach(resolve => resolve());
      }
    });
  }
  ready(): Promise<void> {
    return this.jobs.size || this.frame ? new Promise(resolve => this.waiters.push(resolve)) : Promise.resolve();
  }
  cancel(): void {
    this.generation++; this.scheduled = false; this.active = 0;
    this.worker?.terminate(); this.worker = null;
    clearTimeout(this.timer); this.timer = 0;
    for (const [key, result] of this.deferred) this.results.set(key, result);
    this.deferred.clear();
    while (this.results.size > 1024) this.results.delete(this.results.keys().next().value!);
    this.jobs.clear(); this.keys.clear(); this.waiting.clear(); this.completed.clear();
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.waiters.splice(0).forEach(resolve => resolve());
  }
}
