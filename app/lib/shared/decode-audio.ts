/**
 * Fetches an audio file and decodes it. An error response rejects instead of
 * being decoded: an expired signed link answers with an error document, not
 * with audio.
 */
export async function decodeAudioFromUrl(
  url: string,
  signal: AbortSignal,
): Promise<AudioBuffer> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Audio request failed with status ${response.status}.`);
  }

  const data = await response.arrayBuffer();
  const audioContext = new AudioContext();

  try {
    return await audioContext.decodeAudioData(data);
  } finally {
    // Closing the decoding context carries nothing back: it only rejects on a
    // context that is already closed, which is the state this asks for anyway.
    void audioContext.close();
  }
}
