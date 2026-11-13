# Checks after Orca restarted

The earlier reports, screenshots and test logs were intact. All earlier smoke jobs had finished; none needed resuming. The existing development server was still listening at 127.0.0.1:5174. The restored browser tab was blank, so it was navigated back to the app. Existing browser documents persisted.

The working tree also contained newer application changes beyond this audit's earlier PORT override. Those changes were left untouched. Earlier results remain historical evidence; the checks below used the bundle served after restart.

## Additional finding: incomplete-source feedback is inconsistent (P3)

**Reproduce in the built-in browser:** insert a 2D Geometry block, open Edit 2D Geometry…, replace its source with `\begin{`, and leave the source field. The preview becomes empty, the inspector reports 0 commands, no diagnostic is displayed, and Done remains enabled. Done applies this incomplete source to the parent block. A parent Undo restores the exact previous figure.

This is a validation/quality-of-life gap, **not a confirmed unrecoverable data-loss bug**. A nonblocking parse diagnostic would help distinguish incomplete syntax from an intentionally empty drawing; preserving raw source remains useful.

The same incomplete-input probe produced no `.cz-msg` diagnostic in seven editors: 2D geometry, 3D geometry, tree, ZX, chemistry, commutative diagram and XyMatrix. This is a narrow probe, not a complete syntax-validation assessment.

Evidence: [screenshot](evidence/recovery/incomplete-geometry.png), [UI state](evidence/recovery/malformed-visible.json), [editor snapshot](evidence/recovery/malformed-geometry.txt). The before/applied/undone JSON files alongside them record the exact restoration.

## Recovery of malformed edits: 15/15

In isolated Chrome sessions, each registered visual editor was given incomplete source through its source textarea, then blurred so parsing ran. The driver selected the existing source before sending actual text input. For Physics the input was an incomplete lens command with an invalid focal-length value; for the other editors it was `\begin{`.

- All 15 retained an editor-local Undo step, and Undo restored the exact source from before the edit.
- Cancel after that recovery left the parent callback untouched in all 15 cases.
- Eight editors displayed diagnostics; seven did not display a `.cz-msg` diagnostic for this probe.
- No console exceptions or console errors were captured.

The cancellation check here occurs **after Undo**; it is not an additional dirty-cancel/discard test. Dirty cancellation was covered in the prior block-editor interaction pass.

Evidence: [results](evidence/recovery/malformed.json), [log](evidence/recovery/malformed.log), [reproduction script](evidence/recovery/malformed.mjs). Run the script with Node from this repository; it uses tests/chrome.mjs and writes results under /tmp/texdiagram-editors.

## SVG image workflow: passed

Through the built-in browser's Image button and file upload, imported the repository's `design/logo/final/lockup-horizontal.svg`. Verified one image shape with the expected filename and embedded image source. Changed its Rotation field to 45°, duplicated it, undid the duplicate, and reloaded. The final image shape, embedded source, dimensions, position, filename and rotation matched exactly across reload.

Evidence: [summary](evidence/recovery/image-results.txt), [restored UI](evidence/recovery/image-reloaded.txt), and image JSON snapshots alongside them. Other image formats and all replacement/clipboard variations remain outside this test.

## Native file-picker limitation

Attempting to open an existing legacy .diagramtex fixture through the native file picker returned the automation error `browser_element_not_interactable`: “its file picker has no file input.” The app advertises the File System Access API, rather than using an HTML file input for this operation. No supported desktop driver was installed in this session, so native save/open/overwrite round trips remain unverified. This is an automation coverage limitation, not an application defect conclusion. No driver was installed and no OS permission setting was changed.

No application fixes were made during this recovery pass. The earlier quantum palette keyboard-activation finding remains recorded in [block-editors.md](block-editors.md).
