import type { Metadata } from 'next'
import { DM_Mono } from 'next/font/google'
import './globals.css'

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Clui — The better UI for Claude Code',
  description: 'A calm, floating overlay for Claude Code on macOS. Free & open source. No API key required.',
}

// Inline script prevents theme flash before hydration
const themeScript = `
(function(){
  var stored = null;
  try { stored = localStorage.getItem('clui-theme'); } catch(e){}
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var sys = media.matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', stored || sys);
  if (!stored) {
    media.addEventListener('change', function(e) {
      if (!localStorage.getItem('clui-theme')) {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    });
  }
})();
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={dmMono.variable}>
        {children}
      </body>
    </html>
  )
}
