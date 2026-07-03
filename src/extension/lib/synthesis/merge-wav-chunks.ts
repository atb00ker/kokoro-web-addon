export interface WavSlice {
  data: string;
}

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]!);
  }
  return btoa(binary);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return combined;
}

function parseWavPcm(bytes: Uint8Array): {
  pcm: Uint8Array;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  if (bytes.byteLength < 44) {
    throw new Error("WAV data is too short");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11),
  );

  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new Error("Invalid WAV data from native host");
  }

  let offset = 12;
  let dataOffset = -1;
  let dataSize = 0;
  let sampleRate = 24000;
  let bitsPerSample = 16;
  let numChannels = 1;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;

    if (chunkId === "fmt " && chunkSize >= 16) {
      numChannels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    }

    if (chunkId === "data") {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0) {
    throw new Error("WAV data chunk missing");
  }

  const available = bytes.byteLength - dataOffset;
  const pcmLength = Math.min(dataSize, available);
  const pcm = bytes.slice(dataOffset, dataOffset + pcmLength);

  return { pcm, sampleRate, numChannels, bitsPerSample };
}

function wrapPcmAsWav(
  pcm: Uint8Array,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array {
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = pcm.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcm);
  return new Uint8Array(buffer);
}

export function isValidWavBase64(base64: string): boolean {
  try {
    const bytes = decodeBase64(base64);
    if (bytes.byteLength < 44) {
      return false;
    }

    const { pcm, bitsPerSample, numChannels } = parseWavPcm(bytes);
    if (pcm.byteLength === 0) {
      return false;
    }

    const frameSize = (numChannels * bitsPerSample) / 8;
    return frameSize > 0 && pcm.byteLength % frameSize === 0;
  } catch {
    return false;
  }
}

export function mergeWavSlices(slices: WavSlice[]): string {
  if (slices.length === 0) {
    throw new Error("Cannot merge empty WAV slices");
  }

  const bytes = concatBytes(slices.map((slice) => decodeBase64(slice.data)));
  const { pcm, sampleRate, numChannels, bitsPerSample } = parseWavPcm(bytes);
  return encodeBase64(wrapPcmAsWav(pcm, sampleRate, numChannels, bitsPerSample));
}

export function createTestWav(pcmByteLength: number, sampleRate = 24000): string {
  const pcm = new Uint8Array(pcmByteLength);
  for (let index = 0; index < pcmByteLength; index += 2) {
    pcm[index] = 0;
    pcm[index + 1] = index % 256;
  }
  return encodeBase64(wrapPcmAsWav(pcm, sampleRate, 1, 16));
}
