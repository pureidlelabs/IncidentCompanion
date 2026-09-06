import { useState } from 'react'

import { useCase } from '@/api/case'
import { useSpecs } from '@/api/specs'
import { useImportCsv } from '@/api/useImportCsv'
import { useCaseId } from '@/app/useCaseId'
import { ImportDataScreen, type ImportResult } from '@/screens/import-data'

import { announcing } from './entryWrites'

import type { CollectionName } from '@/api/model'

/**
 * `ImportDataScreen` bound to the case it counts and the route that writes.
 *
 * **The screen's `ImportResult` is wider than the route answers.** It carries
 * `refused` as a list of rows with reasons; `POST {collection}.csv` returns
 * four counts -- added, skipped, replaced, refused -- so the list is filled
 * with nothing here and the two counts the screen has no field for, `skipped`
 * and `replaced`, are not drawn at all. That is a gap in the pair rather than
 * in this file, and inventing row details to fill the panel would be worse
 * than leaving it empty.
 */
export function ImportDataContainer() {
  const caseId = useCaseId()
  const kase = useCase(caseId)
  const specs = useSpecs()
  const importing = useImportCsv(caseId)
  const [aimed, setAimed] = useState<CollectionName | undefined>(undefined)
  const [result, setResult] = useState<ImportResult | undefined>(undefined)

  return (
    <ImportDataScreen
      kase={kase.data}
      specs={specs.data}
      {...(result ? { result } : {})}
      {...(importing.isPending && aimed ? { importing: aimed } : {})}
      onImport={(collection, file) => {
        setAimed(collection)
        void announcing('the import', () => importing.mutateAsync({ collection, file })).then(
          (written) => {
            // **The route's own count, not an empty list.** It answers
            // `{ added, skipped, replaced, refused }`; passing `refused: []`
            // puts every partial import through the screen's success branch,
            // so a file the server took in part reads as one it took whole.
            setResult({ collection, written: written.added, refused: written.refused })
          },
        )
      }}
    />
  )
}
