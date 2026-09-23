type IconName =
  | "apple"
  | "arrow-down"
  | "arrow-up"
  | "arrow-up-right"
  | "arrow-right"
  | "sun"
  | "moon"
  | "plus"
  | "minus"
  | "chevron"
  | "terminal"
  | "sliders"
  | "mic"
  | "folder"
  | "check"
  | "copy"
  | "file"
  | "x";
const paths: Record<Exclude<IconName, "apple">, React.ReactNode> = {
  "arrow-down": <path d="M12 4v16m-6-6 6 6 6-6" />,
  "arrow-up": <path d="M12 20V4m-6 6 6-6 6 6" />,
  "arrow-right": <path d="M4 12h16m-6-6 6 6-6 6" />,
  "arrow-up-right": <path d="M6 18 18 6M6 6h12v12" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  moon: <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  terminal: <path d="m4 6 6 6-6 6m9 0h7" />,
  sliders: (
    <>
      <path d="M4 7h8m5 0h3M4 17h3m5 0h8" />
      <circle cx="14.5" cy="7" r="2.5" />
      <circle cx="9.5" cy="17" r="2.5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M6 11v1a6 6 0 0 0 12 0v-1m-6 7v3m-3 0h6" />
    </>
  ),
  folder: (
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  ),
  check: <path d="m5 12 4 4L19 6" />,
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M15 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6" />
    </>
  ),
  x: <path d="m6 6 12 12M6 18 18 6" />,
};
export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  if (name === "apple")
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <path
          d="M16.7 2c.2 1.4-.4 2.7-1.2 3.6-.9 1-2.1 1.5-3.3 1.4-.2-1.3.5-2.7 1.3-3.5.9-.9 2.2-1.5 3.2-1.5ZM20 17.3c-.5 1.1-.8 1.7-1.5 2.7-1 1.4-2.2 3.1-3.8 3.1-1.4 0-1.8-.9-3.7-.9s-2.4.9-3.7.9c-1.6 0-2.8-1.5-3.8-3-2.8-4-3.1-8.7-1.4-11.1 1.2-1.7 3.1-2.6 4.8-2.6 1.5 0 2.5.9 3.8.9 1.2 0 2-.9 3.8-.9 1.4 0 2.9.8 4 2.1-3.5 1.9-2.9 6.9 1.5 8.8Z"
          transform="translate(2 0) scale(.9)"
        />
      </svg>
    );
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {paths[name]}
    </svg>
  );
}
