import WellnessDashboard from '@/components/WellnessDashboard'
import RecognitionWall from '@/components/RecognitionWall'
import AdminWellnessDashboard from '@/components/AdminWellnessDashboard'
import { loadUser, isAdmin } from '@/lib/auth'

export default function Wellness() {
  const user = loadUser()
  const showAdmin = isAdmin(user)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--foreground)' }}>
          Wellness
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Il tuo benessere conta. Traccia, celebra, respira.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-4">
          <WellnessDashboard />
        </div>
        <div className="space-y-4">
          <div
            className="rounded-2xl p-4 sm:p-5"
            style={{ background: 'var(--panel-solid)', border: '1px solid var(--line)' }}
          >
            <RecognitionWall />
          </div>
        </div>
      </div>

      {showAdmin && (
        <div className="mt-6">
          <AdminWellnessDashboard />
        </div>
      )}
    </div>
  )
}
