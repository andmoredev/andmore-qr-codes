import { config } from '../config';
import { authService } from './auth';
import type { AnalyticsSummary, DashboardSummary } from '../types';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await authService.getIdToken();
  return { Authorization: token ?? '', 'Content-Type': 'application/json' };
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, { headers: await authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export async function getQrAnalytics(
  qrId: string,
  opts: { from?: string; to?: string } = {},
): Promise<AnalyticsSummary> {
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  if (opts.to) params.set('to', opts.to);
  const qs = params.toString();
  return request<AnalyticsSummary>(`/analytics/qrs/${qrId}${qs ? `?${qs}` : ''}`);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/analytics/summary');
}
