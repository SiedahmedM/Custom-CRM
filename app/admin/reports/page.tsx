'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { ArrowLeft, RefreshCw, DollarSign, TrendingUp, Package, PieChart } from 'lucide-react'
import type { Database } from '@/types/database'

type DeliveredOrder = {
  id: string
  total_amount: number
  created_at: string
  status: Database['public']['Tables']['orders']['Row']['status']
}

type OrderItemWithInventory = {
  order_id: string
  inventory_id: string
  quantity: number
  unit_price: number
  total_price: number
  inventory: {
    cost_per_unit: number
    selling_price: number
    part_number: string
    description: string
  } | null
}

type InventoryLite = {
  id: string
  part_number: string
  description: string
  current_quantity: number
  cost_per_unit: number
  selling_price: number
}

type MonthlySummaryDetails = {
  month?: string
  revenue?: number
  cogs?: number
  netProfit?: number
  ordersCount?: number
  avgOrderValue?: number
  inventoryValue?: number
  topSellers?: Array<{ part_number: string; qty: number; revenue: number; margin: number }>
}

type ActivityLogSummary = {
  id: string
  created_at: string
  details: MonthlySummaryDetails | null
}

export default function AdminReportsPage() {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const supabase = createClient()

  const [timeframe, setTimeframe] = useState<'today'|'week'|'month'>('month')
  const [refreshing, setRefreshing] = useState(false)

  const [orders, setOrders] = useState<DeliveredOrder[]>([])
  const [orderItems, setOrderItems] = useState<OrderItemWithInventory[]>([])
  const [inventory, setInventory] = useState<InventoryLite[]>([])

  useEffect(() => {
    if (!user || !isAdmin) router.push('/')
  }, [user, isAdmin, router])

  const range = useMemo(() => {
    const now = new Date()
    if (timeframe === 'today') return { start: new Date(now.setHours(0,0,0,0)), end: new Date() }
    if (timeframe === 'week') return { start: new Date(Date.now() - 7*24*60*60*1000), end: new Date() }
    return { start: new Date(Date.now() - 30*24*60*60*1000), end: new Date() }
  }, [timeframe])

  async function load() {
    setRefreshing(true)
    try {
      // Delivered orders in range
      const { data: delivered } = await supabase
        .from('orders')
        .select('id, total_amount, created_at, status')
        .eq('status', 'delivered')
        .gte('created_at', range.start.toISOString())
        .lte('created_at', range.end.toISOString())

      const deliveredRows = (delivered || []) as Array<{ id: string; total_amount: number; created_at: string; status: DeliveredOrder['status'] }>
      const orderIds = deliveredRows.map(o => o.id)

      // Order items for delivered orders with inventory costs
      let items: OrderItemWithInventory[] = []
      if (orderIds.length > 0) {
        const { data: oi } = await supabase
          .from('order_items')
          .select('order_id, inventory_id, quantity, unit_price, total_price, inventory:inventory_id(cost_per_unit, selling_price, part_number, description)')
          .in('order_id', orderIds)
        items = (oi || []) as OrderItemWithInventory[]
      }

      // Current inventory for valuation
      const { data: inv } = await supabase
        .from('inventory')
        .select('id, part_number, description, current_quantity, cost_per_unit, selling_price')
        .eq('is_active', true)

      setOrders(deliveredRows)
      setOrderItems(items)
      setInventory((inv || []) as InventoryLite[])
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe])

  // KPIs
  const revenue = useMemo(() => orders.reduce((s, o) => s + (o.total_amount || 0), 0), [orders])
  const cogs = useMemo(() => {
    return orderItems.reduce((s, it) => s + (it.quantity || 0) * ((it.inventory?.cost_per_unit) || 0), 0)
  }, [orderItems])
  const netProfit = revenue - cogs
  const ordersCount = orders.length
  const avgOrderValue = ordersCount > 0 ? revenue / ordersCount : 0

  const inventoryValue = useMemo(() => {
    return inventory.reduce((s, it) => s + (it.current_quantity || 0) * (it.cost_per_unit || 0), 0)
  }, [inventory])

  // Top sellers aggregation within range
  const topSellers = useMemo(() => {
    const map = new Map<string, { part_number: string; description?: string; qty: number; revenue: number; cogs: number }>()
    for (const it of orderItems) {
      const key = it.inventory_id
      const qty = it.quantity || 0
      const rev = (it.total_price != null ? it.total_price : qty * (it.unit_price || 0))
      const cost = qty * ((it.inventory?.cost_per_unit) || 0)
      const entry = map.get(key) || { part_number: it.inventory?.part_number || key, description: it.inventory?.description, qty: 0, revenue: 0, cogs: 0 }
      entry.qty += qty
      entry.revenue += rev
      entry.cogs += cost
      map.set(key, entry)
    }
    return Array.from(map.values())
      .map(e => ({ ...e, margin: e.revenue - e.cogs }))
      .sort((a,b) => b.qty - a.qty)
      .slice(0, 10)
  }, [orderItems])

  // CSV export helpers
  function downloadCSV(filename: string, rows: string[]) {
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function exportKPIs() {
    const rows = [
      'Metric,Value',
      `Revenue,${revenue.toFixed(2)}`,
      `COGS,${cogs.toFixed(2)}`,
      `Net Profit,${netProfit.toFixed(2)}`,
      `Inventory Value,${inventoryValue.toFixed(2)}`,
      `Orders,${ordersCount}`,
      `Avg Order Value,${avgOrderValue.toFixed(2)}`,
    ]
    const label = timeframe === 'today' ? 'today' : (timeframe === 'week' ? 'week' : 'month')
    downloadCSV(`kpis_${label}.csv`, rows)
  }

  function exportTopSellers() {
    const rows = ['Part,Description,Qty,Revenue,Margin']
    for (const r of topSellers) {
      rows.push(`${JSON.stringify(r.part_number)},${JSON.stringify(r.description || '')},${r.qty},${r.revenue.toFixed(2)},${r.margin.toFixed(2)}`)
    }
    const label = timeframe === 'today' ? 'today' : (timeframe === 'week' ? 'week' : 'month')
    downloadCSV(`top_sellers_${label}.csv`, rows)
  }

  // Monthly summaries (persist last 12 months in activity_logs)
  const [summaries, setSummaries] = useState<ActivityLogSummary[]>([])

  const loadSummaries = useCallback(async () => {
    const { data } = await supabase
      .from('activity_logs')
      .select('id, created_at, details')
      .eq('action', 'monthly_report')
      .order('created_at', { ascending: false })
      .limit(12)
    setSummaries((data as ActivityLogSummary[]) || [])
  }, [supabase])

  useEffect(() => { loadSummaries() }, [loadSummaries])

  async function saveCurrentMonthSummary() {
    // Build a compact summary from current computations
    const label = new Date().toISOString().slice(0,7) // YYYY-MM
    const details = {
      month: label,
      revenue,
      cogs,
      netProfit,
      ordersCount,
      avgOrderValue,
      inventoryValue,
      topSellers: topSellers.map(t => ({ part_number: t.part_number, qty: t.qty, revenue: t.revenue, margin: t.margin }))
    }
    const payload: Database['public']['Tables']['activity_logs']['Insert'] = {
      user_id: user?.id ?? null,
      action: 'monthly_report',
      entity_type: 'reports',
      entity_id: null,
      details: details as Database['public']['Tables']['activity_logs']['Row']['details'],
      ip_address: null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }
    await supabase
      .from('activity_logs')
      // @ts-expect-error Supabase generated types can infer never for this insert
      .insert(payload)
    await loadSummaries()
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />

      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40">
        <div className="px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="p-2 -ml-2 active:scale-95 transition-transform">
              <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900">Reports</h1>
              <p className="text-[13px] text-gray-500">Business KPIs and analytics</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
              {(['today','week','month'] as const).map(tf => (
                <button key={tf} onClick={() => setTimeframe(tf)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium ${timeframe===tf?'bg-white shadow text-gray-900':'text-gray-600'}`}>{tf}</button>
              ))}
            </div>
            <button onClick={load} disabled={refreshing} className="p-2 active:scale-95 transition-transform">
              <RefreshCw className={`w-[20px] h-[20px] text-gray-600 ${refreshing ? 'animate-spin':''}`} />
            </button>
            <button onClick={exportKPIs} className="px-3 py-1.5 bg-gray-100 rounded-lg text-[12px] font-medium active:bg-gray-200">Export KPIs</button>
            <button onClick={exportTopSellers} className="px-3 py-1.5 bg-gray-100 rounded-lg text-[12px] font-medium active:bg-gray-200">Export Top Sellers</button>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="px-5 py-4 grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-[12px] text-gray-500">Revenue</p>
              <p className="text-[20px] font-bold text-gray-900">${revenue.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center"><Package className="w-5 h-5 text-orange-600" /></div>
            <div>
              <p className="text-[12px] text-gray-500">COGS</p>
              <p className="text-[20px] font-bold text-gray-900">${cogs.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-[12px] text-gray-500">Net Profit</p>
              <p className={`text-[20px] font-bold ${netProfit>=0?'text-green-700':'text-red-700'}`}>${netProfit.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center"><PieChart className="w-5 h-5 text-purple-600" /></div>
            <div>
              <p className="text-[12px] text-gray-500">Inventory Value</p>
              <p className="text-[20px] font-bold text-gray-900">${inventoryValue.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <p className="text-[12px] text-gray-500">Orders</p>
          <p className="text-[20px] font-bold text-gray-900">{ordersCount}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <p className="text-[12px] text-gray-500">Avg Order Value</p>
          <p className="text-[20px] font-bold text-gray-900">${avgOrderValue.toFixed(2)}</p>
        </div>
      </div>

      {/* Top Sellers */}
      <div className="px-5 pb-safe">
        <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Top Sellers</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-5 text-[12px] text-gray-500">
            <div className="px-2">Part</div>
            <div className="px-2">Description</div>
            <div className="px-2 text-right">Qty</div>
            <div className="px-2 text-right">Revenue</div>
            <div className="px-2 text-right">Margin</div>
          </div>
          <div className="divide-y divide-gray-100">
            {topSellers.map((row, idx) => (
              <div key={idx} className="grid grid-cols-5 text-[13px] py-2">
                <div className="px-2 truncate font-medium">{row.part_number}</div>
                <div className="px-2 truncate">{row.description || '—'}</div>
                <div className="px-2 text-right">{row.qty}</div>
                <div className="px-2 text-right">${row.revenue.toFixed(2)}</div>
                <div className={`px-2 text-right ${row.margin>=0?'text-green-600':'text-red-600'}`}>${row.margin.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Summaries */}
      <div className="px-5 pb-safe">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">Monthly Summaries (Last 12)</h2>
          <button onClick={saveCurrentMonthSummary} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[12px] font-medium active:bg-blue-700">Save Current Month</button>
        </div>
        {summaries.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No saved summaries yet</div>
        ) : (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-6 text-[12px] text-gray-500">
              <div className="px-2">Month</div>
              <div className="px-2 text-right">Revenue</div>
              <div className="px-2 text-right">COGS</div>
              <div className="px-2 text-right">Net</div>
              <div className="px-2 text-right">Orders</div>
              <div className="px-2 text-right">Top Items</div>
            </div>
            <div className="divide-y divide-gray-100">
              {summaries.map((s, idx) => {
                const d = s.details || {}
                return (
                  <div key={idx} className="grid grid-cols-6 text-[13px] py-2">
                    <div className="px-2">{d.month || format(new Date(s.created_at), 'yyyy-MM')}</div>
                    <div className="px-2 text-right">${(d.revenue || 0).toFixed?.(2) || Number(d.revenue || 0).toFixed(2)}</div>
                    <div className="px-2 text-right">${(d.cogs || 0).toFixed?.(2) || Number(d.cogs || 0).toFixed(2)}</div>
                    <div className={`px-2 text-right ${((d.netProfit||0) >= 0)?'text-green-600':'text-red-600'}`}>${(d.netProfit || 0).toFixed?.(2) || Number(d.netProfit || 0).toFixed(2)}</div>
                    <div className="px-2 text-right">{d.ordersCount || 0}</div>
                    <div className="px-2 text-right">{Array.isArray(d.topSellers) ? d.topSellers.length : 0}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 