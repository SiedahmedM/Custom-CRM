import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { realtimeManager } from '@/lib/supabase/realtime'
import { toast } from 'react-hot-toast'
import { Database } from '@/types/database'

type Inventory = Database['public']['Tables']['inventory']['Row']
type InventoryInsert = Database['public']['Tables']['inventory']['Insert']
type InventoryUpdate = Database['public']['Tables']['inventory']['Update']
type InventoryAdjustment = Database['public']['Tables']['inventory_adjustments']['Insert']

export interface InventoryWithAdjustments extends Inventory {
  recent_adjustments?: Array<{
    id: string
    adjustment_type: string
    quantity: number
    reason: string
    notes: string | null
    adjusted_by: string | null
    created_at: string
    user: {
      name: string
    } | null
  }>
  available_quantity: number // current_quantity - reserved_quantity
}

export function useRealtimeInventory(filters?: {
  low_stock_only?: boolean
  search_query?: string
  category?: string
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [connectionStatus, setConnectionStatus] = useState(true)

  // Build query
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('inventory')
      .select(`
        *,
        recent_adjustments:inventory_adjustments(
          *,
          user:users(name)
        )
      `)
      .eq('is_active', true)
      .order('part_number')

    if (filters?.low_stock_only) {
      query = query.raw('current_quantity <= reorder_threshold')
    }

    if (filters?.search_query) {
      query = query.or(`part_number.ilike.%${filters.search_query}%,description.ilike.%${filters.search_query}%`)
    }

    return query
  }, [filters, supabase])

  // Fetch inventory
  const { data: inventory, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory', filters],
    queryFn: async () => {
      const { data, error } = await buildQuery()
      if (error) throw error
      
      // Calculate available quantity and enhance data
      const enhancedData: InventoryWithAdjustments[] = (data || []).map(item => ({
        ...item,
        available_quantity: item.current_quantity - item.reserved_quantity,
        recent_adjustments: item.recent_adjustments?.slice(0, 5) || []
      }))
      
      return enhancedData
    },
    refetchInterval: connectionStatus ? 30000 : false,
  })

  // Set up real-time subscription
  useEffect(() => {
    const channel = realtimeManager.subscribe({
      table: 'inventory',
      callback: (payload) => {
        // Optimistically update the cache
        queryClient.setQueryData(['inventory', filters], (old: InventoryWithAdjustments[] | undefined) => {
          if (!old) return old

          switch (payload.eventType) {
            case 'INSERT':
              const newItem = {
                ...payload.new,
                available_quantity: payload.new.current_quantity - (payload.new.reserved_quantity || 0),
                recent_adjustments: []
              } as InventoryWithAdjustments
              
              // Check if it matches filters
              if (matchesFilters(newItem)) {
                toast.success('New inventory item added!', {
                  icon: '📦',
                  duration: 3000,
                })
                return [...old, newItem].sort((a, b) => a.part_number.localeCompare(b.part_number))
              }
              return old

            case 'UPDATE':
              const updatedInventory = old.map(item => {
                if (item.id === payload.new.id) {
                  const updated = {
                    ...item,
                    ...payload.new,
                    available_quantity: payload.new.current_quantity - (payload.new.reserved_quantity || 0)
                  }
                  
                  // Show low stock warning
                  if (payload.new.current_quantity <= payload.new.reorder_threshold && 
                      item.current_quantity > item.reorder_threshold) {
                    toast.error(`Low Stock Alert: ${item.part_number}`, {
                      icon: '⚠️',
                      duration: 8000,
                    })
                    
                    // Play sound if available
                    if (typeof window !== 'undefined' && window.Audio) {
                      const audio = new Audio('/alert.mp3')
                      audio.play().catch(() => {})
                    }
                  }
                  
                  return updated
                }
                return item
              }).filter(item => matchesFilters(item))
              
              return updatedInventory

            case 'DELETE':
              return old.filter(item => item.id !== payload.old.id)

            default:
              return old
          }
        })

        // Refetch to ensure consistency
        setTimeout(() => refetch(), 2000)
      },
      onError: (error) => {
        console.error('Inventory subscription error:', error)
        setConnectionStatus(false)
      },
    })

    return () => {
      realtimeManager.unsubscribe(channel)
    }
  }, [filters, queryClient, matchesFilters, refetch])

  // Helper to check if inventory matches current filters
  const matchesFilters = (item: InventoryWithAdjustments): boolean => {
    if (filters?.low_stock_only && item.current_quantity > item.reorder_threshold) return false
    if (filters?.search_query) {
      const query = filters.search_query.toLowerCase()
      if (!item.part_number.toLowerCase().includes(query) && 
          !item.description.toLowerCase().includes(query)) {
        return false
      }
    }
    return true
  }

  // Add new inventory item
  const addInventoryItem = useMutation({
    mutationFn: async (newItem: InventoryInsert) => {
      const { data, error } = await supabase
        .from('inventory')
        .insert(newItem)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (newItem) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['inventory', filters] })
      
      const previousInventory = queryClient.getQueryData(['inventory', filters])
      
      const optimisticItem: InventoryWithAdjustments = {
        ...newItem,
        id: `temp-${Date.now()}`,
        available_quantity: newItem.current_quantity - 0,
        recent_adjustments: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        reserved_quantity: 0,
        is_active: true,
        reorder_threshold: newItem.reorder_threshold || 10,
        location: newItem.location || null,
        supplier: newItem.supplier || null,
        last_restock_date: newItem.last_restock_date || null
      }

      queryClient.setQueryData(['inventory', filters], (old: InventoryWithAdjustments[] | undefined) => {
        if (!old) return [optimisticItem]
        return [...old, optimisticItem].sort((a, b) => a.part_number.localeCompare(b.part_number))
      })

      return { previousInventory }
    },
    onError: (err, newItem, context) => {
      // Rollback on error
      queryClient.setQueryData(['inventory', filters], context?.previousInventory)
      toast.error('Failed to add inventory item')
    },
    onSuccess: () => {
      toast.success('Inventory item added successfully!')
      refetch()
    },
  })

  // Update inventory item
  const updateInventoryItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: InventoryUpdate }) => {
      const { error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id)

      if (error) throw error
    },
    onMutate: async ({ id, updates }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['inventory', filters] })
      
      const previousInventory = queryClient.getQueryData(['inventory', filters])
      
      queryClient.setQueryData(['inventory', filters], (old: InventoryWithAdjustments[] | undefined) => {
        if (!old) return old
        return old.map(item => 
          item.id === id 
            ? { 
                ...item, 
                ...updates, 
                updated_at: new Date().toISOString(),
                available_quantity: (updates.current_quantity ?? item.current_quantity) - item.reserved_quantity
              }
            : item
        )
      })

      return { previousInventory }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['inventory', filters], context?.previousInventory)
      toast.error('Failed to update inventory item')
    },
    onSuccess: () => {
      toast.success('Inventory item updated successfully!')
    },
  })

  // Adjust inventory stock
  const adjustInventoryStock = useMutation({
    mutationFn: async ({ 
      inventory_id, 
      adjustment_type, 
      quantity, 
      reason, 
      notes,
      user_id 
    }: {
      inventory_id: string
      adjustment_type: 'add' | 'remove'
      quantity: number
      reason: InventoryAdjustment['reason']
      notes?: string
      user_id?: string
    }) => {
      // First create the adjustment record
      const { error: adjustmentError } = await supabase
        .from('inventory_adjustments')
        .insert({
          inventory_id,
          adjustment_type,
          quantity,
          reason,
          notes,
          adjusted_by: user_id
        })

      if (adjustmentError) throw adjustmentError

      // Then update the inventory quantity
      const { data: currentItem, error: fetchError } = await supabase
        .from('inventory')
        .select('current_quantity')
        .eq('id', inventory_id)
        .single()

      if (fetchError) throw fetchError

      const newQuantity = adjustment_type === 'add' 
        ? currentItem.current_quantity + quantity
        : Math.max(0, currentItem.current_quantity - quantity)

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ 
          current_quantity: newQuantity,
          last_restock_date: adjustment_type === 'add' ? new Date().toISOString() : undefined
        })
        .eq('id', inventory_id)

      if (updateError) throw updateError
      
      return newQuantity
    },
    onMutate: async ({ inventory_id, adjustment_type, quantity }) => {
      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }

      // Optimistic update
      queryClient.setQueryData(['inventory', filters], (old: InventoryWithAdjustments[] | undefined) => {
        if (!old) return old
        return old.map(item => {
          if (item.id === inventory_id) {
            const newQuantity = adjustment_type === 'add' 
              ? item.current_quantity + quantity
              : Math.max(0, item.current_quantity - quantity)
            
            return {
              ...item,
              current_quantity: newQuantity,
              available_quantity: newQuantity - item.reserved_quantity
            }
          }
          return item
        })
      })
    },
    onSuccess: (newQuantity, variables) => {
      const actionText = variables.adjustment_type === 'add' ? 'added to' : 'removed from'
      toast.success(`Stock ${actionText} inventory successfully!`)
      
      // Refetch to get updated adjustment history
      setTimeout(() => refetch(), 1000)
    },
    onError: () => {
      toast.error('Failed to adjust inventory stock')
      refetch() // Revert optimistic update
    },
  })

  // Get low stock items count
  const lowStockCount = inventory?.filter(item => 
    item.current_quantity <= item.reorder_threshold
  ).length || 0

  // Get out of stock items
  const outOfStockCount = inventory?.filter(item => 
    item.current_quantity === 0
  ).length || 0

  // Calculate total inventory value
  const totalInventoryValue = inventory?.reduce((total, item) => 
    total + (item.current_quantity * item.cost_per_unit), 0
  ) || 0

  return {
    inventory: inventory || [],
    isLoading,
    error,
    refetch,
    addInventoryItem,
    updateInventoryItem,
    adjustInventoryStock,
    connectionStatus,
    lowStockCount,
    outOfStockCount,
    totalInventoryValue,
  }
}