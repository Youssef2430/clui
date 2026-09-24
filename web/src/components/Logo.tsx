/** A continuous, open G with a rounded inward-facing bridge. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`logo-mark ${className}`}
      viewBox="0 0 80 80"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M57 22.5A25 25 0 1 0 65 41H43"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <LogoMark />
      </span>
      {!compact && <span className="brand-wordmark">glui</span>}
    </span>
  );
}
