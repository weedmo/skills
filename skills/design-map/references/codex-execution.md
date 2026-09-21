# Legacy design-map execution handoff

Only read this for an explicit request to execute a previously confirmed
spec through design-map. Execution has moved to `$matt-auto --spec <path>`.
Load the installed matt-auto skill and follow its execution-only protocol;
legacy `design-map: 1` specs are accepted. Reuse the user's execution request,
but never infer one from design confirmation or a visualization request.

Do not use the old direct/Gemini implementation protocol or its reviewer fields.
The execution skill owns current routing, verification, independent review, and
optional shipping. If matt-auto is unavailable, report the missing matt-loop
plugin and provide the command; do not implement inside design-map.
