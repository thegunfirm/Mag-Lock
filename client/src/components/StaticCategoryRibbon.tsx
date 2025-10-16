// StaticCategoryRibbon.tsx — no API calls, just links
const CATS: { label: string; href: string }[] = [
  { label: 'Uppers', href: '/products?category=' + encodeURIComponent('Uppers') },
  { label: 'Handguns', href: '/products?category=' + encodeURIComponent('Handguns') },
  { label: 'Rifles', href: '/products?category=' + encodeURIComponent('Rifles') },
  { label: 'Ammo', href: '/products?category=' + encodeURIComponent('Ammo') },
  { label: 'Optics', href: '/products?category=' + encodeURIComponent('Optics') },
  { label: 'Accessories', href: '/products?category=' + encodeURIComponent('Accessories') },
  { label: 'NFA Products', href: '/products?category=' + encodeURIComponent('NFA Products') },
  { label: 'Safety & Protection', href: '/products?category=' + encodeURIComponent('Safety & Protection') },
];

export default function StaticCategoryRibbon() {
  return (
    <nav data-catribbon className="w-full bg-white/60 backdrop-blur supports-[backdrop-filter]:bg-white/40">
      <div className="mx-auto max-w-6xl px-4 py-2">
        <ul className="flex flex-wrap items-center justify-center gap-2">
          {CATS.map(c => (
            <li key={c.label}>
              <a
                href={c.href}
                className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-sm text-neutral-800 hover:bg-neutral-100"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}