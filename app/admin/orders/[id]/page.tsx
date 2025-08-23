'use client'

import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { ArrowLeft, Package } from 'lucide-react'

export default function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { orders } = useRealtimeOrders()
  const order = orders.find(o => o.id === params.id)

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />

      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
            <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
          </button>
          <h1 className="text-[17px] font-semibold text-gray-900">Order Details</h1>
        </div>
      </header>

      {!order ? (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <Package className="w-6 h-6 mr-2" /> Order not found
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[13px] text-gray-500">Order Number</p>
            <p className="text-[16px] font-semibold">{order.order_number}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[13px] text-gray-500">Customer</p>
            <p className="text-[16px] font-semibold">{order.customer?.shop_name || '-'}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[13px] text-gray-500">Status</p>
            <p className="text-[16px] font-semibold capitalize">{order.status.replace('_',' ')}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <p className="text-[13px] text-gray-500">Total</p>
            <p className="text-[16px] font-semibold">${order.total_amount.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  )
} 