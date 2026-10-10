import { createHandler } from './handler';
import type { WorkerRequest, WorkerResponse, WorkerResult } from './worker-protocol';

export class EngineError extends Error {
  constructor(
    message: string,
    readonly kind: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

type Distribute<T> = T extends { id: number } ? Omit<T, 'id'> : never;
export type EngineCall = Distribute<WorkerRequest>;
type ResultOf<K extends WorkerResult['type']> = Extract<WorkerResult, { type: K }>['value'];

interface Pending {
  resolve: (r: WorkerResult) => void;
  reject: (e: EngineError) => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let inline: ReturnType<typeof createHandler> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(message: string): void {
  for (const p of pending.values()) p.reject(new EngineError(message, 'WorkerFailure'));
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerFailed || typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const res = event.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new EngineError(res.error, res.name));
    };
    w.onerror = (event) => {
      workerFailed = true;
      worker = null;
      failAll(event.message || 'The engine worker stopped');
    };
    worker = w;
    return w;
  } catch {
    workerFailed = true;
    return null;
  }
}

export async function callEngine<K extends WorkerResult['type']>(call: EngineCall & { type: K }): Promise<ResultOf<K>> {
  const w = getWorker();
  if (!w) {
    inline ??= createHandler();
    try {
      return inline({ ...call, id: 0 } as WorkerRequest).value as ResultOf<K>;
    } catch (e) {
      throw new EngineError(e instanceof Error ? e.message : 'Engine failed', e instanceof Error ? e.name : 'Error');
    }
  }
  const id = nextId++;
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...call, id } as WorkerRequest);
  });
  return result.value as ResultOf<K>;
}
