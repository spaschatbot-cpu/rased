/**
 * Branches and groups — how a fleet is split up.
 *
 * A group is what scopes a manager's view and what a vehicle and an account are
 * filed under, so it is referenced from both tables. Nothing here cascades:
 * deleting a branch is refused while anything still points at it, because the
 * alternative is silently reparenting rows an operator did not ask about.
 */
import { collection, text } from './collection.js'

const SEED = [
  { nameAr: 'الفرع الرئيسي', nameEn: 'Head Office', cityAr: 'الرياض', cityEn: 'Riyadh', managerAr: 'خالد العتيبي', managerEn: 'Khalid Al-Otaibi' },
  { nameAr: 'فرع الشرقية', nameEn: 'Eastern Branch', cityAr: 'الدمام', cityEn: 'Dammam', managerAr: 'سعود الدوسري', managerEn: 'Saud Al-Dosari' },
  { nameAr: 'فرع الغربية', nameEn: 'Western Branch', cityAr: 'جدة', cityEn: 'Jeddah', managerAr: 'ماجد الحربي', managerEn: 'Majed Al-Harbi' },
]

const seed = () => SEED.map((g, i) => ({ id: i + 1, ...g, createdAt: new Date().toISOString() }))

function validate(body, list, existing) {
  const nameAr = text(body.nameAr, 120)
  const nameEn = text(body.nameEn, 120)
  if (!nameAr && !nameEn) return 'a branch name is required'

  const taken = list.some(
    (g) =>
      g.id !== existing?.id &&
      ((nameAr && g.nameAr === nameAr) || (nameEn && g.nameEn.toLowerCase() === nameEn.toLowerCase())),
  )
  if (taken) return 'a branch with this name already exists'
  return null
}

const shape = (body, existing) => ({
  ...existing,
  nameAr: text(body.nameAr, 120) || text(body.nameEn, 120),
  nameEn: text(body.nameEn, 120) || text(body.nameAr, 120),
  cityAr: text(body.cityAr, 80) || text(body.cityEn, 80),
  cityEn: text(body.cityEn, 80) || text(body.cityAr, 80),
  managerAr: text(body.managerAr, 120) || text(body.managerEn, 120),
  managerEn: text(body.managerEn, 120) || text(body.managerAr, 120),
})

export const groups = collection({ key: 'groups', seed, validate, shape })
