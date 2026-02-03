import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Link } from 'react-router-dom'
import { GripVertical, Clock, ArrowRight } from 'lucide-react'
import { cn, formatRelativeDate } from '@/lib/utils'
import type { Project } from '@/lib/types'

interface ProjectCardProps {
  project: Project
  isDragging?: boolean
}

export function ProjectCard({ project, isDragging }: ProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: project.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const dragging = isDragging || isSortableDragging

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'project-card group',
        dragging && 'dragging'
      )}
    >
      <div className="flex items-start gap-3">
        <button
          className="mt-1 cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex-1 min-w-0">
          <Link
            to={`/project/${project.id}`}
            className="block group/link"
          >
            <h3 className="font-medium text-foreground truncate group-hover/link:text-primary transition-colors">
              {project.name}
            </h3>
          </Link>

          {project.intention && (
            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
              {project.intention}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            {project.state_changed_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeDate(project.state_changed_at)}
              </span>
            )}
          </div>
        </div>

        <Link
          to={`/project/${project.id}`}
          className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
        >
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </div>
    </div>
  )
}

export function ProjectCardSkeleton() {
  return (
    <div className="project-card animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-4 h-4 bg-muted rounded mt-1" />
        <div className="flex-1">
          <div className="h-5 bg-muted rounded w-3/4" />
          <div className="h-4 bg-muted rounded w-full mt-2" />
          <div className="h-3 bg-muted rounded w-1/4 mt-3" />
        </div>
      </div>
    </div>
  )
}
