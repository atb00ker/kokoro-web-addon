export interface ReadAlongState {
  chunks: string[];
  activeChunkIndex: number | null;
}

export const EMPTY_READ_ALONG: ReadAlongState = {
  chunks: [],
  activeChunkIndex: null,
};
