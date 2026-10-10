/// <reference lib="webworker" />
import { createHandler } from './handler';
import type { WorkerRequest, WorkerResponse } from './worker-protocol';

const handle = createHandler();

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  let response: WorkerResponse;
  try {
    response = { id: request.id, ok: true, result: handle(request) };
  } catch (e) {
    response = { id: request.id, ok: false, name: e instanceof Error ? e.name : 'Error', error: e instanceof Error ? e.message : 'Worker failed' };
  }
  self.postMessage(response);
};
