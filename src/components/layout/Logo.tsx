export function LogoMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-foreground" />
      <path d="M18 46V18h15a10 10 0 0 1 2.6 19.66L45 46h-8.2l-8.4-8H25v8z M25 31h8a4 4 0 0 0 0-8h-8z" className="fill-background" fillRule="evenodd" />
      <circle cx="47" cy="19" r="4" fill="#22c55e" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className="text-sm font-semibold tracking-tight">ROA Finance</div>
        <div className="mt-1 text-xs text-muted-foreground">Tu cobro semanal, en orden</div>
      </div>
    </div>
  );
}
