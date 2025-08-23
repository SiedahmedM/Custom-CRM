'use client'

import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { ArrowLeft, ChevronRight } from 'lucide-react'

export default function AdminDriversPage() {
  const router = useRouter()
  const supabase = createClient()
  const [drivers, setDrivers] = useState<Array<{id:string; name:string}>>([])

  useEffect(() => {
    supabase.from('users').select('id, name').eq('role','driver').eq('is_active', true).then(({ data }) => {
      setDrivers(data || [])
    })
  }, [supabase])

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Drivers</h1>
        </div>
      </header>

      <div className="px-5 py-4 space-y-3">
        {drivers.map(d => (
          <button key={d.id} onClick={() => router.push(`/admin/drivers/${d.id}`)} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex items-center justify-between">
            <span className="font-medium text-[15px] text-gray-900">{d.name}</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  )
} 