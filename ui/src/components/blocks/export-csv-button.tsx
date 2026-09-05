import { Download } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'

/**
 * One table's CSV export, as a link.
 */
export function ExportCsvButton({ href, filename }: { href: string; filename: string }) {
  return (
    <ButtonLink
      variant="outline"
      size="sm"
      href={href}
      download={filename}
      data-slot="export-csv"
    >
      <Download aria-hidden className="size-4" />
      Export CSV
    </ButtonLink>
  )
}
