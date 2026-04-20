import { config } from '../config';
import { authService } from './auth';
import type { LinkPage, CreatePageRequest, UpdatePageRequest, VersionMeta } from '../types';

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

export async function listPages(): Promise<LinkPage[]> {
  const data = await request<{ items: LinkPage[] }>('/pages');
  return data.items;
}

export async function createPage(body: CreatePageRequest): Promise<LinkPage> {
  return request<LinkPage>('/pages', { method: 'POST', body: JSON.stringify(body) });
}

export async function getPage(pageId: string): Promise<LinkPage> {
  return request<LinkPage>(`/pages/${pageId}`);
}

export async function updatePage(pageId: string, body: UpdatePageRequest): Promise<LinkPage> {
  return request<LinkPage>(`/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export async function publishPage(pageId: string, published: boolean): Promise<LinkPage> {
  return request<LinkPage>(`/pages/${pageId}/publish`, {
    method: 'POST',
    body: JSON.stringify({ published }),
  });
}

export async function deletePage(pageId: string): Promise<void> {
  await request<null>(`/pages/${pageId}`, { method: 'DELETE' });
}

export async function listPageVersions(pageId: string): Promise<VersionMeta[]> {
  const data = await request<{ items: VersionMeta[] }>(`/pages/${pageId}/versions`);
  return data.items;
}

export async function restorePageVersion(pageId: string, n: number): Promise<LinkPage> {
  return request<LinkPage>(`/pages/${pageId}/versions/${n}/restore`, { method: 'POST' });
}
