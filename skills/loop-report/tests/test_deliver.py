"""deliver.py against the fake opener next to this file. Nothing is opened:

    python3 -m unittest skills/loop-report/tests/test_deliver.py
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
DELIVER = os.path.join(HERE, "..", "assets", "deliver.py")
FAKE = os.path.join(HERE, "fake-opener")
OPENER = "open" if sys.platform == "darwin" else "xdg-open"


class DeliverTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.bindir = os.path.join(self.tmp, "bin")
        os.makedirs(self.bindir)
        shutil.copy(FAKE, os.path.join(self.bindir, OPENER))
        os.chmod(os.path.join(self.bindir, OPENER), 0o755)
        # A PATH with only what the fake needs, so the real opener can never run.
        self.tools = os.path.join(self.tmp, "tools")
        os.makedirs(self.tools)
        for tool in ("bash", "env", "printf"):
            real = shutil.which(tool)
            if real:
                os.symlink(real, os.path.join(self.tools, tool))
        self.page = os.path.join(self.tmp, "run.html")
        with open(self.page, "w") as fh:
            fh.write("<html></html>")
        self.log = os.path.join(self.tmp, "calls.log")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def run_deliver(self, verb, extra=(), env=None, with_bin=True, display=True):
        e = {k: v for k, v in os.environ.items()
             if k not in ("LOOP_REPORT_OPEN_BIN", "DISPLAY", "WAYLAND_DISPLAY")}
        e["PATH"] = (self.bindir + os.pathsep if with_bin else "") + self.tools
        e["FAKE_OPEN_LOG"] = self.log
        if display:
            e["DISPLAY"] = ":99"
        e.update(env or {})
        p = subprocess.run([sys.executable, DELIVER, verb, "--page", self.page] + list(extra),
                           capture_output=True, text=True, env=e)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)
        return json.loads(p.stdout.strip().splitlines()[-1])

    def calls(self):
        if not os.path.isfile(self.log):
            return []
        with open(self.log) as fh:
            return [l.strip() for l in fh if l.strip()]

    def test_probe_with_an_opener(self):
        r = self.run_deliver("probe")
        self.assertEqual(r["route"], "open")
        self.assertEqual(r["bin"], OPENER)
        self.assertEqual(self.calls(), [])

    def test_probe_without_an_opener_is_path(self):
        r = self.run_deliver("probe", with_bin=False)
        self.assertEqual(r["route"], "path")
        self.assertIsNone(r["bin"])
        self.assertIn("path only", r["reason"])

    @unittest.skipUnless(sys.platform.startswith("linux"), "display check is Linux-only")
    def test_no_display_is_path(self):
        r = self.run_deliver("publish", display=False)
        self.assertEqual(r["route"], "path")
        self.assertIn("no display", r["reason"])
        self.assertEqual(self.calls(), [])

    def test_publish_opens_once(self):
        first = self.run_deliver("publish")
        self.assertEqual(first["route"], "open")
        self.assertEqual(first["url"], "file://" + self.page)
        second = self.run_deliver("publish")
        self.assertEqual(second["route"], "open")
        self.assertEqual(self.calls(), [self.page])

    def test_failed_open_is_path_and_retried_next_time(self):
        r = self.run_deliver("publish", env={"FAKE_OPEN_FAIL": "1"})
        self.assertEqual(r["route"], "path")
        self.assertIn("exited 3", r["reason"])
        again = self.run_deliver("publish")
        self.assertEqual(again["route"], "open")
        self.assertIsNone(again["reason"])
        self.assertEqual(len(self.calls()), 2)

    def test_bin_override(self):
        other = os.path.join(self.bindir, "my-viewer")
        shutil.copy(FAKE, other)
        os.chmod(other, 0o755)
        r = self.run_deliver("publish", extra=["--bin", "my-viewer"], display=False)
        self.assertEqual(r["route"], "open")
        self.assertEqual(r["bin"], "my-viewer")

    def test_probe_before_the_page_exists(self):
        os.remove(self.page)
        r = self.run_deliver("probe")
        self.assertEqual(r["route"], "open")
        self.assertTrue(os.path.isfile(self.page[:-5] + ".delivery.json"))

    def test_show_reports_state_without_side_effects(self):
        self.run_deliver("publish")
        before = self.calls()
        r = self.run_deliver("show")
        self.assertEqual(r["route"], "open")
        self.assertEqual(self.calls(), before)

    def test_missing_page_exits_1(self):
        p = subprocess.run([sys.executable, DELIVER, "publish", "--page", os.path.join(self.tmp, "nope.html")],
                           capture_output=True, text=True)
        self.assertEqual(p.returncode, 1)


if __name__ == "__main__":
    unittest.main()
