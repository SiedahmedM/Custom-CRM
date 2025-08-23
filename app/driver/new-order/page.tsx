'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Search, AlertCircle, X, Package } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { Database } from '@/types/database'

const orderSchema = z.object({
  customer_id: z.string().min(1, 'Please select a customer'),
  contact_name: z.string().optional(),
  contact_phone: z.string().optional(),
  delivery_address: z.string().optional(),
  delivery_date: z.string().optional(),
  special_instructions: z.string().optional(),
  can_deliver: z.enum(['yes', 'no', 'maybe']),
  reassignment_reason: z.string().optional(),
  items: z.array(z.object({
    inventory_id: z.string(),
    quantity: z.number().min(1),
    unit_price: z.number()
  })).min(1, 'Please add at least one item')
})

type OrderFormData = z.infer<typeof orderSchema>

export default function NewOrderPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  
  const [customers, setCustomers] = useState<{id: string; shop_name: string; contact_name: string; address: string; phone: string; current_balance: number}[]>([])
  const [inventory, setInventory] = useState<{id: string; part_number: string; description: string; selling_price: number; current_quantity: number; reorder_threshold: number | null}[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [partSearchQuery, setPartSearchQuery] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<{id: string; shop_name: string; contact_name: string; address?: string; phone?: string; current_balance: number} | null>(null)
  const [selectedItems, setSelectedItems] = useState<{ inventory_id: string; part: { id: string; part_number: string; description: string; selling_price: number; current_quantity: number }; quantity: number; unit_price: number }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCustomerSearch, setShowCustomerSearch] = useState(false)
  const [showPartSearch, setShowPartSearch] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch
  } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      can_deliver: 'yes',
      items: []
    }
  })

  const canDeliver = watch('can_deliver')

  const loadCustomers = useCallback(async () => {
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .order('shop_name')

    if (data) setCustomers(data)
  }, [supabase])

  const loadInventory = useCallback(async () => {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('is_active', true)
      .gt('current_quantity', 0)
      .order('part_number')

    if (data) setInventory(data)
  }, [supabase])

  // Load customers and inventory once on mount
  useEffect(() => {
    loadCustomers()
    loadInventory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filteredCustomers = customers.filter(c => 
    c.shop_name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredParts = inventory.filter(p => 
    p.part_number.toLowerCase().includes(partSearchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(partSearchQuery.toLowerCase())
  )

  const selectCustomer = (customer: {id: string; shop_name: string; contact_name: string; address: string; phone: string; current_balance: number}) => {
    setSelectedCustomer(customer)
    setValue('customer_id', customer.id)
    setValue('delivery_address', customer.address)
    setValue('contact_name', customer.contact_name)
    setValue('contact_phone', customer.phone)
    setShowCustomerSearch(false)
    setSearchQuery('')
  }

  const addItem = (part: {id: string; part_number: string; description: string; selling_price: number; current_quantity: number}) => {
    const existingItem = selectedItems.find(i => i.inventory_id === part.id)
    
    if (existingItem) {
      toast.error('This part is already added')
      return
    }

    const newItem = {
      inventory_id: part.id,
      part: part,
      quantity: 1,
      unit_price: part.selling_price
    }

    const updatedItems = [...selectedItems, newItem]
    setSelectedItems(updatedItems)
    setValue('items', updatedItems.map(({ inventory_id, quantity, unit_price }) => ({ inventory_id, quantity, unit_price })))
    setShowPartSearch(false)
    setPartSearchQuery('')
    
    // Haptic feedback
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
  }

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return
    
    const item = selectedItems[index]
    if (quantity > item.part.current_quantity) {
      toast.error(`Only ${item.part.current_quantity} available`)
      return
    }

    const updatedItems = [...selectedItems]
    updatedItems[index].quantity = quantity
    setSelectedItems(updatedItems)
    setValue('items', updatedItems.map(({ inventory_id, quantity, unit_price }) => ({ inventory_id, quantity, unit_price })))
  }

  const removeItem = (index: number) => {
    const updatedItems = selectedItems.filter((_, i) => i !== index)
    setSelectedItems(updatedItems)
    setValue('items', updatedItems.map(({ inventory_id, quantity, unit_price }) => ({ inventory_id, quantity, unit_price })))
  }

  const calculateTotal = () => {
    return selectedItems.reduce((sum, item) => 
      sum + (item.quantity * item.unit_price), 0
    )
  }

  const onSubmit = async (data: OrderFormData) => {
    if (!user) return
    
    setIsSubmitting(true)
    
    try {
      // Create order
      const orderData: Database['public']['Tables']['orders']['Insert'] = {
        customer_id: data.customer_id,
        driver_id: data.can_deliver === 'no' ? null : user.id,
        status: (data.can_deliver === 'no' ? 'needs_reassignment' : 'assigned') as Database['public']['Tables']['orders']['Row']['status'],
        order_date: new Date().toISOString(),
        delivery_address: data.delivery_address || null,
        delivery_date: data.delivery_date || null,
        special_instructions: data.special_instructions || null,
        reassignment_reason: data.reassignment_reason || null,
        total_amount: calculateTotal(),
        paid_amount: 0,
        delivery_started_at: null,
        delivered_at: null,
        delivery_latitude: null,
        delivery_longitude: null
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        // @ts-expect-error Supabase types inference issue; payload matches Insert
        .insert<Database['public']['Tables']['orders']['Insert']>(orderData)
        .select()
        .single()

      if (orderError) throw orderError

      type OrderRow = Database['public']['Tables']['orders']['Row']
      const createdOrder = order as OrderRow

      // Add order items
      const itemsData: Database['public']['Tables']['order_items']['Insert'][] = data.items.map(item => ({
        order_id: createdOrder.id,
        inventory_id: item.inventory_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      }))

      const { error: itemsError } = await supabase
        .from('order_items')
        // @ts-expect-error Supabase types inference issue; payload matches Insert[]
        .insert<Database['public']['Tables']['order_items']['Insert']>(itemsData)

      if (itemsError) throw itemsError

      // Create notification for admin if needs reassignment
      if (data.can_deliver === 'no') {
        await supabase
          .from('notifications')
          // @ts-expect-error Supabase types inference issue; payload matches Insert
          .insert<Database['public']['Tables']['notifications']['Insert']>({
            title: 'Order Needs Reassignment',
            message: `Order ${createdOrder.order_number} needs reassignment: ${data.reassignment_reason || 'No reason provided'}`,
            type: 'order',
            priority: 'urgent',
            related_order_id: createdOrder.id,
            is_read: false,
            user_id: null
          })
      }

      toast.success('Order created successfully!')
      router.push('/driver')
    } catch (error) {
      console.error('Error creating order:', error)
      toast.error('Failed to create order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* iOS-style Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
            </button>
            <h1 className="text-[17px] font-semibold text-gray-900">New Order</h1>
            <div className="w-8" />
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit(onSubmit)} className="pb-safe">
        {/* Customer Selection */}
        <div className="px-5 py-4">
          <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
            Customer
          </label>
          
          {selectedCustomer ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="font-semibold text-[17px] text-gray-900">
                    {selectedCustomer.shop_name}
                  </p>
                  {selectedCustomer.contact_name && (
                    <p className="text-[13px] text-gray-600 mt-0.5">
                      {selectedCustomer.contact_name}
                    </p>
                  )}
                  {selectedCustomer.current_balance > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-[13px] font-medium text-red-600">
                        Outstanding: ${selectedCustomer.current_balance.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null)
                    setValue('customer_id', '')
                  }}
                  className="p-1 active:scale-95 transition-transform"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>
            </motion.div>
          ) : (
            <button
              type="button"
              onClick={() => setShowCustomerSearch(true)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-200 flex items-center justify-between active:scale-[0.98] transition-transform"
            >
              <span className="text-[15px] text-gray-500">Select a customer</span>
              <Search className="w-5 h-5 text-gray-400" />
            </button>
          )}
          
          {errors.customer_id && (
            <p className="text-red-500 text-[13px] mt-2">{errors.customer_id.message}</p>
          )}
        </div>

        {/* Contact Information */}
        {selectedCustomer && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-5 py-4 border-t border-gray-100"
          >
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
              Contact Information
            </label>
            
            <div className="space-y-3">
              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200">
                <input
                  type="text"
                  placeholder="Contact name"
                  {...register('contact_name')}
                  className="w-full text-[15px] placeholder-gray-400 outline-none"
                />
              </div>
              
              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200">
                <input
                  type="tel"
                  placeholder="Phone number"
                  {...register('contact_phone')}
                  className="w-full text-[15px] placeholder-gray-400 outline-none"
                  inputMode="tel"
                />
              </div>
              
              <div className="bg-white rounded-xl px-4 py-3 border border-gray-200">
                <input
                  type="text"
                  placeholder="Delivery address"
                  {...register('delivery_address')}
                  className="w-full text-[15px] placeholder-gray-400 outline-none"
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Order Items */}
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide">
              Order Items
            </label>
            <button
              type="button"
              onClick={() => setShowPartSearch(true)}
              className="text-blue-600 text-[15px] font-medium active:text-blue-700"
            >
              Add Part
            </button>
          </div>

          {selectedItems.length > 0 ? (
            <div className="space-y-3">
              {selectedItems.map((item, index) => (
                <motion.div
                  key={item.inventory_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-semibold text-[15px] text-gray-900">
                        {item.part.part_number}
                      </p>
                      <p className="text-[13px] text-gray-600 mt-0.5">
                        {item.part.description}
                      </p>
                      <p className="text-[13px] text-gray-500 mt-1">
                        ${item.unit_price.toFixed(2)} each • {item.part.current_quantity} available
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1 active:scale-95 transition-transform"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(index, item.quantity - 1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200"
                      >
                        -
                      </button>
                      <span className="font-semibold text-[17px] min-w-[30px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateItemQuantity(index, item.quantity + 1)}
                        className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center active:bg-gray-200"
                      >
                        +
                      </button>
                    </div>
                    <p className="font-semibold text-[15px] text-gray-900">
                      ${(item.quantity * item.unit_price).toFixed(2)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 rounded-2xl p-8 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-[15px] text-gray-500">No items added</p>
            </div>
          )}
          
          {errors.items && (
            <p className="text-red-500 text-[13px] mt-2">{errors.items.message}</p>
          )}
        </div>

        {/* Delivery Options */}
        <div className="px-5 py-4 border-t border-gray-100">
          <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
            Can you deliver this order?
          </label>
          
          <div className="grid grid-cols-3 gap-3">
            {(['yes', 'maybe', 'no'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setValue('can_deliver', option)}
                className={`py-3 rounded-xl font-medium text-[15px] transition-all ${
                  canDeliver === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700'
                } active:scale-95`}
              >
                {option === 'yes' ? 'Yes' : option === 'maybe' ? 'Maybe' : 'No'}
              </button>
            ))}
          </div>

          {canDeliver === 'no' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-3"
            >
              <textarea
                placeholder="Reason for reassignment..."
                {...register('reassignment_reason')}
                className="w-full bg-white rounded-xl px-4 py-3 border border-gray-200 text-[15px] placeholder-gray-400 outline-none resize-none"
                rows={3}
              />
            </motion.div>
          )}
        </div>

        {/* Special Instructions */}
        <div className="px-5 py-4 border-t border-gray-100">
          <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
            Special Instructions
          </label>
          <textarea
            placeholder="Any special delivery instructions..."
            {...register('special_instructions')}
            className="w-full bg-white rounded-xl px-4 py-3 border border-gray-200 text-[15px] placeholder-gray-400 outline-none resize-none"
            rows={3}
          />
        </div>

        {/* Order Summary */}
        {selectedItems.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100">
            <div className="bg-blue-50 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-medium text-gray-700">Order Total:</span>
                <span className="text-[24px] font-bold text-blue-600">
                  ${calculateTotal().toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="px-5 py-4 pb-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
          <button
            type="submit"
            disabled={isSubmitting || selectedItems.length === 0 || !selectedCustomer}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-[17px] disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700 transition-colors"
          >
            {isSubmitting ? 'Creating Order...' : 'Create Order'}
          </button>
        </div>
      </form>

      {/* Customer Search Modal */}
      <AnimatePresence>
        {showCustomerSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowCustomerSearch(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
              style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[17px] font-semibold">Select Customer</h2>
                  <button
                    onClick={() => setShowCustomerSearch(false)}
                    className="p-1 active:scale-95 transition-transform"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="search"
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-[15px] outline-none"
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 120px)' }}>
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => selectCustomer(customer)}
                    className="w-full px-5 py-4 border-b border-gray-100 text-left active:bg-gray-50 transition-colors"
                  >
                    <p className="font-medium text-[15px] text-gray-900">
                      {customer.shop_name}
                    </p>
                    {customer.contact_name && (
                      <p className="text-[13px] text-gray-600 mt-0.5">
                        {customer.contact_name}
                      </p>
                    )}
                    {customer.current_balance > 0 && (
                      <p className="text-[13px] text-red-600 mt-1 font-medium">
                        Outstanding: ${customer.current_balance.toFixed(2)}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Part Search Modal */}
      <AnimatePresence>
        {showPartSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setShowPartSearch(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl"
              style={{ maxHeight: '85vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 border-b border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[17px] font-semibold">Add Part</h2>
                  <button
                    onClick={() => setShowPartSearch(false)}
                    className="p-1 active:scale-95 transition-transform"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="search"
                    placeholder="Search parts..."
                    value={partSearchQuery}
                    onChange={(e) => setPartSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl text-[15px] outline-none"
                    autoFocus
                  />
                </div>
              </div>
              
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 120px)' }}>
                {filteredParts.map((part) => (
                  <button
                    key={part.id}
                    onClick={() => addItem(part)}
                    className="w-full px-5 py-4 border-b border-gray-100 text-left active:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="font-medium text-[15px] text-gray-900">
                          {part.part_number}
                        </p>
                        <p className="text-[13px] text-gray-600 mt-0.5">
                          {part.description}
                        </p>
                        <p className="text-[13px] text-gray-500 mt-1">
                          ${part.selling_price.toFixed(2)} • {part.current_quantity} available
                        </p>
                      </div>
                      {(part.reorder_threshold ?? 0) > 0 && part.current_quantity < (part.reorder_threshold ?? 0) && (
                        <div className="ml-3">
                          <span className="text-[11px] font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded-full">
                            Low Stock
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}