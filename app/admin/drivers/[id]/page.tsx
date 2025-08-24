'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Package, Target, ChevronRight } from 'lucide-react'

export default function AdminDriverProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const supabase = createClient()
  const [driver, setDriver] = useState<{ id: string; name: string } | null>(null)
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; status: string }>>([])

  useEffect(() => {
    async function load() {
      type UserRow = { id: string; name: string }
      const [{ data: userRow }, { data: driverOrders }] = await Promise.all([
        supabase.from('users').select('id, name').eq('id', params.id).single<UserRow>(),
        supabase.from('orders').select('id, order_number, status').eq('driver_id', params.id).order('created_at', { ascending: false }).limit(10)
      ])
      if (userRow) setDriver({ id: userRow.id as string, name: userRow.name as string })
      setOrders(driverOrders || [])
    }
    load()
  }, [params.id, supabase])

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Driver Profile</h1>
        </div>
      </header>

      <div className="px-5 py-4 space-y-4">
        {!driver ? (
          <div className="text-gray-500 flex items-center"><Package className="w-5 h-5 mr-2" /> Driver not found</div>
        ) : (
          <>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500">Name</p>
              <p className="text-[16px] font-semibold">{driver.name}</p>
            </div>
            
            {/* Pitch History Button */}
            <button
              onClick={() => router.push(`/admin/drivers/${params.id}/pitches`)}
              className="w-full bg-blue-50 rounded-2xl p-4 shadow-sm border border-blue-200 active:bg-blue-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-[15px] font-semibold text-blue-900">View Pitch History</p>
                    <p className="text-[12px] text-blue-600 mt-0.5">Sales pitches & GPS verification</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-blue-600" />
              </div>
            </button>
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500 mb-2">Recent Orders</p>
              {orders.length === 0 ? (
                <p className="text-[13px] text-gray-500">No orders</p>
              ) : (
                <ul className="space-y-2">
                  {orders.map(o => (
                    <li key={o.id} className="flex items-center justify-between">
                      <span className="text-[14px] text-gray-800">{o.order_number}</span>
                      <span className="text-[12px] text-gray-500 capitalize">{o.status.replace('_',' ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
} 