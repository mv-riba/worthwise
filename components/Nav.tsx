'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/check-in', label: 'Check-in' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/history', label: 'History' },
  { href: '/household', label: 'Household' },
  { href: '/settings', label: 'Settings' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path.startsWith(l.href) ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
