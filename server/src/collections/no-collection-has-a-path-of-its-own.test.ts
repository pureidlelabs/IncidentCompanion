/**
 * A collection with a particular need still goes through the one
 * implementation, and does not grow a route of its own.
 *
 * **What this does not cover:** a controller reaching the database through a
 * helper that spells the mutation somewhere else, and a second implementation
 * living inside `CollectionService` behind a branch on the collection's name.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { describe, expect, it } from 'vitest'

import { CollectionService } from './collection.service.js'
import { CollectionsModule } from './collections.module.js'
import { COLLECTIONS } from '../domain/collections.js'

type Ctor = new (...args: never[]) => unknown

const CONTROLLERS = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CollectionsModule) ??
  []) as Ctor[]

const pathOf = (ctor: Ctor): string => (Reflect.getMetadata(PATH_METADATA, ctor) ?? '') as string

/** The controllers mounted at `api/cases/:caseId/<name>`, keyed by that name. */
const AT: Record<string, Ctor[]> = {}
for (const ctor of CONTROLLERS) {
  const under = /^api\/cases\/:caseId\/([^/]+)$/.exec(pathOf(ctor))
  if (under) (AT[under[1]!] ??= []).push(ctor)
}

const HERE = dirname(fileURLToPath(import.meta.url))
const CONTROLLER_FILES = readdirSync(HERE).filter((name) => name.endsWith('.controller.ts'))

/** A drizzle write, which is what a second implementation would need. */
const MUTATION = /\b(?:db|tx)\s*\.\s*(?:insert|update|delete)\s*\(/g

const mutationsIn = (name: string): number =>
  (readFileSync(join(HERE, name), 'utf8').match(MUTATION) ?? []).length

describe('a collection that needs something the others do not', () => {
  it('registers controllers at all, so the lookups below are looking at something', () => {
    expect(CONTROLLERS.length, 'the module registers no controllers').toBeGreaterThan(0)
  })

  it.each(Object.keys(COLLECTIONS))('%s is served at one route and no other', (collection) => {
    expect(
      (AT[collection] ?? []).length,
      `${collection} is served by ${String((AT[collection] ?? []).length)} controllers rather ` +
        'than one, so a row can be written two ways and only one of them was tested',
    ).toBe(1)
  })

  it.each(Object.keys(COLLECTIONS))('%s is served through the shared service', (collection) => {
    const ctor = AT[collection]![0]!
    const takes = (Reflect.getMetadata('design:paramtypes', ctor) ?? []) as unknown[]

    expect(
      takes.length,
      `${ctor.name} declares no constructor dependencies, so this case cannot see what it uses`,
    ).toBeGreaterThan(0)
    expect(
      takes,
      `${ctor.name} does not take CollectionService, so ${collection} is written by something ` +
        'the other collections do not share',
    ).toContain(CollectionService)
  })

  it('finds the controller files, so the absence below is an absence', () => {
    expect(
      CONTROLLER_FILES.length,
      'no controller file was found beside this test',
    ).toBeGreaterThan(0)
    expect(
      mutationsIn('collection.service.ts'),
      'the shared service writes nothing, so a controller writing nothing proves nothing',
    ).toBeGreaterThan(0)
  })

  it.each(CONTROLLER_FILES)('%s writes no row itself', (name) => {
    expect(
      mutationsIn(name),
      `${name} writes to the database directly, so a route serves a collection without the ` +
        'attribution, version check and announcement the shared service performs as one act',
    ).toBe(0)
  })
})
