# Elevation Lab — Prompt conventions

How every `PROMPTS-N.md` in this folder is written, and what to do before running one.

Steps 32 and 33 produced the least code of the eight steps before them — 235 and 382 insertions against step 30's 1,050 — and cost the most agent usage by a wide margin. The tokens went into *reading and looping*, not writing. That is the failure this file exists to prevent. Everything below is aimed at one thing: **the agent should never have to discover what it could have been told.**

Each `PROMPTS-N.md` opens with:

> Conventions in `docs/elevation-mvp/PROMPT-CONVENTIONS.md` apply. Run one step per fresh session.

---

## Why cost grows even when prompts don't

The repo is 31,226 lines of source plus 18,965 lines under test directories, with 96 test files. The current five largest source files and largest test file are below (paths relative to `src/elevation/`; rough read costs at ~12 tokens a line):

| File | Lines | Rough read cost |
|---|---:|---:|
| `components/ElevationCanvas.jsx` | 1,272 | ~15.3k tokens |
| `plan/PlanCanvas.jsx` | 944 | ~11.3k |
| `model/dimensions.js` | 743 | ~8.9k |
| `store/persistence.js` | 694 | ~8.3k |
| `model/splitRun.js` | 638 | ~7.7k |
| `store/__tests__/persistence.test.js` | 1,139 | ~13.7k |

An agent in an edit-test-fix loop reads each touched file three or four times. A step that touches both canvases therefore starts at roughly 100k tokens of reading before it writes a line — and that figure grows every round, for the same prompt. Prompt length is not the variable. **Files touched × times re-read × file size** is the variable.

---

## Rules for writing a step prompt

**1. Name the files.** Every step opens with the exact list of files it will touch, source and tests, with line counts. No "grep and find the call sites."

**2. Paste the fan-out, don't ask for it.** If a step changes a widely-referenced symbol, run the commands below, paste the output into the prompt, and say what to do with each site. "Grep for X and decide each site deliberately" is an instruction to explore the four biggest files in the repo — that one line was most of step 32.

**3. Literal fixtures, never derivable ones.** Give coordinates, not conditions. SPEC-9 test 5 said *"Room O is the same with B rotated so `cornerAt(O, A, 'right').type === 'outside'`"* — which makes the agent reverse-engineer `wallFrame` → `chainOrientation` → `wallComponents` by trial and error, and a wrong guess fails eight tests with a message that doesn't say why. Write `B (120,0)→(120,−96)` instead. Same for expected widths, reserves and positions: state the number, never the formula that yields it.

**4. A shape change is its own step.** Adding a field to `selection`, `run.anchors` or an `Item`, or renaming anything load-bearing, lands as a standalone step that leaves the suite green and changes no behavior. The behavior that rides on it goes in the next step. A shape change plus new behavior in one step means every test failure is ambiguous, and ambiguity is what makes an agent re-read everything.

**5. Say what NOT to touch.** List the call sites that deliberately stay as they are and why, in the prompt, not just the spec. Otherwise the agent investigates each one to satisfy itself.

**6. Scope the test loop.** Spell it out:

> While iterating, run only `npx vitest run <the one test file>`. Run `npm test && npm run lint` once, at the end. Don't run `npm run build` — Kyle runs that by hand.

The full gate after every fix attempt is 96 test files plus a lint pass per cycle.

**7. Cap the summary.** "Say which you switched and which you left" asks for a 44-line inventory. Ask for at most five lines: what changed, what surprised you, what you left undone.

**8. Budget the step.** If the named file list exceeds ~2,500 lines, or the fan-out exceeds ~15 sites, split it. Two cheap steps beat one that loops.

**9. Move code by script.** A step that moves code between files cuts it by line range with a script (`sed -n 'a,bp'` or a short Node/Python read-modify-write) and then fixes imports. It never retypes moved code. The prompt gives the line ranges.

**10. Contract, not code (from round 43.2, Kyle 2026-10-06).** The SPEC gives:
- the rules and decisions;
- the file list with line counts;
- function names and signatures, and the data shapes in and out;
- what to reuse (name the existing helper or pattern to follow);
- what not to touch;
- the tests, verbatim, with literal values.

Codex writes the implementation. Give code only for a few lines where an exact library call matters, for example an ezdxf API detail. Never give whole functions or files: that pays Claude to write the code and Codex to retype it. Cover every edge case that matters with a test rather than with code. Claude may check test numbers against a throwaway build, but that build never goes into the SPEC. After a tricky step (geometry, miters, anything touching many files), Claude reviews the commit's diff (`git show`) rather than pre-writing the code.

---

## Commands to run before writing a prompt

Replace `SYMBOL` with what the step changes — `activeWallId`, `cornerReserve`, `splitRun`, `selection.`, and so on. All verified against this repo.

**How many sites, and is this one step or two?**

```bash
grep -rn "SYMBOL" src --include=*.js --include=*.jsx | wc -l
```

**Which files, ranked by how entangled they are** (source only — tests are counted separately below):

```bash
grep -rc "SYMBOL" src --include=*.js --include=*.jsx \
  | grep -v ":0$" | grep -v "__tests__" | sort -t: -k2 -rn
```

**Every site with line numbers — this is the block to paste into the prompt:**

```bash
grep -rn "SYMBOL" src --include=*.js --include=*.jsx | grep -v "__tests__"
```

**Which test files the change will break:**

```bash
grep -rl "SYMBOL" src --include=*.js | grep "__tests__"
```

**What the step will cost to read** — the single most useful number. Over ~2,500 total, split the step:

```bash
grep -rl "SYMBOL" src --include=*.js --include=*.jsx | xargs wc -l | sort -rn
```

**The files that make any step expensive**, for deciding whether a step is affordable at all:

```bash
find src \( -name "*.js" -o -name "*.jsx" \) | xargs wc -l | sort -rn | sed -n 2,9p
```

**After the fact — what the step actually cost in output**, to compare against how much usage it burned. A small diff with big usage means the agent was looping, not writing:

```bash
git show --stat --format="%h %s" HEAD | tail -3
```

---

## How a fan-out appears in a prompt

Not this:

> Grep for activeWallId and decide each site deliberately; say which you switched and which you left.

This:

> `activeWallId` has 44 references. Switch these 6 to `selection.wallId`:
>
> ```
> src/elevation/plan/PlanWallShape.jsx:31
> src/elevation/components/PropertiesPanel.jsx:1531,1540
> ...
> ```
>
> Leave every other reference alone — they are draw-time lookups (`ElevationCanvas`, `RoomPicker`, `WallList`) and the cursor must not change. Do not open files outside this list.

---

## Before you run a step

- One step per session, always. Chaining two means the second starts with the first still in context and re-sends it on every tool call.
- Commit first, so `git status` is clean and a bad run is one `git reset --hard` away.
- Read the step's file list. If it names PropertiesPanel plus a canvas, expect it to be expensive and consider running it alone at the start of a window.
- Afterwards, run the `git show --stat` command above. Insertions far below ~400 on a step that felt expensive means something in the prompt sent it exploring — say so, and the next round gets that instruction removed.

---

## Standing structural cost

After this round, only `components/ElevationCanvas.jsx` (1,272 lines) and `store/__tests__/persistence.test.js` (1,139 lines) remain over 1,000 lines under `src/elevation/`.
