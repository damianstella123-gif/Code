import { supabase } from './supabase'

export const ROLES_REQUIRING_MFA = ['Super Admin', 'Admin'] as const
export const MFA_GRACE_DAYS = 7
export const MFA_MAX_SKIPS = 3

export type MfaEnforcement = 'ok' | 'grace' | 'blocked'

export interface MfaState {
  status: MfaEnforcement
  skipsLeft: number
  daysLeft: number
}

export function roleRequiresMfa(role?: string | null): boolean {
  return !!role && (ROLES_REQUIRING_MFA as readonly string[]).includes(role)
}

export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) return null
  const verified = data.totp.filter(f => f.status === 'verified')
  return verified.length > 0 ? verified[0].id : null
}

export async function hasVerifiedTotp(): Promise<boolean> {
  return (await getVerifiedTotpFactorId()) !== null
}

interface GraceRow {
  mfa_grace_started_at: string | null
  mfa_skip_count: number | null
}

async function readGrace(userId: string): Promise<GraceRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('mfa_grace_started_at, mfa_skip_count')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data) return null
  return data as GraceRow
}

/**
 * Evaluates whether an admin must set up 2FA. Starts the grace clock on the
 * first evaluation where the account has no verified factor, so the window is
 * measured from the admin's next login rather than retroactively.
 */
export async function evaluateMfaStatus(userId: string, role?: string | null): Promise<MfaState> {
  const ok: MfaState = { status: 'ok', skipsLeft: MFA_MAX_SKIPS, daysLeft: MFA_GRACE_DAYS }
  if (!roleRequiresMfa(role)) return ok
  if (await hasVerifiedTotp()) return ok

  let grace = await readGrace(userId)
  if (!grace || !grace.mfa_grace_started_at) {
    const startedAt = new Date().toISOString()
    await supabase
      .from('profiles')
      .update({ mfa_grace_started_at: startedAt, mfa_skip_count: 0 })
      .eq('id', userId)
    grace = { mfa_grace_started_at: startedAt, mfa_skip_count: 0 }
  }

  const startedMs = new Date(grace.mfa_grace_started_at as string).getTime()
  const skipCount = grace.mfa_skip_count ?? 0
  const elapsedDays = (Date.now() - startedMs) / (1000 * 60 * 60 * 24)
  const daysLeft = Math.max(0, Math.ceil(MFA_GRACE_DAYS - elapsedDays))
  const skipsLeft = Math.max(0, MFA_MAX_SKIPS - skipCount)

  const expired = elapsedDays >= MFA_GRACE_DAYS || skipCount >= MFA_MAX_SKIPS
  return { status: expired ? 'blocked' : 'grace', skipsLeft, daysLeft }
}

export async function registerMfaSkip(userId: string): Promise<void> {
  const grace = await readGrace(userId)
  const next = (grace?.mfa_skip_count ?? 0) + 1
  await supabase.from('profiles').update({ mfa_skip_count: next }).eq('id', userId)
}

export async function resetUserMfa(targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('admin_reset_user_mfa', { target_user_id: targetUserId })
  if (error) return { success: false, error: error.message }
  const result = data as { success?: boolean } | null
  return { success: !!result?.success }
}
