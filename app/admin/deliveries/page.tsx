'use client'

import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { ArrowLeft, ChevronRight } from 'lucide-react'

export default function AdminActiveDeliveriesPage() {
  const router = useRouter()
  const OUT_FOR_DELIVERY = 'out_for_delivery' as const
  const { orders } = useRealtimeOrders({ status: OUT_FOR_DELIVERY })
  const active = orders.filter(o => o.status === 'out_for_delivery')

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Active Deliveries</h1>
        </div>
      </header>

      <div className="px-5 py-4 space-y-3">
        {active.map(order => (
          <button key={order.id} onClick={() => router.push(`/admin/orders/${order.id}`)} className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex items-center justify-between">
            <div>
              <p className="font-medium text-[15px] text-gray-900">{order.customer?.shop_name || order.id}</p>
              <p className="text-[13px] text-gray-600 mt-0.5">{order.order_number} • Out for delivery</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  )
} 