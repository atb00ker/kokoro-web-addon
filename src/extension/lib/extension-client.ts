import type { StateUpdateMessage } from "./extension-state";

export interface HostSetupChangedMessage {
  type: "HOST_SETUP_CHANGED";
  ready: boolean;
}

export async function fetchExtensionState(): Promise<StateUpdateMessage> {
  const response = await browser.runtime.sendMessage({ type: "GET_STATE" });
  if (!response || typeof response !== "object") {
    throw new Error("Extension background is unavailable.");
  }

  return {
    type: "STATE_UPDATE",
    session: response.session,
    readAlong: response.readAlong,
    playerState: response.playerState,
    settings: response.settings,
  };
}

export function listenToExtensionStateUpdates(
  handler: (message: StateUpdateMessage) => void,
): () => void {
  const listener = (message: StateUpdateMessage) => {
    if (message.type === "STATE_UPDATE") {
      handler(message);
    }
  };

  browser.runtime.onMessage.addListener(listener);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
  };
}

export function subscribeToExtensionState(
  handler: (message: StateUpdateMessage) => void,
): () => void {
  void fetchExtensionState().then(handler);
  return listenToExtensionStateUpdates(handler);
}

export function broadcastHostSetupChange(ready: boolean): void {
  const payload: HostSetupChangedMessage = { type: "HOST_SETUP_CHANGED", ready };
  try {
    void browser.runtime.sendMessage(payload);
  } catch {
    // No listeners are open.
  }
}

export function listenForHostSetupChanges(handler: (ready: boolean) => void): () => void {
  const listener = (message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "HOST_SETUP_CHANGED" &&
      "ready" in message &&
      typeof message.ready === "boolean"
    ) {
      handler(message.ready);
    }
  };

  browser.runtime.onMessage.addListener(listener);
  return () => {
    browser.runtime.onMessage.removeListener(listener);
  };
}
