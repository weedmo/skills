"""Decision-graph data checks, run by loop-report's render.py before it writes.

validate(data) -> list of error strings (empty when the data renders right).
The common keys (title, progress, outcome files) are checked by render.py;
this covers what only the decision graph knows about.
"""
import json

STAGE_STATUSES = {"done", "in-progress", "pending", "skipped"}
TICKET_STATUSES = {"pending", "in-progress", "done", "blocked", "skipped"}
WAVE_MODES = {"parallel", "sequential"}


def validate(d):
    errors = []
    if not isinstance(d.get("stages"), list):
        return ["missing top-level key: stages (a list)"]
    seen = set()
    for st in d["stages"]:
        for key in ("id", "name", "status"):
            if key not in st:
                errors.append("stage without " + key + ": " + json.dumps(st, ensure_ascii=False)[:80])
        if st.get("status") not in STAGE_STATUSES:
            errors.append("stage %s has unknown status %r" % (st.get("id"), st.get("status")))
        for dec in st.get("decisions", []) or []:
            for key in ("id", "question", "decision", "rationale"):
                if key not in dec:
                    errors.append("decision without " + key + ": " + json.dumps(dec, ensure_ascii=False)[:80])
            if dec.get("id") in seen:
                errors.append("duplicate decision id: " + str(dec.get("id")))
            seen.add(dec.get("id"))
            if dec.get("source") and not dec.get("change"):
                # A decision carried in from a spec (design-map) must render as a
                # full before → after node, never the degraded single line.
                errors.append("decision %s has source but no change" % dec.get("id"))
    ticket_ids = set()
    for tk in d.get("tickets", []) or []:
        ticket_ids.add(tk.get("id"))
        if tk.get("status") not in TICKET_STATUSES:
            errors.append("ticket %s has unknown status %r" % (tk.get("id"), tk.get("status")))
        if tk.get("status") == "blocked":
            b = tk.get("blocker") or {}
            if not b.get("reason") or not b.get("detail"):
                errors.append("blocked ticket %s needs blocker.reason and blocker.detail" % tk.get("id"))
    # blockedBy is drawn as a dependency edge, so a dangling id is a missing
    # edge nobody would notice on the page.
    for tk in d.get("tickets", []) or []:
        for dep in tk.get("blockedBy", []) or []:
            if dep not in ticket_ids:
                errors.append("ticket %s is blockedBy unknown ticket %s" % (tk.get("id"), dep))
    plan = d.get("plan")
    if plan:
        for w in plan.get("waves", []) or []:
            if w.get("mode") not in WAVE_MODES:
                errors.append("wave %s needs mode parallel|sequential" % w.get("id"))
            if not w.get("why"):
                errors.append("wave %s needs a why" % w.get("id"))
            for tid in w.get("tickets", []) or []:
                if tid not in ticket_ids:
                    errors.append("wave %s names unknown ticket %s" % (w.get("id"), tid))
    if d.get("outcome") is not None and not d.get("review"):
        # matt-auto always runs its review pass, small path included; a results
        # panel without the review lane is half a report.
        errors.append("outcome present but no review block — the final regeneration carries the review pass")
    return errors
