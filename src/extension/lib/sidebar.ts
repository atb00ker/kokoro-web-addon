import { getDefaultOpenSidebarShortcut, OPEN_READ_ALONG_SIDEBAR_COMMAND } from "./defaults";

type FirefoxBrowser = typeof browser & {
  sidebarAction?: {
    open(): Promise<void>;
    toggle(): Promise<void>;
  };
};

type ChromeSidePanel = {
  open(options: { tabId?: number; windowId?: number }): Promise<void>;
  close?(options: { tabId?: number; windowId?: number }): Promise<void>;
  setPanelBehavior?(options: { openPanelOnActionClick?: boolean }): Promise<void>;
  onOpened?: {
    addListener(callback: (info: { windowId: number; tabId?: number; path: string }) => void): void;
  };
  onClosed?: {
    addListener(callback: (info: { windowId: number; tabId?: number; path: string }) => void): void;
  };
};

type ChromeBrowser = typeof browser & {
  sidePanel?: ChromeSidePanel;
};

type CommandsWithUpdate = typeof browser.commands & {
  update?(details: { name: string; shortcut: string }): Promise<void>;
  openShortcutSettings?(): Promise<void>;
};

let lastFocusedWindowId: number | undefined;
const openSidePanelWindowIds = new Set<number>();

function getFirefoxBrowser(): FirefoxBrowser {
  return browser as FirefoxBrowser;
}

function getChromeBrowser(): ChromeBrowser {
  return browser as ChromeBrowser;
}

function getCommands(): CommandsWithUpdate {
  return browser.commands as CommandsWithUpdate;
}

function isFirefoxSidebarAvailable(): boolean {
  const sidebarAction = getFirefoxBrowser().sidebarAction;
  return typeof sidebarAction?.open === "function" && typeof sidebarAction?.toggle === "function";
}

function isChromeSidePanelAvailable(): boolean {
  return typeof getChromeBrowser().sidePanel?.open === "function";
}

export function isSidebarAvailable(): boolean {
  return isFirefoxSidebarAvailable() || isChromeSidePanelAvailable();
}

export function canCustomizeSidebarShortcut(): boolean {
  return typeof getCommands().update === "function";
}

export async function openExtensionShortcutSettings(): Promise<void> {
  const commands = getCommands();

  if (typeof commands.openShortcutSettings === "function") {
    await commands.openShortcutSettings();
    return;
  }

  if (isChromeSidePanelAvailable()) {
    await browser.tabs.create({ url: "chrome://extensions/shortcuts" });
    return;
  }

  await browser.tabs.create({ url: "about:addons" });
}

export function initSidebarWindowTracking(): void {
  if (!isChromeSidePanelAvailable()) {
    return;
  }

  const sidePanel = getChromeBrowser().sidePanel;
  sidePanel?.onOpened?.addListener((info) => {
    openSidePanelWindowIds.add(info.windowId);
  });
  sidePanel?.onClosed?.addListener((info) => {
    openSidePanelWindowIds.delete(info.windowId);
  });

  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== browser.windows.WINDOW_ID_NONE) {
      lastFocusedWindowId = windowId;
    }
  });

  void browser.windows.getLastFocused().then((window) => {
    if (window?.id !== undefined) {
      lastFocusedWindowId = window.id;
    }
  });
}

function isChromeSidePanelOpen(windowId: number): boolean {
  return openSidePanelWindowIds.has(windowId);
}

function toggleChromeSidePanelSyncWithContext(
  sidePanel: ChromeSidePanel,
  context: { windowId?: number; tabId?: number },
): void {
  const windowId = context.windowId;
  if (windowId !== undefined && isChromeSidePanelOpen(windowId) && sidePanel.close) {
    openSidePanelWindowIds.delete(windowId);
    void sidePanel.close({ windowId });
    return;
  }

  if (context.tabId !== undefined) {
    if (windowId !== undefined) {
      openSidePanelWindowIds.add(windowId);
    }
    void sidePanel.open({ tabId: context.tabId });
    return;
  }

  if (context.windowId !== undefined) {
    openSidePanelWindowIds.add(context.windowId);
    void sidePanel.open({ windowId: context.windowId });
  }
}

