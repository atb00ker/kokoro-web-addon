"""Tests for cross-platform native messaging host installation paths."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest import mock

from system.config import (
    CHROME_EXTENSION_ID,
    FIREFOX_EXTENSION_ID,
    HOST_NAME,
)
from system.install import (
    FIREFOX_WINDOWS_REGISTRY_BASE,
    SetupOptions,
    all_browser_specs,
    browser_is_installed,
    browser_manifest_dir,
    browser_target,
    chrome_manifest,
    firefox_manifest,
    parse_setup_args,
    resolve_browsers,
    skipped_browser_labels,
)


def chromium_browser_targets() -> list:
    return [
        browser_target(spec)
        for spec in all_browser_specs()
        if spec.kind == "chromium"
    ]


def firefox_manifest_dir() -> Path:
    firefox = next(spec for spec in all_browser_specs() if spec.id == "firefox")
    path = browser_manifest_dir(firefox)
    assert path is not None
    return path


class FirefoxManifestDirTests(unittest.TestCase):
    def test_linux_path(self) -> None:
        with mock.patch("system.install.sys.platform", "linux"):
            expected = Path.home() / ".mozilla" / "native-messaging-hosts"
            self.assertEqual(firefox_manifest_dir(), expected)

    def test_macos_path(self) -> None:
        with mock.patch("system.install.sys.platform", "darwin"):
            expected = (
                Path.home()
                / "Library"
                / "Application Support"
                / "Mozilla"
                / "NativeMessagingHosts"
            )
            self.assertEqual(firefox_manifest_dir(), expected)


class ChromiumBrowserTargetsTests(unittest.TestCase):
    def test_linux_targets(self) -> None:
        with (
            mock.patch("system.install.os.name", "posix"),
            mock.patch("system.install.sys.platform", "linux"),
        ):
            targets = chromium_browser_targets()

        self.assertEqual(len(targets), 4)
        labels = [target.label for target in targets]
        self.assertEqual(labels, ["Chrome", "Chromium", "Edge", "Brave"])

        config_home = Path.home() / ".config"
        self.assertEqual(
            targets[0].manifest_dir,
            config_home / "google-chrome" / "NativeMessagingHosts",
        )
        self.assertEqual(
            targets[1].manifest_dir,
            config_home / "chromium" / "NativeMessagingHosts",
        )
        self.assertEqual(
            targets[2].manifest_dir,
            config_home / "microsoft-edge" / "NativeMessagingHosts",
        )
        self.assertEqual(
            targets[3].manifest_dir,
            config_home
            / "BraveSoftware"
            / "Brave-Browser"
            / "NativeMessagingHosts",
        )

    def test_macos_targets(self) -> None:
        with (
            mock.patch("system.install.os.name", "posix"),
            mock.patch("system.install.sys.platform", "darwin"),
        ):
            targets = chromium_browser_targets()

        home = Path.home()
        self.assertEqual(
            targets[0].manifest_dir,
            home
            / "Library"
            / "Application Support"
            / "Google"
            / "Chrome"
            / "NativeMessagingHosts",
        )
        self.assertEqual(
            targets[3].manifest_dir,
            home
            / "Library"
            / "Application Support"
            / "BraveSoftware"
            / "Brave-Browser"
            / "NativeMessagingHosts",
        )

    def test_windows_targets(self) -> None:
        with mock.patch("system.install.os.name", "nt"):
            targets = chromium_browser_targets()

        self.assertEqual(len(targets), 4)
        self.assertTrue(all(target.manifest_dir is None for target in targets))
        registry_bases = [target.windows_registry_base for target in targets]
        self.assertIn(
            r"Software\Google\Chrome\NativeMessagingHosts",
            registry_bases,
        )
        self.assertIn(
            r"Software\Microsoft\Edge\NativeMessagingHosts",
            registry_bases,
        )
        self.assertIn(
            r"Software\BraveSoftware\Brave-Browser\NativeMessagingHosts",
            registry_bases,
        )


class BrowserDetectionTests(unittest.TestCase):
    def test_browser_is_installed_when_detect_path_exists(self) -> None:
        firefox = all_browser_specs()[0]
        detect_path = mock.Mock(spec=Path)
        detect_path.exists.return_value = True

        with mock.patch(
            "system.install.browser_detect_paths",
            return_value=[detect_path],
        ):
            self.assertTrue(browser_is_installed(firefox))

    def test_browser_is_installed_false_when_no_paths_exist(self) -> None:
        firefox = all_browser_specs()[0]
        with mock.patch(
            "system.install.browser_detect_paths",
            return_value=[Path("/tmp/missing-firefox")],
        ):
            with mock.patch.object(Path, "exists", return_value=False):
                self.assertFalse(browser_is_installed(firefox))


class ResolveBrowsersTests(unittest.TestCase):
    def test_resolve_all_flag(self) -> None:
        selected = resolve_browsers(SetupOptions(install_all=True))
        self.assertEqual(
            [spec.id for spec in selected],
            [spec.id for spec in all_browser_specs()],
        )
        self.assertEqual(len(selected), 5)

    def test_resolve_explicit_browser(self) -> None:
        with mock.patch(
            "system.install.browser_is_installed", return_value=False
        ):
            selected = resolve_browsers(SetupOptions(browsers=("edge",)))
        self.assertEqual([spec.id for spec in selected], ["edge"])

    def test_resolve_auto_detect_filters_installed(self) -> None:
        def installed(spec: object) -> bool:
            return getattr(spec, "id", None) == "firefox"

        with mock.patch(
            "system.install.browser_is_installed", side_effect=installed
        ):
            selected = resolve_browsers(SetupOptions())
        self.assertEqual([spec.id for spec in selected], ["firefox"])

    def test_resolve_auto_detect_exits_when_none_found(self) -> None:
        with mock.patch(
            "system.install.browser_is_installed", return_value=False
        ):
            with self.assertRaises(SystemExit) as context:
                resolve_browsers(SetupOptions())
        self.assertIn("No supported browsers detected", str(context.exception))

    def test_resolve_explicit_dedupes(self) -> None:
        selected = resolve_browsers(
            SetupOptions(browsers=("chrome", "chrome", "edge"))
        )
        self.assertEqual([spec.id for spec in selected], ["chrome", "edge"])


class ParseSetupArgsTests(unittest.TestCase):
    def test_parse_auto_detect_by_default(self) -> None:
        options = parse_setup_args([])
        self.assertEqual(options.browsers, ())
        self.assertFalse(options.install_all)

    def test_parse_explicit_browsers(self) -> None:
        options = parse_setup_args(["firefox", "brave"])
        self.assertEqual(options.browsers, ("firefox", "brave"))

    def test_parse_all_flag(self) -> None:
        options = parse_setup_args(["--all"])
        self.assertTrue(options.install_all)

    def test_parse_rejects_all_with_browser_names(self) -> None:
        with self.assertRaises(SystemExit):
            parse_setup_args(["--all", "edge"])

    def test_parse_rejects_unknown_browser(self) -> None:
        with self.assertRaises(SystemExit):
            parse_setup_args(["opera"])

    def test_parse_normalizes_literal_empty_list_token(self) -> None:
        options = parse_setup_args(["[]"])
        self.assertEqual(options.browsers, ())
        self.assertFalse(options.install_all)


class SkippedBrowserLabelsTests(unittest.TestCase):
    def test_skipped_only_for_auto_detect(self) -> None:
        firefox = all_browser_specs()[0]
        skipped = skipped_browser_labels(SetupOptions(), [firefox])
        self.assertEqual(len(skipped), 4)

    def test_skipped_empty_for_explicit_selection(self) -> None:
        firefox = all_browser_specs()[0]
        skipped = skipped_browser_labels(
            SetupOptions(browsers=("firefox",)), [firefox]
        )
        self.assertEqual(skipped, [])


class ManifestPayloadTests(unittest.TestCase):
    def test_firefox_manifest(self) -> None:
        payload = firefox_manifest("/usr/local/bin/kokoro-web-host")
        self.assertEqual(payload["name"], HOST_NAME)
        self.assertEqual(payload["path"], "/usr/local/bin/kokoro-web-host")
        self.assertEqual(payload["allowed_extensions"], [FIREFOX_EXTENSION_ID])

    def test_chrome_manifest(self) -> None:
        payload = chrome_manifest("/usr/local/bin/kokoro-web-host")
        self.assertEqual(payload["name"], HOST_NAME)
        self.assertEqual(payload["path"], "/usr/local/bin/kokoro-web-host")
        self.assertEqual(
            payload["allowed_origins"],
            [f"chrome-extension://{CHROME_EXTENSION_ID}/"],
        )


class WindowsRegistryBaseTests(unittest.TestCase):
    def test_firefox_registry_base(self) -> None:
        self.assertEqual(
            FIREFOX_WINDOWS_REGISTRY_BASE,
            r"Software\Mozilla\NativeMessagingHosts",
        )


class InstallSelectionTests(unittest.TestCase):
    def test_browser_target_for_firefox_on_linux(self) -> None:
        firefox = all_browser_specs()[0]
        with (
            mock.patch("system.install.os.name", "posix"),
            mock.patch("system.install.sys.platform", "linux"),
        ):
            target = browser_target(firefox)
        self.assertEqual(
            target.manifest_dir,
            Path.home() / ".mozilla" / "native-messaging-hosts",
        )


if __name__ == "__main__":
    unittest.main()
