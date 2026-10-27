/** The parts of Durable Object storage the rest clock uses. */
export interface AlarmStorage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(scheduledTime: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface RestPing {
  /** The person's D1 binding, so the ping goes to their push subscriptions. */
  binding: string;
  title: string;
  body: string;
}

/** One person's rest ping: at most one pending, and the latest schedule wins. */
export class RestClock {
  constructor(
    private readonly storage: AlarmStorage,
    private readonly now: () => number,
    private readonly send: (ping: RestPing) => Promise<unknown>,
  ) {}

  async schedule(ping: RestPing, seconds: number): Promise<void> {
    await this.storage.put("ping", ping);
    await this.storage.setAlarm(this.now() + seconds * 1000);
  }

  async cancel(): Promise<void> {
    await this.storage.deleteAlarm();
    await this.storage.delete("ping");
  }

  /** Runs on the alarm. The ping is removed before sending, so a retried alarm never pings twice. */
  async fire(): Promise<void> {
    const ping = await this.storage.get<RestPing>("ping");
    if (!ping) return;
    await this.storage.delete("ping");
    await this.send(ping);
  }
}
