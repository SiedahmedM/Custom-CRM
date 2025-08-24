'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { useRealtimeCustomers } from '@/hooks/useRealtimeCustomers'
import { 
  ArrowLeft, 
  MapPin, 
  Phone as PhoneIcon,
  Package,
  DollarSign,
  CreditCard,
  Banknote,
  AlertCircle,
  FileText,
  Navigation
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { logDriverLocation } from '@/lib/location-tracking'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const paymentSchema = z.object({
  order_total: z.number().min(0, 'Order total must be positive'),
  amount_paid: z.number().min(0, 'Payment amount must be positive'),
  payment_method: z.enum(['cash', 'check', 'card', 'transfer', 'other']),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  customer_signature: z.string().min(1, 'Customer signature is required'),
})

type PaymentFormData = z.infer<typeof paymentSchema>

export default function DeliveryCompletionPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { user, isDriver } = useAuth()
  const supabase = createClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null)
  const [deliveryStarted, setDeliveryStarted] = useState(false)
  const [signature, setSignature] = useState('')
  const [showSignaturePad, setShowSignaturePad] = useState(false)

  // Protect route
  useEffect(() => {
    if (!user || !isDriver) {
      router.push('/')
    }
  }, [user, isDriver, router])

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setCurrentLocation(position),
        (error) => console.error('Location error:', error),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [])

  // Get order details
  const { orders, updateOrderStatus, updateOrder } = useRealtimeOrders({})
  const order = orders.find(o => o.id === params.id)

  // Get customer details with real-time balance
  const { addPayment } = useRealtimeCustomers({})

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      order_total: order?.total_amount || 0,
      amount_paid: 0,
      payment_method: 'cash',
      customer_signature: ''
    }
  })

  // Update signature in form when it changes
  useEffect(() => {
    setValue('customer_signature', signature)
  }, [signature, setValue])

  const orderTotal = watch('order_total')
  const amountPaid = watch('amount_paid')
  const previousBalance = order?.customer?.current_balance || 0
  const totalDue = orderTotal + previousBalance
  const remainingBalance = totalDue - amountPaid

  // Update form when order data loads
  useEffect(() => {
    if (order) {
      setValue('order_total', order.total_amount)
    }
  }, [order, setValue])

  const handleArrivedAtCustomer = async () => {
    if (!order || !user) return

    try {
      await updateOrderStatus.mutateAsync({
        id: order.id,
        status: 'out_for_delivery'
      })

      // Log arrival with GPS coordinates
      await logDriverLocation(user.id, 'arrival_at_customer')

      setDeliveryStarted(true)
      toast.success('Arrival logged with GPS coordinates')
      
      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }
    } catch (error) {
      console.error('Failed to log arrival:', error)
      toast.error('Failed to log arrival')
    }
  }

  const onSubmit = async (data: PaymentFormData) => {
    if (!order || !user) return

    // Validate required fields
    if (!data.customer_signature || data.customer_signature.trim() === '') {
      toast.error('Customer signature is required')
      return
    }

    if (data.order_total <= 0) {
      toast.error('Order total must be greater than 0')
      return
    }

    if (data.amount_paid < 0) {
      toast.error('Payment amount cannot be negative')
      return
    }

    setIsSubmitting(true)
    
    try {
      // Start transaction-like operations
      const deliveryTime = new Date().toISOString()

      // 1. Update order status to delivered
      try {
        await updateOrderStatus.mutateAsync({
          id: order.id,
          status: 'delivered'
        })
      } catch (error) {
        throw new Error(`Failed to update order status: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // 2. Update order with final amount and delivery details
      try {
        await updateOrder.mutateAsync({
          id: order.id,
          updates: {
            total_amount: data.order_total,
            paid_amount: data.amount_paid,
            delivered_at: deliveryTime,
            delivery_latitude: currentLocation?.coords.latitude ?? null,
            delivery_longitude: currentLocation?.coords.longitude ?? null,
            special_instructions: data.notes ?? null
          }
        })
      } catch (error) {
        throw new Error(`Failed to update order details: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }

      // 3. Record payment if any was made
      if (data.amount_paid > 0) {
        try {
          await addPayment.mutateAsync({
            order_id: order.id,
            customer_id: order.customer_id,
            amount: data.amount_paid,
            payment_method: data.payment_method,
            payment_date: deliveryTime,
            reference_number: data.reference_number ?? null,
            notes: data.notes ?? null,
            user_id: user.id
          })
        } catch (error) {
          throw new Error(`Failed to record payment: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      // 4. Log activity for audit trail
      try {
        const { error: activityError } = await supabase
          .from('activity_logs')
          // @ts-expect-error - Supabase types are complex for dynamic content
          .insert({
            user_id: user.id,
            action: 'delivery_completed',
            entity_type: 'order',
            entity_id: order.id,
            details: {
              order_total: data.order_total,
              amount_paid: data.amount_paid,
              payment_method: data.payment_method,
              remaining_balance: remainingBalance,
              delivery_coordinates: currentLocation ? {
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude,
                accuracy: currentLocation.coords.accuracy
              } : null,
              timestamp: deliveryTime
            },
            ip_address: null,
            user_agent: null
          })
        
        if (activityError) {
          console.warn('Failed to log activity:', activityError)
          // Don't throw error for logging failure
        }
      } catch (error) {
        console.warn('Failed to log activity:', error)
        // Don't throw error for logging failure
      }

      // 5. Log completion location
      try {
        await logDriverLocation(user.id, 'delivery_completed')
      } catch (error) {
        console.warn('Failed to log driver location:', error)
        // Don't throw error for location logging failure
      }

      // 6. Create notification for admin
      try {
        const { error: notificationError } = await supabase
          .from('notifications')
          // @ts-expect-error - Supabase types are complex for dynamic content
          .insert({
            user_id: null,
            title: 'Delivery Completed',
            message: `${user.name} completed delivery to ${order.customer.shop_name} - $${data.amount_paid.toFixed(2)} collected`,
            type: 'delivery',
            priority: 'normal',
            is_read: false,
            related_order_id: order.id
          })
        
        if (notificationError) {
          console.warn('Failed to create notification:', notificationError)
          // Don't throw error for notification failure
        }
      } catch (error) {
        console.warn('Failed to create notification:', error)
        // Don't throw error for notification failure
      }

      toast.success('Delivery completed successfully!', {
        icon: '��',
        duration: 5000,
      })

      // Haptic feedback for success
      if (window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100])
      }

      // Navigate to pitches page after delivery completion
      setTimeout(() => {
        router.push('/driver/pitches?from=delivery')
      }, 2000)

    } catch (error) {
      console.error('Failed to complete delivery:', error)
      
      // More detailed error reporting
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : 'Unknown error occurred'
      
      toast.error(`Delivery completion failed: ${errorMessage}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const openMapsNavigation = () => {
    if (order?.delivery_address || order?.customer.address) {
      const address = encodeURIComponent(order.delivery_address || order.customer.address || '')
      window.open(`maps://maps.apple.com/?daddr=${address}`)
    }
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Order not found</p>
          <button
            onClick={() => router.back()}
            className="mt-4 text-blue-600 font-medium"
          >
            Go Back
          </button>
        </div>
      </div>
    )
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
                <h1 className="text-[17px] font-semibold text-gray-900">Delivery</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {order.order_number}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                order.status === 'delivered' ? 'bg-green-500' :
                order.status === 'out_for_delivery' ? 'bg-blue-500 animate-pulse' :
                'bg-orange-500'
              }`} />
            </div>
          </div>
        </div>
      </header>

      {/* Order Details */}
      <div className="px-5 py-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h2 className="text-[20px] font-bold text-gray-900">
                {order.customer.shop_name}
              </h2>
              {order.customer.contact_name && (
                <p className="text-[15px] text-gray-600 mt-1">
                  Contact: {order.customer.contact_name}
                </p>
              )}
            </div>
            {order.customer.current_balance > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-[13px] font-semibold text-red-700">
                    Outstanding: ${order.customer.current_balance.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Contact & Location */}
          <div className="space-y-3 mb-4">
            <button
              onClick={openMapsNavigation}
              className="w-full flex items-center gap-3 p-3 bg-blue-50 rounded-xl active:bg-blue-100 transition-colors"
            >
              <MapPin className="w-5 h-5 text-blue-600" />
              <div className="flex-1 text-left">
                <p className="text-[15px] font-medium text-blue-900">Navigate to Customer</p>
                <p className="text-[13px] text-blue-600 mt-0.5">
                  {order.delivery_address || order.customer.address}
                </p>
              </div>
              <Navigation className="w-5 h-5 text-blue-600" />
            </button>

            {order.customer.phone && (
              <a
                href={`tel:${order.customer.phone}`}
                className="w-full flex items-center gap-3 p-3 bg-green-50 rounded-xl active:bg-green-100 transition-colors"
              >
                <PhoneIcon className="w-5 h-5 text-green-600" />
                <div className="flex-1 text-left">
                  <p className="text-[15px] font-medium text-green-900">Call Customer</p>
                  <p className="text-[13px] text-green-600 mt-0.5">
                    {order.customer.phone}
                  </p>
                </div>
              </a>
            )}
          </div>

          {/* Order Items */}
          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-[15px] font-semibold text-gray-900 mb-3">Order Items</h3>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <p className="text-[15px] font-medium text-gray-900">
                      {item.inventory.part_number}
                    </p>
                    <p className="text-[13px] text-gray-600">
                      {item.inventory.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-medium text-gray-900">
                      {item.quantity} × ${item.unit_price.toFixed(2)}
                    </p>
                    <p className="text-[13px] text-gray-600">
                      ${item.total_price.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-100 pt-3 mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[17px] font-semibold text-gray-900">Total:</span>
                <span className="text-[20px] font-bold text-gray-900">
                  ${order.total_amount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {!deliveryStarted && order.status !== 'out_for_delivery' && (
            <button
              onClick={handleArrivedAtCustomer}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-[17px] active:bg-blue-700 transition-colors"
            >
              I&apos;ve Arrived at Customer
            </button>
          )}

          {(deliveryStarted || order.status === 'out_for_delivery') && !showPaymentForm && (
            <button
              onClick={() => setShowPaymentForm(true)}
              className="w-full bg-green-600 text-white py-4 rounded-2xl font-semibold text-[17px] active:bg-green-700 transition-colors"
            >
              Complete Delivery & Collect Payment
            </button>
          )}
        </div>
      </div>

      {/* Payment Form Modal */}
      <AnimatePresence>
        {showPaymentForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end"
            onClick={() => setShowPaymentForm(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto pb-safe"
              onClick={(e) => e.stopPropagation()}
            >
              <form onSubmit={handleSubmit(onSubmit)} className="p-5">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-[20px] font-bold text-gray-900">Complete Delivery</h2>
                  <button
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                {/* Live Payment Calculations */}
                <div className="space-y-3 mb-6">
                  {/* Order Amount */}
                  <div className="bg-gray-50 rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[15px] text-gray-700">Current Order Amount:</span>
                      <span className="text-[18px] font-semibold text-gray-900">
                        ${orderTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Previous Balance - Highlighted if > 0 */}
                  <div className={`rounded-2xl p-4 ${
                    previousBalance > 0 
                      ? 'bg-red-50 border-2 border-red-200' 
                      : 'bg-gray-50'
                  }`}>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] text-gray-700">Previous Balance:</span>
                        {previousBalance > 0 && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <span className={`text-[18px] font-semibold ${
                        previousBalance > 0 ? 'text-red-700' : 'text-gray-900'
                      }`}>
                        ${previousBalance.toFixed(2)}
                      </span>
                    </div>
                    {previousBalance > 0 && (
                      <p className="text-[12px] text-red-600 mt-2 font-medium">
                        ⚠️ Outstanding balance - collect with current order
                      </p>
                    )}
                  </div>

                  {/* Total Due */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[17px] font-bold text-blue-900">TOTAL DUE:</span>
                      <span className="text-[24px] font-black text-blue-900">
                        ${totalDue.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[12px] text-blue-700 mt-1">
                      Auto-calculated • Updates in real-time
                    </p>
                  </div>

                  {/* Live Remaining Balance */}
                  {amountPaid > 0 && (
                    <div className={`rounded-2xl p-4 border-2 ${
                      remainingBalance > 0 
                        ? 'bg-orange-50 border-orange-200'
                        : remainingBalance < 0
                        ? 'bg-green-50 border-green-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-[15px] font-medium">After Payment:</span>
                        <div className="text-right">
                          <span className={`text-[20px] font-bold ${
                            remainingBalance > 0 
                              ? 'text-orange-700'
                              : remainingBalance < 0
                              ? 'text-green-700'
                              : 'text-gray-900'
                          }`}>
                            ${Math.abs(remainingBalance).toFixed(2)}
                          </span>
                          <p className="text-[11px] text-gray-600 mt-1">
                            {remainingBalance > 0 
                              ? 'Remaining balance'
                              : remainingBalance < 0
                              ? 'Change due to customer'
                              : 'Fully paid'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Order Total (Editable) */}
                <div className="mb-4">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                    Order Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('order_total', { valueAsNumber: true })}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[17px] font-semibold outline-none"
                  />
                  {errors.order_total && (
                    <p className="text-red-500 text-[13px] mt-1">{errors.order_total.message}</p>
                  )}
                </div>

                {/* Amount Paid */}
                <div className="mb-4">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                    Amount Received
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('amount_paid', { valueAsNumber: true })}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[17px] font-semibold outline-none"
                    placeholder="0.00"
                  />
                  {errors.amount_paid && (
                    <p className="text-red-500 text-[13px] mt-1">{errors.amount_paid.message}</p>
                  )}
                </div>

                {/* Payment Method */}
                <div className="mb-4">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'cash', label: 'Cash', icon: Banknote },
                      { value: 'check', label: 'Check', icon: FileText },
                      { value: 'card', label: 'Card', icon: CreditCard },
                      { value: 'transfer', label: 'Transfer', icon: DollarSign },
                    ].map(({ value, label, icon: Icon }) => (
                      <label
                        key={value}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                          watch('payment_method') === value
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          value={value}
                          {...register('payment_method')}
                          className="sr-only"
                        />
                        <Icon className="w-5 h-5 text-gray-600" />
                        <span className="text-[15px] font-medium text-gray-900">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Reference Number */}
                <div className="mb-4">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                    Reference Number (Optional)
                  </label>
                  <input
                    type="text"
                    {...register('reference_number')}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none"
                    placeholder="Check number, transaction ID, etc."
                  />
                </div>

                {/* Notes */}
                <div className="mb-4">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
                    Notes (Optional)
                  </label>
                  <textarea
                    {...register('notes')}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none resize-none"
                    rows={3}
                    placeholder="Any additional notes about the delivery or payment..."
                  />
                </div>

                {/* Customer Signature */}
                <div className="mb-6">
                  <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
                    Customer Signature *
                  </label>
                  {signature ? (
                    <div className="bg-white border-2 border-green-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] text-green-700 font-medium">✓ Signature Captured</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSignature('')
                            setShowSignaturePad(true)
                          }}
                          className="text-[13px] text-blue-600 font-medium"
                        >
                          Retake
                        </button>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 h-20 flex items-center justify-center">
                        <span className="text-[13px] text-gray-600">📝 Signature on file</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSignaturePad(true)}
                      className="w-full bg-gray-100 border-2 border-gray-300 border-dashed rounded-xl p-6 text-center active:bg-gray-200 transition-colors"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-[20px]">✏️</span>
                        </div>
                        <span className="text-[15px] font-medium text-gray-700">Tap to Capture Signature</span>
                        <span className="text-[13px] text-gray-500">Required for delivery completion</span>
                      </div>
                    </button>
                  )}
                  {errors.customer_signature && (
                    <p className="text-red-500 text-[13px] mt-1">{errors.customer_signature.message}</p>
                  )}
                </div>


                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !signature}
                  className="w-full bg-green-600 text-white py-4 rounded-2xl font-semibold text-[17px] disabled:opacity-50 disabled:cursor-not-allowed active:bg-green-700 transition-colors"
                >
                  {isSubmitting ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing Real-time Updates...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <span>📋</span>
                      Submit Payment & Complete Delivery
                    </div>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Signature Pad Modal */}
      <AnimatePresence>
        {showSignaturePad && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-5"
            onClick={() => setShowSignaturePad(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[18px] font-bold text-gray-900">Customer Signature</h3>
                <button
                  onClick={() => setShowSignaturePad(false)}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              
              <div className="mb-4">
                <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 h-40 flex items-center justify-center">
                  <SignaturePad onSignatureCapture={setSignature} />
                </div>
                <p className="text-[13px] text-gray-500 mt-2 text-center">
                  Have the customer sign above to confirm delivery
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSignaturePad(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-[15px] active:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (signature) {
                      setShowSignaturePad(false)
                    }
                  }}
                  disabled={!signature}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium text-[15px] active:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  Save Signature
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Simple Canvas Signature Pad Component
function SignaturePad({ onSignatureCapture }: { onSignatureCapture: (signature: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let clientX, clientY
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let clientX, clientY
    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    
    const canvas = canvasRef.current
    if (!canvas) return

    // Capture signature as base64 data URL
    const dataURL = canvas.toDataURL('image/png')
    onSignatureCapture(dataURL)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    onSignatureCapture('')
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  return (
    <div className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        width={300}
        height={120}
        className="w-full h-full cursor-crosshair touch-none"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <button
        onClick={clearCanvas}
        className="absolute top-2 right-2 bg-red-100 text-red-600 p-1 rounded text-[11px] active:bg-red-200 transition-colors"
      >
        Clear
      </button>
    </div>
  )
}