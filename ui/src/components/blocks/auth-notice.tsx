import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export interface AuthNoticeProps {
  /** `destructive` for a refusal, `warning` for a standing reason to act. */
  variant: 'destructive' | 'warning'
  /** The one line every notice carries. */
  title: string
  /** A second line, when the title alone does not say enough. */
  description?: string | undefined
}

/**
 * The banner an unauthenticated screen draws above its form: a refusal or a
 * standing reason to act, one at a time.
 */
export function AuthNotice({ variant, title, description }: AuthNoticeProps) {
  return (
    <Alert variant={variant}>
      <AlertTitle>{title}</AlertTitle>
      {description !== undefined && <AlertDescription>{description}</AlertDescription>}
    </Alert>
  )
}
