'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeCustomers } from '@/hooks/useRealtimeCustomers'
import { 
  ArrowLeft, 
  Search, 
  AlertTriangle,
  DollarSign,
  Clock,
  User,
  Send,
  Eye,
  RefreshCw,
  CheckCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const paymentSchema = z.object({
  customer_id: z.string(),
  amount: z.number().min(0.01, 'Amount must be greater than 0'),
  payment_method: z.enum(['cash', 'check', 'card', 'transfer', 'other']),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
})

type PaymentFormData = z.infer<typeof paymentSchema>

export default function OutstandingBalancesPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'balance' | 'days' | 'customer'>('balance')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<typeof customers[0] | null>(null)
  const [showReminderModal, setShowReminderModal] = useState(false)
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

  // Get customers with outstanding balances
  const { 
    customers, 
    isLoading, 
    addPayment,
    sendBalanceReminder,
    refetch,
    totals 
  } = useRealtimeCustomers({
    outstanding_only: true,
    search_query: searchQuery
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
    setValue
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema)
  })

  // Sort customers
  const sortedCustomers = [...customers].sort((a, b) => {
    switch (sortBy) {
      case 'balance':
        return b.current_balance - a.current_balance
      case 'days':
        return b.days_outstanding - a.days_outstanding
      case 'customer':
        return a.shop_name.localeCompare(b.shop_name)
      default:
        return 0
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
    toast.success('Balances refreshed')
  }

  const handleAddPayment = (customer: typeof customers[0]) => {
    setSelectedCustomer(customer)
    setValue('customer_id', customer.id)
    setValue('amount', customer.current_balance) // Default to full balance
    setShowPaymentModal(true)
  }

  const onSubmitPayment = async (data: PaymentFormData) => {
    if (!user) return

    try {
      await addPayment.mutateAsync({
        customer_id: data.customer_id,
        amount: data.amount,
        payment_method: data.payment_method,
        reference_number: data.reference_number || null,
        notes: data.notes || null,
        payment_date: new Date().toISOString(),
        order_id: null,
        processed_by: user.id
      })
      
      setShowPaymentModal(false)
      setSelectedCustomer(null)
      reset()
    } catch (error) {
      console.error('Failed to add payment:', error)
    }
  }

  const handleSendReminder = async (customer: typeof customers[0], message?: string) => {
    try {
      await sendBalanceReminder.mutateAsync({
        customer_id: customer.id,
        message
      })
      setShowReminderModal(false)
      setSelectedCustomer(null)
    } catch (error) {
      console.error('Failed to send reminder:', error)
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
                <h1 className="text-[17px] font-semibold text-gray-900">Outstanding Balances</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {totals.customersWithBalance} customers • ${totals.totalOutstanding.toFixed(0)} total
                </p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 active:scale-95 transition-transform"
            >
              <RefreshCw className={`w-[20px] h-[20px] text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3 mb-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Total Outstanding</p>
                <p className="text-[24px] font-bold text-red-600 leading-tight mt-1">
                  ${totals.totalOutstanding.toFixed(0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Average Balance</p>
                <p className="text-[24px] font-bold text-orange-600 leading-tight mt-1">
                  ${totals.averageBalance.toFixed(0)}
                </p>
              </div>
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </motion.div>
        </div>

        {totals.oldestOutstanding && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-medium text-red-900">Oldest Outstanding Balance</p>
                <p className="text-[15px] font-semibold text-red-900 mt-0.5">
                  {totals.oldestOutstanding.shop_name} • {totals.oldestOutstanding.days_outstanding} days • ${totals.oldestOutstanding.current_balance.toFixed(2)}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Search and Sort */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="search"
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-[15px] outline-none border-0"
            />
          </div>
          
          <div className="flex gap-2">
            {[
              { value: 'balance', label: 'By Amount', icon: DollarSign },
              { value: 'days', label: 'By Days', icon: Clock },
              { value: 'customer', label: 'By Name', icon: User },
            ].map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setSortBy(value as 'balance' | 'days' | 'customer')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                  sortBy === value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Customers List */}
      <div className="px-5 pb-safe overflow-y-auto -webkit-overflow-scrolling-touch">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-gray-200 animate-pulse rounded-2xl h-32" />
            ))}
          </div>
        ) : sortedCustomers.length > 0 ? (
          <div className="space-y-3">
            <AnimatePresence>
              {sortedCustomers.map((customer, index) => (
                <motion.div
                  key={customer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-[17px] font-semibold text-gray-900">
                        {customer.shop_name}
                      </h3>
                      {customer.contact_name && (
                        <p className="text-[13px] text-gray-600 mt-0.5">
                          Contact: {customer.contact_name}
                        </p>
                      )}
                      {customer.assigned_driver && (
                        <p className="text-[13px] text-blue-600 mt-0.5">
                          Driver: {customer.assigned_driver.name}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-[20px] font-bold text-red-600">
                        ${customer.current_balance.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {customer.days_outstanding} days old
                      </p>
                    </div>
                  </div>

                  {/* Customer Details */}
                  <div className="grid grid-cols-2 gap-4 mb-4 text-center">
                    <div>
                      <p className="text-[16px] font-semibold text-gray-900">
                        {customer.order_count}
                      </p>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide">Recent Orders</p>
                    </div>
                    <div>
                      <p className="text-[16px] font-semibold text-green-600">
                        ${customer.total_revenue.toFixed(0)}
                      </p>
                      <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total Revenue</p>
                    </div>
                  </div>

                  {/* Recent Activity */}
                  {customer.last_payment_date && (
                    <div className="bg-gray-50 rounded-xl p-3 mb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <span className="text-[13px] font-medium text-gray-700">Last Payment</span>
                      </div>
                      <p className="text-[13px] text-gray-600">
                        {format(new Date(customer.last_payment_date), 'MMM d, yyyy')} • 
                        {customer.recent_payments?.[0] && (
                          <span className="ml-1">
                            ${customer.recent_payments[0].amount.toFixed(2)} ({customer.recent_payments[0].payment_method})
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAddPayment(customer)}
                      className="flex-1 bg-green-600 text-white px-4 py-3 rounded-xl font-medium text-[15px] active:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Record Payment
                    </button>
                    
                    {customer.assigned_driver && (
                      <button
                        onClick={() => {
                          setSelectedCustomer(customer)
                          setShowReminderModal(true)
                        }}
                        className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-xl font-medium text-[15px] active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Send Reminder
                      </button>
                    )}

                    <button
                      onClick={() => router.push(`/admin/customers/${customer.id}`)}
                      className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl active:bg-gray-200 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
              No Outstanding Balances
            </h3>
            <p className="text-[15px] text-gray-500 px-8">
              {searchQuery ? 'No customers match your search' : 'All customers have paid their balances!'}
            </p>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end"
            onClick={() => setShowPaymentModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSubmit(onSubmitPayment)} className="p-5">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[20px] font-bold text-gray-900">Record Payment</h2>
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                <div className="bg-blue-50 rounded-2xl p-4 mb-6">
                  <p className="text-[17px] font-semibold text-gray-900">
                    {selectedCustomer.shop_name}
                  </p>
                  <p className="text-[13px] text-gray-600 mt-1">
                    Current Balance: ${selectedCustomer.current_balance.toFixed(2)}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                      Payment Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('amount', { valueAsNumber: true })}
                      className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[17px] font-semibold outline-none"
                      placeholder="0.00"
                    />
                    {errors.amount && (
                      <p className="text-red-500 text-[13px] mt-1">{errors.amount.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: 'cash', label: 'Cash' },
                        { value: 'check', label: 'Check' },
                        { value: 'card', label: 'Card' },
                        { value: 'transfer', label: 'Transfer' },
                      ].map(({ value, label }) => (
                        <label
                          key={value}
                          className={`flex items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all`}
                        >
                          <input
                            type="radio"
                            value={value}
                            {...register('payment_method')}
                            className="sr-only"
                          />
                          <span className="text-[15px] font-medium">{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                      Reference Number
                    </label>
                    <input
                      type="text"
                      {...register('reference_number')}
                      className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none"
                      placeholder="Check number, transaction ID, etc."
                    />
                  </div>

                  <div>
                    <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                      Notes
                    </label>
                    <textarea
                      {...register('notes')}
                      className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none resize-none"
                      rows={3}
                      placeholder="Additional notes about this payment..."
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-6 bg-green-600 text-white py-4 rounded-2xl font-semibold text-[17px] active:bg-green-700 transition-colors"
                >
                  Record Payment
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reminder Modal */}
      <AnimatePresence>
        {showReminderModal && selectedCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-5"
            onClick={() => setShowReminderModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[18px] font-bold text-gray-900 mb-4">
                Send Balance Reminder
              </h3>
              
              <p className="text-[15px] text-gray-600 mb-4">
                Send a reminder to <strong>{selectedCustomer.assigned_driver?.name}</strong> about {selectedCustomer.shop_name}&apos;s outstanding balance of <strong>${selectedCustomer.current_balance.toFixed(2)}</strong>?
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowReminderModal(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium active:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSendReminder(selectedCustomer)}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium active:bg-blue-700 transition-colors"
                >
                  Send Reminder
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}