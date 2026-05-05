export function Logo({
  size = 24,
  withWordmark = true,
}: {
  size?: number;
  withWordmark?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#F97366" />
          </linearGradient>
        </defs>
        <path d="M16 4L28 26H4L16 4Z" fill="url(#logo-g)" />
        <circle cx="16" cy="22" r="3" fill="#0B0F1A" />
      </svg>
      {withWordmark && (
        <span className="text-[17px] font-semibold tracking-tight text-ink-50">
          parlar
        </span>
      )}
    </span>
  );
}
