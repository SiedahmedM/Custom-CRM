'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { 
  Package, 
  Plus, 
  MapPin, 
  Phone, 
  Clock, 
  AlertCircle,
  Home,
  ClipboardList,
  Box,
  User,
  Bell,
  DollarSign,
  ChevronRight,
  Navigation
} from 'lucide-react'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { format } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
export default function DriverDashboard() {
  const { user, isDriver } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('home')

  // Protect route
  useEffect(() => {
    if (!user || !isDriver) {
      router.push('/')
    }
  }, [user, isDriver, router])

  // Add iOS viewport adjustments
  useEffect(() => {
    // Prevent pull-to-refresh on iOS
    document.body.style.overscrollBehavior = 'none'
    
    // Handle safe area for iOS
    const setSafeArea = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    
    setSafeArea()
    window.addEventListener('resize', setSafeArea)
    
    return () => {
      window.removeEventListener('resize', setSafeArea)
      document.body.style.overscrollBehavior = 'auto'
    }
  }, [])

  // Get driver's orders with real-time updates (both assigned to them and created by them)
  const { 
    orders: allOrders, 
    updateOrderStatus 
  } = useRealtimeOrders({
    date_range: {
      start: new Date(new Date().setHours(0, 0, 0, 0)),
      end: new Date(new Date().setHours(23, 59, 59, 999))
    }
  })

  // Filter to show orders relevant to this driver
  const orders = allOrders.filter(order => 
    // Orders assigned to this driver
    order.driver_id === user?.id ||
    // Orders that need reassignment (could be picked up by this driver)
    order.status === 'needs_reassignment' ||
    // Orders created today that are pending (for visibility)
    order.status === 'pending'
  )

  // Filter orders by status for this driver
  const pendingOrders = orders.filter(o => 
    (o.status === 'assigned' && o.driver_id === user?.id) ||
    o.status === 'pending' ||
    o.status === 'needs_reassignment'
  )
  const inProgressOrders = orders.filter(o => 
    o.status === 'out_for_delivery' && o.driver_id === user?.id
  )
  const completedOrders = orders.filter(o => 
    o.status === 'delivered' && o.driver_id === user?.id
  )

  // Calculate today's stats
  const todayStats = {
    totalDeliveries: completedOrders.length,
    pendingDeliveries: pendingOrders.length,
    revenue: completedOrders.reduce((sum, order) => sum + order.total_amount, 0),
    inProgress: inProgressOrders.length
  }

  const handleStartDelivery = async (orderId: string) => {
    // Haptic feedback for iOS
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
    
    try {
      await updateOrderStatus.mutateAsync({
        id: orderId,
        status: 'out_for_delivery'
      })
      
      // Request location permission for tracking
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            console.log('Location tracking started', position)
          },
          (error) => {
            console.error('Location error:', error)
          }
        )
      }
    } catch (error) {
      console.error('Failed to start delivery:', error)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      
      {/* iOS-style Header with safe area */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40" 
              style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900 tracking-tight">
                Welcome, {user.name}
              </h1>
              <p className="text-[13px] text-gray-500 mt-0.5">
                {format(new Date(), 'EEEE, MMMM d')}
              </p>
            </div>
            <button
              onClick={() => router.push('/driver/notifications')}
              className="relative p-2 -mr-2 active:scale-95 transition-transform"
            >
              <Bell className="w-[22px] h-[22px] text-gray-600" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Show different views based on active tab */}
      {activeTab === 'home' && (
        <>
          {/* iOS-style Stats Cards */}
          <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Deliveries</p>
                <p className="text-[28px] font-bold text-gray-900 leading-tight mt-1">
                  {todayStats.totalDeliveries}
                </p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Pending</p>
                <p className="text-[28px] font-bold text-orange-600 leading-tight mt-1">
                  {todayStats.pendingDeliveries}
                </p>
              </div>
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Active</p>
                <p className="text-[28px] font-bold text-green-600 leading-tight mt-1">
                  {todayStats.inProgress}
                </p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <Navigation className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Revenue</p>
                <p className="text-[28px] font-bold text-gray-900 leading-tight mt-1">
                  ${todayStats.revenue.toFixed(0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Main Content with iOS-style scrolling */}
      <div className="px-5 pb-24 overflow-y-auto -webkit-overflow-scrolling-touch">
        {/* Current Orders */}
        {pendingOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-gray-900 mb-3 px-1">
              Pending Deliveries
            </h2>
            <div className="space-y-3">
              <AnimatePresence>
                {pendingOrders.map((order) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="bg-white rounded-2xl shadow-sm overflow-hidden active:scale-[0.98] transition-transform"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <p className="font-semibold text-[17px] text-gray-900">
                            {order.customer.shop_name}
                          </p>
                          <p className="text-[13px] text-gray-500 mt-0.5">
                            {order.order_number}
                          </p>
                        </div>
                        {order.customer.current_balance > 0 && (
                          <div className="flex items-center gap-1 bg-red-50 text-red-600 px-2.5 py-1 rounded-full">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold">${order.customer.current_balance.toFixed(0)}</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2.5 mb-3">
                        <button 
                          onClick={() => window.open(`maps://maps.apple.com/?q=${encodeURIComponent(order.delivery_address || order.customer.address || '')}`)}
                          className="flex items-start gap-2 text-[13px] text-gray-600 active:text-blue-600 transition-colors w-full text-left"
                        >
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span className="underline">{order.delivery_address || order.customer.address}</span>
                        </button>
                        {order.customer.phone && (
                          <a 
                            href={`tel:${order.customer.phone}`} 
                            className="flex items-center gap-2 text-[13px] text-blue-600 active:text-blue-700"
                          >
                            <Phone className="w-4 h-4" />
                            <span className="font-medium">{order.customer.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <div className="text-[13px]">
                        <span className="text-gray-500">Total:</span>
                        <span className="font-semibold text-[15px] text-gray-900 ml-1">
                          ${order.total_amount.toFixed(2)}
                        </span>
                      </div>
                      <button
                        onClick={() => handleStartDelivery(order.id)}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-[15px] font-medium active:bg-blue-700 transition-colors"
                      >
                        Start Delivery
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* In Progress Orders */}
        {inProgressOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-[15px] font-semibold text-gray-900 mb-3 px-1">
              In Progress
            </h2>
            <div className="space-y-3">
              {inProgressOrders.map((order) => (
                <motion.div
                  key={order.id}
                  className="bg-green-50 border border-green-200 rounded-2xl p-4 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[17px] text-gray-900">
                        {order.customer.shop_name}
                      </p>
                      <p className="text-[13px] text-gray-600 mt-0.5">
                        Started: {format(new Date(order.delivery_started_at!), 'h:mm a')}
                      </p>
                    </div>
                    <button
                      onClick={() => router.push(`/driver/delivery/${order.id}`)}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-[15px] font-medium active:bg-green-700 transition-colors"
                    >
                      Complete
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {pendingOrders.length === 0 && inProgressOrders.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
              No current orders
            </h3>
            <p className="text-[15px] text-gray-500 mb-6 px-8">
              Check back later or contact admin for assignments
            </p>
            <div className="space-y-3 px-8">
              <button
                onClick={() => router.push('/driver/shops')}
                className="w-full bg-blue-600 text-white px-4 py-3.5 rounded-2xl font-medium text-[17px] active:bg-blue-700 transition-colors"
              >
                View Suggested Shops
              </button>
              <button
                onClick={() => router.push('/driver/inventory')}
                className="w-full bg-gray-100 text-gray-700 px-4 py-3.5 rounded-2xl font-medium text-[17px] active:bg-gray-200 transition-colors"
              >
                Check Inventory
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="px-5 py-4">
          <h2 className="text-[20px] font-semibold text-gray-900 mb-4">My Orders</h2>
          
          {pendingOrders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[15px] font-semibold text-gray-700 mb-3">Pending Orders</h3>
              <div className="space-y-3">
                {pendingOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] text-gray-900">
                          {order.customer.shop_name}
                        </p>
                        <p className="text-[13px] text-gray-600 mt-0.5">
                          {order.order_number} • ${order.total_amount.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {format(new Date(order.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {inProgressOrders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[15px] font-semibold text-gray-700 mb-3">Active Deliveries</h3>
              <div className="space-y-3">
                {inProgressOrders.map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
                    onClick={() => router.push(`/driver/delivery/${order.id}`)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] text-gray-900">
                          {order.customer.shop_name}
                        </p>
                        <p className="text-[13px] text-gray-600 mt-0.5">
                          {order.order_number} • ${order.total_amount.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-green-600 mt-1 font-medium">
                          In Progress
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {completedOrders.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[15px] font-semibold text-gray-700 mb-3">Completed Today</h3>
              <div className="space-y-3">
                {completedOrders.slice(0, 5).map((order, index) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 opacity-75"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-[15px] text-gray-900">
                          {order.customer.shop_name}
                        </p>
                        <p className="text-[13px] text-gray-600 mt-0.5">
                          {order.order_number} • ${order.total_amount.toFixed(2)}
                        </p>
                        <p className="text-[11px] text-green-600 mt-1 font-medium">
                          ✓ Completed
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {orders.length === 0 && (
            <div className="text-center py-12">
              <ClipboardList className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
                No orders found
              </h3>
              <p className="text-[15px] text-gray-500">
                Orders will appear here when assigned to you
              </p>
            </div>
          )}
        </div>
      )}

      {/* Inventory Tab */}
      {activeTab === 'inventory' && (
        <div className="px-5 py-4">
          <h2 className="text-[20px] font-semibold text-gray-900 mb-4">Inventory Status</h2>
          <div className="text-center py-12">
            <Box className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
              Coming Soon
            </h3>
            <p className="text-[15px] text-gray-500">
              Inventory management for drivers will be available soon
            </p>
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="px-5 py-4">
          <h2 className="text-[20px] font-semibold text-gray-900 mb-4">Profile</h2>
          
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500 mb-1">Name</p>
              <p className="text-[16px] font-semibold text-gray-900">{user?.name}</p>
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500 mb-1">Role</p>
              <p className="text-[16px] font-semibold text-gray-900 capitalize">{user?.role}</p>
            </div>
            
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500 mb-1">Access Key</p>
              <p className="text-[16px] font-mono text-gray-900">{user?.access_key}</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
              <p className="text-[13px] text-gray-500 mb-1">Today&apos;s Performance</p>
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <p className="text-[20px] font-bold text-blue-600">{todayStats.totalDeliveries}</p>
                  <p className="text-[11px] text-gray-500">Deliveries</p>
                </div>
                <div>
                  <p className="text-[20px] font-bold text-green-600">${todayStats.revenue.toFixed(0)}</p>
                  <p className="text-[11px] text-gray-500">Revenue</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* iOS-style Floating Action Button */}
      <button
        onClick={() => router.push('/driver/new-order')}
        className="fixed bottom-24 right-5 bg-blue-600 text-white w-14 h-14 rounded-full shadow-lg active:scale-95 transition-transform z-30 flex items-center justify-center"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* iOS-style Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/50 z-30"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center py-2 pt-2.5 active:scale-95 transition-transform ${
              activeTab === 'home' ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <Home className="w-[22px] h-[22px]" strokeWidth={activeTab === 'home' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Home</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex flex-col items-center py-2 pt-2.5 active:scale-95 transition-transform ${
              activeTab === 'orders' ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <ClipboardList className="w-[22px] h-[22px]" strokeWidth={activeTab === 'orders' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Orders</span>
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-col items-center py-2 pt-2.5 active:scale-95 transition-transform ${
              activeTab === 'inventory' ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <Box className="w-[22px] h-[22px]" strokeWidth={activeTab === 'inventory' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Inventory</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center py-2 pt-2.5 active:scale-95 transition-transform ${
              activeTab === 'profile' ? 'text-blue-600' : 'text-gray-400'
            }`}
          >
            <User className="w-[22px] h-[22px]" strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
            <span className="text-[10px] mt-1 font-medium">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  )
}