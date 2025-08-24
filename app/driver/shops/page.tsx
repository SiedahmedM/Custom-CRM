'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ShopsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/driver/pitches')
  }, [router])
  return null
} 