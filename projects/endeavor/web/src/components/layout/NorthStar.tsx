import { NORTH_STAR } from '@/lib/philosophy'

export function NorthStar() {
  return (
    <div className="text-center py-6">
      <p className="north-star max-w-2xl mx-auto">
        "{NORTH_STAR}"
      </p>
    </div>
  )
}

export function NorthStarCompact() {
  return (
    <p className="north-star text-xs">
      "{NORTH_STAR}"
    </p>
  )
}
