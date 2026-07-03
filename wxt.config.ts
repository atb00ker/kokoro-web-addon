import {
  DEFAULT_CHROME_MANIFEST_KEY,
  DEFAULT_FIREFOX_EXTENSION_ID,
} from "./src/scripts/extension-identity";
import {
  MANIFEST_CHROME_SIDEBAR_SHORTCUT_KEYS,
  MANIFEST_FIREFOX_SIDEBAR_SHORTCUT_KEYS,
} from "./src/extension/lib/defaults";
import { envOrDefault, loadEnvFile } from "./src/scripts/load-env";
import { defineConfig } from "wxt";

loadEnvFile();
const FIREFOX_EXTENSION_ID = envOrDefault(
  "FIREFOX_EXTENSION_ID",
  DEFAULT_FIREFOX_EXTENSION_ID,
);
const CHROME_MANIFEST_KEY = envOrDefault(
  "CHROME_MANIFEST_KEY",
  DEFAULT_CHROME_MANIFEST_KEY,
);

const ICON = "kokoro-web.png";

export default defineConfig({
  browser: "firefox",
  srcDir: "src/extension",
  publicDir: "src/assets",
  outDir: ".output",
  manifest: ({ browser }) => ({
    name: "Kokoro Web",
    description: "Read text aloud using locally installed kokoro-tts",
    permissions: [
      "nativeMessaging",
      "contextMenus",
      "storage",
      "clipboardWrite",
      "activeTab",
      "scripting",
      "tabs",
      ...(browser === "chrome" ? (["offscreen", "sidePanel"] as const) : []),
    ],
    icons: {
      16: ICON,
      32: ICON,
      48: ICON,
      96: ICON,
      128: ICON,
    },
    action: {
      default_icon: {
        16: ICON,
        32: ICON,
        48: ICON,
      },
      default_title: "Kokoro Web",
    },
    commands: {
      "open-read-along-sidebar": {
        suggested_key:
          browser === "chrome"
            ? MANIFEST_CHROME_SIDEBAR_SHORTCUT_KEYS
            : MANIFEST_FIREFOX_SIDEBAR_SHORTCUT_KEYS,
        description: "Toggle Kokoro: Read along sidebar",
      },
    },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_EXTENSION_ID,
              strict_min_version: "109.0",
              data_collection_permissions: {
                required: ["websiteContent"],
              },
            },
          },
        }
      : {}),
    ...(browser === "chrome" ? { key: CHROME_MANIFEST_KEY } : {}),
  }),
  webExt: {
    disabled: true,
    chromiumArgs: ["--user-data-dir=./.wxt/chrome-data"],
  },
});
