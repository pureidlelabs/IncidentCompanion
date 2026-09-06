# The hand-rolled log

*Everything in `ui/src/components/ui/` that neither wraps a primitive nor copies a shadcn shape. **A new row needs the maintainer's yes before the file exists.***

| Component | Why nothing off the shelf answered | Approved |
| --- | --- | --- |
| `data-table.tsx` | TanStack Table + Virtual driven by the served field specs. shadcn's Data Table is a *recipe* over the same libraries, not a component. | pre-policy |
| `data-cell.tsx` | Successor to the editable cells, whose file was deleted on 2026-08-16 once nothing shipping imported it. Inline editing was removed everywhere (2026-08-02): a cell renders a value and nothing else, so what is left is the *view* half — a field's text, its tone, its resolved reference. Neither library ships a table cell. | 2026-08-02 |
| `selection-slot.tsx` | A portal slot so the screen decides where a table's selection actions are drawn. The entities screen owns one filter bar over seven scopes and the table under it is one of seven components; without it the bar can only render beside its own table, which is where it pushed the table down on every tick. Nothing in either library is a slot. | 2026-08-02, **revisit at the design-language pass** |
| `entity-card.tsx` | The hover card's *contents*, rendered from a served spec. The card itself is `hover-card.tsx` on Base UI `preview-card`. | pre-policy |
| `entity-link.tsx`, `reference-select.tsx`, `entity-dialog.tsx` | The reference system — an id on the wire, a name on screen, a dialog for the one that does not exist yet. Entirely this app's model. | pre-policy |
| `severity-badge.tsx` | `Badge` plus the severity ramp and its measured contrast pairs. | pre-policy |
| `tags-input.tsx` | A CSV string on the wire drawn as chips. Neither library has a tags input. | pre-policy |
| `datetime-input.tsx` | `<input type="datetime-local">` with the app's parse/format. shadcn's Date Picker is Calendar + Popover and is a different control: an analyst copies a stamp off an alert, they do not pick a day. | pre-policy |
| `import-csv-control.tsx`, `import-csv-dialog.tsx`, `export-csv-button.tsx` | File exchange against the case API. | pre-policy |
| `bulk-actions.tsx` | One dialog that writes a chosen value across every selected row, driven by the served field specs: a field list, what each offers, and how a choice maps onto the fields to write. Neither library ships a bulk editor. | pre-policy |
| `async-boundary.tsx` | Query state to skeleton/error/children, with `isPending` first-load-only so a refetch never unmounts the table. | pre-policy |
| `confirm-delete-dialog.tsx` | `alert-dialog` plus count-aware copy. Thin. | pre-policy |
| `empty-state.tsx` | One call signature over shadcn's six `empty` parts. Not a shape of ours. | 2026-08-01 |
| `ambient-field.tsx` | The unauthenticated screens' ground: entities as nodes, relations as links, a link lighting as it is traversed. Neither library ships an ambient field, and the shape is this app's own vocabulary rather than the genre's. Canvas, sized to its own pane. | 2026-08-03 |
| `features/graphs/TimelineCascade.tsx` | The timeline graph's drawing. Two off-the-shelf timelines were evaluated against it and both declined by the maintainer: **vis-timeline** (Apache-2.0/MIT, mature) has no vertical mode and its interaction model is not the one this page wants, and **react-chrono** (MIT) draws vertical-alternating cards but carries none of the page's semantics — observed/response as *tracks*, silences drawn proportionally, day and milestone rules — so its model would have been fought rather than used. What is left is composition over the app's own blocks: `context-menu`, `row-menu`, the selection `aside` and the severity ramp, laid out with grid. **Not SVG**: the first build was, and every defect it shipped — hand-measured labels, fine-print type, paint-order collisions, a pill row off the canvas edge — existed only because text was being placed by hand. | 2026-08-05 |

**`pre-policy` is exempt by date, not blessed.** Every row is a candidate for deletion the moment a library ships the shape.
