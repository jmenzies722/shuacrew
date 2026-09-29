# Onboarding reset and test-data cleanup

Removed only the two teaching lessons created by the assistant during verification:
- `teach_2d45f456-e1da-4ec0-99ce-edeca5164d8c` — recursion example.
- `teach_96121e47-e5c6-4690-9912-201452f3383b` — upload practice fixture.

Gateway was stopped before the atomic JSON replacement and restarted afterward. All other lesson records would have been retained; these were the only two records. No real session, project, credential, learning record, or preference was erased. No session used the mock runtime, and SHUACREW_DEMO was not enabled in the service configuration. This is targeted test-data cleanup, not a factory data wipe.

Backup: `/Users/admin/.shuacrew/backups/onboarding-20260927-214339`. Private directory and files; SQLite online backup verified with integrity_check. Contains the original database, teaching lessons, learning data, settings, settings history, and a cleanup manifest. Provider credentials were not read or copied.

Verified the 16,540 pre-cleanup event sequence/hash pairs still match the backup exactly. New events from the resumed real session remain valid. learning.json, settings.json, and settings-history.json match the backup byte-for-byte. Claude, Codex, and local report installed and signed in; this does not claim they have unlimited usage quota.

Final read-only commands:
```sh
curl -fsS http://127.0.0.1:7420/api/audit/verify
curl -fsS http://127.0.0.1:7420/api/teaching
python3 -c "import sqlite3; c=sqlite3.connect('file:/Users/admin/.shuacrew/shuacrew.db?mode=ro',uri=True); print(c.execute('pragma integrity_check').fetchone()[0])"
```

Results: audit `ok: true`; teaching `active: null`, `lessons: []`, `document: null`, `busy: false`; database integrity `ok`. Structural consistency is verified; this does not establish that every saved real-world fact is semantically correct.

Used the native Mac app's Settings → Spark → Guidance → Replay welcome. Verified the visible first onboarding step, with robot choice, name, color, and Continue. Left onboarding unfinished for the user. Their existing preferences remain editable and their model logins/OS permissions remain intact.

No commit or push.
