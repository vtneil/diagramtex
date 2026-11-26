# Reviewing and improving DiagramTeX's interface

How to critique a screen, a pull request or a design, and how to improve one. The method comes from Apple's Human
Interface Guidelines (its principles, its review lenses and its report format) and from Linear's checklist and stress
test, re-ordered so DiagramTeX's own rules come first. The house decisions in `../SKILL.md` §2 and §15 are never
findings.

## The two people doing the review

You are a reviewer who knows the guidelines cold, and the design lead of a small studio whose work has a point of
view. The first keeps the design honest; the second keeps it from looking like every other app. DiagramTeX already has
its point of view (the drafting table, ink and two pens, the rulers), so the second person's job here is mostly to
protect it.

## Apple's eight principles: the first filter

A screen that breaks one of these has a bigger problem than any single rule it breaks.

| Principle | The question |
|---|---|
| Purpose | What is this screen for, and does the design serve it? |
| Agency | Can people explore, skip, and recover from mistakes (undo, Esc, Cancel)? |
| Responsibility | Is it clear what happens to their files, their data and their work? |
| Familiarity | Do the patterns match what people know, and the rest of the app? |
| Flexibility | Does it work at 1400px and in the narrower pane, with keyboard and pointer, in Thai, light, dark and Increase Contrast? |
| Simplicity | Has every element earned its place? |
| Craft | Spacing, alignment, wording, animation: is it finished? |
| Delight | Is there a feeling, and is it the right one? Delight is not decoration |

## Step 1: establish context

- **The piece and its single job**, in one sentence. Where does the user come from and go next?
- **What you can verify** from what you have: running app, screenshot, code or description. Contrast is computed from
  token hex values, not guessed from a JPEG. Say what you can't verify; a limit is not a finding.
- **What the person wants:** a full audit, a specific worry, or a direction.

## Step 2: review in this order

Tag each finding Critical, High, Medium or Low.

1. **Accessibility** (failures are Critical): see `../SKILL.md` §14. Measure contrast (4.5:1 for text), check type ≥ 10px,
   targets 28px (never under 20px), names on icon-only controls and inputs, a full keyboard path with Tab kept inside
   dialogs, reduced motion, Increase Contrast, and that nothing relies on colour alone.
2. **Stability** (High): does anything move, flash, lose scroll or lose typed text when a mode, switch, fold, selection
   or re-render happens (§3)? Does anything overlap or steal a hit area (§5)?
3. **House rules** (High): colour meanings and white vs tinted fields (§6), the one outlined button and a single primary,
   kit components rather than hand-written markup (§9), tokens only, concentric radii (§8), title-style vs sentence case
   (§13).
