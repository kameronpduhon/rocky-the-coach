const KEY = "rocky-queue";

interface Item {
  id: string;
  url: string;
  fields: Record<string, string>;
}

// Mirrors storage so the queue still works for this page's lifetime when localStorage is blocked (private mode).
let memory: Item[] = [];

function load(): Item[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? memory : (JSON.parse(raw) as Item[]);
  } catch {
    return memory;
  }
}

function save(items: Item[]): void {
  memory = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage blocked: the in-memory copy above carries the queue until the page closes.
  }
  window.dispatchEvent(new Event("rocky-queue"));
}

let flushing: Promise<boolean> | null = null;

/** Sends every queued item in order. Resolves true when the queue is empty. */
export function flush(): Promise<boolean> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const item of load()) {
      const body = new FormData();
      for (const [k, v] of Object.entries(item.fields)) body.set(k, v);
      try {
        const res = await fetch(item.url, { method: "POST", body, redirect: "manual" });
        if (res.status >= 500) return false;
      } catch {
        return false;
      }
      save(load().filter((i) => i.id !== item.id));
    }
    return true;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Queues a mutation and tries to send it now. Fields must include a clientId for idempotency. */
export async function send(url: string, fields: Record<string, string>): Promise<boolean> {
  save([...load(), { id: crypto.randomUUID(), url, fields }]);
  return flush();
}

export function pendingCount(): number {
  return load().length;
}
