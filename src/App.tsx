import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Plus,
  Play,
  Square,
  MoreVertical,
  RotateCcw,
  Upload,
  Search,
  AlertTriangle,
  ShieldCheck,
  Settings2,
  Trash2,
  ExternalLink
} from 'lucide-react'
import type { BrowserPlugin, BrowserProfile, FingerprintConfig, ProfileDraft } from '../electron/types'
import './styles.css'

// Helper for labels
function platformLabel(platform: string) {
  return {
    amazon: 'AMAZON',
    shopify: 'SHOPIFY',
    ebay: 'EBAY',
    tiktok: 'TIKTOK',
    walmart: 'WALMART',
    other: 'OTHER'
  }[platform] || platform.toUpperCase()
}

export function App() {
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [plugins, setPlugins] = useState<BrowserPlugin[]>([])
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string>()
  const [runtimeInfo, setRuntimeInfo] = useState<any>()

  async function load() {
    const [nextProfiles, nextPlugins, statuses, nextRuntimeInfo] = await Promise.all([
      window.registry.profiles.list(),
      window.registry.plugins.list(),
      window.registry.profiles.status(),
      window.registry.runtime.info()
    ])
    setProfiles(nextProfiles)
    setPlugins(nextPlugins)
    setRunningIds(new Set(statuses.filter((status: any) => status.running).map((status: any) => status.profileId)))
    setRuntimeInfo(nextRuntimeInfo)
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 3000)
    return () => window.clearInterval(timer)
  }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return profiles
    return profiles.filter((profile) => 
      [profile.name, profile.platform, profile.notes, profile.proxy.host].join(' ').toLowerCase().includes(needle)
    )
  }, [profiles, query])

  async function launch(profile: BrowserProfile) {
    setBusyId(profile.id)
    try {
      await window.registry.profiles.launch(profile.id)
      await load()
    } catch (error) {
      console.error(error)
    } finally {
      setBusyId(undefined)
    }
  }

  async function stop(profile: BrowserProfile) {
    setBusyId(profile.id)
    try {
      await window.registry.profiles.stop(profile.id)
      await load()
    } catch (error) {
      console.error(error)
    } finally {
      setBusyId(undefined)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="brand-mark">AR</div>
            <div>
              <h1 className="font-display text-xl font-bold tracking-tight">AUTO REGISTRY</h1>
              <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground uppercase">
                <span>ENV:{profiles.length}</span>
                <span className="opacity-20">|</span>
                <span>PLG:{plugins.length}</span>
                <span className="opacity-20">|</span>
                <span>RUN:{runningIds.size}</span>
                <span className="opacity-20">|</span>
                <span className="text-primary">{runtimeInfo?.browserKind?.toUpperCase() || 'LOADING...'}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              ADD NEW
            </Button>
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              IMPORT
            </Button>
            <Button variant="secondary" size="sm">
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Status Alert */}
        <Alert variant={runtimeInfo?.fingerprintSpoofingEnabled ? "warning" : "success"} className="border-none bg-muted/50">
          {runtimeInfo?.fingerprintSpoofingEnabled ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          <AlertTitle className="text-[11px] tracking-[0.1em] uppercase">
            {runtimeInfo?.fingerprintSpoofingEnabled ? "Risk Mode: ITBrowser Fingerprint Active" : "Secure Mode: Natural Fingerprint"}
          </AlertTitle>
          <AlertDescription>
            {runtimeInfo?.fingerprintSpoofingEnabled 
              ? "Injection active. High-consistency parameters applied via --itbrowser flag."
              : `Using native Chromium fingerprint. Path: ${runtimeInfo?.browserPath}`}
          </AlertDescription>
        </Alert>

        {/* Toolbar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH BY NAME / PLATFORM / PROXY..." 
              className="pl-10 h-10 border-none bg-muted/50 focus-visible:ring-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4 mr-2" />
              REFRESH
            </Button>
          </div>
        </div>

        {/* Profiles Table */}
        <Card className="border-none bg-transparent">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Environment</TableHead>
                <TableHead className="w-[120px]">Platform</TableHead>
                <TableHead className="w-[180px]">Proxy</TableHead>
                <TableHead className="w-[220px]">Fingerprint</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((profile) => {
                const isRunning = runningIds.has(profile.id)
                const isBusy = busyId === profile.id
                
                return (
                  <TableRow key={profile.id} className="group">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-sm tracking-tight">{profile.name}</span>
                        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[200px]">
                          {profile.notes || profile.startUrl}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center px-2 py-0.5 bg-muted text-[10px] font-bold font-mono tracking-wider">
                        {platformLabel(profile.platform)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <code className="text-[11px] text-accent font-mono">
                        {profile.proxy.host}:{profile.proxy.port}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-[11px] font-mono text-muted-foreground">
                        <span>{profile.fingerprint.language?.toUpperCase()} / {profile.fingerprint.timezone?.split('/').pop()}</span>
                        <span className="text-[9px] opacity-50 truncate max-w-[180px]">{profile.fingerprint.userAgent}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-primary animate-pulse shadow-[0_0_8px_var(--color-primary)]' : 'bg-muted'}`} />
                        <span className={`text-[10px] font-bold font-mono tracking-widest ${isRunning ? 'text-primary' : 'text-muted-foreground'}`}>
                          {isRunning ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isRunning ? (
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            className="h-8 px-3"
                            disabled={isBusy}
                            onClick={() => stop(profile)}
                          >
                            <Square className="h-3 w-3 mr-2 fill-current" />
                            STOP
                          </Button>
                        ) : (
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="h-8 px-3"
                            disabled={isBusy}
                            onClick={() => launch(profile)}
                          >
                            <Play className="h-3 w-3 mr-2 fill-current" />
                            RUN
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground font-mono">
                    NO ENVIRONMENTS FOUND.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  )
}
