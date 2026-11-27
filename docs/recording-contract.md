# Recorded actions and recovery

`recordedSteps` retains the legacy event/target fields for old desktop clients and stores the canonical action JSON under `contract`. The session is one recordingId within the group, not a separate Mongo database. Records link previous/next step IDs; automatic upload never asks the assistant to save individual actions.

The native capture supplies Windows UI Automation (`uia`) or macOS Accessibility (`ax`) identity, ancestor names, supported patterns, normalized bounds, environment information and timestamped observations before/after an action. Unknown data is null. Pre-state is a cached observation, not a guaranteed immediate snapshot. Post-state is observed about 400 ms later, and can include unrelated concurrent changes. No screenshots or typed input contents are stored. Window titles and accessible labels are context and can still contain application data.

Keyboard shortcut records retain only whitelisted key names (`A`–`Z`, `0`–`9`, `F1`–`F12`, `Delete`, `Escape`, `Tab`, or `Enter`) and modifiers. Ordinary text entry is represented as a `type` event with `typedText: null`.

Initial actions are uploaded first. A subsequent enrichment with the same eventId updates only the observed post-state, without incrementing sequence or action counts. Retries of existing events remain accepted after stop; new events do not. Group authorization applies to both.

The encrypted desktop journal persists queued actions before attempting upload and restores paused after restart. A lost HTTP response is retried using the same eventId. A pending stop is retried after the queue drains. Group expiration/closure still prevents upload: retention is seven days.

Acknowledgements distinguish locator resolution from `interaction: target-clicked` and `outcome: observed | not-observed | unverifiable`. Observed means recorded UI state changes were matched, not that a whole task was completed. Unchanged or missing observations are unverifiable.

Supported replay strategies remain UIA AutomationId or AXIdentifier and unique role/name. Browser DOM selectors, canvas/visual matching, automatic prerequisite inference, and arbitrary app coverage are not implemented. `contract.meta.unsupported` records these limitations.
