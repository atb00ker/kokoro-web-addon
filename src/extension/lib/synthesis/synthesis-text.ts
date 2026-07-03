export function getChunkSynthesisContent(text: string, prefix: string, chunkIndex: number): string {
  if (chunkIndex !== 0 || !prefix) {
    return text;
  }
  return prefix + text;
}
