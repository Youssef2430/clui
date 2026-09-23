import type { SVGProps } from "react";

/** GLUI mark; the export name stays stable for the upstream workspace's consumers. */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M19.5 7.5h-6a8.5 8.5 0 0 0 0 17h6v-9h-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M23 7.5h2m-2 17h2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
  </svg>;
}
