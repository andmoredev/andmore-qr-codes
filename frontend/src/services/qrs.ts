import { config } from '../config';
import { authService } from './auth';
import type { QrCode, CreateQrRequest, UpdateQrRequest, VersionMeta } from '../types';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await authService.getIdToken();
  return { Authorization: token ?? '', 'Content-Type': 'application/json' };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export async function listQrs(): Promise<QrCode[]> {
  const data = await request<{ items: QrCode[] }>('/qrs');
  return data.items;
}

export async function createQr(body: CreateQrRequest): Promise<QrCode> {
  return request<QrCode>('/qrs', { method: 'POST', body: JSON.stringify(body) });
}

export async function getQr(qrId: string): Promise<QrCode> {
  return request<QrCode>(`/qrs/${qrId}`);
}

export async function updateQr(qrId: string, body: UpdateQrRequest): Promise<QrCode> {
  return request<QrCode>(`/qrs/${qrId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function deleteQr(qrId: string): Promise<void> {
  await request<null>(`/qrs/${qrId}`, { method: 'DELETE' });
}

export async function listQrVersions(qrId: string): Promise<VersionMeta[]> {
  const data = await request<{ items: VersionMeta[] }>(`/qrs/${qrId}/versions`);
  return data.items;
}

export async function restoreQrVersion(qrId: string, n: number): Promise<QrCode> {
  return request<QrCode>(`/qrs/${qrId}/versions/${n}/restore`, { method: 'POST' });
}
