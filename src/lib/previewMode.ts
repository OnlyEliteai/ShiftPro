export function isAdminPreviewMode(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === 'admin';
}

export function isChatterPreviewMode(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('preview') === 'chatter';
}
