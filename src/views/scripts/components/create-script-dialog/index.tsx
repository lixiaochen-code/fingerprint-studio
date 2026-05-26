import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { ScriptDraft, ScriptSource } from '../../../../../electron/types'
import type { Translations } from '../../translations'

export interface CreateScriptDialogProps {
  open: boolean
  source: ScriptSource
  t: Translations
  onCancel: () => void
  onSubmit: (draft: ScriptDraft) => Promise<void>
}

/**
 * 新建脚本对话框。`source = 'local'` 时只需要 name + 可选描述;
 * `source = 'external'` 时还要选 entryPath(支持系统文件选择器)。
 */
export function CreateScriptDialog({
  open,
  source,
  t,
  onCancel,
  onSubmit
}: CreateScriptDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [entryPath, setEntryPath] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setEntryPath('')
    setError(undefined)
    setSubmitting(false)
  }, [open, source])

  const pickFile = useCallback(async () => {
    const picked = await window.registry.scripts.pickExternalFile()
    if (picked) setEntryPath(picked)
  }, [])

  const submit = useCallback(async () => {
    if (!name.trim()) return setError(t.errorRequired)
    if (source === 'external' && !entryPath.trim()) return setError(t.errorExternalPath)
    setSubmitting(true)
    setError(undefined)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        source,
        entryPath: source === 'external' ? entryPath.trim() : undefined
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSubmitting(false)
    }
  }, [name, description, entryPath, source, onSubmit, t])

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={`${t.createTitle} · ${source === 'local' ? t.local : t.external}`}
      size="md"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={submitting}>
            {t.cancel}
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={submitting}>
            {t.createSubmit}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t.namePlaceholder}
          />
        </Field>
        <Field label={t.description}>
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t.descriptionPlaceholder}
          />
        </Field>
        {source === 'external' && (
          <Field label={t.entryPath}>
            <div className="flex gap-2">
              <Input
                value={entryPath}
                onChange={(event) => setEntryPath(event.target.value)}
                placeholder={t.entryPathPlaceholder}
                className="font-mono text-[11px]"
              />
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={() => void pickFile()}
              >
                {t.browse}
              </Button>
            </div>
          </Field>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

export default CreateScriptDialog
