export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="roa-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#0ea5a4" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#0b0d12" />
      <path d="M18 46V18h15a10 10 0 0 1 2.6 19.66L45 46h-8.2l-8.4-8H25v8z M25 31h8a4 4 0 0 0 0-8h-8z" fill="url(#roa-g)" fillRule="evenodd" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-[15px] font-semibold tracking-tight">ROA Finance</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Tu cobro semanal, en orden</div>
      </div>
    </div>
  );
}
