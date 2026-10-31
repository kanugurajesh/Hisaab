// Client-safe constants (no server imports), shared by the reminder UI and generator.
export const LANGUAGES = { en: "English", hi: "Hindi", te: "Telugu" } as const;
export type Language = keyof typeof LANGUAGES;
export const TONES = ["friendly", "firm", "final"] as const;
export type Tone = (typeof TONES)[number];
