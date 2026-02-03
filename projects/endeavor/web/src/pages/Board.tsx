import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useList, useAction } from '@forge/react'
import { StateBoard } from '@/components/board/StateBoard'
import { NorthStar } from '@/components/layout/NorthStar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, Archive, ChevronDown, ChevronRight } from 'lucide-react'
import type { Project } from '@/lib/types'
import type { ProjectState } from '@/lib/philosophy'

export function Board() {
  const { data: projects, loading, error, refetch } = useList<Project>('ProjectBoard')
  const transitionState = useAction<Record<string, unknown>>('transition_state')
  const [showArchived, setShowArchived] = useState(false)

  const activeProjects = projects?.filter(p => !p.archived) || []
  const archivedProjects = projects?.filter(p => p.archived) || []

  async function handleTransition(
    projectId: string,
    fromState: ProjectState,
    toState: ProjectState,
    reflection: string
  ) {
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
        projects={activeProjects}
        loading={loading}
        onTransition={handleTransition}
      />

      {archivedProjects.length > 0 && (
        <div className="pt-4 border-t border-border">
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? <ChevronDown className="h-4 w-4 mr-2" /> : <ChevronRight className="h-4 w-4 mr-2" />}
            <Archive className="h-4 w-4 mr-2" />
            Archived ({archivedProjects.length})
          </Button>

          {showArchived && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {archivedProjects.map(project => (
                <Link key={project.id} to={`/project/${project.id}`}>
                  <Card className="opacity-60 hover:opacity-80 transition-opacity">
                    <CardContent className="py-3">
                      <p className="font-medium text-sm">{project.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Was in {project.state}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
