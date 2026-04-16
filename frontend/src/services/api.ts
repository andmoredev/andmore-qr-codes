import { config } from '../config';
import { authService } from './auth';

async function authHeaders(): Promise<Record<string, string>> {
  const token = await authService.getIdToken();
  return { Authorization: token ?? '', 'Content-Type': 'application/json' };
}

export interface GenerateResult {
  id: string;
  qrCode: string; // base64 PNG
}

export interface HistoryItem {
  id: string;
  url: string;
  createdAt: string;
  qrCodeUrl: string;
  imageUrl: string | null;
}

export async function generateQr(url: string, imageBase64?: string): Promise<GenerateResult> {
  const res = await fetch(`${config.apiUrl}/generate`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ url, ...(imageBase64 && { image: imageBase64 }) }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to generate QR code');
  return data as GenerateResult;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const res = await fetch(`${config.apiUrl}/history`, {
    headers: await authHeaders(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load history');
  return (data as { items: HistoryItem[] }).items;
}
