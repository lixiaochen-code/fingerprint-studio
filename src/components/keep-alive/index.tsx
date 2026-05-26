import { useRef, type ReactNode } from 'react'

export interface KeepAliveProps {
  /** 当前是否可见。false 时不卸载子树，仅 display:none */
  visible: boolean
  /**
   * 是否延迟首次 mount 直到第一次 visible=true。默认 true，避免 Scripts 那种
   * 重 chunk（Monaco）在用户不点的时候就被加载。
   */
  lazy?: boolean
  children: ReactNode
}

/**
 * Vue keep-alive 风格的"保活"容器。子树在第一次 visible=true 后挂上 React 树，
 * 之后切走只是隐藏，所有内部 useState / refs / 事件监听都保留，不会触发卸载/重 mount。
 *
 * 用法：直接传一个能撑满父布局的子节点（typically `<div className="flex flex-1 ...">`）。
 * KeepAlive 自身就是一个 flex 容器，visible 时占据父布局，隐藏时 `display:none`。
 */
export function KeepAlive({ visible, lazy = true, children }: KeepAliveProps) {
  // 一旦曾经显示过就不再隐藏 mount —— 这是关键，否则 keep-alive 没意义
  const mountedOnceRef = useRef(false)
  if (visible) mountedOnceRef.current = true

  // lazy=false 或者已经显示过：始终渲染。否则推迟到第一次 visible
  const shouldRender = !lazy || mountedOnceRef.current

  if (!shouldRender) return null

  return (
    <div
      className={visible ? 'flex flex-1 min-h-0 overflow-hidden' : 'hidden'}
      aria-hidden={!visible}
    >
      {children}
    </div>
  )
}
