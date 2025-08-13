import { debug, info } from '../util/logger';

const DEFAULT_BASE = process.env.LUCIDIC_DEBUG === 'True'
  ? 'http://localhost:8000/api'
  : 'https://analytics.lucidic.ai/api';

export class HttpClient {
  private readonly baseUrl: string;
  private apiKey: string;

  constructor(params: { baseUrl?: string; apiKey: string }) {
    this.baseUrl = (params.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
    this.apiKey = params.apiKey;
    info(`HTTP client initialized at ${this.baseUrl}`);
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers() {
    return {
      'Authorization': `Api-Key ${this.apiKey}`,
      'User-Agent': 'lucidic-ts-sdk/0.1',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    } as Record<string, string>;
  }

  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(this.baseUrl + '/' + endpoint);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, String(v)));
    debug(`GET ${url.toString()}`);
    const res = await fetch(url, { method: 'GET', headers: this.headers() });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async post<T>(endpoint: string, body?: Record<string, any>): Promise<T> {
    const url = this.baseUrl + '/' + endpoint;
    debug(`POST ${url}`, body);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...(body ?? {}), current_time: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async put<T>(endpoint: string, body?: Record<string, any>): Promise<T> {
    const url = this.baseUrl + '/' + endpoint;
    debug(`PUT ${url}`, body);
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ ...(body ?? {}), current_time: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }
}

