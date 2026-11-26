/** A static build accepts a Worker HTTPS origin, with an optional /api suffix. */
export function parseApiBase(value: string | undefined): URL | undefined {
  const input = value?.trim();
  if (!input || input === '/api' || input === '/api/') return;
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !['/', '/api', '/api/'].includes(url.pathname)) {
    throw new Error('VITE_API_BASE_URL must be an HTTPS Worker origin, with an optional /api suffix.');
  }
  return url;
}
