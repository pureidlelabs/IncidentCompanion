import { Form as AriaForm, type FormProps as AriaFormProps } from 'react-aria-components'

export type FormProps = AriaFormProps

/**
 * The `<form>` every screen in the kit submits through.
 */
export function Form({ validationBehavior = 'aria', ...props }: FormProps) {
  return <AriaForm data-slot="form" validationBehavior={validationBehavior} {...props} />
}
