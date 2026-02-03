import { useList, useAction } from '@forge/react'
import { WeeklyReview as WeeklyReviewComponent } from '@/components/review/WeeklyReview'
import { Card, CardContent } from '@/components/ui/card'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { Project, WeeklyReview as WeeklyReviewType } from '@/lib/types'

export function Review() {
  const { data: projects, loading: projectsLoading, error: projectsError } = useList<Project>('ProjectBoard')
  const { data: reviews, loading: reviewsLoading, error: reviewsError, refetch: refetchReviews } = useList<WeeklyReviewType>('WeeklyReviewList')
  const createReview = useAction<Record<string, unknown>>('create_weekly_review')

  async function handleSubmit(review: Omit<WeeklyReviewType, 'id' | 'created_at'>) {
    await createReview.execute({
      ...review,
    })
    await refetchReviews()
  }

  if (projectsLoading || reviewsLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (projectsError || reviewsError) {
    return (
      <Card className="border-red-200 bg-red-50 max-w-xl mx-auto">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Failed to load data</p>
            <p className="text-sm text-red-700">Please try again later</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <WeeklyReviewComponent
      projects={projects || []}
      pastReviews={reviews || []}
      onSubmit={handleSubmit}
    />
  )
}
