import { type ComplianceRecord } from '@/api/compliance'
import { type ComplianceFieldSpec } from '@/api/specs'
import { Checkbox, CheckboxGroup } from '@/components/ui/checkbox'
import { DateTimeInput } from '@/components/ui/datetime-input'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ListBoxItem } from '@/components/ui/list-box'
import { Select } from '@/components/ui/select'
import { Tag, TagGroup } from '@/components/ui/tag-group'
import { chosen, optionShape, valueOf, type OptionGroup } from './compliance-answers'

/**
 * One served compliance field, as whatever control its kind declares.
 */
export function ComplianceControl({
  spec,
  record,
  onSet,
}: {
  spec: ComplianceFieldSpec
  record: ComplianceRecord
  /**
   * The answer, in the shape the record stores it.
   */
  onSet: (name: string, value: unknown) => void
}) {
  const value = valueOf(record, spec)

  if (spec.computedFrom !== undefined) {
    return (
      <Field label={spec.label} hint="Its options follow the causes chosen in 4.2.">
        {() => <p className="text-sm text-ink-muted">{value || '\u2014'}</p>}
      </Field>
    )
  }

  if (spec.kind === 'check') {
    return (
      <Checkbox
        isSelected={record[spec.name] === true}
        onChange={(next) => {
          onSet(spec.name, next)
        }}
      >
        {spec.label}
      </Checkbox>
    )
  }

  if (spec.kind === 'multi_csv' || spec.kind === 'multi_lines') {
    const picked = chosen(record, spec)
    // Re-filtered through the served order, so the stored value does not
    // depend on the order the analyst ticked the boxes in.
    const store = (next: readonly string[]) => {
      onSet(spec.name, (spec.options ?? []).filter((option) => next.includes(option)))
    }
    const shape = optionShape(spec)

    if (shape.kind === 'compact') {
      return (
        <TagGroup
          label={spec.label}
          selectionMode="multiple"
          selectedKeys={new Set(picked)}
          onSelectionChange={(next) => {
            store(next === 'all' ? (spec.options ?? []) : [...next].map(String))
          }}
        >
          {shape.options.map((option) => (
            <Tag key={option} id={option}>
              {spec.optionLabels?.[option] ?? option}
            </Tag>
          ))}
        </TagGroup>
      )
    }

    return (
      <CheckboxGroup
        label={spec.label}
        value={picked}
        onChange={store}
        className="rounded-md border border-border p-3"
      >
        {shape.kind === 'grouped'
          ? shape.groups.map((group) => <StemGroup key={group.stem || 'ungrouped'} group={group} />)
          : shape.options.map((option) => (
              <Checkbox key={option} value={option}>
                {spec.optionLabels?.[option] ?? option}
              </Checkbox>
            ))}
      </CheckboxGroup>
    )
  }

  if (spec.kind === 'event_datetime') {
    return (
      <Field label={spec.label}>
        {(ids) => (
          <DateTimeInput
            {...ids}
            label={spec.label}
            value={value}
            onChange={(iso) => {
              onSet(spec.name, iso)
            }}
          />
        )}
      </Field>
    )
  }

  if (spec.kind === 'select' || spec.kind === 'ground') {
    return (
      <Select
        label={spec.label}
        // `''` is a labelled member of these vocabularies and reads "not
        // stated", so it is a row rather than the absence of one - and a key
        // has to be a string React Aria can tell from "nothing picked".
        selectedKey={value === '' ? UNSET : value}
        onSelectionChange={(key) => {
          onSet(spec.name, key === UNSET ? '' : String(key))
        }}
      >
        {(spec.options ?? []).map((option) => (
          <ListBoxItem key={option || UNSET} id={option || UNSET}>
            {spec.optionLabels?.[option] ?? (option === '' ? 'not stated' : option)}
          </ListBoxItem>
        ))}
      </Select>
    )
  }

  return (
    <Field label={spec.label}>
      {(ids) => (
        <Input
          {...ids}
          {...(spec.kind === 'number' ? { type: 'number', inputMode: 'numeric' as const } : {})}
          value={value}
          onChange={(event) => {
            onSet(
              spec.name,
              spec.kind === 'number'
                ? event.target.value === ''
                  ? null
                  : Number(event.target.value)
                : event.target.value,
            )
          }}
        />
      )}
    </Field>
  )
}

/**
 * One stem of a grouped vocabulary: the parent said once, its details beneath.
 */
function StemGroup({ group }: { group: OptionGroup }) {
  return (
    <div
      data-slot="option-stem"
      className={
        group.stem === ''
          ? 'flex flex-col gap-2 border-t border-border pt-3'
          : 'flex flex-col gap-2'
      }
    >
      {group.stem !== '' && (
        <span className="text-micro uppercase tracking-micro text-ink-muted">
          {group.stem}
        </span>
      )}
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {group.options.map((option) => (
          <Checkbox key={option.value} value={option.value}>
            {group.stem === '' ? (
              option.detail
            ) : (
              <>
                <span className="sr-only">{option.value}</span>
                <span aria-hidden>{option.detail}</span>
              </>
            )}
          </Checkbox>
        ))}
      </div>
    </div>
  )
}

/**
 * The key standing in for the vocabulary's empty member.
 */
const UNSET = 'not-stated'
