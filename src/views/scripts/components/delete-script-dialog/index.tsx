import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { interpolate } from '@/lib/i18n'
import type { Script } from '../../../../../electron/types'
import type { Translations } from '../../translations'

export interface DeleteScriptDialogProps {
  target: Script | undefined
  t: Translations
  onCancel: () => void
  onConfirm: () => Promise<void>
}

/**
 * 删除脚本确认框。文案根据 source 区分:
 * - local 删除会一并干掉脚本目录(含日志、state)
 * - external 仅取消登记,本地源文件不动
 */
export function DeleteScriptDialog({
  target,
  t,
  onCancel,
  onConfirm
}: DeleteScriptDialogProps) {
  const [working, setWorking] = useState(false)

  const detail = target?.source === 'local' ? t.deleteDetailLocal : t.deleteDetailExternal
  const message = target ? interpolate(t.deleteConfirmSingle, { name: target.name, detail }) : ''

  return (
    <Dialog
      open={target !== undefined}
      onClose={onCancel}
      title={t.deleteConfirmTitle}
      size="sm"
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={working}>
            {t.cancel}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={working}
            onClick={async () => {
              setWorking(true)
              try {
                await onConfirm()
              } finally {
                setWorking(false)
              }
            }}
          >
            {t.deleteConfirm}
          </Button>
        </>
      }
    >
      <p className="text-sm text-foreground">{message}</p>
    </Dialog>
  )
}

export default DeleteScriptDialog
