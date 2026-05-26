import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Proxy } from '../../../electron/types'

/**
 * profile 新建/编辑对话框里的代理下拉。
 *
 * 设计:
 * - 用原生 <select> + 一个"特殊值"机制实现"+ 新增"——选中 __add_new__ 不真的赋值,
 *   只调 onCreateNew(),然后受控组件下次 render 自动回退到原 value。
 * - "No proxy (system)" = value=""(空字符串),内部映射成 null
 * - 已有代理列表按 name 自然顺序;每条显示 name + (host:port)
 * - 列表为空时(无任何已保存代理)只显示前两个选项("+ 新增" + "无代理")—— 引导用户先建一个
 *
 * 设计选择:用原生 <select> 而不是 Radix DropdownMenu —— 项目中已有的下拉都走原生,
 * 维护一致性。"+ 新增"放在第一项,符合用户描述("第一个为新增按钮")。
 */

type Locale = 'en' | 'zh'

type Translations = {
  addNew: string
  systemProxy: string
  hint: string
}

const labels: Record<Locale, Translations> = {
  en: {
    addNew: '+ Add new proxy',
    systemProxy: 'No proxy (use system)',
    hint: 'Profiles without a proxy fall back to OS network settings.'
  },
  zh: {
    addNew: '+ 新增代理',
    systemProxy: '无代理(使用系统)',
    hint: '未关联代理的环境会使用系统网络设置。'
  }
}

const ADD_NEW_SENTINEL = '__add_new__'
const SYSTEM_PROXY_SENTINEL = ''

export interface ProxySelectFieldProps {
  value: string | null
  proxies: Proxy[]
  locale: Locale
  /** 选了"+ 新增"时触发,父组件应打开 ProxyFormDialog */
  onCreateNew: () => void
  /** 选了别的(包括无代理)时触发 */
  onChange: (proxyId: string | null) => void
  /** 受控显示,UI 里要显示 hint 时父组件可以用 */
  showHint?: boolean
}

export function ProxySelectField({ value, proxies, locale, onCreateNew, onChange, showHint = true }: ProxySelectFieldProps) {
  const t = labels[locale]
  // value 是 null 时显示 SYSTEM_PROXY_SENTINEL,这是个简单映射,不需要 useEffect 也不会反弹
  const selectValue = value ?? SYSTEM_PROXY_SENTINEL

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const v = event.target.value
    if (v === ADD_NEW_SENTINEL) {
      // 不 commit 这个 value;受控 select 下次 render 会自动回到 props.value
      onCreateNew()
      return
    }
    onChange(v === SYSTEM_PROXY_SENTINEL ? null : v)
  }

  return (
    <div className="space-y-1.5">
      <select
        value={selectValue}
        onChange={handleChange}
        className="flex h-9 w-full border border-border bg-input px-3 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
      >
        <option value={ADD_NEW_SENTINEL}>{t.addNew}</option>
        <option value={SYSTEM_PROXY_SENTINEL}>{t.systemProxy}</option>
        {proxies.length > 0 && <option disabled value="__sep__">────────</option>}
        {proxies.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.host}:{p.port}
          </option>
        ))}
      </select>
      {showHint && <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">{t.hint}</p>}
    </div>
  )
}

/**
 * 工具组件:当 props.value 指向一个已被删除的 proxy 时,父组件应该把它视为 null 并展示提示。
 * 这里给出一个判断辅助,供 ProfileFormDialog 等使用:
 */
export function isValidProxyRef(value: string | null, proxies: Proxy[]): boolean {
  if (value === null) return true
  return proxies.some((p) => p.id === value)
}
