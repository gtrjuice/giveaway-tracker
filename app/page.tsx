"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Download, Settings, Trash, Trophy, Package, TrendingUp, Gift, CheckCircle, Plus, Edit, RefreshCw, X } from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ──────────────────────────────────────────────────────────────────

type PackSize = 10000 | 20000 | 45000 | 100000
type WheelOutcomeType = "immediate" | "next_order" | "multiplier_2x" | "fun"

interface WheelOutcome {
  id: string; label: string; type: WheelOutcomeType; entries: number; group: string
}

interface SpinEntry {
  id: string
  outcome: WheelOutcome | null
  targetOrderNumber: string   // for next_order type — blank = goes to general pending pool
}

interface FormSpin {
  id: string
  spinId: string
  spinPending: boolean
  targetOrderNum: string
}

interface TargetedBonus {
  id: string
  entries: number
  spinLabel: string
  targetOrderNumber: string
  sourceOrderNumber: string
  timestamp: string
  applied: boolean
}

interface Order {
  id: string
  orderNumber: string
  packSize: PackSize | null
  multiplier: number
  baseEntries: number
  extraEntries: number
  pendingBonusApplied: number
  targetedBonusApplied: number
  spins: SpinEntry[]
  immediateBonus: number
  nextOrderBonusGenerated: number
  totalEntries: number
  timestamp: string
}

interface Multipliers { pack10k: number; pack20k: number; pack45k: number; pack100k: number }

