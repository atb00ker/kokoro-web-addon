export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
}

export const LANGUAGES = [
  { id: "en-us", label: "English (US)" },
  { id: "en-gb", label: "English (UK)" },
  { id: "fr-fr", label: "French" },
  { id: "it", label: "Italian" },
  { id: "ja", label: "Japanese" },
  { id: "cmn", label: "Chinese (Mandarin)" },
] as const;

export const VOICES: VoiceOption[] = [
  { id: "af_alloy", label: "Alloy (US female)", lang: "en-us" },
  { id: "af_aoede", label: "Aoede (US female)", lang: "en-us" },
  { id: "af_bella", label: "Bella (US female)", lang: "en-us" },
  { id: "af_heart", label: "Heart (US female)", lang: "en-us" },
  { id: "af_jessica", label: "Jessica (US female)", lang: "en-us" },
  { id: "af_kore", label: "Kore (US female)", lang: "en-us" },
  { id: "af_nicole", label: "Nicole (US female)", lang: "en-us" },
  { id: "af_nova", label: "Nova (US female)", lang: "en-us" },
  { id: "af_river", label: "River (US female)", lang: "en-us" },
  { id: "af_sarah", label: "Sarah (US female)", lang: "en-us" },
  { id: "af_sky", label: "Sky (US female)", lang: "en-us" },
  { id: "am_adam", label: "Adam (US male)", lang: "en-us" },
  { id: "am_echo", label: "Echo (US male)", lang: "en-us" },
  { id: "am_eric", label: "Eric (US male)", lang: "en-us" },
  { id: "am_fenrir", label: "Fenrir (US male)", lang: "en-us" },
  { id: "am_liam", label: "Liam (US male)", lang: "en-us" },
  { id: "am_michael", label: "Michael (US male)", lang: "en-us" },
  { id: "am_onyx", label: "Onyx (US male)", lang: "en-us" },
  { id: "am_puck", label: "Puck (US male)", lang: "en-us" },
  { id: "bf_alice", label: "Alice (UK female)", lang: "en-gb" },
  { id: "bf_emma", label: "Emma (UK female)", lang: "en-gb" },
  { id: "bf_isabella", label: "Isabella (UK female)", lang: "en-gb" },
  { id: "bf_lily", label: "Lily (UK female)", lang: "en-gb" },
  { id: "bm_daniel", label: "Daniel (UK male)", lang: "en-gb" },
  { id: "bm_fable", label: "Fable (UK male)", lang: "en-gb" },
  { id: "bm_george", label: "George (UK male)", lang: "en-gb" },
  { id: "bm_lewis", label: "Lewis (UK male)", lang: "en-gb" },
  { id: "ff_siwis", label: "Siwis (French female)", lang: "fr-fr" },
  { id: "if_sara", label: "Sara (Italian female)", lang: "it" },
  { id: "im_nicola", label: "Nicola (Italian male)", lang: "it" },
  { id: "jf_alpha", label: "Alpha (Japanese female)", lang: "ja" },
  { id: "jf_gongitsune", label: "Gongitsune (Japanese female)", lang: "ja" },
  { id: "jf_nezumi", label: "Nezumi (Japanese female)", lang: "ja" },
  { id: "jf_tebukuro", label: "Tebukuro (Japanese female)", lang: "ja" },
  { id: "jm_kumo", label: "Kumo (Japanese male)", lang: "ja" },
  { id: "zf_xiaobei", label: "Xiaobei (Chinese female)", lang: "cmn" },
  { id: "zf_xiaoni", label: "Xiaoni (Chinese female)", lang: "cmn" },
  { id: "zf_xiaoxiao", label: "Xiaoxiao (Chinese female)", lang: "cmn" },
  { id: "zf_xiaoyi", label: "Xiaoyi (Chinese female)", lang: "cmn" },
  { id: "zm_yunjian", label: "Yunjian (Chinese male)", lang: "cmn" },
  { id: "zm_yunxi", label: "Yunxi (Chinese male)", lang: "cmn" },
  { id: "zm_yunxia", label: "Yunxia (Chinese male)", lang: "cmn" },
  { id: "zm_yunyang", label: "Yunyang (Chinese male)", lang: "cmn" },
];

export function getVoicesForLanguage(lang: string): VoiceOption[] {
  return VOICES.filter((voice) => voice.lang === lang);
}
