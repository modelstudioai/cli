import { DEFAULT_LANGUAGE, type Language, type LocalizedText } from "bailian-cli-core";

/** Per-CLI localized text selector. */
export interface Translator {
  language: Language;
  localize(text: LocalizedText): string;
}

export function createTranslator(language: Language): Translator {
  return {
    language,
    localize(text) {
      return typeof text === "string" ? text : (text[language] ?? text[DEFAULT_LANGUAGE]);
    },
  };
}
