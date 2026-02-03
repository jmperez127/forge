import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ProjectCard, ProjectCardSkeleton } from './ProjectCard'
import { cn } from '@/lib/utils'
import { STATE_INFO, type ProjectState } from '@/lib/philosophy'
import type { Project } from '@/lib/types'

interface StateColumnProps {
  state: ProjectState
  projects: Project[]
  loading?: boolean
}

export function StateColumn({ state, projects, loading }: StateColumnProps) {
  const info = STATE_INFO[state]
  const { setNodeRef, isOver } = useDroppable({ id: state })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'state-column',
        `state-column-${state}`,
        isOver && 'ring-2 ring-primary/30'
      )}
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">{info.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground font-serif italic">
          "{info.question}"
        </p>
      </div>

      <div className="flex-1 space-y-3">
        <SortableContext
          items={projects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {loading ? (
            <>
              <ProjectCardSkeleton />
              <ProjectCardSkeleton />
            </>
          ) : projects.length === 0 ? (
            <EmptyState state={state} />
          ) : (
            projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))
          )}
        </SortableContext>
      </div>

      <div className="mt-4 pt-4 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}

function EmptyState({ state }: { state: ProjectState }) {
  const info = STATE_INFO[state]

  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-muted-foreground italic">
        {info.emptyMessage}
      </p>
    </div>
  )
}
