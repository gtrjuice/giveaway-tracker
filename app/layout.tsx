import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Giveaway Entry Tracker",
  description: "Track entry pack orders and wheel spin bonuses",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 antialiased">
        {children}
      </body>
    </html>
  )
}
