import { createInstance, type ResourceLanguage, type TOptions } from "i18next";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type Language,
  type LocalizedText,
} from "bailian-cli-core";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A colocated namespace that a product or feature can register with the CLI runtime. */
export interface CliMessageBundle {
  namespace: string;
  resources: Partial<Record<Language, ResourceLanguage>>;
}

/** Per-CLI translation surface. The mutable i18next instance stays private to runtime. */
export interface Translator {
  language: Language;
  translate: Translate;
  localize(text: LocalizedText): string;
}

export async function createTranslator(
  language: Language,
  bundles: readonly CliMessageBundle[] = [],
): Promise<Translator> {
  const instance = createInstance();

  await instance.init({
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    initAsync: false,
    interpolation: { escapeValue: false },
  });

  for (const bundle of bundles) {
    for (const supportedLanguage of SUPPORTED_LANGUAGES) {
      const resource = bundle.resources[supportedLanguage];
      if (resource) {
        instance.addResourceBundle(supportedLanguage, bundle.namespace, resource, true, false);
      }
    }
  }

  return {
    language,
    localize(text) {
      return typeof text === "string" ? text : text[language];
    },
    translate(key, options = {}) {
      return String(instance.t(key, options as TOptions));
    },
  };
}
