import { Zap, Minus, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MOMENTUM_OPTIONS, type MomentumLevel } from '@/lib/pulse'

interface MomentumSelectorProps {
  value: MomentumLevel | undefined
  onChange: (level: MomentumLevel) => void
  disabled?: boolean
}

const ICONS = {
  flowing: Zap,
  steady: Minus,
  stuck: Pause,
} as const

export function MomentumSelector({ value, onChange, disabled }: MomentumSelectorProps) {
  return (
    <div className="momentum-selector">
      {MOMENTUM_OPTIONS.map(({ value: level, label, description }) => {
        const Icon = ICONS[level]
        const isActive = value === level

        return (
          <button
            key={level}
            onClick={() => onChange(level)}
            disabled={disabled}
            data-active={isActive}
            title={description}
            className={cn(
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            <span className="flex items-center gap-1">
              <Icon className={cn(
                'h-3 w-3',
                isActive && level === 'flowing' && 'text-emerald-600 dark:text-emerald-400',
                isActive && level === 'stuck' && 'text-amber-600 dark:text-amber-400',
              )} />
              {label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
