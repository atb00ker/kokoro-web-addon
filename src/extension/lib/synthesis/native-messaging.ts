import { NATIVE_HOST_NAME } from "../defaults";
import { getSetupCommand } from "../onboarding";
import { isRecord } from "../type-guards";

export type HostMessage =
  | {
      type: "pong";
      hostConnected?: boolean;
      kokoroReady?: boolean;
      kokoroPath?: string;
      modelDir?: string;
      message?: string;
    }
  | { type: "config_saved" }
  | { type: "audio_chunk"; requestId: string; index: number; data: string; final: boolean }
  | { type: "progress"; requestId: string; message: string }
  | { type: "complete"; requestId: string }
  | { type: "cancelled"; requestId: string }
  | { type: "error"; requestId?: string; message: string };

export interface SynthesizeOptions {
  voice: string;
  speed: number;
  lang: string;
  format: "wav";
}

export interface SynthesizeRequest {
  requestId: string;
  content: string;
  options: SynthesizeOptions;
}

type MessageHandler = (message: HostMessage) => void;

let nativePort: Browser.runtime.Port | null = null;
let portConnected = false;
const messageHandlers = new Set<MessageHandler>();

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

export function parseHostMessage(value: unknown): HostMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid native host response.");
  }

  switch (value.type) {
    case "pong":
      return {
        type: "pong",
        hostConnected: readBoolean(value.hostConnected),
        kokoroReady: readBoolean(value.kokoroReady),
        kokoroPath: readString(value.kokoroPath),
        modelDir: readString(value.modelDir),
        message: readString(value.message),
      };
    case "config_saved":
      return { type: "config_saved" };
    case "audio_chunk": {
      const requestId = readString(value.requestId);
      const data = readString(value.data);
      const index = readNumber(value.index);
      const final = readBoolean(value.final);
      if (!requestId || data === undefined || index === undefined || final === undefined) {
        throw new Error("Invalid audio_chunk response from native host.");
      }
      return { type: "audio_chunk", requestId, index, data, final };
    }
    case "progress": {
      const requestId = readString(value.requestId);
      const message = readString(value.message);
      if (!requestId || !message) {
        throw new Error("Invalid progress response from native host.");
      }
      return { type: "progress", requestId, message };
    }
    case "complete": {
      const requestId = readString(value.requestId);
      if (!requestId) {
        throw new Error("Invalid complete response from native host.");
      }
      return { type: "complete", requestId };
    }
    case "cancelled": {
      const requestId = readString(value.requestId);
      if (!requestId) {
        throw new Error("Invalid cancelled response from native host.");
      }
      return { type: "cancelled", requestId };
    }
    case "error": {
      const message = readString(value.message);
      if (!message) {
        throw new Error("Invalid error response from native host.");
      }
      return { type: "error", requestId: readString(value.requestId), message };
    }
    default:
      throw new Error(`Unexpected native host response type: ${value.type}`);
  }
}

function getNativeMessagingError(context: string): Error {
  const lastError = browser.runtime.lastError;
  const detail = lastError?.message ? ` (${lastError.message})` : "";
  return new Error(
    `${context} Run once in a terminal: ${getSetupCommand()} Then restart your browser.${detail}`,
  );
}

async function sendOneShotMessage(message: Record<string, unknown>): Promise<HostMessage> {
  try {
    const response = await browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, message);
    if (!response || typeof response !== "object") {
      throw new Error("Native host returned an empty response.");
    }
    return parseHostMessage(response);
  } catch (error) {
    if (browser.runtime.lastError) {
      throw getNativeMessagingError("Failed to reach native host.");
    }
    throw error;
  }
}

function connectStreamingPort(): Browser.runtime.Port {
  if (nativePort && portConnected) {
    return nativePort;
  }

  nativePort = browser.runtime.connectNative(NATIVE_HOST_NAME);

  if (browser.runtime.lastError) {
    nativePort = null;
    portConnected = false;
    throw getNativeMessagingError("Failed to open native host stream.");
  }

  portConnected = true;

  nativePort.onMessage.addListener((message: unknown) => {
    let parsed: HostMessage;
    try {
      parsed = parseHostMessage(message);
    } catch (error) {
      console.warn("Ignored invalid native host stream message", error);
      return;
    }

    for (const handler of messageHandlers) {
      handler(parsed);
    }
  });

  nativePort.onDisconnect.addListener(() => {
    nativePort = null;
    portConnected = false;
  });

  return nativePort;
}

export function onHostMessage(handler: MessageHandler): () => void {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

function sendStreamingMessage(message: Record<string, unknown>): void {
  const port = connectStreamingPort();
  port.postMessage(message);

  if (browser.runtime.lastError) {
    nativePort = null;
    portConnected = false;
    throw getNativeMessagingError("Failed to send message to native host.");
  }
}

export async function pingHost(): Promise<HostMessage> {
  const response = await sendOneShotMessage({ action: "ping" });

  if (response.type === "error") {
    throw new Error(response.message);
  }

  if (response.type !== "pong") {
    throw new Error("Unexpected response from native host during ping.");
  }

  return response;
}

export async function setHostConfig(kokoroPath: string, modelDir: string): Promise<void> {
  const response = await sendOneShotMessage({ action: "set_config", kokoroPath, modelDir });

  if (response.type === "error") {
    throw new Error(response.message);
  }

  if (response.type !== "config_saved") {
    throw new Error("Unexpected response from native host while saving config.");
  }
}

export function synthesize(request: SynthesizeRequest): void {
  sendStreamingMessage({
    action: "synthesize",
    requestId: request.requestId,
    content: request.content,
    options: request.options,
  });
}

export function cancelSynthesis(requestId: string): void {
  sendStreamingMessage({ action: "cancel", requestId });
}

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
