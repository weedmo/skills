#!/usr/bin/env python3
"""Deliver a loop-report page to where the user reads it.

    python3 deliver.py probe   --page <dir>/<slug>.html      # before the page exists is fine
    python3 deliver.py publish --page <dir>/<slug>.html
    python3 deliver.py show    --page <dir>/<slug>.html      # current state, no side effects

Routes, in order: the page opened once with the system opener (`xdg-open`,
`open` on macOS), or the bare path. The route is kept in
<dir>/<slug>.delivery.json, which only this script reads and writes. Every
call prints one JSON line on stdout:

    {"route": "open|path", "url": ..., "bin": ..., "reason": ..., "page": ...}

and exits 0 whenever it answered — a run nobody could open is an answer, not
an error. Exit 1 only when `publish` is given a page that does not exist, or
for bad arguments. The page is opened once per run; later publishes leave the
viewer alone, because the page reloads itself.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

STATE_KEYS = ("route", "bin", "url", "opened", "reason")
OPEN_WAIT = 5


def out(state, extra=None):
    d = {k: state.get(k) for k in ("route", "url", "bin", "reason")}
    if extra:
        d.update(extra)
    print(json.dumps(d, ensure_ascii=False))


def fail(msg):
    print(json.dumps({"route": None, "error": msg}, ensure_ascii=False))
    sys.exit(1)


class State:
    def __init__(self, page):
        self.page = os.path.abspath(page)
        base = self.page[:-5] if self.page.endswith(".html") else self.page
        self.path = base + ".delivery.json"
        self.data = {k: None for k in STATE_KEYS}
        if os.path.isfile(self.path):
            try:
                with open(self.path, encoding="utf-8") as fh:
                    saved = json.load(fh)
                for k in STATE_KEYS:
                    if k in saved:
                        self.data[k] = saved[k]
            except (OSError, ValueError):
                pass

    def get(self, k):
        return self.data.get(k)

    def set(self, **kw):
        self.data.update(kw)

    def save(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")


def pick_opener(override=None):
    """The system opener, or (None, why). A Linux session without a display
    has nothing to open a page in, so it is a path route, not a failure."""
    if override:
        return (override, None) if shutil.which(override) else (None, "%s not on PATH" % override)
    if sys.platform == "darwin":
        name = "open"
    elif sys.platform.startswith("linux"):
        if not (os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")):
            return None, "no display in this session"
        name = "xdg-open"
    else:
        return None, "no system opener for %s" % sys.platform
    return (name, None) if shutil.which(name) else (None, "%s not on PATH" % name)


def launch(opener, page):
    """Start the opener detached. Some openers stay alive as the viewer, so
    still running after OPEN_WAIT seconds counts as opened."""
    try:
        p = subprocess.Popen([opener, page], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as e:
        return False, str(e)
    try:
        code = p.wait(timeout=OPEN_WAIT)
    except subprocess.TimeoutExpired:
        return True, None
    return (True, None) if code == 0 else (False, "%s exited %d" % (opener, code))


def probe(state, override):
    opener, why = pick_opener(override)
    if opener:
        state.set(route="open", bin=opener, reason=None)
    else:
        state.set(route="path", bin=None, reason=why + " — path only")
    state.save()


def publish(state, override):
    state.set(url="file://" + state.page)
    if state.get("opened"):
        state.set(route="open", reason=None)
        state.save()
        return
    opener, why = pick_opener(override)
    if opener:
        ok, why = launch(opener, state.page)
        if ok:
            state.set(route="open", bin=opener, opened=True, reason=None)
            state.save()
            return
    state.set(route="path", bin=None, reason=why + " — path only")
    state.save()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("verb", choices=("probe", "publish", "show"))
    ap.add_argument("--page", required=True, help="the rendered <slug>.html (probe/show accept a page that does not exist yet)")
    ap.add_argument("--bin", default=os.environ.get("LOOP_REPORT_OPEN_BIN"), help="force the opener executable")
    args = ap.parse_args()
    if args.verb == "publish" and not os.path.isfile(args.page):
        fail("page not found: " + args.page)
    state = State(args.page)
    if args.verb == "probe":
        os.makedirs(os.path.dirname(state.page), exist_ok=True)
        probe(state, args.bin)
    elif args.verb == "publish":
        publish(state, args.bin)
    out(state.data, {"page": state.page})


if __name__ == "__main__":
    main()
