import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Proxy } from '../../../../../electron/types'
import type { Translations } from '../../translations'

export interface DeleteProxyDialogProps {
  target: Proxy | null
  t: Translations
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 删除代理确认框。已经引用此代理的环境会回退到系统网络设置,
 * 这层提示由文案承担,实际行为在主进程 ProxyStore.remove 里。
 */
export function DeleteProxyDialog({ target, t, onCancel, onConfirm }: DeleteProxyDialogProps) {
  return (
    <Dialog
      open={!!target}
      onClose={onCancel}
      title={t.removeConfirmTitle}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {t.removeCancel}
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t.removeConfirm}
          </Button>
        </>
      }
    >
      <p className="text-sm">
        {target ? t.removeConfirmBody.replace('{name}', target.name) : ''}
      </p>
    </Dialog>
  )
}

export default DeleteProxyDialog
