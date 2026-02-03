import { useList, useAction } from '@forge/react'
import { StateBoard } from '@/components/board/StateBoard'
import { NorthStar } from '@/components/layout/NorthStar'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'
import type { Project } from '@/lib/types'
import type { ProjectState } from '@/lib/philosophy'

export function Board() {
  const { data: projects, loading, error, refetch } = useList<Project>('ProjectBoard')
  const transitionState = useAction<Record<string, unknown>>('transition_state')

  async function handleTransition(
    projectId: string,
    fromState: ProjectState,
    toState: ProjectState,
    reflection: string
  ) {
    // Create the transition record (this also updates the project state)
    await transitionState.execute({
      project_id: projectId,
      from_state: fromState,
      to_state: toState,
      reflection,
      insight: '',
    })
    await refetch()
  }

  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Failed to load projects</p>
            <p className="text-sm text-red-700">Please try again later</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-8">
      <NorthStar />

      <StateBoard
        projects={projects || []}
        loading={loading}
        onTransition={handleTransition}
      />
    </div>
  )
}
