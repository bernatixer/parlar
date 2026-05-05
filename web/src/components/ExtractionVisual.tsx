export function ExtractionVisual() {
  return (
    <div className="relative aspect-[4/3] w-full">
      <svg
        viewBox="0 0 480 360"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ev-prism" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#A855F7" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#F97366" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="ev-beam" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0" />
            <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ev-out-1" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#22D3EE" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ev-out-2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ev-out-3" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F97366" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#F97366" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="ev-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#A855F7" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#A855F7" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="480" height="360" fill="transparent" />
        <circle cx="240" cy="180" r="170" fill="url(#ev-glow)" />

        {/* Incoming messy signals */}
        <g opacity="0.9">
          {Array.from({ length: 14 }).map((_, i) => {
            const y = 40 + i * 18 + (i % 3) * 4;
            const len = 60 + (i % 5) * 14;
            const op = 0.25 + ((i * 37) % 60) / 100;
            return (
              <line
                key={i}
                x1={20}
                y1={y}
                x2={20 + len}
                y2={y + (i % 2 === 0 ? -4 : 4)}
                stroke="url(#ev-beam)"
                strokeWidth="1.5"
                opacity={op}
              />
            );
          })}
        </g>

        {/* Prism */}
        <g transform="translate(220 120)">
          <path
            d="M40 0 L80 80 L0 80 Z"
            fill="url(#ev-prism)"
            opacity="0.95"
          />
          <path
            d="M40 0 L80 80 L0 80 Z"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
          />
          <circle cx="40" cy="58" r="6" fill="#0B0F1A" />
        </g>

        {/* Extracted, structured beams out */}
        <g>
          <line
            x1="320"
            y1="170"
            x2="470"
            y2="120"
            stroke="url(#ev-out-1)"
            strokeWidth="2.5"
          />
          <line
            x1="320"
            y1="200"
            x2="470"
            y2="200"
            stroke="url(#ev-out-2)"
            strokeWidth="2.5"
          />
          <line
            x1="320"
            y1="230"
            x2="470"
            y2="280"
            stroke="url(#ev-out-3)"
            strokeWidth="2.5"
          />

          <circle cx="455" cy="124" r="4" fill="#22D3EE" />
          <circle cx="455" cy="200" r="4" fill="#A855F7" />
          <circle cx="455" cy="276" r="4" fill="#F97366" />
        </g>

        {/* Floating particles */}
        <g className="animate-pulse-soft">
          <circle cx="260" cy="80" r="2" fill="#22D3EE" />
          <circle cx="290" cy="60" r="1.5" fill="#A855F7" />
          <circle cx="240" cy="50" r="1.5" fill="#F97366" />
          <circle cx="310" cy="100" r="1.5" fill="#22D3EE" />
        </g>
      </svg>
    </div>
  );
}
