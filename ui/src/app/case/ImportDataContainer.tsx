import { useState } from 'react'

import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useBatchCreatableCollections } from '@/api/useBatchCreatableCollections'
import { useImportCsv } from '@/api/useImportCsv'
import { useCaseId } from '@/app/useCaseId'
import { ImportDataScreen, type ImportResult } from '@/screens/import-data'

import { announced } from './entryWrites'

import type { CollectionName } from '@/api/model'

/** `ImportDataScreen` bound to the case it counts and the route that writes. */
export function ImportDataContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const batchCreatable = useBatchCreatableCollections()
  const importing = useImportCsv(caseId)
  const [aimed, setAimed] = useState<CollectionName | undefined>(undefined)
  const [result, setResult] = useState<ImportResult | undefined>(undefined)

  return (
    <ImportDataScreen
      kase={kase.data}
      specs={specs.data}
      collections={batchCreatable.data}
      busy={kase.isPending || specs.isPending || batchCreatable.isPending}
      {...(result ? { result } : {})}
      {...(importing.isPending && aimed ? { importing: aimed } : {})}
      onImport={(collection, file) => {
        setAimed(collection)
        void announced('the import', () => importing.mutateAsync({ collection, file })).then(
          (written) => {
            if (written === undefined) return
            setResult({
              collection,
              written: written.added,
              skipped: written.skipped,
              replaced: written.replaced,
              refused: written.refused,
              unlinked: written.unlinked,
              unlinkedBy: written.unlinkedBy,
            })
          },
        )
      }}
    />
  )
}
