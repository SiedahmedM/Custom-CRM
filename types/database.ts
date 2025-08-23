export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          access_key: string
          name: string
          role: 'admin' | 'driver'
          phone: string | null
          email: string | null
          is_active: boolean
          last_login: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      customers: {
        Row: {
          id: string
          shop_name: string
          contact_name: string | null
          phone: string | null
          email: string | null
          address: string | null
          city: string | null
          state: string | null
          zip_code: string | null
          current_balance: number
          credit_limit: number | null
          notes: string | null
          assigned_driver_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['customers']['Row'], 'id' | 'created_at' | 'updated_at' | 'current_balance'>
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      inventory: {
        Row: {
          id: string
          part_number: string
          description: string
          cost_per_unit: number
          selling_price: number
          current_quantity: number
          reserved_quantity: number
          reorder_threshold: number | null
          location: string | null
          supplier: string | null
          last_restock_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory']['Row'], 'id' | 'created_at' | 'updated_at' | 'reserved_quantity'>
        Update: Partial<Database['public']['Tables']['inventory']['Insert']>
      }
      orders: {
        Row: {
          id: string
          order_number: string
          customer_id: string
          driver_id: string | null
          status: 'pending' | 'assigned' | 'needs_reassignment' | 'out_for_delivery' | 'delivered' | 'cancelled'
          order_date: string
          delivery_date: string | null
          delivery_address: string | null
          total_amount: number
          paid_amount: number
          balance_due: number
          special_instructions: string | null
          reassignment_reason: string | null
          delivery_started_at: string | null
          delivered_at: string | null
          delivery_latitude: number | null
          delivery_longitude: number | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['orders']['Row'], 'id' | 'order_number' | 'balance_due' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          inventory_id: string
          quantity: number
          unit_price: number
          total_price: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['order_items']['Row'], 'id' | 'total_price' | 'created_at'>
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      payments: {
        Row: {
          id: string
          order_id: string | null
          customer_id: string
          amount: number
          payment_method: 'cash' | 'check' | 'card' | 'transfer' | 'other'
          payment_date: string
          reference_number: string | null
          notes: string | null
          processed_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
      pitch_attempts: {
        Row: {
          id: string
          driver_id: string
          customer_id: string | null
          shop_name: string | null
          contact_name: string | null
          phone: string | null
          pitch_date: string
          decision_maker_contacted: boolean
          interest_level: 'high' | 'medium' | 'low' | 'none' | null
          follow_up_required: boolean
          follow_up_date: string | null
          potential_order_value: number | null
          notes: string | null
          latitude: number | null
          longitude: number | null
          location_verified: boolean
          verification_status: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['pitch_attempts']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['pitch_attempts']['Insert']>
      }
      inventory_adjustments: {
        Row: {
          id: string
          inventory_id: string
          adjustment_type: 'add' | 'remove'
          quantity: number
          reason: 'new_shipment' | 'damaged' | 'lost' | 'manual_count' | 'sale' | 'return' | 'other'
          notes: string | null
          adjusted_by: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['inventory_adjustments']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['inventory_adjustments']['Insert']>
      }
      driver_locations: {
        Row: {
          id: string
          driver_id: string
          latitude: number
          longitude: number
          accuracy: number | null
          heading: number | null
          speed: number | null
          recorded_at: string
        }
        Insert: Omit<Database['public']['Tables']['driver_locations']['Row'], 'id' | 'recorded_at'>
        Update: Partial<Database['public']['Tables']['driver_locations']['Insert']>
      }
      notifications: {
        Row: {
          id: string
          user_id: string | null
          title: string
          message: string
          type: string | null
          priority: string
          is_read: boolean
          related_order_id: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notifications']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
      }
      activity_logs: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string | null
          entity_id: string | null
          details: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['activity_logs']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['activity_logs']['Insert']>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}