interface OutcomeForm {
  id: string; label: string; type: WheelOutcomeType; entries: string; group: string; customGroup: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PACK_SIZES: { value: PackSize; label: string }[] = [
  { value: 10000, label: "10K Pack" }, { value: 20000, label: "20K Pack" },
  { value: 45000, label: "45K Pack" }, { value: 100000, label: "100K Pack" },
]

const DEFAULT_MULTIPLIERS: Multipliers = { pack10k: 0, pack20k: 0, pack45k: 0, pack100k: 0 }

const DEFAULT_WHEEL_OUTCOMES: WheelOutcome[] = [
  { id: "im_50k",    label: "50K Entries",              type: "immediate",     entries: 50000,   group: "For You" },
  { id: "im_250k",   label: "250K Entries",             type: "immediate",     entries: 250000,  group: "For You" },
  { id: "im_500k",   label: "500K Entries",             type: "immediate",     entries: 500000,  group: "For You" },
  { id: "im_1m",     label: "1 Million Entries",        type: "immediate",     entries: 1000000, group: "For You" },
  { id: "im_1_5m",   label: "1.5 Million Entries",      type: "immediate",     entries: 1500000, group: "For You" },
  { id: "im_2m",     label: "2 Million Entries",        type: "immediate",     entries: 2000000, group: "For You" },
  { id: "im_3m",     label: "3 Million Entries",        type: "immediate",     entries: 3000000, group: "For You" },
  { id: "next_1m_a", label: "Next Order +1M",           type: "next_order",    entries: 1000000, group: "Next Order" },
  { id: "next_1m_b", label: "Next Order +1M",           type: "next_order",    entries: 1000000, group: "Next Order" },
  { id: "next_1_5m", label: "Next Order +1.5M",         type: "next_order",    entries: 1500000, group: "Next Order" },
  { id: "next_2m",   label: "Next Order +2M",           type: "next_order",    entries: 2000000, group: "Next Order" },
  { id: "next_3m",   label: "Next Order +3M",           type: "next_order",    entries: 3000000, group: "Next Order" },
  { id: "x2",        label: "2x Order Entries",         type: "multiplier_2x", entries: 0,       group: "Special" },
  { id: "pledge",    label: "🇺🇸 Pledge of Allegiance", type: "fun",           entries: 0,       group: "Fun" },
  { id: "gay",       label: "🏳️‍🌈 Gay",                 type: "fun",           entries: 0,       group: "Fun" },
  { id: "teapot",    label: "🫖 Teapot Song",            type: "fun",           entries: 0,       group: "Fun" },
]

const STORAGE_KEY        = "giveaway-tracker-v1"
const WHEEL_STORAGE_KEY  = "giveaway-wheel-v1"
const BONUS_STORAGE_KEY  = "giveaway-targeted-bonuses-v1"
const BLANK_FORM: OutcomeForm = { id: "", label: "", type: "immediate", entries: "1000000", group: "For You", customGroup: "" }
const TYPE_OPTIONS = [
  { value: "immediate"     as WheelOutcomeType, label: "For You (immediate)",  desc: "Added directly to this order" },
  { value: "next_order"    as WheelOutcomeType, label: "Next Order bonus",     desc: "Carried as bonus to a future order" },
  { value: "multiplier_2x" as WheelOutcomeType, label: "2× Order boost",       desc: "Doubles base pack entries" },
  { value: "fun"           as WheelOutcomeType, label: "Fun / no entries",     desc: "Just for laughs" },
]
// No cap on spins per order
const BLANK_SPIN = (): FormSpin => ({ id: crypto.randomUUID(), spinId: "", spinPending: false, targetOrderNum: "" })

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n/1_000_000_000).toFixed(1).replace(/\.0$/,"")}B`
  if (n >= 1_000_000)     return `${(n/1_000_000).toFixed(1).replace(/\.0$/,"")}M`
  if (n >= 1_000)         return `${(n/1_000).toFixed(1).replace(/\.0$/,"")}K`
  return n.toLocaleString()
}
function packKey(p: PackSize): keyof Multipliers { return `pack${p/1000}k` as keyof Multipliers }
function getMult(p: PackSize, m: Multipliers): number { return m[packKey(p)] }
function calcBase(p: PackSize, m: Multipliers): number { return p * Math.max(1, getMult(p, m)) }
function badgeCls(type: WheelOutcomeType) {
  switch(type) {
    case "immediate":     return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    case "next_order":    return "bg-amber-500/20   text-amber-400   border-amber-500/30"
    case "multiplier_2x": return "bg-purple-500/20  text-purple-400  border-purple-500/30"
    case "fun":           return "bg-pink-500/20    text-pink-400    border-pink-500/30"
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GiveawayTracker() {
  const [orders,          setOrders]          = useState<Order[]>([])
  const [multipliers,     setMultipliers]     = useState<Multipliers>(DEFAULT_MULTIPLIERS)
  const [pendingBonus,    setPendingBonus]    = useState(0)
  const [wheelOutcomes,   setWheelOutcomes]   = useState<WheelOutcome[]>(DEFAULT_WHEEL_OUTCOMES)
  const [targetedBonuses, setTargetedBonuses] = useState<TargetedBonus[]>([])

  // form
  const [orderNum,   setOrderNum]   = useState("")
  const [packSize,   setPackSize]   = useState<PackSize | "">("")
  const [extraInput, setExtraInput] = useState("")
  const [formSpins,  setFormSpins]  = useState<FormSpin[]>([BLANK_SPIN()])
  const [copied,     setCopied]     = useState<string | null>(null)

  // settings dialog
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tempMults,    setTempMults]    = useState<Multipliers>(DEFAULT_MULTIPLIERS)

  // wheel editor
  const [outcomeOpen, setOutcomeOpen] = useState(false)
  const [outcomeMode, setOutcomeMode] = useState<"add"|"edit">("add")
  const [oForm,       setOForm]       = useState<OutcomeForm>(BLANK_FORM)

  // ── Persistence ───────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
      if (d.orders)                    setOrders(d.orders)
      if (d.multipliers)               setMultipliers(d.multipliers)
      if (d.pendingBonus !== undefined) setPendingBonus(d.pendingBonus)
      const wh = localStorage.getItem(WHEEL_STORAGE_KEY)
      if (wh) setWheelOutcomes(JSON.parse(wh))
      const tb = localStorage.getItem(BONUS_STORAGE_KEY)
      if (tb) setTargetedBonuses(JSON.parse(tb))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ orders, multipliers, pendingBonus })) } catch { /* ignore */ }
  }, [orders, multipliers, pendingBonus])
  useEffect(() => {
    try { localStorage.setItem(WHEEL_STORAGE_KEY, JSON.stringify(wheelOutcomes)) } catch { /* ignore */ }
  }, [wheelOutcomes])
  useEffect(() => {
    try { localStorage.setItem(BONUS_STORAGE_KEY, JSON.stringify(targetedBonuses)) } catch { /* ignore */ }
  }, [targetedBonuses])

  // ── Derived ───────────────────────────────────────────────────────────────
  const totalEntries  = useMemo(() => orders.reduce((s,o) => s + o.totalEntries, 0), [orders])
  const extraEntries  = useMemo(() => Math.max(0, parseInt(extraInput)||0), [extraInput])

  const wheelGroups = useMemo(() => {
    const g: Record<string,WheelOutcome[]> = {}
    wheelOutcomes.forEach(w => { (g[w.group] = g[w.group]??[]).push(w) })
    return g
  }, [wheelOutcomes])
  const existingGroups = useMemo(() => Object.keys(wheelGroups), [wheelGroups])

  // Resolve each form spin to its outcome
  const resolvedSpins = useMemo(() =>
    formSpins.map(fs => ({
      ...fs,
      outcome: fs.spinPending ? null : (wheelOutcomes.find(w => w.id === fs.spinId) ?? null)
    })), [formSpins, wheelOutcomes])

  // Aggregate spin math
  const spinCalc = useMemo(() => {
    const immediateTotal = resolvedSpins.reduce((s,rs) =>
      rs.outcome?.type==="immediate" ? s + rs.outcome.entries : s, 0)
    const is2x = resolvedSpins.some(rs => rs.outcome?.type==="multiplier_2x")
    const nextOrderSpins = resolvedSpins.filter(rs => rs.outcome?.type==="next_order")
    const generalNextTotal = nextOrderSpins
      .filter(rs => !rs.targetOrderNum.trim())
      .reduce((s,rs) => s + (rs.outcome?.entries??0), 0)
    const targetedSpins = nextOrderSpins.filter(rs => rs.targetOrderNum.trim())
    return { immediateTotal, is2x, generalNextTotal, targetedSpins }
  }, [resolvedSpins])

  // Targeted bonuses already assigned to the current order number
  const detectedBonuses = useMemo(() =>
    orderNum.trim()
      ? targetedBonuses.filter(b => !b.applied && b.targetOrderNumber.trim().toLowerCase() === orderNum.trim().toLowerCase())
      : [],
    [orderNum, targetedBonuses])
  const detectedBonusTotal = useMemo(() => detectedBonuses.reduce((s,b)=>s+b.entries,0), [detectedBonuses])

  const preview = useMemo(() => {
    const base    = packSize ? calcBase(packSize, multipliers) : 0
    const effBase = spinCalc.is2x ? base*2 : base
    const total   = effBase + extraEntries + pendingBonus + detectedBonusTotal + spinCalc.immediateTotal
    return { base, effBase, is2x: spinCalc.is2x, imm: spinCalc.immediateTotal,
             next: spinCalc.generalNextTotal, total }
  }, [packSize, spinCalc, multipliers, pendingBonus, extraEntries, detectedBonusTotal])

  const needsEntries  = oForm.type==="immediate"||oForm.type==="next_order"
  const resolvedGroup = oForm.group==="__custom__" ? oForm.customGroup.trim() : oForm.group
  const canSave       = oForm.label.trim() && resolvedGroup

  const pendingTargetedBonuses = useMemo(() => targetedBonuses.filter(b=>!b.applied), [targetedBonuses])

  // ── Spin form helpers ─────────────────────────────────────────────────────
  const addSpin = useCallback(() => {
    setFormSpins(p => [...p, BLANK_SPIN()])
  }, [])

  const removeSpin = useCallback((id: string) => {
    setFormSpins(p => p.length > 1 ? p.filter(s => s.id !== id) : p)
  }, [])

  const updateSpin = useCallback((id: string, changes: Partial<FormSpin>) => {
    setFormSpins(p => p.map(s => s.id===id ? {...s,...changes} : s))
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const copyText = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(()=>setCopied(null),2000) })
  }, [])

  const handleAddOrder = useCallback(() => {
    if (!orderNum.trim() || (!packSize && extraEntries<=0 && detectedBonusTotal<=0)) return
    const mult    = packSize ? getMult(packSize,multipliers) : 0
    const base    = packSize ? calcBase(packSize,multipliers) : 0
    const is2x    = spinCalc.is2x
    const effBase = is2x ? base*2 : base
    const total   = effBase + extraEntries + pendingBonus + detectedBonusTotal + spinCalc.immediateTotal

    const spins: SpinEntry[] = resolvedSpins.map(rs => ({
      id: rs.id, outcome: rs.outcome, targetOrderNumber: rs.targetOrderNum.trim()
    }))

    // New targeted bonuses from this order's spins
    const newTargeted: TargetedBonus[] = spinCalc.targetedSpins.map(rs => ({
      id: crypto.randomUUID(),
      entries: rs.outcome!.entries,
      spinLabel: rs.outcome!.label,
      targetOrderNumber: rs.targetOrderNum.trim(),
      sourceOrderNumber: orderNum.trim(),
      timestamp: new Date().toISOString(),
      applied: false,
    }))

    setOrders(prev => [{
      id: crypto.randomUUID(), orderNumber: orderNum.trim(),
      packSize: packSize||null, multiplier: mult, baseEntries: base,
      extraEntries, pendingBonusApplied: pendingBonus,
      targetedBonusApplied: detectedBonusTotal,
      spins, immediateBonus: spinCalc.immediateTotal,
      nextOrderBonusGenerated: spinCalc.generalNextTotal,
      totalEntries: total, timestamp: new Date().toISOString(),
    }, ...prev])

    setPendingBonus(spinCalc.generalNextTotal)

    if (detectedBonuses.length > 0)
      setTargetedBonuses(p => p.map(b => detectedBonuses.find(d=>d.id===b.id) ? {...b,applied:true} : b))
    if (newTargeted.length > 0)
      setTargetedBonuses(p => [...p, ...newTargeted])

    setOrderNum(""); setPackSize(""); setExtraInput(""); setFormSpins([BLANK_SPIN()])
  }, [orderNum, packSize, extraEntries, resolvedSpins, spinCalc, multipliers, pendingBonus, detectedBonuses, detectedBonusTotal])

  const deleteOrder    = useCallback((id:string) => setOrders(p=>p.filter(o=>o.id!==id)),[])
  const clearAll       = useCallback(()=>{ if(confirm("Clear ALL orders and reset?")){ setOrders([]); setPendingBonus(0); setTargetedBonuses([]) } },[])
  const dismissBonus   = useCallback((id:string) => setTargetedBonuses(p=>p.map(b=>b.id===id?{...b,applied:true}:b)),[])

  const exportCSV = useCallback(()=>{
    const hdr = ["Order #","Pack","Multiplier","Base","Extra/Promo","Pending Bonus","Targeted Bonus","Spins","Spin Bonuses","→ Next Order","Total","Time"]
    const rows = orders.map(o=>[
      o.orderNumber, o.packSize?`${o.packSize/1000}K`:"Custom",
      o.multiplier?`${o.multiplier}x`:"—", o.baseEntries, o.extraEntries??0,
      o.pendingBonusApplied, o.targetedBonusApplied??0,
      (o.spins??[]).length,
      o.immediateBonus, o.nextOrderBonusGenerated, o.totalEntries,
      new Date(o.timestamp).toLocaleString(),
    ])
    const csv=[hdr,...rows].map(r=>r.join(",")).join("\n")
    Object.assign(document.createElement("a"),{
      href:URL.createObjectURL(new Blob([csv],{type:"text/csv"})),
      download:`giveaway-${new Date().toISOString().slice(0,10)}.csv`,
    }).click()
  },[orders])

  // Wheel management
  const openAdd = useCallback(()=>{
    setOForm({...BLANK_FORM,id:crypto.randomUUID(),group:existingGroups[0]??"For You"})
    setOutcomeMode("add"); setOutcomeOpen(true)
  },[existingGroups])

  const openEdit = useCallback((w:WheelOutcome)=>{
    const known=existingGroups.includes(w.group)
    setOForm({id:w.id,label:w.label,type:w.type,entries:String(w.entries),
              group:known?w.group:"__custom__",customGroup:known?"":w.group})
    setOutcomeMode("edit"); setOutcomeOpen(true)
  },[existingGroups])

  const saveOutcome = useCallback(()=>{
    if(!canSave) return
    const saved:WheelOutcome={
      id:oForm.id||crypto.randomUUID(), label:oForm.label.trim(), type:oForm.type,
      entries:needsEntries?Math.max(0,parseInt(oForm.entries)||0):0,
      group:resolvedGroup||"For You",
    }
    setWheelOutcomes(prev=>outcomeMode==="add"?[...prev,saved]:prev.map(w=>w.id===saved.id?saved:w))
    setOutcomeOpen(false)
  },[oForm,outcomeMode,canSave,needsEntries,resolvedGroup])

  const deleteOutcome = useCallback((id:string)=>{
    if(!confirm("Remove this wheel outcome?")) return
    setWheelOutcomes(prev=>prev.filter(w=>w.id!==id))
    setFormSpins(prev=>prev.map(s=>s.spinId===id?{...s,spinId:"",spinPending:false}:s))
  },[])

  const resetWheel = useCallback(()=>{
    if(confirm("Reset wheel outcomes to defaults?")) setWheelOutcomes(DEFAULT_WHEEL_OUTCOMES)
  },[])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0">🏎️</span>
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-none text-white">Giveaway Entry Tracker</h1>
              <p className="text-xs text-gray-500 mt-0.5">Live stream spin tracker</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {pendingBonus>0&&(
              <motion.div initial={{scale:0.8,opacity:0}} animate={{scale:1,opacity:1}}
                className="hidden sm:flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1">
                <Gift className="h-3 w-3 text-amber-400"/>
                <span className="text-xs text-amber-400 font-medium">+{fmt(pendingBonus)} pending</span>
              </motion.div>
            )}
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500 leading-none">Total Entries</p>
              <p className="text-lg font-bold text-emerald-400 leading-tight">{fmt(totalEntries)}</p>
            </div>
            <Dialog open={settingsOpen} onOpenChange={o=>{setSettingsOpen(o);if(o)setTempMults(multipliers)}}>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8 border-gray-700 bg-gray-800 hover:bg-gray-700">
                  <Settings className="h-4 w-4"/>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
                <DialogHeader><DialogTitle className="text-white">Pack Multipliers</DialogTitle></DialogHeader>
                <p className="text-xs text-gray-400 -mt-2">Update when the promo changes.</p>
                <div className="space-y-3 py-1">
                  {PACK_SIZES.map(p=>{
                    const key=packKey(p.value)
                    return (
                      <div key={p.value} className="flex items-center gap-3">
                        <Label className="w-20 text-sm text-gray-300 shrink-0">{p.label}</Label>
                        <Input type="number" min={0} value={tempMults[key]}
                          onChange={e=>setTempMults(prev=>({...prev,[key]:Number(e.target.value)}))}
                          className="bg-gray-800 border-gray-700 text-white h-8 text-sm"/>
                        <span className="text-gray-500 text-xs shrink-0">= {fmt(p.value*Math.max(1,tempMults[key]))}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button onClick={()=>{setMultipliers(tempMults);setSettingsOpen(false)}} className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-9">Save</Button>
                  <Button variant="outline" className="border-gray-700 bg-gray-800 hover:bg-gray-700 h-9" onClick={()=>setTempMults(DEFAULT_MULTIPLIERS)}>Reset</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* ── Stats ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {icon:<Trophy className="h-4 w-4 text-yellow-400"/>,   label:"Total Entries",    value:fmt(totalEntries),  sub:totalEntries.toLocaleString(),                             color:"text-emerald-400"},
            {icon:<Gift   className="h-4 w-4 text-amber-400"/>,    label:"Next Order Bonus", value:pendingBonus>0?`+${fmt(pendingBonus)}`:"—", sub:pendingBonus>0?"Pending for next order":"None yet", color:pendingBonus>0?"text-amber-400":"text-gray-500"},
            {icon:<Package className="h-4 w-4 text-blue-400"/>,    label:"Orders Logged",    value:String(orders.length), sub:`${orders.filter(o=>o.spins?.some(s=>s.outcome)).length} with spins`, color:"text-blue-400"},
            {icon:<TrendingUp className="h-4 w-4 text-purple-400"/>,label:"Avg / Order",     value:orders.length>0?fmt(Math.round(totalEntries/orders.length)):"—", sub:"entries per order", color:"text-purple-400"},
          ].map(s=>(
            <Card key={s.label} className="bg-gray-900 border-gray-800">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-1.5 mb-1.5">{s.icon}<span className="text-xs text-gray-400">{s.label}</span></div>
                <p className={cn("text-xl font-bold",s.color)}>{s.value}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">{s.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending bonuses banners */}
        <AnimatePresence>
          {pendingBonus>0&&(
            <motion.div key="mob-pending" initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="sm:hidden">
              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
                <Gift className="h-4 w-4 text-amber-400 shrink-0"/>
                <p className="text-sm text-amber-300"><span className="font-semibold">+{fmt(pendingBonus)}</span> bonus waiting for your next order</p>
              </div>
            </motion.div>
          )}
          {pendingTargetedBonuses.length>0&&(
            <motion.div key="targeted" initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}>
              <div className="rounded-lg bg-sky-500/10 border border-sky-500/25 px-3 py-2.5 space-y-1.5">
                <p className="text-xs text-sky-400 font-semibold uppercase tracking-wide">🎯 Targeted Bonuses Pending</p>
                {pendingTargetedBonuses.map(b=>(
                  <div key={b.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-sky-300 font-medium">+{fmt(b.entries)}</span>
                      <span className="text-xs text-sky-400/60">→ Order <span className="font-mono">{b.targetOrderNumber}</span></span>
                      <span className="text-xs text-gray-600 hidden sm:inline">(from {b.sourceOrderNumber})</span>
                    </div>
                    <button onClick={()=>dismissBonus(b.id)} className="text-gray-600 hover:text-gray-400 shrink-0" title="Dismiss">
                      <X className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue="log" className="space-y-4">
          <TabsList className="bg-gray-900 border border-gray-800 w-full sm:w-auto">
            <TabsTrigger value="log"     className="flex-1 sm:flex-none data-[state=active]:bg-gray-700">📋 Log Order</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none data-[state=active]:bg-gray-700">🕐 History {orders.length>0&&`(${orders.length})`}</TabsTrigger>
            <TabsTrigger value="wheel"   className="flex-1 sm:flex-none data-[state=active]:bg-gray-700">🎡 Wheel</TabsTrigger>
          </TabsList>

          {/* ━━━━ LOG ORDER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <TabsContent value="log" className="mt-0">
            <div className="grid md:grid-cols-2 gap-5">
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-white">
                    <Plus className="h-4 w-4"/> New Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">

                  {/* ① Order number */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">① Order Number</Label>
                    <div className="flex gap-2">
                      <Input value={orderNum} onChange={e=>setOrderNum(e.target.value)}
                        placeholder="Paste order # here…"
                        className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 font-mono"
                        onKeyDown={e=>e.key==="Enter"&&handleAddOrder()}/>
                      <Button size="icon" variant="outline" disabled={!orderNum}
                        className={cn("shrink-0 border-gray-700 bg-gray-800 hover:bg-gray-700",copied==="form"&&"border-emerald-600 bg-emerald-900/30")}
                        onClick={()=>copyText(orderNum,"form")}>
                        {copied==="form"?<CheckCircle className="h-4 w-4 text-emerald-400"/>:<Copy className="h-4 w-4"/>}
                      </Button>
                    </div>
                    {orderNum&&<p className="text-xs text-gray-500">💬 Copy this to paste in the live stream chat</p>}
                  </div>

                  {/* ② Entry pack */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">② Entry Pack <span className="text-gray-600 normal-case">(optional)</span></Label>
                    <Select value={packSize?String(packSize):""} onValueChange={v=>setPackSize(Number(v) as PackSize)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select a pack…"/>
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700">
                        {PACK_SIZES.map(p=>(
                          <SelectItem key={p.value} value={String(p.value)} className="text-white focus:bg-gray-700 focus:text-white">
                            <span>{p.label}</span>
                            <span className="text-gray-400 text-xs ml-2">
                              {getMult(p.value,multipliers)>0?`× ${getMult(p.value,multipliers)}x = ${fmt(calcBase(p.value,multipliers))}`:`= ${fmt(p.value)} (no promo)`}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* ③ Extra entries */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-400 uppercase tracking-wide">③ Extra Entries <span className="text-gray-600 normal-case">(promo codes, bonuses)</span></Label>
                    <Input type="number" min={0} value={extraInput} onChange={e=>setExtraInput(e.target.value)}
                      placeholder="e.g. 500000 — leave blank if none"
                      className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
                    {extraEntries>0&&<p className="text-xs text-sky-400">+{fmt(extraEntries)} extra entries</p>}
                  </div>

                  {/* ④ Wheel spins */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-400 uppercase tracking-wide">④ Wheel Spins ({formSpins.length})</Label>
                      {(
                        <button onClick={addSpin} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1">
                          <Plus className="h-3 w-3"/> Add spin
                        </button>
                      )}
                    </div>

                    {formSpins.map((fs,idx)=>{
                      const outcome = fs.spinPending?null:(wheelOutcomes.find(w=>w.id===fs.spinId)??null)
                      const isNextOrder = outcome?.type==="next_order"
                      return (
                        <div key={fs.id} className="rounded-lg bg-gray-800/60 border border-gray-700/60 p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium w-12 shrink-0">Spin {idx+1}</span>
                            <Select
                              value={fs.spinPending?"pending":fs.spinId}
                              onValueChange={v=>{
                                if(v==="pending") updateSpin(fs.id,{spinPending:true,spinId:"",targetOrderNum:""})
                                else updateSpin(fs.id,{spinPending:false,spinId:v})
                              }}>
                              <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 text-sm flex-1">
                                <SelectValue placeholder="Select result…"/>
                              </SelectTrigger>
                              <SelectContent className="bg-gray-800 border-gray-700 max-h-64">
                                <SelectItem value="pending" className="text-amber-400 focus:bg-gray-700 focus:text-amber-400">⏳ Pending</SelectItem>
                                {Object.entries(wheelGroups).map(([group,outcomes])=>(
                                  <div key={group}>
                                    <div className="px-2 py-1 text-xs text-gray-500 font-semibold uppercase border-t border-gray-700 mt-1">{group}</div>
                                    {outcomes.map(w=>(
                                      <SelectItem key={w.id} value={w.id} className="text-white focus:bg-gray-700 focus:text-white">
                                        {w.label}{w.entries>0&&<span className="text-gray-400 ml-2">+{fmt(w.entries)}</span>}
                                      </SelectItem>
                                    ))}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                            {formSpins.length>1&&(
                              <button onClick={()=>removeSpin(fs.id)} className="text-gray-600 hover:text-red-400 shrink-0">
                                <X className="h-4 w-4"/>
                              </button>
                            )}
                          </div>

                          {/* Target order # for next_order spins */}
                          {isNextOrder&&(
                            <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} className="overflow-hidden">
                              <div className="flex items-center gap-2 pl-14">
                                <span className="text-xs text-amber-400 shrink-0">→ Goes to order #</span>
                                <Input value={fs.targetOrderNum}
                                  onChange={e=>updateSpin(fs.id,{targetOrderNum:e.target.value})}
                                  placeholder="Order # (leave blank = your next order)"
                                  className="bg-gray-700 border-gray-600 text-white text-xs h-7 placeholder:text-gray-500 font-mono"/>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Detected targeted bonus notice */}
                  <AnimatePresence>
                    {detectedBonusTotal>0&&(
                      <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}
                        className="rounded-lg bg-sky-500/10 border border-sky-500/25 p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-lg leading-none">🎯</span>
                          <div>
                            <p className="text-sm text-sky-400 font-semibold">Targeted bonus: +{fmt(detectedBonusTotal)}</p>
                            {detectedBonuses.map(b=>(
                              <p key={b.id} className="text-xs text-sky-300/60">{b.spinLabel} — assigned from order {b.sourceOrderNumber}</p>
                            ))}
                            <p className="text-xs text-sky-300/50 mt-0.5">Will be added to this order's total</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Pending bonus notice */}
                  <AnimatePresence>
                    {pendingBonus>0&&(
                      <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-4}}
                        className="rounded-lg bg-amber-500/10 border border-amber-500/25 p-3">
                        <div className="flex items-start gap-2">
                          <Gift className="h-4 w-4 text-amber-400 mt-0.5 shrink-0"/>
                          <div>
                            <p className="text-sm text-amber-400 font-semibold">+{fmt(pendingBonus)} bonus from last spin</p>
                            <p className="text-xs text-amber-300/60 mt-0.5">Will be added to this order's total</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Preview */}
                  <AnimatePresence>
                    {(packSize||extraEntries>0||detectedBonusTotal>0)&&(
                      <motion.div initial={{opacity:0,y:4}} animate={{opacity:1,y:0}}
                        className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 space-y-2">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Entry Preview</p>
                        <div className="space-y-1 text-sm">
                          {packSize&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">Pack entries{preview.is2x&&<span className="text-purple-400 ml-1">× 2 🎉</span>}</span>
                              <span className={cn("font-medium",preview.is2x?"text-purple-300":"text-white")}>{fmt(preview.effBase)}</span>
                            </div>
                          )}
                          {extraEntries>0&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">Extra / promo</span>
                              <span className="text-sky-400">+{fmt(extraEntries)}</span>
                            </div>
                          )}
                          {pendingBonus>0&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">Pending pool bonus</span>
                              <span className="text-amber-400">+{fmt(pendingBonus)}</span>
                            </div>
                          )}
                          {detectedBonusTotal>0&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">Targeted bonus</span>
                              <span className="text-sky-400">+{fmt(detectedBonusTotal)}</span>
                            </div>
                          )}
                          {preview.imm>0&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">Spin bonus (for you)</span>
                              <span className="text-emerald-400">+{fmt(preview.imm)}</span>
                            </div>
                          )}
                          {preview.next>0&&(
                            <div className="flex justify-between">
                              <span className="text-gray-400">→ Unassigned next order</span>
                              <span className="text-amber-400">+{fmt(preview.next)}</span>
                            </div>
                          )}
                          {spinCalc.targetedSpins.length>0&&spinCalc.targetedSpins.map((rs,i)=>(
                            <div key={i} className="flex justify-between">
                              <span className="text-gray-400">→ Assigned to <span className="font-mono text-sky-400/80">{rs.targetOrderNum}</span></span>
                              <span className="text-sky-400">+{fmt(rs.outcome?.entries??0)}</span>
                            </div>
                          ))}
                          <Separator className="bg-gray-700 my-1"/>
                          <div className="flex justify-between font-semibold">
                            <span className="text-gray-200">Total this order</span>
                            <span className="text-emerald-400 text-base">{fmt(preview.total)}</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <Button onClick={handleAddOrder}
                    disabled={!orderNum.trim()||(!packSize&&extraEntries<=0&&detectedBonusTotal<=0)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 h-10">
                    <Plus className="h-4 w-4 mr-2"/> Log Order
                  </Button>
                </CardContent>
              </Card>

              {/* Pack values reference */}
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-white">📦 Current Pack Values</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {PACK_SIZES.map(p=>(
                    <div key={p.value} className="flex items-center justify-between rounded-lg bg-gray-800/50 border border-gray-700/50 px-3 py-2.5">
                      <div>
                        <span className="text-sm font-medium text-white">{p.label}</span>
                        <span className="text-gray-500 text-xs ml-2">{getMult(p.value,multipliers)>0?`× ${getMult(p.value,multipliers)}x`:"(no promo)"}</span>
                      </div>
                      <span className="font-semibold text-emerald-400">{fmt(calcBase(p.value,multipliers))}</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 pt-1 flex items-center gap-1">
                    <Settings className="h-3 w-3"/> Tap the gear icon to update multipliers when the promo changes
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ━━━━ HISTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <TabsContent value="history" className="mt-0">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-semibold text-white">Order History</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="border-gray-700 bg-gray-800 hover:bg-gray-700 h-7 text-xs"
                      onClick={exportCSV} disabled={!orders.length}><Download className="h-3 w-3 mr-1"/> Export CSV</Button>
                    <Button size="sm" variant="outline" className="border-red-900 bg-red-950/30 hover:bg-red-900/30 text-red-400 h-7 text-xs"
                      onClick={clearAll} disabled={!orders.length}><Trash className="h-3 w-3 mr-1"/> Clear All</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {orders.length===0?(
                  <div className="flex flex-col items-center justify-center py-16 text-gray-600 px-4">
                    <Package className="h-12 w-12 mb-3 opacity-30"/>
                    <p className="text-sm">No orders yet — go to Log Order to get started</p>
                  </div>
                ):(
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-gray-800 hover:bg-transparent">
                          <TableHead className="text-gray-500 text-xs">Order #</TableHead>
                          <TableHead className="text-gray-500 text-xs hidden sm:table-cell">Pack</TableHead>
                          <TableHead className="text-gray-500 text-xs hidden md:table-cell">Bonuses</TableHead>
                          <TableHead className="text-gray-500 text-xs">Spins</TableHead>
                          <TableHead className="text-gray-500 text-xs">Total</TableHead>
                          <TableHead className="text-gray-500 text-xs w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map(order=>{
                          const spins = order.spins ?? []
                          const pendingSpins = spins.filter(s=>!s.outcome).length
                          return (
                            <TableRow key={order.id} className="border-gray-800 hover:bg-gray-800/30 align-top">
                              <TableCell className="py-2.5">
                                <button onClick={()=>copyText(order.orderNumber,order.id)}
                                  className="flex items-center gap-1 font-mono text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                  <span className="truncate max-w-[110px]">{order.orderNumber}</span>
                                  {copied===order.id?<CheckCircle className="h-3 w-3 text-emerald-400 shrink-0"/>:<Copy className="h-3 w-3 opacity-40 shrink-0"/>}
                                </button>
                              </TableCell>
                              <TableCell className="py-2.5 text-xs text-gray-300 hidden sm:table-cell">
                                {order.packSize?`${order.packSize/1000}K`:<span className="text-gray-600">—</span>}
                                {order.multiplier>0&&<span className="text-gray-600 ml-0.5">×{order.multiplier}</span>}
                              </TableCell>
                              <TableCell className="py-2.5 text-xs hidden md:table-cell">
                                <div className="space-y-0.5">
                                  {(order.extraEntries??0)>0&&<div className="text-sky-400">+{fmt(order.extraEntries)} promo</div>}
                                  {order.pendingBonusApplied>0&&<div className="text-amber-400">+{fmt(order.pendingBonusApplied)} pool</div>}
                                  {(order.targetedBonusApplied??0)>0&&<div className="text-sky-400">+{fmt(order.targetedBonusApplied)} targeted</div>}
                                  {(order.extraEntries??0)===0&&order.pendingBonusApplied===0&&(order.targetedBonusApplied??0)===0&&<span className="text-gray-700">—</span>}
                                </div>
                              </TableCell>
                              <TableCell className="py-2.5">
                                {spins.length===0?(
                                  <Badge variant="outline" className="text-xs py-0 bg-gray-700/30 text-gray-500 border-gray-700">None</Badge>
                                ):(
                                  <div className="space-y-0.5">
                                    {spins.map((s,i)=>(
                                      <div key={s.id} className="flex items-center gap-1 flex-wrap">
                                        {s.outcome?(
                                          <>
                                            <Badge variant="outline" className={cn("text-xs py-0",badgeCls(s.outcome.type))}>
                                              {s.outcome.type==="immediate"?`+${fmt(s.outcome.entries)}`
                                                :s.outcome.type==="next_order"?`→ +${fmt(s.outcome.entries)}`
                                                :s.outcome.type==="multiplier_2x"?"2×":"Fun"}
                                            </Badge>
                                            {s.outcome.type==="next_order"&&s.targetOrderNumber&&(
                                              <span className="text-xs text-sky-400/70 font-mono">#{s.targetOrderNumber}</span>
                                            )}
                                          </>
                                        ):(
                                          <Badge variant="outline" className="text-xs py-0 bg-gray-700/30 text-gray-500 border-gray-700">Pending</Badge>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-2.5 text-sm font-semibold text-emerald-400">{fmt(order.totalEntries)}</TableCell>
                              <TableCell className="py-2.5">
                                <button onClick={()=>deleteOrder(order.id)} className="text-gray-700 hover:text-red-400 transition-colors">
                                  <Trash className="h-3.5 w-3.5"/>
                                </button>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ━━━━ WHEEL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <TabsContent value="wheel" className="mt-0">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm font-semibold text-white">🎡 Wheel Outcomes</CardTitle>
                    <p className="text-xs text-gray-500 mt-0.5">Add, edit, or remove outcomes. Changes apply immediately.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={openAdd} className="bg-emerald-600 hover:bg-emerald-700 h-7 text-xs">
                      <Plus className="h-3 w-3 mr-1"/> Add Outcome
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetWheel} className="border-gray-700 bg-gray-800 hover:bg-gray-700 h-7 text-xs">
                      <RefreshCw className="h-3 w-3 mr-1"/> Defaults
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ScrollArea className="h-[520px] pr-2">
                  <div className="space-y-5">
                    {Object.entries(wheelGroups).map(([group,outcomes])=>(
                      <div key={group}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{group}</span>
                          <span className="text-xs text-gray-600">({outcomes.length})</span>
                        </div>
                        <div className="space-y-1.5">
                          {outcomes.map(w=>(
                            <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-800/50 border border-gray-700/60 px-3 py-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge variant="outline" className={cn("text-xs shrink-0",badgeCls(w.type))}>
                                  {w.entries>0?`+${fmt(w.entries)}`:w.type==="multiplier_2x"?"2× base":"Fun"}
                                </Badge>
                                <span className="text-sm text-gray-200 truncate">{w.label}</span>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={()=>openEdit(w)} className="p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"><Edit className="h-3.5 w-3.5"/></button>
                                <button onClick={()=>deleteOutcome(w.id)} className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"><Trash className="h-3.5 w-3.5"/></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Outcome Editor Dialog ────────────────────────────────────────── */}
      <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
          <DialogHeader><DialogTitle className="text-white">{outcomeMode==="add"?"Add Wheel Outcome":"Edit Wheel Outcome"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-300">Label</Label>
              <Input value={oForm.label} onChange={e=>setOForm(p=>({...p,label:e.target.value}))}
                placeholder="e.g. 500K Entries…" className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-300">Type</Label>
              <Select value={oForm.type} onValueChange={v=>setOForm(p=>({...p,type:v as WheelOutcomeType}))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {TYPE_OPTIONS.map(t=>(
                    <SelectItem key={t.value} value={t.value} className="text-white focus:bg-gray-700 focus:text-white">
                      <div><p className="text-sm">{t.label}</p><p className="text-xs text-gray-400">{t.desc}</p></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <AnimatePresence>
              {needsEntries&&(
                <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="space-y-1.5 overflow-hidden">
                  <Label className="text-sm text-gray-300">Entry Value</Label>
                  <Input type="number" min={0} value={oForm.entries} onChange={e=>setOForm(p=>({...p,entries:e.target.value}))}
                    placeholder="e.g. 1000000" className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
                  {parseInt(oForm.entries)>0&&<p className="text-xs text-gray-400">= {fmt(parseInt(oForm.entries))} entries</p>}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-1.5">
              <Label className="text-sm text-gray-300">Category</Label>
              <Select value={oForm.group} onValueChange={v=>setOForm(p=>({...p,group:v,customGroup:""}))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Pick a category…"/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {existingGroups.map(g=><SelectItem key={g} value={g} className="text-white focus:bg-gray-700 focus:text-white">{g}</SelectItem>)}
                  <SelectItem value="__custom__" className="text-sky-400 focus:bg-gray-700 focus:text-sky-400">+ New category…</SelectItem>
                </SelectContent>
              </Select>
              <AnimatePresence>
                {oForm.group==="__custom__"&&(
                  <motion.div initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}} className="overflow-hidden">
                    <Input value={oForm.customGroup} onChange={e=>setOForm(p=>({...p,customGroup:e.target.value}))}
                      placeholder="New category name…" className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 mt-1.5"/>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={saveOutcome} disabled={!canSave} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 h-9">
              {outcomeMode==="add"?"Add Outcome":"Save Changes"}
            </Button>
            <Button variant="outline" onClick={()=>setOutcomeOpen(false)} className="border-gray-700 bg-gray-800 hover:bg-gray-700 h-9">Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
