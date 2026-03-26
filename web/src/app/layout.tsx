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
  var sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', stored || sys);
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
