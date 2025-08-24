import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { realtimeManager } from '@/lib/supabase/realtime'
import { toast } from 'react-hot-toast'
import { Database } from '@/types/database'
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

type Customer = Database['public']['Tables']['customers']['Row']
type CustomerInsert = Database['public']['Tables']['customers']['Insert']
type CustomerUpdate = Database['public']['Tables']['customers']['Update']
type PaymentInsert = Database['public']['Tables']['payments']['Insert']

export interface CustomerWithDetails extends Customer {
  recent_orders?: Array<{
    id: string
    order_number: string
    total_amount: number
    status: string
    created_at: string
  }>
  recent_payments?: Array<{
    id: string
    amount: number
    payment_method: string
    payment_date: string
    reference_number: string | null
  }>
  days_outstanding: number
  last_order_date: string | null
  last_payment_date: string | null
  order_count: number
  total_revenue: number
  assigned_driver?: {
    id: string
    name: string
  }
}

export function useRealtimeCustomers(filters?: {
  outstanding_only?: boolean
  search_query?: string
  assigned_driver_id?: string
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [connectionStatus, setConnectionStatus] = useState(true)

  // Helper to check if customer matches current filters
  const matchesFilters = useCallback(
    (customer: CustomerWithDetails): boolean => {
      if (filters?.outstanding_only && customer.current_balance <= 0) return false
      if (
        filters?.search_query &&
        !customer.shop_name.toLowerCase().includes(filters.search_query.toLowerCase())
      )
        return false
      if (filters?.assigned_driver_id && customer.assigned_driver_id !== filters.assigned_driver_id)
        return false
      return true
    },
    [filters]
  )

  // Build query
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('customers')
      .select(`
        *,
        assigned_driver:users(id, name),
        recent_orders:orders(id, order_number, total_amount, status, created_at),
        recent_payments:payments(id, amount, payment_method, payment_date, reference_number)
      `)
      .eq('is_active', true)
      .order('shop_name')

    if (filters?.outstanding_only) {
      query = query.gt('current_balance', 0)
    }

    if (filters?.search_query) {
      query = query.ilike('shop_name', `%${filters.search_query}%`)
    }

    if (filters?.assigned_driver_id) {
      query = query.eq('assigned_driver_id', filters.assigned_driver_id)
    }

    return query
  }, [filters, supabase])

  // Fetch customers
  const { data: customers, isLoading, error, refetch } = useQuery({
    queryKey: ['customers', filters],
    queryFn: async () => {
      const { data, error } = await buildQuery()
      if (error) throw error
      
      // Enhance data with calculations
      const rows = (data ?? []) as CustomerWithDetails[]
      const enhancedData: CustomerWithDetails[] = rows.map((customer) => {
        const recentOrders = (customer.recent_orders ?? []).slice(0, 5)
        const recentPayments = (customer.recent_payments ?? []).slice(0, 5)

        const lastOrderDate =
          recentOrders.length > 0
            ? recentOrders
                .sort(
                  (a, b) =>
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                )[0].created_at
            : null

        const lastPaymentDate =
          recentPayments.length > 0
            ? recentPayments
                .sort(
                  (a, b) =>
                    new Date(b.payment_date).getTime() -
                    new Date(a.payment_date).getTime()
                )[0].payment_date
            : null

        const daysOutstanding =
          customer.current_balance > 0 && lastOrderDate
            ? Math.floor(
                (Date.now() - new Date(lastOrderDate).getTime()) /
                  (1000 * 60 * 60 * 24)
              )
            : 0

        const totalRevenue = recentOrders.reduce(
          (sum, order) => sum + order.total_amount,
          0
        )

        return {
          ...customer,
          recent_orders: recentOrders,
          recent_payments: recentPayments,
          days_outstanding: daysOutstanding,
          last_order_date: lastOrderDate,
          last_payment_date: lastPaymentDate,
          order_count: recentOrders.length,
          total_revenue: totalRevenue,
        }
      })

      return enhancedData
    },
    refetchInterval: connectionStatus ? 30000 : false,
  })

  // Set up real-time subscription for customers
  useEffect(() => {
    const customersChannel = realtimeManager.subscribe({
      table: 'customers',
      callback: (payload) => {
        const typedPayload =
          payload as RealtimePostgresChangesPayload<CustomerWithDetails>
        queryClient.setQueryData(
          ['customers', filters],
          (old: CustomerWithDetails[] | undefined) => {
            if (!old) return old

            switch (typedPayload.eventType) {
              case 'INSERT':
                const newCustomer: CustomerWithDetails = {
                  ...typedPayload.new,
                  recent_orders: [],
                  recent_payments: [],
                  days_outstanding: 0,
                  last_order_date: null,
                  last_payment_date: null,
                  order_count: 0,
                  total_revenue: 0,
                }

                if (matchesFilters(newCustomer)) {
                  toast.success('New customer added!', {
                    icon: '👤',
                    duration: 3000,
                  })
                  return [...old, newCustomer].sort((a, b) =>
                    a.shop_name.localeCompare(b.shop_name)
                  )
                }
                return old

              case 'UPDATE':
                const updatedCustomers = old
                  .map((customer) => {
                    if (customer.id === typedPayload.new.id) {
                      const updated = { ...customer, ...typedPayload.new }

                      // Show balance change notification
                      if (
                        typedPayload.new.current_balance !==
                        customer.current_balance
                      ) {
                        const change =
                          typedPayload.new.current_balance -
                          customer.current_balance
                        const changeText =
                          change > 0
                            ? `increased by $${change.toFixed(2)}`
                            : `decreased by $${Math.abs(change).toFixed(2)}`

                        toast.success(
                          `${customer.shop_name} balance ${changeText}`,
                          {
                            icon: change > 0 ? '📈' : '📉',
                            duration: 4000,
                          }
                        )
                      }

                      return updated
                    }
                    return customer
                  })
                  .filter((customer) => matchesFilters(customer))

                return updatedCustomers

              case 'DELETE':
                return old.filter(
                  (customer) => customer.id !== typedPayload.old.id
                )

              default:
                return old
            }
          }
        )

        // Refetch to ensure data consistency
        setTimeout(() => refetch(), 2000)
      },
      onError: (error) => {
        console.error('Customers subscription error:', error)
        setConnectionStatus(false)
      },
    })

    return () => {
      realtimeManager.unsubscribe(customersChannel)
    }
  }, [filters, queryClient, matchesFilters, refetch])

  // Set up real-time subscription for payments (affects customer balances)
  useEffect(() => {
    const paymentsChannel = realtimeManager.subscribe({
      table: 'payments',
      callback: (payload) => {
        const typedPayload =
          payload as RealtimePostgresChangesPayload<
            Database['public']['Tables']['payments']['Row']
          >
        queryClient.setQueryData(
          ['customers', filters],
          (old: CustomerWithDetails[] | undefined) => {
            if (!old) return old

            switch (typedPayload.eventType) {
              case 'INSERT':
                // Find customer and update their recent payments
                return old.map((customer) => {
                  if (customer.id === typedPayload.new.customer_id) {
                    const newPayment = {
                      id: typedPayload.new.id,
                      amount: typedPayload.new.amount,
                      payment_method: typedPayload.new.payment_method,
                      payment_date: typedPayload.new.payment_date,
                      reference_number: typedPayload.new.reference_number,
                    }

                    return {
                      ...customer,
                      recent_payments: [
                        newPayment,
                        ...(customer.recent_payments || []),
                      ].slice(0, 5),
                      last_payment_date: typedPayload.new.payment_date,
                    }
                  }
                  return customer
                })

              default:
                return old
            }
          }
        )
      },
      onError: (error) => {
        console.error('Payments subscription error:', error)
      },
    })

    return () => {
      realtimeManager.unsubscribe(paymentsChannel)
    }
  }, [filters, queryClient])

  // Add new customer
  const addCustomer = useMutation<Customer, unknown, CustomerInsert>({
    mutationFn: async (newCustomer: CustomerInsert) => {
      const { data, error } = await supabase
        .from('customers')
        .insert(newCustomer as never)
        .select()
        .single()

      if (error) throw error
      return data as Customer
    },
    onSuccess: () => {
      toast.success('Customer added successfully!')
      refetch()
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Failed to add customer: ' + message)
    },
  })

  // Update customer
  const updateCustomer = useMutation<void, unknown, { id: string; updates: CustomerUpdate }>({
    mutationFn: async ({ id, updates }: { id: string; updates: CustomerUpdate }) => {
      const { error } = await supabase
        .from('customers')
        .update(updates as never)
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Customer updated successfully!')
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Failed to update customer: ' + message)
    },
  })

  // Add payment (which will trigger balance recalculation via database triggers)
  const addPayment = useMutation<Database['public']['Tables']['payments']['Row'], unknown, Omit<PaymentInsert, 'processed_by'> & { user_id?: string }>({
    mutationFn: async (payment) => {
      const { data, error } = await supabase
        .from('payments')
        .insert({
          order_id: payment.order_id,
          customer_id: payment.customer_id,
          amount: payment.amount,
          payment_method: payment.payment_method,
          payment_date: payment.payment_date,
          reference_number: payment.reference_number,
          notes: payment.notes,
          processed_by: payment.user_id ?? null
        } as never)
        .select()
        .single()

      if (error) throw error
      return data as Database['public']['Tables']['payments']['Row']
    },
    onMutate: async (payment: Omit<PaymentInsert, 'processed_by'> & { user_id?: string }) => {
      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }

      // Optimistic update - reduce customer balance immediately
      queryClient.setQueryData(['customers', filters], (old: CustomerWithDetails[] | undefined) => {
        if (!old) return old
        
        return old.map(customer => {
          if (customer.id === payment.customer_id) {
            return {
              ...customer,
              current_balance: Math.max(0, customer.current_balance - payment.amount),
              recent_payments: [{
                id: `temp-${Date.now()}`,
                amount: payment.amount,
                payment_method: payment.payment_method,
                payment_date: payment.payment_date,
                reference_number: payment.reference_number || null
              }, ...(customer.recent_payments || [])].slice(0, 5),
              last_payment_date: payment.payment_date
            }
          }
          return customer
        })
      })
    },
    onSuccess: (_data, variables) => {
      toast.success(`Payment of $${variables.amount.toFixed(2)} recorded!`, {
        icon: '💰',
        duration: 4000,
      })
      
      // Refetch to get accurate balance from server
      setTimeout(() => refetch(), 1000)
    },
      onError: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        toast.error('Failed to record payment: ' + message)
        // Revert optimistic update
        refetch()
      },
  })

  // Send balance reminder
  const sendBalanceReminder = useMutation({
    mutationFn: async ({ customer_id, message }: { customer_id: string; message?: string }) => {
      const customer = customers?.find(c => c.id === customer_id)
      if (!customer) throw new Error('Customer not found')

      // Create notification for assigned driver
      if (customer.assigned_driver_id) {
        const { error } = await supabase
          .from('notifications')
          .insert({
            user_id: customer.assigned_driver_id,
            title: 'Balance Reminder',
            message: message || `Reminder: ${customer.shop_name} has outstanding balance of $${customer.current_balance.toFixed(2)}`,
            type: 'payment',
            priority: 'normal',
            related_order_id: null
          } as never)

        if (error) throw error
      } else {
        throw new Error('No driver assigned to this customer')
      }
    },
    onSuccess: (_, variables) => {
      const customer = customers?.find(c => c.id === variables.customer_id)
      toast.success(`Reminder sent to ${customer?.assigned_driver?.name}`, {
        icon: '📱',
        duration: 3000,
      })
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      toast.error('Failed to send reminder: ' + message)
    },
  })

  // Calculate totals
  const totalOutstanding = customers?.reduce((sum, customer) => sum + customer.current_balance, 0) || 0
  const customersWithBalance = customers?.filter(c => c.current_balance > 0).length || 0
  const averageBalance = customersWithBalance > 0 ? totalOutstanding / customersWithBalance : 0
  const oldestOutstanding = customers
    ?.filter(c => c.current_balance > 0)
    ?.sort((a, b) => b.days_outstanding - a.days_outstanding)[0]

  return {
    customers: customers || [],
    isLoading,
    error,
    refetch,
    addCustomer,
    updateCustomer,
    addPayment,
    sendBalanceReminder,
    connectionStatus,
    totals: {
      totalOutstanding,
      customersWithBalance,
      averageBalance,
      oldestOutstanding
    }
  }
}