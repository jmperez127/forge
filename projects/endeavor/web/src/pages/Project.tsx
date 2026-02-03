import { useParams } from 'react-router-dom'
import { useEntity, useList, useAction } from '@forge/react'
import { ProjectDetail } from '@/components/project/ProjectDetail'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Project as ProjectType, StateTransition } from '@/lib/types'

export function Project() {
  const { id } = useParams<{ id: string }>()

  const { data: project, loading, error, refetch } = useEntity<ProjectType>('Project', id || '')
  const { data: allTransitions } = useList<StateTransition>('TransitionHistory')
  const updateIntention = useAction<Record<string, unknown>>('update_intention')
  const archiveProject = useAction<Record<string, unknown>>('archive_project')
  const restoreProject = useAction<Record<string, unknown>>('restore_project')

  // Filter transitions for this project
  const transitions = allTransitions?.filter((t) => (t.project_id || t.project) === id) || []

  async function handleUpdateIntention(newIntention: string, reason: string) {
    if (!project) return

    // Log the intention change (this also updates the project intention)
    await updateIntention.execute({
      project_id: id!,
      previous_intention: project.intention,
      new_intention: newIntention,
      reason,
    })
    await refetch()
  }

  async function handleArchive() {
    await archiveProject.execute({
      id: id!,
      archived: true,
    })
    await refetch()
  }

  async function handleRestore() {
    await restoreProject.execute({
      id: id!,
      archived: false,
    })
    await refetch()
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading project...</p>
      </div>
    )
  }

  if (error || !project) {
    return (
      <Card className="border-red-200 bg-red-50 max-w-xl mx-auto">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Project not found</p>
            <p className="text-sm text-red-700">
              This project may have been deleted or you don't have access.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <ProjectDetail
      project={project}
      transitions={transitions}
      onUpdateIntention={handleUpdateIntention}
      onArchive={handleArchive}
      onRestore={handleRestore}
    />
  )
}
