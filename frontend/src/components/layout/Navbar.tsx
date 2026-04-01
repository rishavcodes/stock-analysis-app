'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/screener', label: 'Screener' },
  { href: '/portfolio', label: 'Portfolio' },
  { href: '/alerts', label: 'Alerts' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-800 bg-gray-950">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-lg font-bold text-blue-400">
            StockAnalyzer AI
          </Link>
          <div className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
