/**
 * A field the analyst writes prose into, with the marks the document keeps.
 * Case notes, an evidence note, an action's detail and a report section all
 * use this block.
 *
 * Keeps the textarea's contract: a live field, commit on blur, Escape
 * restores the saved text, no click-to-edit step. Nothing here is a modal
 * editing mode.
 *
 * The stored column is markdown in, markdown out, so the export, the API and
 * every existing case keep working -- but the stored bytes are now a
 * *serialisation* rather than the characters typed. A construct the schema
 * has no node for is destroyed silently on the round trip
 * (`server/src/report/document/markdown.ts` guards every demo body against it), and
 * serialisation is not byte-stable, so `touched` tracks a real document
 * change rather than a difference between the value and its own round trip --
 * committing on blur regardless would rewrite files nobody opened to edit.
 */

import { Extension, type Editor } from '@tiptap/core'
import Collaboration, { isChangeOrigin } from '@tiptap/extension-collaboration'
// A direct dependency on purpose, though `Collaboration` installs the
// plugin: relying on a transitive package resolving is how an import breaks
// on someone else's install rather than here.
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import { Placeholder } from '@tiptap/extensions/placeholder'
import { EditorContent, useEditor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { ChevronDown } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { keyLabel } from '@/components/blocks/prose-keys'
import {
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SubmenuTrigger,
} from '@/components/ui/menu'
import { Popover } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleButton, ToggleButtonGroup } from '@/components/ui/toggle-button'
import { Toolbar } from '@/components/ui/toolbar'
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip'
import type { ProseChannel, SyncStatus } from '@/api/proseSync'
import { markdownOf, proseExtensions } from '@/components/blocks/prose-schema'
import { bubbleSide } from '@/components/blocks/prose-side'
import { SlashMenu, type SlashCommand, type SlashItem } from '@/components/blocks/prose-slash'
import { cn } from '@/lib/cn'

/**
 * What a table offers once the caret is inside one.
 *
 * Every entry has a markdown spelling: a command producing a structure the
 * serialiser cannot write would put something on screen that the next save
 * deletes. A merged cell is absent for that reason, and so is a header
 * column -- GFM has one header *row* and nothing else.
 */
const TABLE_ACTIONS: readonly {
  name: string
  /** Which submenu it belongs under, or none for a verb on the table itself. */
  axis?: 'Row' | 'Column'
  destructive?: boolean
  run: (editor: Editor) => void
}[] = [
  { name: 'Insert row below', axis: 'Row',
    run: (e) => { e.chain().focus().addRowAfter().run() } },
  { name: 'Delete row', axis: 'Row', destructive: true,
    run: (e) => { e.chain().focus().deleteRow().run() } },
  { name: 'Insert column after', axis: 'Column',
    run: (e) => { e.chain().focus().addColumnAfter().run() } },
  { name: 'Delete column', axis: 'Column', destructive: true,
    run: (e) => { e.chain().focus().deleteColumn().run() } },
  { name: 'Delete table', destructive: true,
    run: (e) => { e.chain().focus().deleteTable().run() } },
]

export interface ProseBodyProps {
  /** Markdown, as stored. */
  value: string
  /** Called on blur, and only when the analyst changed something. */
  onCommit?: (markdown: string) => void
  /** Called on every change, for a caller that shows something about the text. */
  onChange?: (markdown: string) => void
  /** Names the field for assistive tech. Never drawn. */
  label: string
  placeholder?: string
  readOnly?: boolean
  /**
   * What `/` offers. Absent means no menu at all - a body with nothing to
   * insert should not answer a key with an empty list.
   */
  slashItems?: () => SlashItem[]
  /** Anything else the calling screen adds to the document. */
  extensions?: readonly Extension[]
  /** Drawn after this component's own bubble-menu buttons. */
  bubbleExtras?: (editor: Editor) => ReactNode
  className?: string
  /** Told which editor this is, for a screen that moves focus between several. */
  onReady?: (editor: Editor | null) => void
  /** The caret landed in this body. For a rail that follows it. */
  onFocus?: () => void
  /**
   * Makes the body live: several analysts type into it at once and see each
   * other's carets. Absent is the ordinary single-writer field.
   *
   * The channel has to be *open* before it is passed - `status` of `opening`
   * means the server has not said whether there is stored state, and nothing
   * may be written into the document until it has. -> `api/proseSync`
   */
  sync?: {
    channel: ProseChannel
    status: SyncStatus
    /**
     * Which fragment of the document this body is. One document holds every
     * section of the report, so an unnamed fragment would edit the same
     * default one as every other section. The block's id, stable across a
     * rename and unique inside the report.
     */
    field: string
  }
}

