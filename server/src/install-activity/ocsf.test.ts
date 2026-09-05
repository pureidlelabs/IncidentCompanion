/**
 * The OCSF mapping, checked against the published schema rather than trusted.
 */
import { describe, expect, it } from 'vitest'

import { CATEGORY, CLASS, OCSF_VERSION, classify } from './ocsf.js'
import { SEVERITY_ID } from './severity.js'

/**
 * The version the app claims, not a second copy of it.
 */
const VERSION = OCSF_VERSION

interface OcsfClass {
  uid: number
  category_uid: number
  caption: string
  attributes: Record<string, { enum?: Record<string, { caption: string }> }>[]
}

/**
 * What the schema server said, with *no answer* kept apart from *no such
 * thing*.
 */
type Answer =
  | { got: 'served'; served: OcsfClass }
  | { got: 'absent'; status: number }
  | { got: 'offline' }

async function fetchClass(name: string): Promise<Answer> {
  let answer: Response
  try {
    answer = await fetch(`https://schema.ocsf.io/api/${VERSION}/classes/${name}`, {
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { got: 'offline' }
  }
  if (!answer.ok) return { got: 'absent', status: answer.status }
  return { got: 'served', served: (await answer.json()) as OcsfClass }
}

/**
 * The class, or `null` to skip -- and a throw when the server denied it.
 */
function servedOr(answer: Answer, what: string): OcsfClass | null {
  if (answer.got === 'absent') {
    throw new Error(
      `schema.ocsf.io answered ${String(answer.status)} for ${what} at version ${VERSION}: ` +
        'the mapping names a version or a class the framework does not serve',
    )
  }
  if (answer.got === 'offline') {
    // Named rather than silent: a skip that says nothing reads as a pass.
    console.warn(`skipped: schema.ocsf.io did not answer, ${what} unverified`)
    return null
  }
  return answer.served
}

/** The enum on one attribute, flattened to `{ id: caption }`. */
function enumOf(served: OcsfClass, attribute: string): Record<string, string> {
  for (const entry of served.attributes) {
    const found = entry[attribute]
    if (found?.enum) {
      return Object.fromEntries(
        Object.entries(found.enum).map(([id, one]) => [id, one.caption]),
      )
    }
  }
  return {}
}

describe('the OCSF mapping matches the published schema', () => {
  const CHECKS: { slug: string; declared: (typeof CLASS)[keyof typeof CLASS] }[] = [
    { slug: 'authentication', declared: CLASS.authentication },
    { slug: 'account_change', declared: CLASS.accountChange },
    { slug: 'user_access', declared: CLASS.userAccess },
    { slug: 'api_activity', declared: CLASS.api },
  ]

  it.each(CHECKS)('$slug carries the uid and category this app declares', async ({
    slug,
    declared,
  }) => {
    const served = servedOr(await fetchClass(slug), slug)
    if (!served) return
    expect(served.uid, `${slug} class_uid`).toBe(declared.uid)
    expect(served.category_uid, `${slug} category_uid`).toBe(declared.category)
  })

  it('uses the severity and status numbers the framework defines', async () => {
    const served = servedOr(await fetchClass('authentication'), 'enums')
    if (!served) return

    const severity = enumOf(served, 'severity_id')
    for (const [caption, id] of Object.entries(SEVERITY_ID)) {
      expect(severity[String(id)], `severity_id ${String(id)}`).toBe(caption)
    }

    const status = enumOf(served, 'status_id')
    expect(status['1']).toBe('Success')
    expect(status['2']).toBe('Failure')
  })

  it('names an activity the class actually defines', async () => {
    const served = servedOr(await fetchClass('authentication'), 'activities')
    if (!served) return
    const activities = enumOf(served, 'activity_id')

    for (const event of ['signed_in', 'signed_out', 'sign_in_failed'] as const) {
      const it_ = classify(event)
      expect(activities[String(it_.activityId)], `${event} activity_id`).toBe(it_.activityName)
    }
  })

  /**
   * **`type_uid = class_uid * 100 + activity_id`**, which the framework
   * derives rather than stores - so a mapping that computed it any other way
   * would produce ids no collector recognises.
   */
  it('derives type_uid the way the framework does', () => {
    expect(classify('signed_in').typeUid).toBe(300201)
    expect(classify('signed_out').typeUid).toBe(300202)
    expect(classify('case_deleted').typeUid).toBe(CLASS.api.uid * 100 + 4)
  })

  it('puts identity events in the IAM category and the rest in application', () => {
    expect(classify('account_role_changed').categoryUid).toBe(CATEGORY.iam)
    expect(classify('signed_in').categoryUid).toBe(CATEGORY.iam)
    expect(classify('case_created').categoryUid).toBe(CATEGORY.application)
    expect(classify('install_started').categoryUid).toBe(CATEGORY.application)
  })
})
