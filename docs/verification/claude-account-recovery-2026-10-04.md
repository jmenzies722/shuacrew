# Claude account diagnosis and recovery — October 4, 2026

The previous conclusion that Claude was generally unavailable was too broad. Both saved logins report Pro; authentication status alone does not verify execution.

## Reproduction

Ran the installed `claude` CLI directly in a disposable empty directory, using `-p`, `--output-format json`, `--tools ''`, `--strict-mcp-config`, empty MCP configuration, `--setting-sources ''`, disabled hooks, and `--no-session-persistence`. No API credentials, account logout, or policy overrides were introduced.

- Default saved login: exit 1, `is_error:true`, subscription-access-disabled error.
- Additional saved login (`claude-accounts/2`): exit 0, `is_error:false`, exact `SHUA_READY`.

This proves the issue differs by saved account, not that Claude is unavailable to the user or that Shua's SDK is universally blocked. It does not establish why the default account's provider-side entitlement is rejected. The same wording is reported by personal subscribers on Anthropic's issue tracker.

## Recovery

Added explicit `claude.accountId` selection to gateway runtime configuration. Set `~/.shuacrew/runtimes.json` to select existing account `2`. Existing login stores and terminal sessions unchanged. The selected account fails explicitly if missing or signed out; it does not silently run through another login. Ordinary unselected account pooling remains unchanged.

Restarted only Shua gateway after checking no active agent tasks. Real gateway run `r_7ced495e`, model `claude-sonnet-5`, finished with status `done` and message `SHUA_READY`.

```text
node node_modules/vitest/vitest.mjs run packages/runtimes/src/claude-accounts.test.ts packages/runtimes/src/claude.test.ts apps/gateway/src/openai-policy.test.ts
3 files passed; 15 tests passed
node node_modules/typescript/bin/tsc --noEmit -p packages/runtimes
node node_modules/typescript/bin/tsc --noEmit -p apps/gateway
exit 0
git diff --check
exit 0
```

The explicit-account regression was observed failing before implementation. Additional regression verifies a signed-out selected login cannot fall through to the global login.

## Research

- [Anthropic: Agent SDK and Claude subscriptions](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): June 15 changes paused; current notice says SDK, print-mode and third-party app usage still draw from subscription usage limits.
- [Anthropic: Pro/Max Claude Code access](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan): subscription access remains supported.
- [Personal Pro report in Anthropic's tracker](https://github.com/anthropics/claude-code/issues/91834): same error despite personal subscription; user report, not a confirmed diagnosis of this account.

No commit or push. No API billing enabled. Default account remains unresolved; Shua now uses the independently verified working account.
