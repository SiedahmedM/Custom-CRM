'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { ArrowLeft, ChevronRight, Package, Filter, Trash2, AlertTriangle, Home, FileText, Users } from 'lucide-react'
import { format, startOfToday, subWeeks, subMonths, subYears } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

type TimeFilter = 'day' | 'week' | 'month' | 'year'
type StatusFilter = 'all' | 'pending' | 'assigned' | 'out_for_delivery' | 'delivered' | 'cancelled' | 'needs_reassignment'

export default function AdminOrdersPage() {
  const router = useRouter()
  const supabase = createClient()
  const { orders, isLoading, refetch } = useRealtimeOrders()
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<TimeFilter>('month')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<StatusFilter>('all')
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<{
    id: string
    order_number: string
    customer: { shop_name: string }
    total_amount: number
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'reports' | 'drivers'>('orders')
  
  // Filter orders by time and status
  const getTimeFilterDate = () => {
    const now = new Date()
    switch (selectedTimeFilter) {
      case 'day':
        return startOfToday()
      case 'week':
        return subWeeks(now, 1)
      case 'month':
        return subMonths(now, 1)
      case 'year':
        return subYears(now, 1)
      default:
        return subMonths(now, 1)
    }
  }
  
  const filteredOrders = orders.filter(order => {
    // Time filter
    const orderDate = new Date(order.created_at)
    const filterDate = getTimeFilterDate()
    const timeMatch = orderDate >= filterDate
    
    // Status filter
    const statusMatch = selectedStatusFilter === 'all' || order.status === selectedStatusFilter
    
    return timeMatch && statusMatch
  })
  
  const handleDeleteOrder = async () => {
    if (!orderToDelete) return
    
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderToDelete.id)
      
      if (error) throw error
      
      toast.success('Order deleted successfully')
      setShowDeleteModal(false)
      setOrderToDelete(null)
      refetch()
    } catch (error) {
      console.error('Error deleting order:', error)
      toast.error('Failed to delete order')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />

      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
              <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
            </button>
            <h1 className="text-[17px] font-semibold text-gray-900">All Orders</h1>
          </div>
          
          {/* Filters */}
          <div className="space-y-3">
            {/* Time Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <div className="flex items-center gap-1">
                {(['day', 'week', 'month', 'year'] as const).map((timeFrame) => (
                  <button
                    key={timeFrame}
                    onClick={() => setSelectedTimeFilter(timeFrame)}
                    className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                      selectedTimeFilter === timeFrame
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                    }`}
                  >
                    {timeFrame === 'day' ? 'Today' : timeFrame === 'week' ? 'Week' : timeFrame === 'month' ? 'Month' : 'Year'}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Status Filter */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['all', 'pending', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setSelectedStatusFilter(status)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all whitespace-nowrap ${
                    selectedStatusFilter === status
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </button>
              ))}
            </div>
            
            {/* Results count */}
            <p className="text-[11px] text-gray-500">
              {filteredOrders.length} orders {selectedTimeFilter === 'day' ? 'today' : `in the past ${selectedTimeFilter}`}
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-4 pb-20">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 animate-pulse rounded-2xl" />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No orders found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
              >
                <div className="flex items-center justify-between">
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => router.push(`/admin/orders/${order.id}`)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-medium px-2 py-1 rounded-full ${
                        order.status === 'delivered' ? 'bg-green-50 text-green-700' :
                        order.status === 'out_for_delivery' ? 'bg-blue-50 text-blue-700' :
                        order.status === 'needs_reassignment' ? 'bg-red-50 text-red-700' :
                        order.status === 'cancelled' ? 'bg-gray-50 text-gray-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {order.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                    <p className="font-medium text-[15px] text-gray-900">
                      {order.customer?.shop_name || order.id}
                    </p>
                    <p className="text-[13px] text-gray-600 mt-0.5">
                      {order.order_number} • ${order.total_amount.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {format(new Date(order.created_at), 'MMM d, yyyy • h:mm a')}
                    </p>
                    {order.driver && (
                      <p className="text-[11px] text-blue-600 mt-0.5">
                        Driver: {order.driver.name}
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOrderToDelete(order)
                        setShowDeleteModal(true)
                      }}
                      className="p-2 bg-red-50 text-red-600 rounded-lg active:bg-red-100 transition-colors"
                      title="Delete order"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
      
      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && orderToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowDeleteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-[17px] font-semibold text-gray-900">Delete Order</h3>
                  <p className="text-[13px] text-gray-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-xl p-3 mb-6">
                <p className="text-[13px] font-medium text-gray-900">
                  {orderToDelete.customer.shop_name}
                </p>
                <p className="text-[12px] text-gray-600">
                  {orderToDelete.order_number} • ${orderToDelete.total_amount.toFixed(2)}
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-[15px] active:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteOrder}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium text-[15px] active:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/50 z-40"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4 px-2 py-2">
          <button
            onClick={() => {
              setActiveTab('home')
              router.push('/admin')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'home' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'orders' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">All Orders</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('reports')
              router.push('/admin/reports')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'reports' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Reports</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('drivers')
              router.push('/admin/drivers')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'drivers' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">Drivers</span>
          </button>
        </div>
      </div>
    </div>
  )
}