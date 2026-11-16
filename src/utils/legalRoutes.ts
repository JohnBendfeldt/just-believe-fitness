export type LegalDocTab = 'privacy' | 'terms';

export function resolveLegalRouteFromPathname(pathname: string): LegalDocTab | null {
  const clean = pathname.replace(/\/+$/, '').toLowerCase();
  if (clean === '/privacy' || clean === '/privacy-policy') return 'privacy';
  if (clean === '/terms' || clean === '/liability' || clean === '/legal') return 'terms';
  return null;
}
