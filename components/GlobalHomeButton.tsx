"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { Home } from 'lucide-react'

export default function GlobalHomeButton() {
  const { user } = useAuth()
  const pathname = usePathname()

  if (!user) return null
  const homeHref = user.role === 'admin' ? '/admin' : '/driver'
  if (pathname === homeHref) return null

  return (
    <Link href={homeHref} className="fixed left-4 bottom-20 z-40">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200 shadow-lg rounded-full p-3 active:scale-95 transition">
        <Home className="w-5 h-5 text-gray-800" />
      </div>
    </Link>
  )
} 