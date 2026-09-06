import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export interface AuthNoticeProps {
  /** `destructive` for a refusal, `warning` for a standing reason to act. */
  variant: 'destructive' | 'warning'
  title: string
  description?: string | undefined
}

/**
 * The banner an unauthenticated screen draws above its form: a refusal or a
 * standing reason to act, one at a time.
 *
 * `AlertDescription` renders only when `description` is passed, so a caller
 * that already puts the whole sentence in the title -- the forced change's
 * refusal, which the server's own answer fills in full -- draws one line
 * rather than an empty second.
 */
export function AuthNotice({ variant, title, description }: AuthNoticeProps) {
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      {description !== undefined && <AlertDescription>{description}</AlertDescription>}
    </Alert>
  )
}
