import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ChattingLord',
  description: 'Real-time ephemeral chat and collaboration platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}

