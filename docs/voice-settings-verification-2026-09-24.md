# Local voice settings — September 24, 2026

Implemented in the Mac app: Settings → Shua voice. Lists voices returned by
AVSpeechSynthesisVoice, saves identity and 0.7–1.3× rate in native UserDefaults,
offers Preview / Stop, and refreshes the installed inventory. Automatic selection
prefers English, then male, then installed quality, then Daniel at equal quality.
Explicit voice choices take precedence. Missing saved voices use a visible fallback.

No mic access, API key, network synthesis, automatic speech, or permission change.
This is a settings/preview slice, **not** the full Shua conversational agent.
Neural TTS, continuous recognition, interruption, and orchestration remain pending.
No claim that built-in Daniel is the best or most realistic free voice.

## Verification

- `pnpm test`: 27 files, 184 tests passed.
- `pnpm typecheck`: exit 0.
- `swift test --package-path apps/mac`: 12 tests passed; no Swift compiler warnings.
- Preference tests cover persistence, rejected invalid speed, explicit voice selection,
  missing-voice fallback, empty inventory, and Daniel tie preference. The latter was
  observed failing (legacy voice selected), then passing after the ranking change.
- `pnpm --filter @shuacrew/web build`: success. Existing CSS optimizer warning for
  `::highlight(find)` remains; unrelated to voice settings.
- `git diff --check`: exit 0.
- `bash apps/mac/scripts/install.sh`: installed `/Applications/ShuaCrew.app`;
  previous app retained at `/Applications/ShuaCrew.backup-20260924-213104.app`.
- Native UI: new section visible, Automatic resolved to Daniel, preview changed to
  “Playing preview on this Mac…” / “Stop preview”; stopped preview, inspected voices,
  selected explicit Daniel, and observed saved selection. Screenshot layout inspected.
  This verifies the native UI/bridge flow, not subjective sound quality or latency.
- Independent read-only code review: no blocking findings; corrected Automatic label
  so an explicit selection does not mislabel the automatic default.

App left on Shua voice settings with Daniel selected and normal (1.0×) speed.
No commit or push. No existing chat, appearance, or permission preferences changed
in this slice.
