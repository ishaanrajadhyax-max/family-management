// Shared server-side authorization rules for the health-data routes.
// Every route calls these — the frontend's own checks (if any) are not
// trusted, per the requirement that every route enforce this itself.

// For GET (list) and POST (create): decides which family_member_id a
// request is allowed to act on.
//   - admin: may act on any family member (the one requested, or their own
//     if none was requested).
//   - everyone else: may only ever act on their own id. If they explicitly
//     requested a different one, that's forbidden (returns null) rather
//     than silently substituting their own id, so the caller gets a clear
//     403 instead of a confusing wrong-data response.
export function getScopedFamilyMemberId(user, requestedFamilyMemberId) {
  if (user.role === 'admin') {
    return requestedFamilyMemberId || user.id
  }
  if (requestedFamilyMemberId && requestedFamilyMemberId !== user.id) {
    return null
  }
  return user.id
}

// For PUT (update an existing record): decides whether this user may
// modify a record that already belongs to a known family_member_id.
export function canAccessFamilyMember(user, targetFamilyMemberId) {
  return user.role === 'admin' || user.id === targetFamilyMemberId
}
