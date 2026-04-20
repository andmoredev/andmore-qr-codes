import type { PublicPage } from '../types';

/**
 * Fetches a published Links Page through the CloudFront public route.
 * No auth header — this is an anonymous request from the public page renderer.
 *
 * The path `/public/pages/{slug}` is served by CloudFront on the same origin
 * as the SPA, so we use a relative URL.
 */
export async function getPublicPage(slug: string): Promise<PublicPage> {
  const res = await fetch(`/public/pages/${encodeURIComponent(slug)}`);
  if (res.status === 404) throw new Error('not-found');
  if (!res.ok) throw new Error(`Failed to load page: ${res.status}`);
  return (await res.json()) as PublicPage;
}
