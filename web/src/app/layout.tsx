import type { Metadata } from "next";
import { DM_Mono, Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GLUI — Glue UI for your coding agents",
  description:
    "Claude Code, Codex, and OpenCode, brought together in one thoughtful macOS workspace. GLUI uses your existing CLI logins.",
};

// Inline script prevents theme flash before hydration
const themeScript = `
(function(){
  var stored = null;
  try { stored = localStorage.getItem('glui-theme'); } catch(e){}
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  if (stored !== 'light' && stored !== 'dark') stored = null;
  document.documentElement.setAttribute('data-theme', stored || (media.matches ? 'dark' : 'light'));
  if (!stored) {
    media.addEventListener('change', function(e) {
      var preference = null;
      try { preference = localStorage.getItem('glui-theme'); } catch(e){}
      if (preference !== 'light' && preference !== 'dark') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${dmMono.variable} ${hanken.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        {process.env.VERCEL && <Analytics />}
      </body>
    </html>
  );
}
