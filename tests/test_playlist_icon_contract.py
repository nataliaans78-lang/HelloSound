from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "docs" / "app" / "index.html").read_text(encoding="utf-8")
CSS = (ROOT / "docs" / "app" / "style" / "style.css").read_text(encoding="utf-8")


def css_block(selector: str) -> str:
    pattern = re.compile(rf"{re.escape(selector)}\s*\{{(?P<body>.*?)\}}", re.S)
    match = pattern.search(CSS)
    if not match:
      raise AssertionError(f"Missing CSS block for {selector}")
    return match.group("body")


class PlaylistIconContractTests(unittest.TestCase):
    def test_html_uses_playlist_icon_btn_only_for_clear_and_search(self):
        clear_match = re.search(r'<button id="playlist-clear-btn" class="([^"]+)"', HTML)
        search_match = re.search(r'<button id="playlist-tools-toggle" class="([^"]+)"', HTML)

        self.assertIsNotNone(clear_match)
        self.assertIsNotNone(search_match)
        self.assertEqual(clear_match.group(1), "playlist-icon-btn")
        self.assertEqual(search_match.group(1), "playlist-icon-btn")

    def test_shared_playlist_icon_btn_styles_exist(self):
        block = css_block(".playlist-icon-btn")
        expected = [
            "width: 38px;",
            "height: 38px;",
            "min-width: 38px;",
            "min-height: 38px;",
            "padding: 0;",
            "border-radius: 10px;",
            "border: 1px solid rgba(255,255,255,0.14);",
            "background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.04));",
            "display: inline-flex;",
            "align-items: center;",
            "justify-content: center;",
            "box-shadow:",
        ]
        for item in expected:
            self.assertIn(item, block)

    def test_shared_playlist_icon_img_styles_exist(self):
        block = css_block(".playlist-icon-btn img")
        for item in ["width: 18px;", "height: 18px;", "opacity: 0.9;", "display: block;"]:
            self.assertIn(item, block)

    def test_wrappers_are_neutral_layout_only(self):
        block = css_block("#playlist-tools,\n#playlist-actions")
        expected = [
            "position: relative;",
            "display: none;",
            "align-items: center;",
            "justify-content: center;",
            "width: 38px;",
            "min-width: 38px;",
            "min-height: 38px;",
            "opacity: 0;",
            "pointer-events: none;",
            "background: transparent;",
            "border: 0;",
            "box-shadow: none;",
        ]
        for item in expected:
            self.assertIn(item, block)

    def test_legacy_playlist_tools_toggle_blocks_are_gone(self):
        legacy_selectors = [
            ".playlist-tools-toggle {",
            ".playlist-tools-toggle.active {",
            ".playlist-tools-toggle img {",
            "#playlist-tools > .playlist-tools-toggle,",
            "#playlist-tools > .playlist-tools-toggle {",
        ]
        for selector in legacy_selectors:
            self.assertNotIn(selector, CSS)

    def test_clear_button_no_longer_has_legacy_gradient_block(self):
        block = css_block("#playlist-actions #playlist-clear-btn")
        self.assertNotIn("background:", block)
        self.assertNotIn("border:", block)
        self.assertNotIn("box-shadow:", block)


if __name__ == "__main__":
    unittest.main()
