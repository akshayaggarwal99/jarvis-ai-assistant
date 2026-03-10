# Voice Agent Reliability Guide

Voice workflows fail differently from text-only workflows.

In Jarvis, the pipeline is not just:
audio in → text out

It is usually closer to:
audio capture → transcription → intent interpretation → memory/state usage → tool execution → final response or action

That means a voice assistant can appear to “work” in demos, while still failing in real usage because the wrong layer is drifting.

This guide gives you a practical way to inspect those failures.

## Why voice workflows are harder to debug

Voice systems introduce extra instability that text-only systems often hide:

- transcription ambiguity changes the prompt before the model even sees it
- short spoken commands can map to multiple intents
- session memory can drift across repeated interactions
- tool or command execution failures are often mistaken for model failures
- multi-step voice tasks can degrade gradually instead of failing all at once
- evaluation is harder because users usually remember the final bad outcome, not the earlier step that broke

## Common voice-agent failure modes

### 1. Input drift from transcription

**What it looks like**

- Jarvis heard something close, but not quite right
- the output is grammatical, but based on the wrong words
- commands fail more often for names, apps, URLs, numbers, or accented speech

**What to inspect first**

- raw transcript before post-processing
- filler removal or cleanup behavior
- punctuation or rewrite steps that may have changed meaning
- whether local and cloud transcription produce different transcripts

**Typical symptom**

> “I said one thing, Jarvis acted on another.”

---

### 2. Intent mismatch after transcription

**What it looks like**

- transcription is mostly correct, but the assistant chooses the wrong action
- dictation is treated like a command
- a command is treated like free-form writing
- a short phrase gets over-expanded into something more confident than the user intended

**What to inspect first**

- intent classification logic
- command parsing rules
- prompt instructions that blur dictation vs command mode
- examples used to define valid actions

**Typical symptom**

> “The words were right, but the action was wrong.”

---

### 3. Memory or session drift

**What it looks like**

- Jarvis loses continuity across related interactions
- context from an earlier step disappears
- stale context keeps affecting later turns
- the assistant behaves as if an earlier instruction is still active when it should be reset

**What to inspect first**

- session state boundaries
- memory reset conditions
- what is persisted vs what is transient
- whether follow-up prompts inherit too much previous context

**Typical symptom**

> “It remembered the wrong thing, or forgot the right thing.”

---

### 4. Tool or command execution failure

**What it looks like**

- the assistant understood the request, but the action did not happen
- the wrong app opens
- a tool silently fails
- execution errors are misread as reasoning failures

**What to inspect first**

- command dispatch logic
- tool availability checks
- app / system permission boundaries
- fallback behavior when execution fails
- whether the assistant reports execution failure clearly

**Typical symptom**

> “It knew what I meant, but nothing happened.”

---

### 5. Long-run degradation in multi-step workflows

**What it looks like**

- the first one or two steps work, then quality drops
- outputs become flatter, more literal, or inconsistent
- follow-up actions drift away from the user’s original goal
- recovery becomes harder after a small early mistake

**What to inspect first**

- how state is carried between steps
- whether summaries or intermediate rewrites introduce drift
- whether each step has visibility into the original goal
- retry and recovery logic after partial failure

**Typical symptom**

> “It started well, then slowly went off track.”

---

### 6. Evaluation blind spots

**What it looks like**

- demo success looks high, but real user reliability feels low
- obvious failures are only noticed after repeated daily use
- the assistant sounds confident even when intent is unclear
- logs show activity, but not the actual failure boundary

**What to inspect first**

- whether you evaluate only final output instead of the full path
- whether transcripts, parsed intent, tool calls, and outcomes are all visible
- whether you track failure by symptom class, not just generic error rate
- whether “successful completion” hides low-quality behavior

**Typical symptom**

> “The system says it worked, but users do not trust it.”

## Symptom-first troubleshooting table

| Symptom | Likely failure class | What to inspect first |
|---|---|---|
| Jarvis heard the wrong thing | Input drift from transcription | Raw transcript, cleanup rules, local vs cloud transcript differences |
| Transcript is right but action is wrong | Intent mismatch | Intent classification, command parsing, instruction boundaries |
| Follow-up turns lose continuity | Memory or session drift | Session state, reset logic, persisted context |
| Tool should run but does not | Tool execution failure | Command dispatch, permissions, fallback behavior |
| Multi-step task slowly falls apart | Long-run degradation | Step-to-step state carryover, intermediate rewrites, recovery logic |
| Output sounds confident but feels unreliable | Evaluation blind spots | Trace visibility, symptom labeling, path-level inspection |

## Quick diagnostic workflow

When a voice workflow fails, do not start by asking “which model is bad?”

Start here instead:

1. **Check the transcript**
   - What exactly did the system think the user said?

2. **Check the intent boundary**
   - Was this supposed to be dictation, a command, or a multi-step assistant task?

3. **Check state and memory**
   - Did the system carry the right context forward?

4. **Check tool execution**
   - Did the action layer fail after the reasoning layer succeeded?

5. **Check the full path, not just the final answer**
   - transcript → intent → context → tool → result

## Example failure patterns in a Jarvis-style pipeline

### Example A: transcription drift

User says:
> “open notion and create a note called sprint review”

System transcript becomes:
> “open motion and create a note called sprint review”

Result:
- the wrong app opens
- the system may look like it misunderstood intent, but the earlier failure was transcription drift

### Example B: command vs dictation confusion

User says:
> “write an email to sam saying I will be ten minutes late”

If the system treats this as a direct command without preserving dictation intent, it may:
- open mail too early
- generate the wrong tone
- execute an unwanted action before the user confirms

### Example C: session drift

User says:
> “summarize this into bullets”
Then later:
> “now rewrite it in a warmer tone”

If the prior context is not preserved correctly, the second instruction may act on the wrong text or on a stale intermediate result.

## Recommended mindset

Voice reliability problems are usually not one big bug.

They are often small boundary failures between:
- hearing
- interpreting
- remembering
- acting
- evaluating

If you debug those boundaries explicitly, Jarvis becomes much easier to improve.

## Scope of this guide

This page is intentionally practical and docs-first.

It does not require changes to Jarvis core code.
It is meant to give contributors and users a shared language for isolating where voice workflows fail first.
