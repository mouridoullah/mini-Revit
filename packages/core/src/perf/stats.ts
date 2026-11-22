/**
 * @tabax/core
 * Module d'instrumentation statistique pour les bancs de performance et de scalabilité.
 */

export interface BenchmarkMetrics {
  name: string;
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  stdDevMs: number;
  totalMs: number;
  samplesMs: number[];
}

export interface BenchmarkOptions {
  warmup?: number;
  iterations?: number;
}

/**
 * Exécute une routine de mesure avec répétition statistique, période d'échauffement (warm-up)
 * et calcul précis de la médiane (P50), du 95e percentile (P95) et de l'écart-type.
 */
export function runBenchmark(
  name: string,
  fn: (iteration: number) => void,
  options: BenchmarkOptions = {}
): BenchmarkMetrics {
  const warmup = options.warmup ?? 3;
  const iterations = Math.max(1, options.iterations ?? 10);

  // Phase d'échauffement (JIT / caches / warmup)
  for (let w = 0; w < warmup; w++) {
    fn(w);
  }

  // Phase de mesure
  const samplesMs: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn(i);
    const t1 = performance.now();
    samplesMs[i] = t1 - t0;
  }

  // Tri pour calcul des percentiles
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const totalMs = samplesMs.reduce((acc, v) => acc + v, 0);
  const avgMs = totalMs / iterations;

  const p50Index = Math.min(iterations - 1, Math.floor(iterations * 0.5));
  const p95Index = Math.min(iterations - 1, Math.floor(iterations * 0.95));

  const p50Ms = sorted[p50Index] ?? 0;
  const p95Ms = sorted[p95Index] ?? 0;
  const minMs = sorted[0] ?? 0;
  const maxMs = sorted[iterations - 1] ?? 0;

  const variance = samplesMs.reduce((acc, v) => acc + Math.pow(v - avgMs, 2), 0) / iterations;
  const stdDevMs = Math.sqrt(variance);

  return {
    name,
    iterations,
    p50Ms: Number(p50Ms.toFixed(3)),
    p95Ms: Number(p95Ms.toFixed(3)),
    minMs: Number(minMs.toFixed(3)),
    maxMs: Number(maxMs.toFixed(3)),
    avgMs: Number(avgMs.toFixed(3)),
    stdDevMs: Number(stdDevMs.toFixed(3)),
    totalMs: Number(totalMs.toFixed(3)),
    samplesMs,
  };
}
