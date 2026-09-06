import { Download } from 'lucide-react'

import { ButtonLink } from '@/components/ui/button'

/**
 * One table's CSV export, as a link.
 *
 * A link and not a button with an `onPress`: the browser owns the download,
 * the session cookie rides on a same-origin navigation, and a refused request
 * saves its JSON refusal under the `.csv` name - the same gap a plain browser
 * link has with or without React.
 *
 * **`ButtonLink`, so it announces as a link.** React Aria keeps the button and
 * the link separate rather than dressing one as the other; a control that
 * announces as a button while it navigates like a link is the failure to
 * avoid.
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
