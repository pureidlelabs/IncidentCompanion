import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'

import type { Case } from '@/api/model'
import { ArchivePassphraseFields } from '@/components/blocks/archive-passphrase-fields'
import { FormSection } from '@/components/blocks/form-section'
import { Section } from '@/components/blocks/section'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

/**
 * This case, out, as a `.iccase` the picker's import can read back in.
 *
 * **The passphrase is not length-checked here.** The shortest one is a server
 * constant that is not on the wire; the refusal states the number in words.
 * Left blank, the archive leaves unencrypted.
 *
 * **The confirm field is a client-side equality check only**, and it disables
 * the export rather than refusing on the server. A mistyped passphrase produces
 * an archive nobody can ever open, so it is caught before the request rather
 * than after the download.
 *
 * **The archive itself is written by the server.** It carries the attachments
 * and is encrypted with the passphrase, neither of which this tier holds, so
 * `onExport` is what performs it and the control is drawn refused without one.
 *
 * **Attached files travel by default, and leaving them out is the deliberate
 * act.** With them the archive is a backup and a re-import loses nothing;
 * without them it is a handover - small enough to send to a customer or a
 * regulator, and not carrying the incident's own artefacts out of the building.
 */
export interface CaseArchiveScreenProps {
  /** The case being exported. Its rows are what the count is summed from. */
  kase: Case | undefined
  /** The server's words for a refused export. */
  refusal?: string
  /** The export is running. Distinct from `busy`, which is the case read. */
  exporting?: boolean
  /** What the passphrase box opens with. */
  passphrase?: string
  /** What the confirm box opens with. */
  confirm?: string
  /** Writes the archive. Without it the export is drawn refused. */
  onExport?: ((choice: { passphrase: string; files: boolean }) => void) | undefined
  /**
   * The case is still being read.
   *
   * Nothing is drawn while this holds: the fixture default is the demo case,
   * so an ungated pending state offers to export another case's row counts.
   */
  busy?: boolean
  /** Why the read failed, if it did. Not a refused export -- that is `refusal`. */
  problem?: unknown
  /** Asked again when *Try again* is pressed. */
  onRetry?: (() => void) | undefined
}

/** The tables a `.iccase` carries, in the order the case document lists them. */
const ARCHIVED: readonly (keyof Case)[] = [
  'timeline',
  'systems',
  'accounts',
  'networkIndicators',
  'malware',
  'cloudApps',
  'impact',
  'evidence',
  'actions',
  'casenotes',
  'reports',
  'reportBlocks',
]

export function CaseArchiveScreen({
  kase,
  refusal,
  exporting = false,
  passphrase = '',
  confirm = '',
  onExport,
  busy = false,
  problem,
  onRetry,
}: CaseArchiveScreenProps) {
  const [secret, setSecret] = useState(passphrase)
  const [repeat, setRepeat] = useState(confirm)
  const [files, setFiles] = useState(true)

  /**
   * **No route serves an archive inventory**, so the count is summed here from
   * the same case document every other section already holds.
   */
  const entries = useMemo(
    () =>
      ARCHIVED.reduce((total, key) => {
        const rows = kase?.[key]
        return total + (Array.isArray(rows) ? rows.length : 0)
      }, 0),
    [kase],
  )

  const mismatch = secret !== '' && repeat !== '' && secret !== repeat

  return (
    <Section
      measure="form"
      title="Case archive"
      meta={
        <Badge variant="outlined" size="xs">
          {`${String(entries)} ${entries === 1 ? 'entry' : 'entries'}`}
        </Badge>
      }
      blurb="Every record and every attachment of this case, in one file."
      footer={
        <div className="flex items-center gap-3 border-t border-border pt-3">
          <Button
            variant="default"
            isDisabled={mismatch || entries === 0 || !onExport}
            isPending={exporting}
            stateKey={exporting ? 'busy' : 'idle'}
            {...(onExport
              ? {
                  onPress: () => {
                    onExport({ passphrase: secret, files })
                  },
                }
              : {})}
          >
            <Download aria-hidden />
            {exporting ? 'Exporting\u2026' : 'Export archive'}
          </Button>
          <span className="text-xs text-ink-muted">
            {secret === ''
              ? 'The archive leaves unencrypted.'
              : 'The archive is encrypted with this passphrase.'}
          </span>
        </div>
      }
      read={{
        isPending: busy,
        isError: problem !== undefined,
        error: problem,
        ...(onRetry ? { refetch: onRetry } : {}),
      }}
    >
      <div className="flex flex-col gap-4">
        {refusal !== undefined && (
          <Alert variant="destructive">
            <AlertTitle>The archive was not written</AlertTitle>
            <AlertDescription>{refusal}</AlertDescription>
          </Alert>
        )}

        {entries === 0 && (
          <Alert variant="warning">
            <AlertTitle>This case holds nothing yet</AlertTitle>
            <AlertDescription>
              An archive of it would carry the case&rsquo;s own fields and no records.
            </AlertDescription>
          </Alert>
        )}

        <FormSection title="Contents" columns={2} layout="plain">
          <Checkbox
            isSelected={files}
            onChange={setFiles}
            description="Without them, a re-import has no artefacts to restore."
          >
            Include attached files
          </Checkbox>
        </FormSection>

        <ArchivePassphraseFields
          secret={secret}
          onSecret={setSecret}
          repeat={repeat}
          onRepeat={setRepeat}
          mismatch={mismatch}
        />
      </div>
    </Section>
  )
}
