import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { interpolate } from '@/lib/i18n'

type Locale = 'en' | 'zh'

const labels = {
  en: {
    confirm: 'Confirm',
    cancel: 'Cancel',
    deleteTitle: 'Delete environments',
    deleteSingle: 'Delete "{{name}}"? This removes the configuration but keeps the local user data folder.',
    deleteMany: 'Delete {{count}} environments? Configurations will be removed; local user data folders are kept.',
    workingDelete: 'Deleting...'
  },
  zh: {
    confirm: '确认',
    cancel: '取消',
    deleteTitle: '删除环境',
    deleteSingle: '确定删除「{{name}}」？将移除配置，保留本地用户数据目录。',
    deleteMany: '确定删除 {{count}} 个环境？将移除配置，保留本地用户数据目录。',
    workingDelete: '删除中…'
  }
} as const

export type ConfirmDeleteDialogProps = {
  open: boolean
  names: string[]
  locale: Locale
  onConfirm: () => Promise<void>
  onCancel: () => void
}

export function ConfirmDeleteDialog({ open, names, locale, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  const t = labels[locale]
  const [working, setWorking] = useState(false)

  async function handleConfirm() {
    setWorking(true)
    try {
      await onConfirm()
    } finally {
      setWorking(false)
    }
  }

  const message = names.length === 1
    ? interpolate(t.deleteSingle, { name: names[0] })
    : interpolate(t.deleteMany, { count: String(names.length) })

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={t.deleteTitle}
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={working}>{t.cancel}</Button>
          <Button variant="destructive" size="sm" onClick={() => void handleConfirm()} disabled={working}>
            {working ? t.workingDelete : t.confirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">{message}</p>
      {names.length > 1 && names.length <= 8 && (
        <ul className="mt-3 space-y-1">
          {names.map((name) => (
            <li key={name} className="font-mono text-[11px] text-muted-foreground">— {name}</li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}