type ChromeTabsQueryTab = { id?: number; windowId?: number };

type ChromeTabsApi = {
  query: (
    queryInfo: { active: boolean; currentWindow: boolean },
    callback: (tabs: ChromeTabsQueryTab[]) => void,
  ) => void;
};

function queryActiveTab(callback: (tab: ChromeTabsQueryTab | undefined) => void): void {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: { tabs?: ChromeTabsApi } })
    .chrome;
  if (!chromeApi?.tabs?.query) {
    callback(undefined);
    return;
  }

  chromeApi.tabs.query({ active: true, currentWindow: true }, (tabs: ChromeTabsQueryTab[]) => {
    callback(tabs[0]);
  });
}

function toggleChromeSidePanelSync(): void {
  const sidePanel = getChromeBrowser().sidePanel;
  if (!sidePanel) {
    console.warn("Side panel is not available in this browser.");
    return;
  }

  if (lastFocusedWindowId !== undefined) {
    toggleChromeSidePanelSyncWithContext(sidePanel, { windowId: lastFocusedWindowId });
    return;
  }

  queryActiveTab((tab) => {
    if (tab?.id !== undefined) {
      toggleChromeSidePanelSyncWithContext(sidePanel, {
        tabId: tab.id,
        windowId: tab.windowId,
      });
    } else if (tab?.windowId !== undefined) {
      toggleChromeSidePanelSyncWithContext(sidePanel, { windowId: tab.windowId });
    } else {
      console.warn("No focused window available to toggle side panel.");
    }
  });
}

export function openReadAlongSidebarFromCommand(): void {
  if (isFirefoxSidebarAvailable()) {
    void getFirefoxBrowser()
      .sidebarAction!.toggle()
      .catch((error) => {
        console.warn("Failed to toggle read-along sidebar:", error);
      });
    return;
  }

  if (isChromeSidePanelAvailable()) {
    toggleChromeSidePanelSync();
    return;
  }

  console.warn("Sidebar is not available in this browser.");
}

export async function openReadAlongSidebar(): Promise<void> {
  if (isFirefoxSidebarAvailable()) {
    await getFirefoxBrowser().sidebarAction!.open();
    return;
  }

  if (isChromeSidePanelAvailable()) {
    const window = await browser.windows.getCurrent();
    if (window?.id === undefined) {
      throw new Error("No current window found to open side panel.");
    }
    openSidePanelWindowIds.add(window.id);
    await getChromeBrowser().sidePanel!.open({ windowId: window.id });
    return;
  }

  throw new Error("Sidebar is not available in this browser.");
}

export async function configureSidePanelBehavior(): Promise<void> {
  const sidePanel = getChromeBrowser().sidePanel;
  if (!sidePanel?.setPanelBehavior) {
    return;
  }

  await sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

export async function getOpenSidebarShortcut(): Promise<string> {
  if (!browser.commands?.getAll) {
    return getDefaultOpenSidebarShortcut();
  }

  const commands = await browser.commands.getAll();
  const command = commands.find((entry) => entry.name === OPEN_READ_ALONG_SIDEBAR_COMMAND);
  return command?.shortcut || getDefaultOpenSidebarShortcut();
}

export async function setOpenSidebarShortcut(shortcut: string): Promise<void> {
  const commands = getCommands();
  if (!commands.update) {
    throw new Error("Shortcut customization is not available in this browser.");
  }

  await commands.update({
    name: OPEN_READ_ALONG_SIDEBAR_COMMAND,
    shortcut,
  });
}

export async function clearOpenSidebarShortcut(): Promise<void> {
  await setOpenSidebarShortcut("");
}

const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Escape: "Esc",
};

export function formatShortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
  if (
    event.key === "Control" ||
    event.key === "Shift" ||
    event.key === "Alt" ||
    event.key === "Meta"
  ) {
    return null;
  }

  const parts: string[] = [];

  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Command");
  }

  const key =
    KEY_ALIASES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  parts.push(key);

  return parts.join("+");
}
