import { OFFSCREEN_PLAYER_MESSAGE } from "../lib/audio/offscreen-messages";
import { handleExtensionMessageSafely } from "../lib/message-handlers";
import { OPEN_READ_ALONG_SIDEBAR_COMMAND } from "../lib/defaults";
import {
  broadcastState,
  getPlayer,
  initSessionManager,
  setSessionError,
  startContextMenuReadAloud,
  startPageReadAloud,
} from "../lib/session-manager";
import { readPageTextFromTab } from "../lib/page-text/read-active-page";
import {
  configureSidePanelBehavior,
  initSidebarWindowTracking,
  openReadAlongSidebarFromCommand,
} from "../lib/sidebar";

export default defineBackground(() => {
  initSessionManager();

  initSidebarWindowTracking();
  void configureSidePanelBehavior();

  const player = getPlayer();

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === OFFSCREEN_PLAYER_MESSAGE) {
      return false;
    }

    void handleExtensionMessageSafely(message, { player }).then(sendResponse);
    return true;
  });

  async function setupContextMenus(): Promise<void> {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: "kokoro-read-selection",
      title: "Read with Kokoro",
      contexts: ["selection"],
    });
    browser.contextMenus.create({
      id: "kokoro-read-page",
      title: "Read page with Kokoro",
      contexts: ["page"],
    });
  }

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      void browser.runtime.openOptionsPage();
    }

    void setupContextMenus();
  });

  void setupContextMenus();

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "kokoro-read-selection" && info.selectionText?.trim()) {
      void startContextMenuReadAloud(info.selectionText);
      return;
    }

    if (info.menuItemId === "kokoro-read-page") {
      const tabId = tab?.id;
      if (tabId === undefined) {
        return;
      }

      void (async () => {
        const pageText = await readPageTextFromTab(tabId, tab?.url);
        if (!pageText.ok) {
          setSessionError(pageText.error);
          return;
        }

        await startPageReadAloud(pageText.text);
      })();
    }
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === OPEN_READ_ALONG_SIDEBAR_COMMAND) {
      openReadAlongSidebarFromCommand();
    }
  });

  void broadcastState();
});