4. **Desktop conventions** (High when broken; Apple's macOS guidance translated to a web app):
   - every command is reachable without the pointer (⌘K search, right-click menus, keys) and standard shortcuts keep
     their usual meaning; custom ones are few and shown where the action is
   - the window resizes fluidly and the same functions exist at every width; nothing critical hides in a bottom bar
   - sidebars can be hidden and hold at most two levels
   - everything interactive has a hover state, pointer feedback and a comfortable hit area
5. **Calm and craft** (Medium; Linear's rules and Apple's craft lens):
   - Is the content brighter than the chrome? Can a separator, icon, label or colour go with no loss?
   - Do columns, icons and titles share exact x positions across views?
   - One colour means one thing; icons share one visual language and weight; motion is brief and rare on frequent
     actions.
   - **Is it a template?** A palette, type pairing or layout with no reason in the product is a default, not a choice.
     Here that usually shows up as SaaS-dashboard habits: cards around list items, pills, coloured badges, a gradient,
     an accent hue.
   - **Is the boldness spent in one place?** The rulers and the user's drawing are the signature; everything round
     them stays quiet.
   - **Remove one accessory.** Name what could go. If nothing can, say the design is lean.
6. **Interaction** (Medium; Apple's feedback, modality and undo guidance):
   - Feedback lives in the interface (status hint, inline help), not in alerts. Alerts are rare, never shown on launch,
     never for an undoable action, and never default to OK unless purely informational.
   - Destructive, irreversible actions get a warning and a Cancel; undo covers the rest.
   - A modal has an obvious way out and one short task.
   - Data entry offers choices over typing, validates as you type, and keeps what was typed.
   - Something appears at once while work is under way, and people can keep working.
   - The click and key counts in `tests/bench.json` don't grow without a reason.
7. **Copy** (Medium or Low; Apple's writing guidance plus §13): every label says what happens, and an action keeps its
   name through the flow ("Copy TikZ" gives "Copied"). Errors say what went wrong and how to fix it, without apology.
   Empty views invite the next action. Names come from what people recognise, not from how the code is built. UK
   spelling, "math" left alone, Thai present and fitting.

## Step 3: write the report

```text
## Design review: <name>

### Summary
Two or three sentences. Rating: Excellent / Good / Needs work / Critical issues.
The piece's job, and whether it keeps the drafting-table feel.

### Critical
- **What**: the problem, with numbers (px, ms, contrast ratio)
- **Why**: the rule, cited as `SKILL.md §6`, `system.md › Depth and shape`, or `HIG › Alerts` (or "judgment")
- **Fix**: the concrete change: the token, the kit component, the property, the file

### Improvements
Same format, each tagged High, Medium or Low.

### Craft notes
Point of view, restraint, one thing to remove.

### What works
Specific patterns to keep so they survive the next change.
```

Include only sections with content; Summary always. The rating follows the tags: **Critical issues** if any Critical;
**Needs work** with several High; **Good** with nothing Critical and at most a couple of High; **Excellent** when
nothing is above Medium.

## Working rules

- **Numbers, not adjectives.** "11px `#8f8c84` on `--paper`, 3.0:1, below 4.5:1" beats "hard to read". If you can't
  measure, say what you'd need.
- **Cite it or label it as judgment.** Never invent a rule. HIG pages worth citing for this app: Accessibility,
  Typography, Color, Dark Mode, Layout, Designing for macOS, Writing, Feedback, Undo and Redo, Modality, Alerts,
  Popovers, Menus, Context Menus, Toolbars, Segmented Controls, Toggles, Sliders, Text Fields, Lists and Tables,
  Sidebars, Keyboards, Pointing Devices, Focus and Selection, Motion, Loading, Searching. If the `apple-design` skill is
  installed, its `references/hig/<page>.md` has the full text: read before quoting.
- **Review the flow, not just the screen.** A fine panel can break the mode switch around it.
- **Don't over-critique.** A strong design gets a short review and a clear statement of what makes it strong.
- **Don't flatten the personality.** If your fixes would leave DiagramTeX indistinguishable from a template, you have
  gone too far.
- **Name the trade-off** when a rule collides with a need, then recommend.

## Linear's checklist, adapted

1. Is the content brighter than the chrome?
2. Can a separator, icon, label or colour be removed with no loss?
3. Do the columns and icons share exact x positions across views?
4. Are all values tokens (`--fs-*`, `--ctl`, `--r*`, colours, shadows)?
5. Do nested radii follow inner = outer − inset?
6. Does each interactive element have hover, `:focus-visible`, pressed, selected and disabled states?
7. Can the whole task be done from the keyboard, and is each shortcut shown somewhere?
8. Does each action show its result in under 100ms?
9. Does the layout stay still on hover, load, data change, mode switch and re-render?
10. Do light, dark and Increase Contrast all pass 4.5:1 for text?

## Stress test

- **Environment:** Brave and Safari/WebKit on a Mac, a 1400×900 window, the narrower browser pane, the sidebar open
  and folded, the properties window open and folded, Quick's embedded editor.
- **Appearance:** light, dark, Increase Contrast, reduced motion.
- **Language:** English and Thai.
- **Data:** a 120-character file or layer name, a 5-digit count, nothing at all, thousands of shapes or table cells,
  maths labels still decoding.

## Improving a design (studio mode)

When asked to improve or redesign, review first, then:

1. **Ground it in the subject.** Paper, ink, rulers, pencil marks, the `.tex` file the user came from. Draw the
   visual ideas from these, never from a generic product.
2. **Plan within the system.** Use the existing tokens; propose a new token only with its role, its light and dark
   values and its contrast figure. Sketch the layout in a sentence or an ASCII wireframe at 1400px and at the narrow
   pane.
3. **Critique the plan.** Would you have produced the same plan for a different product? Then it is a default; revise
   it and say what changed.
4. **Propose concrete changes:** exact tokens, the kit component that replaces the hand-made one, the file and
   property. Not "fix the contrast" but "`--pencil` to `#6f6c64`, 4.7:1 on `--paper`".
5. **Sequence the work:** accessibility, then stability and house rules, then craft, then polish.
6. **Critique again** and look for one thing to remove.
