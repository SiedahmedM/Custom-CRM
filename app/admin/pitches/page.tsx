'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimePitches } from '@/hooks/useRealtimePitches'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { format } from 'date-fns'
import { ArrowLeft, RefreshCw, MapPin, Phone } from 'lucide-react'

export default function AdminPitchesPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const supabase = createClient()
  const [refreshing, setRefreshing] = useState(false)
  const [timeframe, setTimeframe] = useState<'today'|'week'|'month'>('today')
  const [driverId, setDriverId] = useState<string>('all')
  const { pitches, refetch } = useRealtimePitches({})
  const [drivers, setDrivers] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    if (!user || !isAdmin) router.push('/')
  }, [user, isAdmin, router])

  useEffect(() => {
    supabase.from('users').select('id, name').eq('role','driver').eq('is_active', true).then(({ data }) => {
      setDrivers(data || [])
    })
  }, [supabase])

  const filtered = useMemo(() => {
    const startEnd = (() => {
      const now = new Date()
      if (timeframe === 'today') return { start: new Date(now.setHours(0,0,0,0)), end: new Date() }
      if (timeframe === 'week') return { start: new Date(Date.now()-7*24*60*60*1000), end: new Date() }
      return { start: new Date(Date.now()-30*24*60*60*1000), end: new Date() }
    })()

    return (pitches || []).filter(p => {
      const d = new Date(p.pitch_date)
      const inRange = d >= startEnd.start && d <= startEnd.end
      const byDriver = driverId === 'all' || p.driver_id === driverId
      return inRange && byDriver
    }).sort((a,b) => new Date(b.pitch_date).getTime() - new Date(a.pitch_date).getTime())
  }, [pitches, timeframe, driverId])

  async function handleRefresh() {
    setRefreshing(true)
    await refetch()
    setRefreshing(false)
  }

  async function resolveAddressPhone(pitchId: string, shopName: string) {
    try {
      const q = encodeURIComponent(shopName)
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`
      const res = await fetch(url, { headers: { 'User-Agent': 'MufflerCRM/1.0' } })
      if (!res.ok) return
      const data = await res.json()
      if (data && data[0]) {
        const address = data[0].display_name as string
        // @ts-expect-error Supabase typing inference issue on Update payload
        await supabase.from('pitch_attempts').update({ notes: `Addr: ${address}` }).eq('id', pitchId)
        handleRefresh()
      }
    } catch {}
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />

      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
              <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Pitches</h1>
              <p className="text-[13px] text-gray-500">Live monitoring and verification</p>
            </div>
          </div>
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 active:scale-95 transition-transform">
            <RefreshCw className={`w-[20px] h-[20px] text-gray-600 ${refreshing ? 'animate-spin':''}`} />
          </button>
        </div>

        <div className="px-5 pb-3 flex items-center gap-2">
          <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
            {(['today','week','month'] as const).map(tf => (
              <button key={tf} onClick={() => setTimeframe(tf)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${timeframe===tf?'bg-white shadow text-gray-900':'text-gray-600'}`}>{tf}</button>
            ))}
          </div>
          <select value={driverId} onChange={e=>setDriverId(e.target.value)} className="bg-gray-100 rounded-xl px-3 py-2 text-[13px]">
            <option value="all">All Drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </header>

      <div className="px-5 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500">No pitches found for selected filters</div>
        ) : filtered.map(p => (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[12px] text-gray-500">{format(new Date(p.pitch_date), 'MMM d, h:mm a')}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.verification_status==='verified'?'bg-green-50 text-green-700':p.verification_status==='flagged'?'bg-red-50 text-red-700':'bg-yellow-50 text-yellow-700'}`}>{p.verification_status}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${p.interest_level==='high'?'bg-green-50 text-green-700':p.interest_level==='medium'?'bg-yellow-50 text-yellow-700':p.interest_level==='low'?'bg-orange-50 text-orange-700':'bg-gray-50 text-gray-700'}`}>{p.interest_level || 'none'}</span>
                </div>
                <div className="truncate text-[15px] font-semibold text-gray-900">{p.shop_name || 'Unknown Shop'}</div>
                <div className="mt-1 text-[13px] text-gray-600 truncate flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span className="truncate">{'address' in p ? (p as never as {address?: string}).address || 'Address not available' : 'Address not available'}</span>
                </div>
                <div className="mt-1 text-[13px] text-blue-600 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>{'phone' in p ? (p as never as {phone?: string}).phone || 'Call for info' : 'Call for info'}</span>
                </div>
              </div>
              <div className="flex-shrink-0 flex flex-col gap-2 items-end">
                <span className="text-[12px] text-gray-500">Driver</span>
                <span className="text-[14px] font-medium">{'driver' in p ? (p as never as {driver?: {name?: string}}).driver?.name || '—' : '—'}</span>
                {(!('address' in p) || !('phone' in p)) && (
                  <button onClick={()=>resolveAddressPhone(p.id, p.shop_name || '')} className="mt-2 text-[12px] bg-gray-100 px-2 py-1 rounded-lg active:bg-gray-200">Resolve Address</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 