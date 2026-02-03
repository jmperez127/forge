import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { StateColumn } from './StateColumn'
import { ProjectCard } from './ProjectCard'
import { ReflectionModal } from '@/components/reflection/ReflectionModal'
import type { Project } from '@/lib/types'
import { STATE_ORDER, type ProjectState } from '@/lib/philosophy'

interface StateBoardProps {
  projects: Project[]
  loading?: boolean
  onTransition: (
    projectId: string,
    fromState: ProjectState,
    toState: ProjectState,
    reflection: string
  ) => Promise<void>
}

export function StateBoard({ projects, loading, onTransition }: StateBoardProps) {
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [pendingTransition, setPendingTransition] = useState<{
    project: Project
    toState: ProjectState
  } | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const projectsByState = useMemo(() => {
    const grouped: Record<ProjectState, Project[]> = {
      threshold: [],
      forge: [],
      embodiment: [],
      clearing: [],
    }

    for (const project of projects) {
      if (!project.archived && project.state in grouped) {
        grouped[project.state].push(project)
      }
    }

    return grouped
  }, [projects])

  function handleDragStart(event: DragStartEvent) {
    const project = projects.find((p) => p.id === event.active.id)
    if (project) {
      setActiveProject(project)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveProject(null)

    const { active, over } = event
    if (!over) return

    const projectId = active.id as string
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    // Determine the target state
    const targetState = over.id as ProjectState

    // Only valid states
    if (!STATE_ORDER.includes(targetState)) return

    // Don't trigger if same state
    if (project.state === targetState) return

    // Open reflection modal
    setPendingTransition({ project, toState: targetState })
  }

  async function handleReflectionSubmit(reflection: string) {
    if (!pendingTransition) return

    await onTransition(
      pendingTransition.project.id,
      pendingTransition.project.state,
      pendingTransition.toState,
      reflection
    )

    setPendingTransition(null)
  }

  function handleReflectionCancel() {
    setPendingTransition(null)
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATE_ORDER.map((state) => (
            <StateColumn
              key={state}
              state={state}
              projects={projectsByState[state]}
              loading={loading}
            />
          ))}
        </div>

        <DragOverlay>
          {activeProject && (
            <ProjectCard project={activeProject} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      <ReflectionModal
        open={pendingTransition !== null}
        onClose={handleReflectionCancel}
        onSubmit={handleReflectionSubmit}
        fromState={pendingTransition?.project.state ?? 'threshold'}
        toState={pendingTransition?.toState ?? 'forge'}
        projectName={pendingTransition?.project.name ?? ''}
      />
    </>
  )
}
