// Returns config values for Azure Speech SDK (used server-side only)
export function getSpeechConfig() {
  return {
    key: process.env.AZURE_SPEECH_KEY!,
    region: process.env.AZURE_SPEECH_REGION!,
  };
}
