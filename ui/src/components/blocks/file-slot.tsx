import { Paperclip, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropZone, FileTrigger } from '@/components/ui/drop-zone'

/**
 * One file, chosen or not yet.
 */
export function FileSlot({
  file,
  onFile,
  label,
  description,
  choose = 'Choose a file',
}: {
  file: File | null
  /** `null` when the analyst takes the file back. */
  onFile: (next: File | null) => void
  /** What the drop zone asks for. */
  label: string
  /** What holding no file means here. */
  description?: string | undefined
  /** The picker's own label, where "a file" is not specific enough. */
  choose?: string
}) {
  if (file) {
    return (
      <div
        data-slot="file-slot"
        className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm"
      >
        <Paperclip aria-hidden className="size-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">{file.name}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${file.name}`}
          onPress={() => {
            onFile(null)
          }}
        >
          <X aria-hidden />
        </Button>
      </div>
    )
  }
  return (
    <DropZone
      label={label}
      {...(description === undefined ? {} : { description })}
      onDrop={(event) => {
        const dropped = event.items.find((item) => item.kind === 'file')
        if (dropped?.kind !== 'file') return
        void dropped.getFile().then(onFile)
      }}
    >
      <FileTrigger
        onSelect={(files) => {
          const first = files?.item(0)
          if (first) onFile(first)
        }}
      >
        <Button variant="outline" className="w-fit">
          <Upload aria-hidden />
          {choose}
        </Button>
      </FileTrigger>
    </DropZone>
  )
}
