import { Form as AriaForm, type FormProps as AriaFormProps } from 'react-aria-components'

export type FormProps = AriaFormProps

/**
 * The `<form>` every screen in the kit submits through.
 *
 * Defaults `validationBehavior` to `"aria"`, against React Aria's `"native"`:
 * a field marks itself and the submit still goes through, so a screen's own
 * refusal branch is reachable. A caller wanting the platform to gate the
 * submit passes `"native"` explicitly.
 */
export function Form({ validationBehavior = 'aria', ...props }: FormProps) {
  return <AriaForm data-slot="form" validationBehavior={validationBehavior} {...props} />
}
