# Project TODO

This is the shared backlog for project ideas, bugs, improvements, and follow-up work.

## How to use this file

- Add new thoughts to **Idea inbox** immediately; they do not need to be fully specified.
- Move an item to **Planned** when its scope and completion criteria are clear.
- Use `P0` for urgent work, `P1` for important work, `P2` for normal work, and `P3` for someday work.
- Add an area such as `elevation`, `plan`, `model`, `UI`, `DXF`, `estimate`, or `docs`.
- Mark an item complete only after its completion criteria and relevant checks pass.
- Preserve completed items in **Done** with the completion date and commit or pull request when available.

AI collaborators should read this file when asked to plan or prioritize project work. Preserve the user's wording and intent, avoid silently deleting ideas, and record any important assumptions under the relevant item.

Suggested format:

```markdown
- [ ] **[P2][area] Short idea title**
  - Why: Optional context or motivation.
  - Notes: Constraints, links, or open questions.
  - Done when: A concrete, verifiable outcome.
```

## Idea inbox

- [ ] Inset face frame vs. Euro cabinet styles; this would change the reveals per cabinet, and face frame would rarely need fillers at all.
- [ ] UI settings modal with tabs instead of the sidebar to increase the working area.
- [ ] Extend parts above or below their run box, such as fillers or panels sitting on the floor next to appliances or on the countertop.
- [ ] Divide individual cabinetry into doors, drawer fronts, panels, and other components.
- [ ] Rules for AI to “process” a room and generate reports: shipping list, cabinet order, door order, etc.
  - Separate doors/drawer fronts by style and size
- [ ] Rules for AI to determine stile and rail widths for smaller doors/drawer fronts
- [ ] Upload current job processing checklist document to inform AI on current rules for processing
- [ ] Molding designer: crown, applied moldings, and choosing which points of the molding are drawn into the room geometry.
- [ ] Door Style editor with door-thickness options that adjust how cabinets fit in a room.
- [ ] Allow every cabinet to override its room or team defaults for every setting.
- [ ] Hardware choices: hinges, slides, pulls, and more. Hinges might determine cabinet style; slides would adjust drawer-front widths and depths.
- [ ] Appliance panels.
- [ ] Appliances without panels.
- [ ] Split cabinets vertically within a run so they can stack on top of each other, not only side by side.
  - Blind Corner Cabinets
  - Add Accessories to individual cabinets
- [ ] Comments per unique cabinet box or part.
- [ ] Part numbering for a whole room.
- [ ] Cross sections on drawings.
- [ ] Saving to the database - how to structure for edits, redraws and versions, etc. Do we need a version history since multiple people could work on one project?
- [ ] save clearances to side objects - i.e. a run needs 4" clearance from door casing, etc.

## Planned

<!-- Move sufficiently defined work here. -->

## In progress

<!-- Include the branch, task, or owner when useful. -->

## Bugs and cleanup

<!-- Record known defects, technical debt, and maintenance work here. -->

## Later / Maybe

<!-- Keep worthwhile ideas here when they are not currently planned. -->

## Done

<!-- Keep completed items for project history. -->
