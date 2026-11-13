# Block-editor interaction pass

This extends the original smoke test beyond opening and closing editor dialogs. All 15 registered visual editor types were exercised. Bloch's separate inspector is not one of these modal editors.

## Confirmed bug: quantum palette cannot be activated from the keyboard (P2)

1. Open a Quantum block's **Edit Circuit…** dialog.
2. Focus **Search elements**, then press Tab. Focus moves to the Hadamard palette item.
3. Press Enter: the gate is not armed. Press Space: it is still not armed.
4. Click that same gate: it becomes armed and displays “Hadamard: click a cell to place it. Esc when done.”

**Expected:** Enter or Space activates a focused gate button. The Space key currently enters the editor's pan shortcut, and Enter does not invoke palette selection. Search + Enter and letter shortcuts provide alternative paths for some actions, but do not make a focused button's broken activation correct.

**Related accessibility issue:** native palette buttons override their role with `role="listitem"`, so the accessibility tree reports list items rather than buttons. This explains their absence from the interactive-only button snapshot. It does not mean they are absent from the tab order.

**Implementation evidence:** src/editors/qceditor.ts renders palette buttons with `role="listitem"` and handles activation in pointerdown/pointerup, without a click handler. Its global Space handler prevents the button's native activation. Other editors must be checked individually; several use a click handler and are not confirmed to share this activation defect.

**Reproduction evidence:** [keyboard.log](evidence/editors/keyboard.log) records the same focused element after Enter and Space with `armed:false`; mouse activation yields `armed:true`. [keyboard.mjs](evidence/editors/keyboard.mjs) reproduces this with actual Chrome keyboard/mouse input. The issue was also reproduced in Orca's built-in browser.

No application fix was made during this test.

## Applying, reopening, cancelling and parent-document history

For **every row** below, the built-in browser test changed the editor's source field, clicked Done, verified the actual parent block changed, reopened it, verified the edited content, made another edit, cancelled and confirmed Discard, verified the parent was unchanged, then verified one parent Undo restored the exact prior block and Redo restored the applied block.

| Editor | Content change |
|---|---|
| Commutative diagram | Object A → E |
| XyMatrix | Object A → E |
| Quantum circuit | Hadamard gate → Pauli Y; separate run added a wire and a step and applied Pauli X |
| Circuit | Resistor label R → R₁ |
| Tree | Root → System |
| ZX | Phase α → γ |
| Feynman | Momentum label q → p |
| Timing | CLK → CLOCK |
| State machine | State label q₀ → s₀ |
| Karnaugh map | Variable label D → E |
| Bit field | Version → Revision |
| Chemistry | H₃C → H₂N |
| 2D geometry | Vector length macro 4 → 5 |
| 3D geometry | View tilt 60° → 45° |
| Physics | Optics focal length 2 → 3 |

All 15 passed. [roundtrips.log](evidence/editors/roundtrips.log) and [roundtrips-extra.log](evidence/editors/roundtrips-extra.log) contain the results; per-editor applied/cancel/undo/redo JSON and reopened UI snapshots are alongside them. The first 2D geometry attempt failed in the test driver's macro matcher before editing anything; the corrected matcher then passed. That driver failure is not an application bug.

## Graphical tools inside each editor

These complementary isolated-Chrome checks seed each default block through the application's registry, then use real mouse input to activate palette tools and operate the canvas. They verify source changes, exact **editor-local** Undo and Redo, and a nonempty Done callback. They do not substitute a programmatic model mutation for the graphical action.

| Editor | Graphical action verified |
|---|---|
| 2D / 3D geometry | Add a point in each editor |
| Quantum | Place a Pauli X gate in a cell |
| Tree | Insert a two-child subtree |
| ZX | Place an X spider |
| Feynman | Place a dotted vertex |
| Timing | Add a signal row |
| State machine | Place a state |
| Karnaugh map | Change template from 4×4 to 2×2 |
| Bit field | Add a bit box |
| Chemistry | Apply nitrogen to an existing atom |
| Commutative diagram / XyMatrix | Place an X object in each matrix |
| Circuit | Drag a resistor into the circuit |
| Physics | Add an optical axis |

All 15 passed. The first generic timing gesture missed a row and the first chemistry gesture targeted blank canvas; both were inconclusive, then retested with the correct row/atom workflow. These are not counted as application failures.

Evidence: [graphical-tools.log](evidence/editors/graphical-tools.log), [graphical-extra.log](evidence/editors/graphical-extra.log), and per-type `graphical-*.json` files. The scripts beside the logs reproduce the input checks. Run them from the repository with Node; they use the existing tests/chrome.mjs helper and write their results under /tmp/texdiagram-editors.

## Connections and geometry dragging

- Drew a wire between existing circuit pins, moved the capacitor, applied the edit, and verified the new wire still ended at a capacitor terminal. Verified exactly one item was added and the capacitor moved.
- Dragged a writable point in both 2D and 3D geometry; source changed and local Undo/Redo restored the exact before/after source.

All passed, with no captured console errors. See [connections.log](evidence/editors/connections.log), [circuit-connections.json](evidence/editors/circuit-connections.json) and the two `drag-geo*.json` files.

## Remaining depth

This covers meaningful editing and history in every visual editor, not every palette entry or property combination. Full circuit-library coverage, multiple-wire topologies, every quantum gate/control combination, chemistry rings/reaction schemes, graph edge variants, timing constraint arrows, malformed-source handling, mathematical/scientific correctness and exhaustive keyboard accessibility still need dedicated matrices. No claim that all of those passed is implied by these smoke checks.
