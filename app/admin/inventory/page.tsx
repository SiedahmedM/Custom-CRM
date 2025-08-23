'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeInventory } from '@/hooks/useRealtimeInventory'
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  Filter,
  AlertTriangle,
  Package,
  TrendingUp,
  TrendingDown,
  Edit3,
  BarChart3,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'

export default function InventoryPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'low_stock' | 'out_of_stock'>('all')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Protect route
  useEffect(() => {
    if (!user || !isAdmin) {
      router.push('/')
    }
  }, [user, isAdmin, router])

  // iOS optimizations
  useEffect(() => {
    document.body.style.overscrollBehavior = 'none'
    
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

  // Get inventory with real-time updates
  const { 
    inventory, 
    isLoading, 
    lowStockCount,
    outOfStockCount,
    totalInventoryValue,
    adjustInventoryStock,
    addInventoryItem,
    updateInventoryItem,
    refetch 
  } = useRealtimeInventory({
    search_query: searchQuery,
    low_stock_only: filterType === 'low_stock'
  })

  // Filter inventory based on filter type
  const filteredInventory = inventory.filter(item => {
    switch (filterType) {
      case 'low_stock':
        return item.current_quantity <= item.reorder_threshold && item.current_quantity > 0
      case 'out_of_stock':
        return item.current_quantity === 0
      default:
        return true
    }
  })

  const handleRefresh = async () => {
    setRefreshing(true)
    // Haptic feedback
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
    
    await refetch()
    setRefreshing(false)
    toast.success('Inventory refreshed')
  }

  const handleAdjustStock = async (adjustment: {
    adjustment_type: 'add' | 'remove'
    quantity: number
    reason: string
    notes?: string
  }) => {
    if (!selectedItem || !user) return

    try {
      await adjustInventoryStock.mutateAsync({
        inventory_id: selectedItem.id,
        user_id: user.id,
        ...adjustment
      })
      setShowAdjustModal(false)
      setSelectedItem(null)
    } catch (error) {
      console.error('Failed to adjust stock:', error)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      
      {/* iOS-style Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40" 
              style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 -ml-2 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
              </button>
              <div>
                <h1 className="text-[17px] font-semibold text-gray-900">Inventory</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {inventory.length} items • ${totalInventoryValue.toFixed(0)} total value
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 active:scale-95 transition-transform"
              >
                <RefreshCw className={`w-[20px] h-[20px] text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="bg-blue-600 text-white p-2 rounded-xl active:bg-blue-700 transition-colors"
              >
                <Plus className="w-[20px] h-[20px]" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200"
          >
            <div className="text-center">
              <div className="w-8 h-8 bg-green-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                <Package className="w-4 h-4 text-green-600" />
              </div>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Total Items</p>
              <p className="text-[20px] font-bold text-gray-900 leading-tight mt-0.5">
                {inventory.length}
              </p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200"
          >
            <div className="text-center">
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
              </div>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Low Stock</p>
              <p className="text-[20px] font-bold text-orange-600 leading-tight mt-0.5">
                {lowStockCount}
              </p>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-3 shadow-sm border border-gray-200"
          >
            <div className="text-center">
              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center mx-auto mb-2">
                <XCircle className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Out of Stock</p>
              <p className="text-[20px] font-bold text-red-600 leading-tight mt-0.5">
                {outOfStockCount}
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              placeholder="Search parts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-[15px] outline-none border-0"
            />
          </div>
          
          <div className="flex gap-2">
            {(['all', 'low_stock', 'out_of_stock'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  filterType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {type === 'all' ? 'All Items' : 
                 type === 'low_stock' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inventory List */}
      <div className="px-5 pb-safe overflow-y-auto -webkit-overflow-scrolling-touch">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-gray-200 animate-pulse rounded-2xl h-24" />
            ))}
          </div>
        ) : filteredInventory.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {filteredInventory.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
                  onClick={() => {
                    setSelectedItem(item)
                    setShowAdjustModal(true)
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-start gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          item.current_quantity === 0 ? 'bg-red-50' :
                          item.current_quantity <= item.reorder_threshold ? 'bg-orange-50' :
                          'bg-green-50'
                        }`}>
                          <Package className={`w-5 h-5 ${
                            item.current_quantity === 0 ? 'text-red-600' :
                            item.current_quantity <= item.reorder_threshold ? 'text-orange-600' :
                            'text-green-600'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-[15px] text-gray-900 truncate">
                            {item.part_number}
                          </p>
                          <p className="text-[13px] text-gray-600 mt-0.5 line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <p className={`text-[16px] font-bold ${
                            item.current_quantity === 0 ? 'text-red-600' :
                            item.current_quantity <= item.reorder_threshold ? 'text-orange-600' :
                            'text-green-600'
                          }`}>
                            {item.current_quantity}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">On Hand</p>
                        </div>
                        <div>
                          <p className="text-[16px] font-bold text-blue-600">
                            {item.reserved_quantity}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Reserved</p>
                        </div>
                        <div>
                          <p className="text-[16px] font-bold text-gray-900">
                            ${item.selling_price.toFixed(0)}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Price</p>
                        </div>
                        <div>
                          <p className="text-[16px] font-bold text-gray-900">
                            ${(item.current_quantity * item.cost_per_unit).toFixed(0)}
                          </p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wide">Value</p>
                        </div>
                      </div>

                      {/* Stock Status Bar */}
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] text-gray-500">
                            Reorder at {item.reorder_threshold}
                          </span>
                          <span className={`text-[11px] font-medium ${
                            item.current_quantity === 0 ? 'text-red-600' :
                            item.current_quantity <= item.reorder_threshold ? 'text-orange-600' :
                            'text-green-600'
                          }`}>
                            {item.current_quantity === 0 ? 'OUT OF STOCK' :
                             item.current_quantity <= item.reorder_threshold ? 'LOW STOCK' :
                             'IN STOCK'}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all ${
                              item.current_quantity === 0 ? 'bg-red-500' :
                              item.current_quantity <= item.reorder_threshold ? 'bg-orange-500' :
                              'bg-green-500'
                            }`}
                            style={{ 
                              width: `${Math.min(100, (item.current_quantity / (item.reorder_threshold * 2)) * 100)}%` 
                            }}
                          />
                        </div>
                      </div>

                      {/* Recent Activity */}
                      {item.recent_adjustments && item.recent_adjustments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-[11px] text-gray-500 mb-1">Latest Activity:</p>
                          <div className="flex items-center gap-2">
                            {item.recent_adjustments[0].adjustment_type === 'add' ? (
                              <TrendingUp className="w-3 h-3 text-green-500" />
                            ) : (
                              <TrendingDown className="w-3 h-3 text-red-500" />
                            )}
                            <span className="text-[11px] text-gray-600">
                              {item.recent_adjustments[0].adjustment_type === 'add' ? '+' : '-'}
                              {item.recent_adjustments[0].quantity} • {item.recent_adjustments[0].reason}
                            </span>
                            <span className="text-[11px] text-gray-400">
                              {format(new Date(item.recent_adjustments[0].created_at), 'MMM d')}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
              No inventory found
            </h3>
            <p className="text-[15px] text-gray-500 mb-6 px-8">
              {searchQuery ? 'Try adjusting your search' : 'Add your first inventory item'}
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-medium text-[15px] active:bg-blue-700 transition-colors"
            >
              Add New Item
            </button>
          </div>
        )}
      </div>

      {/* Add/Adjust Modals would go here - keeping this file focused on the main view */}
    </div>
  )
}