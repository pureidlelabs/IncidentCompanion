import { useAbout } from '@/api/useAbout'
import { AboutDialog } from '@/components/blocks/about-dialog'

/**
 * `AboutDialog` bound to `GET /api/about`.
 *
 * Mount it where the dialog's open state lives: the read runs only while this
 * is mounted, so the rail's head does not carry a request on every screen.
 */
export function AboutContainer({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}) {
  // **Nothing exists until it is opened, hooks included.** Both rails mount
  // this on every screen, so a read at this level is a request on all of them
  // -- and it makes the frame need a QueryClient to render at all.
  return isOpen ? <AboutReader onOpenChange={onOpenChange} /> : null
}

function AboutReader({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const about = useAbout()
  return (
    <AboutDialog
      isOpen
      onOpenChange={onOpenChange}
      about={about.data}
      busy={about.isPending}
      problem={about.error}
      onRetry={() => void about.refetch()}
    />
  )
}
