/**
 * The geometry probes, evaluated in the page.
 *
 * **Ported verbatim from `app/e2e/driver.py`'s `PROBE`, and deliberately plain
 * JavaScript.** Every rule below was paid for by a false positive - the
 * `foreignObject` icon badges reported as 11x11 click targets, the `Math.max`
 * over four edges that turned a below-the-fold pencil into "606px past the
 * viewport", the scrollable-*ancestor* question an `overflow` check gets
 * backwards. Retyping it under `strict` in the same move as the port is how a
 * probe stops biting while every sweep still reports clean; `selftest.ts` is
 * what proves it bites, and is the only reason this was safe to move at all.
 *
 * **`.js`, not `.ts`, and that is the choice rather than an omission.** The
 * body is full of its own template literals; as a TypeScript string it needed
 * every backtick escaped, which is a second spelling of 364 lines that no test
 * compares against the first. Playwright serialises a plain function to the
 * page, so this file is the same source the browser runs.
 *
 * @param {[string | null, string]} args `[rootSel, excludeSel]`
 * @returns {{kind: string, what: string, detail: string}[]}
 */
export function probe([rootSel, excludeSel]) {
    const root = rootSel ? document.querySelector(rootSel) : document;
    if (!root) return [];
    const out = [];
    const doc = document.documentElement;
    // `vh` went here in the port: the Python source declared it and no rule
    // read it. Nothing had ever linted this file, which is the first thing
    // moving it into the Node tier produced.
    const vw = doc.clientWidth;

    // Anything overlaying the page -- an open dropdown, the contents a shut
    // `<details>` keeps in the tree -- covers what is under it by design, so
    // measuring it as page furniture reports everything underneath as an
    // `overlap`. `excludeSel` names them: `PAGE_EXCLUDE` and `DIALOG_EXCLUDE`
    // differ because a dialog is the *root* when probing inside it, not
    // something covering it.
    const portal = el => el.closest(excludeSel);
    // Past the viewport inside something that scrolls sideways is reachable by
    // scrolling, not a clipped control. Stops short of <body>/<html>
    // deliberately: a sideways-scrolling *page* would excuse every control past
    // the edge, so the two findings that most want reporting together -- the
    // page scrolls, and this control is cut off -- would suppress each other.
    //
    // `scrollWidth > clientWidth` is the wrong question: an ancestor's
    // scrollWidth grows *because* of the overflowing child, so asking it
    // excuses the very element under test. Ask whether the ancestor is
    // genuinely scrollable -- overflow-x auto/scroll means the analyst can
    // reach the control, `visible` means it merely spills, and `hidden` means
    // it is unreachable, which is a defect rather than an excuse.
    const inScroller = el => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const ox = getComputedStyle(p).overflowX;
            if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1)
                return true;
        }
        return false;
    };
    // What is actually on screen: an element's box intersected with every
    // scrolling ancestor's. `getBoundingClientRect` reports where an element
    // is *painted* and knows nothing about the ancestor clipping it, so a rail
    // row scrolled below its own container still reports a rect, sitting on
    // whatever the container's edge gave way to -- a 223x27px `overlap`
    // between two nav rows that nothing on screen showed.
    //
    // **Clamped, not merely excluded.** Dropping a row only when it is
    // *wholly* outside its scroller is half right: the visible half can
    // collide and the clipped half cannot, but one rect covers both, so a
    // half-scrolled row collides with the rail's own footer strip on every
    // page. Null when nothing is left, which is the wholly-outside case
    // falling out for free.
    const paintedRect = el => {
        let r = el.getBoundingClientRect();
        let box = {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (!/(auto|scroll|hidden)/.test(s.overflowY)
                && !/(auto|scroll|hidden)/.test(s.overflowX)) continue;
            const b = p.getBoundingClientRect();
            box = {top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom),
                   left: Math.max(box.left, b.left), right: Math.min(box.right, b.right)};
        }
        box.width = box.right - box.left;
        box.height = box.bottom - box.top;
        return (box.width > 1 && box.height > 1) ? box : null;
    };
    /**
     * The painted boxes, one per line the element occupies.
     *
     * **`getClientRects`, not `getBoundingClientRect`, and the difference is a
     * whole class of false positive.** A wrapped inline element's bounding rect
     * is the *union* of its lines: a link whose text wraps reports a box as
     * wide as its container and two lines tall, so it intersects every other
     * link on either line. Measured on the timeline, whose entity links wrap:
     * `overlap: controls overlap by 208x14px` between two links that touch
     * nothing, in both grounds - the shape of a real cross-theme defect.
     *
     * A block element has exactly one client rect, so nothing else moves.
     */
    const paintedRects = el => {
        const clips = [];
        // **A text field paints inside its own content box, and its padding is
        // where an inset control is *meant* to sit.** The date half of
        // `datetime-input.tsx` is `w-40 pr-9` with a `w-9` calendar trigger laid
        // over that padding: the boxes overlap by exactly 36x32px and no glyph
        // ever lands under the trigger, because the typed text is confined to
        // the content box, which ends one pixel short of it. Measured on
        // `Screens/Case/Overview`: content box right edge 139, trigger left edge
        // 140 - reported as an `overlap` on 11 stories, none of them a defect.
        //
        // **Clamped, not excluded.** Drop the padding and the content box grows
        // under the trigger, and the finding comes back - which is the whole
        // distinction: a padded host plus an inset control is a design, an
        // unpadded one is a collision. Excluding inputs from the check
        // altogether would take the second with the first, and `selftest`'s
        // padded-input fault is what holds that shut.
        //
        // **Text fields only.** A checkbox, a radio or a range has no text and a
        // few pixels of border; clamping those would shave a real overlap below
        // the 2px threshold the check uses.
        if (el.matches('textarea, input:not([type]), '
                       + 'input[type=text], input[type=search], input[type=tel], '
                       + 'input[type=url], input[type=email], input[type=password], '
                       + 'input[type=number]')) {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const px = v => parseFloat(v) || 0;
            clips.push({
                top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
                bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom),
                left: r.left + px(s.borderLeftWidth) + px(s.paddingLeft),
                right: r.right - px(s.borderRightWidth) - px(s.paddingRight),
            });
        }
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(s.overflowY)
                || /(auto|scroll|hidden)/.test(s.overflowX)) clips.push(p.getBoundingClientRect());
        }
        const out = [];
        for (const r of el.getClientRects()) {
            let box = {top: r.top, bottom: r.bottom, left: r.left, right: r.right};
            for (const b of clips) {
                box = {top: Math.max(box.top, b.top), bottom: Math.min(box.bottom, b.bottom),
                       left: Math.max(box.left, b.left), right: Math.min(box.right, b.right)};
            }
            if (box.right - box.left > 1 && box.bottom - box.top > 1) out.push(box);
        }
        return out;
    };
    const clippedOut = el => paintedRect(el) === null;
    const visible = el => {
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        return !clippedOut(el);
    };
    const name = el => (el.tagName.toLowerCase()
        + (el.className && el.className.toString ? '.' + el.className.toString().trim().split(/\\s+/).slice(0, 2).join('.') : ''))
        .slice(0, 48);

    // 1. The page scrolls sideways. Never intended here.
    if (!rootSel && doc.scrollWidth > vw + 1)
        out.push({kind: 'h-scroll', what: 'document',
                  detail: `page scrolls horizontally by ${doc.scrollWidth - vw}px`});

    // 2. Text cut off with no ellipsis -- a word ends mid-glyph and
    //    nothing on screen says there was more.
    for (const el of root.querySelectorAll('*')) {
        if (portal(el) || !visible(el)) continue;
        if (el.children.length) continue;
        // `.sr-only` is a 1x1 clipping box by construction, so its label is
        // always "clipped with no ellipsis" -- there is no ellipsis to add and
        // nothing on screen to cut off. See the exclusion in `controls` below.
        if (el.closest('.sr-only')) continue;
        const t = (el.textContent || '').trim();
        if (!t) continue;
        const s = getComputedStyle(el);
        const hidden = s.overflowX === 'hidden' || s.overflowX === 'clip';
        if (!hidden || s.textOverflow === 'ellipsis') continue;
        if (el.scrollWidth > el.clientWidth + 1)
            out.push({kind: 'clipped-text', what: name(el),
                      detail: `"${t.slice(0, 30)}" clipped by ${el.scrollWidth - el.clientWidth}px, no ellipsis`});
    }

    // 3. Two controls sitting on top of each other -- the "search box collides
    //    with Add" class. Rect intersection needs no container arithmetic, so
    //    it does not inherit the ambiguity that makes overflow numbers
    //    untrustworthy.
    //
    //    **Icons count, not just interactive elements.** A collapsed search
    //    stub can measure zero-width and drop out of `visible()`, and the
    //    magnifier beside it is an `<i>` -- with interactive elements alone in
    //    the set, a header that plainly overlapped on screen reported clean at
    //    every width from 820 to 1600. Leaf icons only (`:not(:has(*))`): an
    //    ancestor overlaps its own descendants by construction, and the
    //    containment test below excuses only direct pairs, not cousins under a
    //    shared wrapper.
    //
    //    **Nothing inside an SVG is a control.** The graphs paint icon badges
    //    into `foreignObject`, so an 11x11 glyph on a node card measures as an
    //    11x11 click target -- on both graph pages, in both engines and both
    //    themes. The click lands on the node via the single `[data-node]`
    //    listener on the canvas, and `_zoomable_svg_view` puts zoom, export and
    //    the per-node buttons outside the SVG because SVG focus is inconsistent
    //    across browsers, so an interactive element in there would be the app
    //    breaking its own rule. Same exclusion and the same reason as the
    //    contrast check below: inside an SVG the box model is not where the
    //    truth is.
    //
    //    **`.sr-only` is excluded here and in two checks below.** It is a 1x1
    //    clipped box by construction, so it reports `small-target` and
    //    `clipped-text` on every capture holding one -- Settings has three, the
    //    no-script `Apply` behind each `submit_on_change` control.
    const controls = [...root.querySelectorAll(
        'button, a[href], input, [role="button"], [role="tab"]')]
        .filter(el => visible(el) && !portal(el) && !el.closest('svg, foreignObject')
                      && !el.closest('.sr-only'));
    for (let i = 0; i < controls.length; i++) {
        for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i], b = controls[j];
            if (a.contains(b) || b.contains(a)) continue;
            // The painted boxes, so a row clipped by its scroller cannot
            // collide with what the scroller's edge gave way to - and one per
            // line, so a wrapped link does not collide with its own neighbours.
            let worst = null;
            for (const ra of paintedRects(a)) {
                for (const rb of paintedRects(b)) {
                    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
                    const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
                    if (ox > 2 && oy > 2 && (!worst || ox * oy > worst.ox * worst.oy))
                        worst = {ox, oy};
                }
            }
            if (worst)
                out.push({kind: 'overlap', what: `${name(a)} / ${name(b)}`,
                          detail: `controls overlap by ${Math.round(worst.ox)}x`
                                  + `${Math.round(worst.oy)}px`});
        }
    }

    // 4. A control cut off by the left or right edge.
    //
    // Horizontal only. `Math.max` over all four edges reports an ordinary edit
    // pencil *below the fold* on a scrolling page as "606px past the
    // viewport", reproducibly and in both engines -- which reads as a real
    // cross-browser defect. Vertical position on a page that scrolls says
    // nothing; sideways is the axis nothing here may exceed. Report the axis
    // that fired: one unlabelled number collapsing several conditions cannot
    // be triaged.
    for (const el of controls) {
        if (inScroller(el)) continue;
        const r = el.getBoundingClientRect();
        const past = Math.round(Math.max(r.right - vw, -r.left));
        if (past > 1)
            out.push({kind: 'offscreen', what: name(el),
                      detail: `control is cut off ${past}px past the ${r.right - vw > -r.left ? 'right' : 'left'} edge`});
    }

    // 5. Text that does not contrast with what it sits on.
    //
    // The geometry probes are blind to this by construction, and it cost a
    // real defect: a dialog's copy had no colour rule at all, so every entity
    // dialog carried a line of white text on a white card -- right size, right
    // place, not clipped, not overlapping, and not there to read.
    //
    // Walks up for the first non-transparent background rather than trusting
    // the element's own, since text almost always sits on an ancestor's fill.
    // Reports below 3:1, well under AA's 4.5:1 for body text: the aim is "this
    // is invisible", not a WCAG audit, and a stricter bar buries that signal
    // under muted-caption noise.
    //
    // **The browser converts the colour; nothing here parses one.** A computed
    // colour is reported in whatever space it was authored in, and this probe
    // has now been wrong twice by reading one syntax as another:
    //
    //   `color-mix()`  -> `color(srgb 0.909 0.903 0.948)`   0..1 floats
    //   a Tailwind v4 token -> `oklch(0.22 0.012 260)`      not RGB at all
    //
    // A bare digit match takes 0.909 for an 8-bit channel, so a near-white
    // ground scored as near-black -- the New report dialog's layout card read
    // 1.49:1 where it measures 11.36:1. The oklch case is worse and was live
    // for the whole React tier: the same scrape yields `rgb(0.22, 0.012, 260)`,
    // whose blue channel pins at 255 for *every* token, so foreground and
    // ground both compute to the same luminance and **every** element reports
    // 1.00:1. `ui/src/styles/tokens.css` is oklch throughout; the older tier
    // was hex and unaffected, which is why it went unnoticed.
    //
    // Both were false *negatives* as much as false positives, and an oracle
    // that misreports is believed in either direction. So the fix is not a
    // third branch: painting to a canvas makes the browser do the conversion,
    // which is exact, handles every syntax it accepts including ones not
    // invented yet, and clamps to sRGB -- the gamut the screen shows anyway,
    // so it is the right answer for a contrast question.
    //
    // Memoised because the walk touches every element and a page has a handful
    // of distinct colours: `getImageData` per element is what makes this cost
    // anything.
    const _paint = document.createElement('canvas');
    _paint.width = _paint.height = 1;
    const _ctx = _paint.getContext('2d', {willReadFrequently: true});
    const _seen = new Map();
    const rgba = s => {
        if (_seen.has(s)) return _seen.get(s);
        // **Validity by two sentinels, not by one.** Assigning an unparseable
        // colour to `fillStyle` leaves the previous value in place, so a single
        // sentinel cannot tell "rejected" from "the colour really was that
        // sentinel" -- and black is the value a rejected read is most likely to
        // collide with. Assign `s` over two different starting colours: if it
        // took, both agree.
        let out = null;
        _ctx.fillStyle = '#000000'; _ctx.fillStyle = s; const a = _ctx.fillStyle;
        _ctx.fillStyle = '#ffffff'; _ctx.fillStyle = s; const b = _ctx.fillStyle;
        if (a === b) {
            _ctx.clearRect(0, 0, 1, 1);
            _ctx.fillRect(0, 0, 1, 1);
            const d = _ctx.getImageData(0, 0, 1, 1).data;   // unpremultiplied
            out = [d[0], d[1], d[2], d[3] / 255];
        }
        _seen.set(s, out);
        return out;
    };
    const parseRGB = s => { const c = rgba(s); return c && [c[0], c[1], c[2]]; };
    const lum = ([r, g, b]) => {
        const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const alphaOf = s => { const c = rgba(s); return c ? c[3] : 1; };
    const groundOf = el => {
        for (let p = el; p; p = p.parentElement) {
            const s = getComputedStyle(p);
            if (alphaOf(s.backgroundColor) > 0.5) {
                const c = parseRGB(s.backgroundColor); if (c) return c;
            }
        }
        return [255, 255, 255];
    };
    for (const el of root.querySelectorAll('*')) {
        if (portal(el) || !visible(el) || el.children.length) continue;
        const text = (el.textContent || '').trim();
        if (!text) continue;
        const style = getComputedStyle(el);
        const fg = parseRGB(style.color);
        if (!fg) continue;
        // A fully transparent colour is a deliberate hide (icon ligatures
        // waiting on a font, screen-reader-only text), not a mistake.
        if (style.color.startsWith('rgba') && parseFloat(style.color.split(',')[3]) === 0) continue;
        // **A disabled control is muted on purpose.** Low contrast is how "you
        // cannot press this" is drawn, and undo and redo sit greyed out on
        // every section of every page -- 16 copies of the same non-defect
        // burying the genuine findings.
        if (el.closest('[disabled], .disabled, [aria-disabled="true"]')) continue;
        // **Inside an SVG, `groundOf` measures the wrong thing.** The graphs
        // paint node fills as <circle>/<rect>, which have no CSS
        // backgroundColor, so the walk runs past them to the canvas and reports
        // a white icon on a coloured node as 1.00:1 against the page. Skipped
        // rather than guessed at -- and the graphs' own colours go through
        // `_svg_escape` and a strict allowlist, so they are reviewed elsewhere.
        if (el.closest('svg, foreignObject')) continue;
        const bg = groundOf(el);
        const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a);
        const ratio = (hi + 0.05) / (lo + 0.05);
        if (ratio < 3)
            out.push({kind: 'low-contrast', what: name(el),
                      detail: `"${text.slice(0, 30)}" is ${ratio.toFixed(2)}:1 against its background`});
    }

    // 6. Touch/click targets smaller than 24px in either axis.
    //
    // **Only things you can actually click.** `controls` carries bare icons
    // for the overlap check above, but an icon is evidence about the control
    // it sits in, never a control itself -- a legend glyph is not a target.
    // Ancestry cannot decide this, so ask what the thing *is*. `matches`,
    // never `closest`: `closest` re-admits a 17x17 glyph centred in a 24x24
    // button and reports it against a target that passes.
    //
    // The gap left is a bare icon that really is clickable and sits in no
    // button. No DOM property distinguishes one from a legend glyph, so it is
    // stated rather than guessed at with a `cursor: pointer` heuristic.
    //
    // **A form control inside a `<label>` is measured at the label**, and only
    // when the label owns it -- a `for=` pointing elsewhere, or a label
    // wrapping several controls, credits an input with a target that focuses
    // something else. Clicking anywhere in the label focuses the control, so a
    // wrapped input whose label is comfortably over 24px is not a small target.
    // Re-measure before removing this; `selftest` injects a label-wrapped
    // fault that depends on it.
    //
    // **A link inside a run of text is exempt**, the one exception the 24px
    // rule itself makes (WCAG 2.5.8): the target is sized by the sentence it
    // belongs to, and padding it to 24px sets the line's rhythm from its links
    // rather than from its prose. Timeline's fact clauses are exactly that.
    // Keyed on `display: inline`, not on a class -- an inline-level box is
    // *what* an in-sentence link is, and a real control is `inline-flex` or
    // `block` and keeps reporting.
    // 7. A control nobody can reach: laid out, named, and painted at zero.
    //
    // **`visible()` above reads the element's *own* opacity and never walks
    // its ancestors**, which is the hole this closes. A row's action cluster
    // sets `opacity-0` on the toolbar while the buttons inside keep
    // `opacity: 1`, so every other check measures them as ordinary controls,
    // finds a real 24x24 box, and reports clean.
    //
    // **Reported per holder, not per control.** The holder is what is painted
    // at zero, and one finding per button would be three lines saying one
    // thing about one element.
    //
    // **A reveal class is named rather than excused.** A cluster carrying
    // `group-hover`/`hover:` is *meant* to be hidden at rest, so this cannot
    // decide alone whether it is a defect -- the driving spec hovers it and
    // rules. What it can say is which of the two it is looking at, and a
    // holder with no reveal class at all is unreachable with no argument.
    const opacityOf = el => {
        let node = el, product = 1;
        while (node && node.nodeType === 1) {
            product *= +getComputedStyle(node).opacity;
            if (product === 0) return {value: 0, holder: node};
            node = node.parentElement;
        }
        return {value: product, holder: null};
    };
    const REVEAL = /(^|:)hover|group-hover|focus-visible|data-\[state=|data-\[hovered/;
    const seen = new Set();
    for (const el of root.querySelectorAll(
            'button, a[href], input, select, textarea, [role="button"], [role="menuitem"]')) {
        if (portal(el) || el.closest('.sr-only') || el.closest('svg, foreignObject')) continue;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const {value, holder} = opacityOf(el);
        if (value !== 0 || !holder) continue;
        // **Keyed on the holder's classes, not the element.** One broken
        // cluster shape repeated down a table is one defect; per element it
        // was 180 findings across eight stories, which is a backlog nobody
        // clears rather than a signal somebody acts on.
        const cls = holder.className && holder.className.toString ? holder.className.toString() : '';
        if (seen.has(cls)) continue;
        seen.add(cls);
        out.push({kind: 'hidden-control', what: name(holder),
                  detail: REVEAL.test(cls)
                      ? 'painted at zero opacity; carries a reveal class, so hover it to rule'
                      : 'painted at zero opacity and carries no reveal class, so nothing can show it'});
    }

    // **Two siblings in a centred row that do not share a centre line.**
    //
    // A rule given both `self-stretch` and a fixed height anchors to the top of
    // its line and reads as a tick beside its neighbours, which no clipping,
    // contrast or overlap rule can see: the row is laid out, nothing is cut,
    // everything is legible. One visual line at a time, because a wrapped row
    // is several and comparing across them reports every row as broken.
    for (const row of root.querySelectorAll('*')) {
        const rs = getComputedStyle(row);
        if (rs.display !== 'flex' || rs.flexDirection !== 'row') continue;
        if (rs.alignItems !== 'center') continue;
        if (portal(row)) continue;
        const kids = [...row.children].filter(k =>
            visible(k) && !portal(k) && getComputedStyle(k).position !== 'absolute');
        if (kids.length < 3) continue;
        const boxes = kids.map(k => k.getBoundingClientRect());
        const top = Math.min(...boxes.map(x => x.top));
        const line = kids.filter((_, i) => boxes[i].top - top < 4);
        if (line.length < 3) continue;
        const mids = line.map(k => {
            const r = k.getBoundingClientRect();
            return r.top + r.height / 2;
        });
        const median = [...mids].sort((a, b) => a - b)[Math.floor(mids.length / 2)];
        line.forEach((k, i) => {
            const off = mids[i] - median;
            if (Math.abs(off) > 1.5)
                out.push({kind: 'off-centre', what: name(k),
                          detail: `${Math.abs(off).toFixed(1)}px off the centre line its `
                              + `${line.length - 1} siblings share`});
        });
    }

    // **A declared size the computed box contradicts.**
    //
    // An arbitrary variant outranks an element's own utility, so an ancestor's
    // `[&_svg]:size-4` holds a `size-5` icon at 16px with nothing to say which
    // rule won. Computed width rather than a rect: a rect carries transforms,
    // and a spinner mid-rotation measures wider than the box it was given.
    for (const el of root.querySelectorAll('[class]')) {
        if (portal(el) || !visible(el)) continue;
        const s = getComputedStyle(el);
        if (s.transform !== 'none') continue;
        const cls = (el.getAttribute('class') || '').toString();
        const want = /(?:^|\s)(?:size|w)-(\d+(?:\.\d+)?)(?:\s|$)/.exec(cls);
        if (!want) continue;
        // **A flex child that may shrink treats a width as a basis, not a
        // promise.** `min-w-0 flex-1` on a search box is the row doing exactly
        // what it was told, and reporting it buries the real finding -- the
        // class that cannot win at all -- under one per toolbar.
        const parent = el.parentElement;
        if (parent && getComputedStyle(parent).display.includes('flex')
            && parseFloat(s.flexShrink) > 0) continue;
        const asked = parseFloat(want[1]) * 4;
        const got = parseFloat(s.width);
        if (!got || Math.abs(got - asked) <= 0.6) continue;
        out.push({kind: 'size-overridden', what: name(el),
                  detail: `asks for ${asked}px and computes ${got.toFixed(1)}px, `
                      + 'so a stronger rule is winning'});
    }

    // **A child painting outside its parent's rounded corner.**
    //
    // A box with a smaller radius than the box it sits in still paints in the
    // corner the larger arc cuts away, and the result is a notch no other rule
    // can see: nothing is clipped, nothing overlaps, contrast is fine. Three
    // boxes each rounding themselves never line up, because their arcs differ
    // and the innermost wins at the extremes.
    //
    // Sampled rather than computed: the point at 15% of the radius along the
    // diagonal is inside the square and outside the arc, so anything the
    // browser reports there is painting where the corner was cut.
    for (const box of root.querySelectorAll('*')) {
        if (portal(box) || !visible(box)) continue;
        const bs = getComputedStyle(box);
        const radius = parseFloat(bs.borderTopLeftRadius);
        if (!radius || radius < 4) continue;
        if (bs.overflow !== 'visible' || bs.clipPath !== 'none') continue;
        const br = box.getBoundingClientRect();
        if (br.width < radius * 2 || br.height < radius * 2) continue;
        const corners = [
            ['top left', br.left + radius * 0.15, br.top + radius * 0.15],
            ['top right', br.right - radius * 0.15, br.top + radius * 0.15],
        ];
        for (const [where, x, y] of corners) {
            for (const hit of document.elementsFromPoint(x, y)) {
                if (hit === box || !box.contains(hit)) continue;
                const hs = getComputedStyle(hit);
                const bg = hs.backgroundColor;
                if (bg === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(bg)) continue;
                out.push({kind: 'paints-past-the-corner', what: name(hit),
                          detail: `paints at the ${where} corner of ${name(box)}, `
                              + `which its ${radius}px radius cuts away`});
                break;
            }
        }
    }

    const clickable = 'button, a[href], input, select, textarea, [role="button"], [role="tab"]';
    const owns = (lab, el) => lab && (!lab.htmlFor || lab.htmlFor === el.id)
                  && lab.querySelectorAll('input, select, textarea').length === 1;
    for (const el of controls) {
        if (!el.matches(clickable)) continue;
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue;
        let r = el.getBoundingClientRect();
        const lab = el.closest('label');
        if (owns(lab, el)) {
            const lr = lab.getBoundingClientRect();
            r = {width: Math.max(r.width, lr.width), height: Math.max(r.height, lr.height)};
        }
        if (r.width < 24 || r.height < 24)
            out.push({kind: 'small-target', what: name(el),
                      detail: `target is ${Math.round(r.width)}x${Math.round(r.height)}px`});
    }
    return out;
}
