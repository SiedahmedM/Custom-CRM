/* eslint-disable */
// @ts-nocheck
import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { realtimeManager } from '@/lib/supabase/realtime'
import { toast } from 'react-hot-toast'
import { Database } from '@/types/database'

type Order = Database['public']['Tables']['orders']['Row']
type OrderInsert = Database['public']['Tables']['orders']['Insert']
type OrderUpdate = Database['public']['Tables']['orders']['Update']

export interface OrderWithDetails extends Order {
  customer: Database['public']['Tables']['customers']['Row']
  driver?: Database['public']['Tables']['users']['Row']
  items: Array<{
    id: string
    quantity: number
    unit_price: number
    total_price: number
    inventory: Database['public']['Tables']['inventory']['Row']
  }>
}

export function useRealtimeOrders(filters?: {
  status?: Order['status']
  driver_id?: string
  customer_id?: string
  date_range?: { start: Date; end: Date }
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [connectionStatus, setConnectionStatus] = useState(true)

  // Build query
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        driver:users(*),
        items:order_items(
          *,
          inventory(*)
        )
      `)
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    if (filters?.driver_id) {
      query = query.eq('driver_id', filters.driver_id)
    }
    if (filters?.customer_id) {
      query = query.eq('customer_id', filters.customer_id)
    }
    if (filters?.date_range) {
      query = query
        .gte('order_date', filters.date_range.start.toISOString())
        .lte('order_date', filters.date_range.end.toISOString())
    }

    return query
  }, [filters, supabase])

  // Fetch orders
  const { data: orders, isLoading, error, refetch } = useQuery({
    queryKey: ['orders', filters],
    queryFn: async () => {
      const { data, error } = await buildQuery()
      if (error) throw error
      return data as OrderWithDetails[]
    },
    refetchInterval: connectionStatus ? 30000 : false,
  })

  // Set up real-time subscription
  useEffect(() => {
    const channel = realtimeManager.subscribe({
      table: 'orders',
      callback: (payload: any) => {
        // Optimistically update the cache
        queryClient.setQueryData(['orders', filters], (old: OrderWithDetails[] | undefined) => {
          if (!old) return old

          switch (payload.eventType) {
            case 'INSERT':
              // Fetch full order details for new order
              fetchOrderDetails(payload.new.id).then(newOrder => {
                if (newOrder && matchesFilters(newOrder)) {
                  queryClient.setQueryData(['orders', filters], [newOrder, ...old])
                  
                  // Show notification
                  toast.success('New order received!', {
                    icon: '📦',
                    duration: 5000,
                  })
                  
                  // Play sound if admin
                  if (typeof window !== 'undefined' && window.Audio) {
                    const audio = new Audio('/notification.mp3')
                    audio.play().catch(() => {})
                  }
                }
              })
              return old

            case 'UPDATE':
              // Update existing order
              const updated = old.map(order => 
                order.id === payload.new.id 
                  ? { ...order, ...payload.new }
                  : order
              )
              
              // Check if order needs to be removed based on filters
              if (!matchesFilters(payload.new as Order)) {
                return updated.filter(o => o.id !== payload.new.id)
              }
              
              return updated

            case 'DELETE':
              return old.filter(order => order.id !== payload.old.id)

            default:
              return old
          }
        })

        // Refetch to ensure consistency
        setTimeout(() => refetch(), 1000)
      },
      onError: (error) => {
        console.error('Orders subscription error:', error)
        setConnectionStatus(false)
      },
    })

    return () => {
      realtimeManager.unsubscribe(channel)
    }
  }, [filters, queryClient, refetch])

  // Helper to check if order matches current filters
  const matchesFilters = (order: Partial<Order>): boolean => {
    if (filters?.status && order.status !== filters.status) return false
    if (filters?.driver_id && order.driver_id !== filters.driver_id) return false
    if (filters?.customer_id && order.customer_id !== filters.customer_id) return false
    if (filters?.date_range && order.order_date) {
      const orderDate = new Date(order.order_date)
      if (orderDate < filters.date_range.start || orderDate > filters.date_range.end) {
        return false
      }
    }
    return true
  }

  // Fetch full order details
  const fetchOrderDetails = async (orderId: string): Promise<OrderWithDetails | null> => {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        customer:customers(*),
        driver:users(*),
        items:order_items(
          *,
          inventory(*)
        )
      `)
      .eq('id', orderId)
      .single()

    if (error) {
      console.error('Error fetching order details:', error)
      return null
    }

    return data as OrderWithDetails
  }

  // Create order mutation
  const createOrder = useMutation({
    mutationFn: async (newOrder: OrderInsert & { items: Array<{ inventory_id: string; quantity: number; unit_price: number }> }) => {
      const { items, ...orderData } = newOrder

      // Start transaction
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert(orderData)
        .select()
        .single()

      if (orderError) throw orderError

      // Insert order items
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(items.map(item => ({
            ...item,
            order_id: order.id,
          })))

        if (itemsError) {
          // Rollback order creation
          await supabase.from('orders').delete().eq('id', order.id)
          throw itemsError
        }
      }

      return order
    },
    onMutate: async (newOrder) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders', filters] })
      
      const previousOrders = queryClient.getQueryData(['orders', filters])
      
      // Add optimistic order
      const optimisticOrder: Partial<OrderWithDetails> = {
        ...newOrder,
        id: `temp-${Date.now()}`,
        order_number: 'PENDING...',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        balance_due: newOrder.total_amount - (newOrder.paid_amount || 0),
      }

      queryClient.setQueryData(['orders', filters], (old: OrderWithDetails[] | undefined) => {
        if (!old) return [optimisticOrder]
        return [optimisticOrder, ...old]
      })

      return { previousOrders }
    },
    onError: (err, newOrder, context) => {
      // Rollback on error
      queryClient.setQueryData(['orders', filters], context?.previousOrders)
      toast.error('Failed to create order')
    },
    onSuccess: () => {
      toast.success('Order created successfully')
      refetch()
    },
  })

  // Update order mutation
  const updateOrder = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: OrderUpdate }) => {
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async ({ id, updates }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['orders', filters] })
      
      const previousOrders = queryClient.getQueryData(['orders', filters])
      
      queryClient.setQueryData(['orders', filters], (old: OrderWithDetails[] | undefined) => {
        if (!old) return old
        return old.map(order => 
          order.id === id 
            ? { ...order, ...updates, updated_at: new Date().toISOString() }
            : order
        )
      })

      return { previousOrders }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['orders', filters], context?.previousOrders)
      toast.error('Failed to update order')
    },
    onSuccess: () => {
      toast.success('Order updated successfully')
    },
  })

  // Update order status with real-time trigger
  const updateOrderStatus = useMutation({
    mutationFn: async ({ 
      orderId, 
      id, 
      status, 
      notes, 
      driverId 
    }: { 
      orderId?: string
      id?: string
      status: Order['status']
      notes?: string
      driverId?: string
    }) => {
      const orderIdToUpdate = orderId || id
      if (!orderIdToUpdate) throw new Error('Order ID is required')
      
      const updates: OrderUpdate = { status }
      
      // Add driver assignment
      if (driverId) {
        updates.driver_id = driverId
      }
      
      // Add status-specific fields
      if (status === 'out_for_delivery') {
        updates.delivery_started_at = new Date().toISOString()
      } else if (status === 'delivered') {
        updates.delivered_at = new Date().toISOString()
      } else if (status === 'needs_reassignment') {
        updates.reassignment_reason = notes
      }

      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderIdToUpdate)

      if (error) throw error

      // Create notification for admin
      if (status === 'needs_reassignment') {
        await supabase
          .from('notifications')
          .insert({
            title: 'Order Needs Reassignment',
            message: `Order requires reassignment: ${notes || 'No reason provided'}`,
            type: 'order',
            priority: 'urgent',
            related_order_id: id,
          })
      }
    },
    onMutate: async ({ id, status }) => {
      // Play sound for urgent statuses
      if (status === 'needs_reassignment' && typeof window !== 'undefined' && window.Audio) {
        const audio = new Audio('/alert.mp3')
        audio.play().catch(() => {})
      }
    },
    onSuccess: (_, { status }) => {
      toast.success(`Order ${status.replace('_', ' ')}`)
    },
    onError: () => {
      toast.error('Failed to update order status')
    },
  })

  return {
    orders: orders || [],
    isLoading,
    error,
    refetch,
    createOrder,
    updateOrder,
    updateOrderStatus,
    connectionStatus,
  }
}