import { AudioPlayer } from "../../lib/audio/audio-player";
import { formatError } from "../../lib/format-error";
import {
  parseOffscreenPlayerRequest,
  type OffscreenPlayerCommand,
  type OffscreenPlayerResponse,
} from "../../lib/audio/offscreen-messages";

const player = new AudioPlayer();

function broadcastState(): void {
  void browser.runtime.sendMessage({
    type: "PLAYER_STATE_CHANGE",
    state: player.getState(),
  });
}

player.onStateChange(() => {
  broadcastState();
});

player.onSegmentPlayback((segmentIndex) => {
  void browser.runtime.sendMessage({
    type: "PLAYER_SEGMENT_START",
    segmentIndex,
  });
});

player.onSegmentEnded((segmentIndex) => {
  void browser.runtime.sendMessage({
    type: "PLAYER_SEGMENT_END",
    segmentIndex,
  });
});

let commandQueue: Promise<void> = Promise.resolve();

function enqueueCommand(task: () => Promise<void>): Promise<void> {
  commandQueue = commandQueue.then(task).catch((error) => {
    console.error("Offscreen player command failed", error);
  });
  return commandQueue;
}

async function runCommand(command: OffscreenPlayerCommand): Promise<void> {
  switch (command.action) {
    case "PREPARE_PLAYBACK":
      await player.prepare();
      break;
    case "BEGIN_SEGMENT":
      player.beginSegment(command.segmentIndex, command.expectingMore);
      break;
    case "ADD_CHUNK":
      await player.addChunk(command.data, command.final);
      break;
    case "PLAY":
      await player.play();
      break;
    case "PAUSE":
      player.pause();
      break;
    case "RESUME":
      await player.resume();
      break;
    case "STOP":
      player.stop();
      break;
    case "ABORT_SCHEDULED":
      player.abortScheduledPlayback();
      break;
  }
}

async function handleCommand(command: OffscreenPlayerCommand): Promise<OffscreenPlayerResponse> {
  try {
    await runCommand(command);
    return { ok: true, state: player.getState() };
  } catch (error) {
    const message = formatError(error);
    return { ok: false, error: message, state: player.getState() };
  }
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const request = parseOffscreenPlayerRequest(message);
  if (!request) {
    return;
  }

  void enqueueCommand(async () => {
    sendResponse(await handleCommand(request.command));
  });
  return true;
});