export function ProseBody({
  value,
  onCommit,
  onChange,
  label,
  placeholder = 'Write\u2026',
  readOnly = false,
  slashItems,
  extensions = [],
  bubbleExtras,
  className,
  onReady,
  onFocus,
  sync,
}: ProseBodyProps) {
  // The `/` menu's state. Refs beside the state because `useEditor` builds the
  // extension once: a handler closing over `open` would read the first
  // render's `false` forever.
  const [items, setItems] = useState<SlashItem[]>([])
  const [at, setAt] = useState<DOMRect | null>(null)
  const [open, setOpen] = useState(false)
  const isOpen = useRef(false)
  const list = useRef<SlashItem[]>([])
  const run = useRef<SlashCommand | null>(null)
  const listBox = useRef<HTMLUListElement>(null)
  /** The element the insert menu is positioned against; it stands at the caret. */
  const anchor = useRef<HTMLSpanElement>(null)

  /**
   * State drives the highlight's render; a ref beside it feeds the keymap.
   * React Compiler refuses reading a ref while rendering, and the keymap
   * still needs the ref: `useEditor` builds its extensions once, so a handler
   * closing over state alone would read the first render's `0` forever.
   */
  const [cursor, setCursor] = useState(0)
  const cursorRef = useRef(0)

  const pick = useCallback((index: number) => {
    cursorRef.current = index
    setCursor(index)
  }, [])

  // Keep the highlighted hit inside the scroll box. No dependency array: the
  // cursor is a ref, so there is no value to key this on, and `block: 'nearest'`
  // is a no-op when the item is already visible.
  useEffect(() => {
    if (!isOpen.current) return
    listBox.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })

  const touched = useRef(false)
  const commit = useRef(onCommit)
  const changed = useRef(onChange)
  const entered = useRef(onFocus)

  // Assigned in an effect, not during render: `react-hooks/refs` refuses a
  // ref write while rendering, since React Compiler may throw a render away
  // and re-run it.
  useEffect(() => {
    commit.current = onCommit
    changed.current = onChange
    entered.current = onFocus
  }, [onCommit, onChange, onFocus])

  // Through refs, because `useEditor` builds its handlers once and a callback
  // closing over the prop would capture only the first render's copy.
  const stored = useRef(value)
  useEffect(() => { stored.current = value }, [value])

  // Read by the Escape handler, which `useEditor` builds once and which would
  // otherwise capture the first render's answer for ever.
  const shared = useRef(Boolean(sync?.channel))
  useEffect(() => { shared.current = Boolean(sync?.channel) }, [sync?.channel])

  const blur = Extension.create({
    name: 'proseBodyCommit',
    addKeyboardShortcuts() {
      return {
        // Escape restores the saved text, exactly as the textarea did, and
        // gives the focus back so the next key is not swallowed.
        Escape: ({ editor }) => {
          // A shared body has nothing to restore *to*: "the saved text" is
          // one analyst's row value, and putting it back would delete every
          // edit another analyst made since. Escape still returns focus.
          // Undo inside a shared body is the CRDT's, and reverses only your
          // own edits.
          if (!shared.current) {
            editor.commands.setContent(stored.current)
            touched.current = false
          }
          ;(editor.view.dom).blur()
          return true
        },
      }
    },
  })

  const wanted = useRef(slashItems)
  useEffect(() => { wanted.current = slashItems }, [slashItems])

  // The ref read below is deferred, not render: the menu asks for its items
  // when it opens, and the lint rule cannot see that the closure runs later.
  // eslint-disable-next-line react-hooks/refs
  const slash = SlashMenu({
    items: () => wanted.current?.() ?? [],
    onOpen: (next, rect, command) => {
      list.current = next; isOpen.current = true; run.current = command
      cursorRef.current = 0
      setCursor(0); setItems(next); setAt(rect); setOpen(true)
    },
    onUpdate: (next, rect, command) => {
      list.current = next; run.current = command
      setItems(next); setAt(rect)
    },
    onClose: () => { isOpen.current = false; setOpen(false) },
    onKey: (event) => {
      if (!isOpen.current) return false
      if (event.key === 'ArrowDown') {
        pick(Math.min(cursorRef.current + 1, list.current.length - 1)); return true
      }
      if (event.key === 'ArrowUp') { pick(Math.max(cursorRef.current - 1, 0)); return true }
      if (event.key === 'Enter') {
        const chosen = list.current[cursorRef.current]
        if (chosen && run.current) run.current(chosen)
        return true
      }
      if (event.key === 'Escape') { isOpen.current = false; setOpen(false); return true }
      return false
    },
  })

  const channel = sync?.channel

  const editor = useEditor({
    extensions: [
      ...proseExtensions(Boolean(channel)),
      Placeholder.configure({ placeholder }),
      blur,
      ...(slashItems ? [slash] : []),
      ...(channel
        ? [
            Collaboration.configure({ document: channel.doc, field: sync.field }),
            // `user` is not optional in practice, though the type allows it:
            // the extension overwrites it with its own default on mount.
            CollaborationCaret.configure({
              provider: { awareness: channel.awareness },
              ...(channel.user ? { user: channel.user } : {}),
            }),
          ]
        : []),
      ...extensions,
    ],
    // No initial content when collaborative: `Collaboration` takes the
    // document from Yjs, and seeding through `content` on every mount would
    // duplicate it. The effect below is the one legitimate seed.
    ...(channel ? {} : { content: value }),
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: cn('prose-body outline-none', className),
        'aria-label': label,
        // A contenteditable carries no implicit role: without these the
        // field is invisible to `getByRole('textbox')` and to a screen
        // reader looking for one.
        role: 'textbox',
        'aria-multiline': 'true',
      },
    },
    onUpdate: ({ editor: live, transaction }) => {
      // `docChanged`, not merely "onUpdate fired": a selection move is an
      // update, and treating one as an edit would write the file back on
      // every click into the section. `!isChangeOrigin` excludes a remote
      // analyst's own transaction, which is `docChanged` too.
      if (transaction.docChanged && !isChangeOrigin(transaction)) {
        touched.current = true
      }
      changed.current?.(markdownOf(live))
    },
    onFocus: () => entered.current?.(),
    onBlur: ({ editor: live }) => {
      if (!touched.current) return
      touched.current = false
      commit.current?.(markdownOf(live))
    },
    // Rebuilt when the channel arrives or is replaced -- the extension list is
    // built once per editor.
  }, [channel])

  useEffect(() => {
    onReady?.(editor)
    return () => onReady?.(null)
  }, [editor, onReady])

  // A value that moved underneath us replaces the document, unless it is
  // being typed in -- overwriting a focused editor would delete what the
  // analyst is halfway through.
  useEffect(() => {
    // Never in a collaborative body: the row is a projection of the Yjs
    // document, and writing it back would undo the other analyst's edits.
    if (channel) return
    // `useEditor` rebuilds when the channel appears or goes, and this effect
    // can still run against the instance just torn down.
    if (editor.isDestroyed) return
    if (editor.isFocused || touched.current) return
    if (markdownOf(editor).trim() === value.trim()) return
    editor.commands.setContent(value)
    // Adopting the row's own value is not an edit.
    touched.current = false
  }, [editor, value, channel])

  useEffect(() => {
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  /**
   * A toggle group, not plain buttons: marks are independent and several can
   * be on at once (`selectionMode="multiple"`), a block is exactly one of
   * three (`"single"`). `onSelectionChange` hands back the whole set, so the
   * changed entry is the difference -- the group owns what is pressed, the
   * editor owns what that does.
   */
  const MARKS = [
    { value: 'bold', glyph: 'B', name: 'Bold', keys: 'Mod-B',
      run: () => editor.chain().focus().toggleBold().run() },
    { value: 'italic', glyph: 'I', name: 'Italic', keys: 'Mod-I',
      run: () => editor.chain().focus().toggleItalic().run() },
    { value: 'code', glyph: '<>', name: 'Code', keys: 'Mod-E',
      run: () => editor.chain().focus().toggleCode().run() },
  ] as const

  const BLOCKS = [
    { value: 'paragraph', glyph: '\u00b6', name: 'Body text', keys: 'Mod-Alt-0',
      run: () => editor.chain().focus().setParagraph().run() },
    { value: 'heading2', glyph: 'H2', name: 'Subhead', keys: 'Mod-Alt-2',
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { value: 'heading3', glyph: 'H3', name: 'Minor head', keys: 'Mod-Alt-3',
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  ] as const

  const bubblePlacement = bubbleSide(
    editor.state.selection.$head.pos, editor.state.selection.$anchor.pos)

  const marksOn = MARKS.filter((mark) => editor.isActive(mark.value)).map((m) => m.value)
  const blockOn = editor.isActive('heading', { level: 2 })
    ? 'heading2'
    : editor.isActive('heading', { level: 3 })
      ? 'heading3'
      : 'paragraph'

  const item = (
    entry: { value: string; glyph: string; name: string; keys: string },
  ) => (
    // A tooltip carries the shortcut rather than `title`, which React Aria
    // drops.
    <TooltipTrigger key={entry.value}>
      <ToggleButton
        id={entry.value}
        size="sm"
        variant="ghost"
        aria-label={entry.name}
        // Without this the selection is gone before the command runs, and
        // every button formats nothing.
        onMouseDown={(event: React.MouseEvent) => { event.preventDefault() }}
        className="min-w-8 justify-center font-semibold"
      >
        {entry.glyph}
      </ToggleButton>
      <Tooltip>{`${entry.name} \u00b7 ${keyLabel(entry.keys)}`}</Tooltip>
    </TooltipTrigger>
  )

  return (
    <>
      <EditorContent editor={editor} />
      {/* Not on a read-only body: text stays selectable, so the menu would
          appear and every button in it would do nothing. jsdom renders no
          floating menu at all, so this guard is asserted in `e2e/` instead,
          against a sent report's frozen, read-only sections. */}
      {!readOnly && (
        <BubbleMenu
          editor={editor}
          options={{ placement: bubblePlacement }}
          className="rounded-md border bg-popover p-1 shadow-md"
        >
          {/* The bar is "Formatting"; the group inside it is "Marks". Naming
              both the same makes two elements one accessible name apart, which
              this tier has already caught twice on other screens. */}
          <Toolbar className="gap-1" aria-label="Formatting">
            <ToggleButtonGroup
              selectionMode="multiple"
              selectedKeys={marksOn}
              onSelectionChange={(keys) => {
                const changed = MARKS.find(
                  (mark) => keys.has(mark.value) !== marksOn.includes(mark.value))
                changed?.run()
              }}
              aria-label="Marks"
            >
              {MARKS.map(item)}
            </ToggleButtonGroup>
            <Separator orientation="vertical" spacing="sm" />
            <ToggleButtonGroup
              selectionMode="single"
              // A block kind has no "off" - a paragraph is one of the choices.
              disallowEmptySelection
              selectedKeys={[blockOn]}
              onSelectionChange={(keys) => {
                const [next] = keys
                BLOCKS.find((block) => block.value === next)?.run()
              }}
              aria-label="Block"
            >
              {BLOCKS.map(item)}
            </ToggleButtonGroup>
            {bubbleExtras?.(editor)}
          </Toolbar>
        </BubbleMenu>
      )}

      {/* A table's controls, on a menu of their own: the formatting bubble
          above appears on a *text selection*, and a caret sitting in a cell
          is not one -- `shouldShow` asks whether the caret is in a table
          instead. A separate menu because these act on the structure and the
          others act on the text inside it. */}
      {!readOnly && (
        <BubbleMenu
          editor={editor}
          pluginKey="proseTable"
          shouldShow={({ editor: live }) => live.isActive('table')}
          className="rounded-md border bg-popover p-1 shadow-md"
        >
          {/* A menu, where the marks above are a toolbar: these commands have
              names rather than a glyph legend, and named commands that group
              by axis belong in a menu.

              **One menu, so no menubar.** A menubar is the roving-focus
              container several menus sit in and there is one here; the kit's
              `MenuTrigger` is what a lone menu opens from, and the trigger is
              then a button rather than a `menuitem` in a bar of one.

              Not "Table" as the menu's accessible name \u2014 a section called
              "Technique table" would collide with it under a substring
              match. */}
          <MenuTrigger>
            {/* No `onMouseDown` preventDefault here, deliberately: every verb
                begins `.chain().focus()`, which restores the editor's own
                stored selection, so the menu taking focus costs nothing.
                Guarded by `server/e2e/prose-table.spec.ts`. */}
            <Button variant="outline" className="px-2">
              Table
              <ChevronDown aria-hidden className="size-3" />
            </Button>
            <Menu aria-label="Table controls" className="w-52">
              {(['Row', 'Column'] as const).map((axis) => (
                <SubmenuTrigger key={axis}>
                  <MenuItem>{axis}</MenuItem>
                  <Menu aria-label={`${axis} controls`}>
                    {TABLE_ACTIONS.filter((action) => action.axis === axis).map(
                      ({ name, destructive, run }) => (
                        <MenuItem
                          key={name}
                          {...(destructive ? { tone: 'destructive' as const } : {})}
                          onAction={() => { run(editor) }}
                        >
                          {name}
                        </MenuItem>
                      ),
                    )}
                  </Menu>
                </SubmenuTrigger>
              ))}
              <MenuSeparator />
              {TABLE_ACTIONS.filter((action) => action.axis === undefined).map(
                ({ name, destructive, run }) => (
                  <MenuItem
                    key={name}
                    {...(destructive ? { tone: 'destructive' as const } : {})}
                    onAction={() => { run(editor) }}
                  >
                    {name}
                  </MenuItem>
                ),
              )}
            </Menu>
          </MenuTrigger>
        </BubbleMenu>
      )}

      {/* **A 1px anchor at the caret**, which is what the popover is
          positioned against. React Aria measures a *trigger element*, and the
          thing this menu belongs to is a place in the text rather than a
          control -- so the rect Suggestion hands back is drawn as an element
          nothing can reach, exactly as `PointerContextMenu` anchors a context
          menu at the pointer. */}
      <span
        ref={anchor}
        aria-hidden
        className="pointer-events-none fixed size-px"
        style={at
          ? { left: at.left, top: at.top, width: at.width, height: at.height }
          : { left: 0, top: 0 }}
      />
      {/* **A popover, not the kit's `Menu`**, though the contents are a list
          of commands: a menu brings `role="menu"` and roves by *focusing* the
          list, and the caret has to stay in the document or the next keystroke
          lands in the menu instead of in the query. Roving is driven from the
          editor's own keymap instead.

          **`isNonModal` is what keeps the document usable underneath.** A
          modal popover hides the rest of the page from assistive tech, locks
          the document's scroll and focuses its own surface on mount -- three
          separate ways of taking the field away from the analyst who is still
          typing into it. Held by `prose-body.test.tsx`. */}
      <Popover
        triggerRef={anchor}
        isOpen={open && at !== null}
        onOpenChange={(next) => { if (!next) setOpen(false) }}
        isNonModal
        placement="bottom start"
        // 384px, not 320: at the narrower width six of the library's labels
        // truncated against the hint column.
        className="w-96 p-1"
      >
        <ul ref={listBox} className="max-h-72 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-ink-muted">Nothing matches.</li>
          )}
          {items.map((item, index) => (
            <Fragment key={item.group + item.label}>
              {/* A heading whenever the group changes: the list is flat
                  because the cursor is an index into it, so the heading
                  is drawn between rows rather than wrapping them. Sticky,
                  since a group runs past the 288px scroller. */}
              {items[index - 1]?.group !== item.group && (
                <li
                  // Not a `<li>` anyone can reach: it names the rows under
                  // it, and a screen reader walking the list should hear
                  // them, not it.
                  aria-hidden
                  className="sticky top-0 z-10 bg-popover px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-ink-muted"
                >
                  {item.group}
                </li>
              )}
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                // `run.current`, never `item.run`: Suggestion owns the
                // range it will delete, so calling the item leaves the
                // typed `/tab` behind next to what it inserted.
                onClick={() => run.current?.(item)}
                aria-current={index === cursor}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                  index === cursor
                    ? 'bg-accent text-on-accent'
                    : 'hover:bg-muted',
                )}
              >
                <span className="w-6 shrink-0 text-center font-mono text-2xs text-ink-muted">
                  {item.glyph}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint && (
                  <span className="shrink-0 text-2xs text-ink-muted">{item.hint}</span>
                )}
              </button>
            </li>
            </Fragment>
          ))}
        </ul>
      </Popover>
    </>
  )
}
