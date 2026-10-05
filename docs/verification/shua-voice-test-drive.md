# Shua test drive

Installed workspace: Today · Projects · Crew · Learning · Automations · Library.
Start with the UI checks below. Voice phrases are acceptance prompts for your microphone and account, not a claim that every speech path was automated in this verification.

## 1. Teach a short workflow

Click **Watch me** in the notch. Demonstrate a short action in TextEdit; click **Finish recording**. Check the captured steps before saving. A missed action must say it needs help; recording must not claim a successful replay.

Optional Fn phrases: “Watch me” and “Stop recording”. If continuous voice interprets these differently, use the verified button flow.

Sable: the original running sessions were preserved. Recording its terminal input needs the staged Sable update on a future restart. The updated component passed isolated capture and two exact replay checks.

## 2. See your crew

Open **Crew**, select Rhea, inspect the source-linked session, then press Escape. Focus returns to the station. Switch between Studio and List view. Use Fit after zooming.

Ask: “What is my crew working on? Use recorded status and tell me if nobody is running.”
Expected: real task names, or a clear idle answer. No invented active agents.

## 3. Learn and get feedback

Open **Learning → Continue lesson**. Read, type an explanation in the exercise panel, and click **Get feedback**. Return to the path and reopen the lesson: the draft and source-session feedback remain. Completion is manual, separate from mastery.

Ask: “Explain the difference between IAM permissions and network access using one example. Do not run commands.”
Expected: explanation only. The lesson workspace's own Get feedback action was verified with Codex and zero tool calls.

## 4. Explore a visual

From a lesson, open **Visual explanation**. Its visual document is associated with that lesson; the lesson text is provided as context. Review the prefilled question and ask it. Select diagram items and step through the explanation. Saved standalone diagrams remain under Visual workspace.

Prompt: “Show a browser, an API, and a database as a three-part request flow. Explain request and response in two steps.”
Expected: a saved diagram and real steps; model errors remain visible. A real Codex generation of Request Journey passed during verification.

## 5. Turn learning into a project

Open **Projects → Recommended projects → Review project idea**. Check the title, deliverable, and goal. The goal retains the source roadmap ID. Create only a project you actually want; reviewing an idea does not launch work.

## 6. Reuse results

Open **Automations** for playbooks and schedules; Mac demonstrations remain in notch teaching. Open **Library** to search existing artifacts and follow their source. Pending playbook reviews remain pending until you decide.

Ask: “Help me plan a small project around my next learning milestone. Prepare a proposal; don't launch agents yet.”

## Stop and failure checks

Use the visible Stop control during assistant work. If a permission is absent, expect a specific blocked state, not a claim of success. Do not approve a consequential action merely to pass a test.

## Fresh foundation test — October 4

Start at the open setup screen. Enter your goal and weekly hours; Both paths is selected. Run Test Codex response. Claude remains connected but its organization currently rejects Claude Code subscription execution.

1. Open a disposable TextEdit document. Say “Watch me.” Type a short note, then say “Stop recording.”
2. Review the captured text and steps, name the workflow, and Save. Say “Replay my last workflow.” Check actual text and verified completion.
3. Teach a new correction if the target changes. Escape or taking over stops replay. A checkpoint is not executable; do not treat terminal Return as verified shell submission.
4. Ask “What is in my Library?” New live calls should not create saved artifacts automatically.
5. Say a short question, interrupt mid-response, and report microphone, speaker and interrupt results separately in setup.

Sable's signed terminal-input update requires its pending restart. Existing Sable sessions include the agent doing this work and another Claude session; they were not terminated. See the foundation verification report for exact evidence and restore location.
