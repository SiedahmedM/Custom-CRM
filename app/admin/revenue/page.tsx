'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { ArrowLeft, DollarSign } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function AdminRevenuePage() {
  const router = useRouter()
  const supabase = createClient()
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'month'>('today')
  const [total, setTotal] = useState(0)

  async function load() {
    const now = new Date()
    let start = new Date()
    if (timeframe === 'today') start = new Date(now.setHours(0,0,0,0))
    if (timeframe === 'week') start = new Date(Date.now() - 7*24*60*60*1000)
    if (timeframe === 'month') start = new Date(Date.now() - 30*24*60*60*1000)
    const { data } = await supabase
      .from('orders')
      .select('total_amount, status, created_at')
      .gte('created_at', start.toISOString())
    const rows = (data || []) as Array<{ total_amount: number; status: string; created_at: string }>
    const delivered = rows.filter(o => o.status === 'delivered')
    setTotal(delivered.reduce((s, o) => s + (o.total_amount || 0), 0))
  }

  // Lazy load on interaction
  function handleSet(tf: 'today'|'week'|'month') {
    setTimeframe(tf)
    load()
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Revenue</h1>
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-2">
          {(['today','week','month'] as const).map(tf => (
            <button key={tf} onClick={() => handleSet(tf)} className={`px-3 py-1.5 rounded-xl text-[13px] ${timeframe===tf?'bg-blue-600 text-white':'bg-gray-100 text-gray-600'}`}>{tf}</button>
          ))}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-[12px] text-gray-500">Delivered Revenue ({timeframe})</p>
              <p className="text-[22px] font-bold text-gray-900">${total.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 