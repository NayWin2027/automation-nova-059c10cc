// Comprehensive list of 80+ unique languages for TTS
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  bcp47: string; // For Web Speech API
}

export const languages: Language[] = [
  // Major World Languages
  { code: 'en-US', name: 'ENGLISH', nativeName: 'English', bcp47: 'en-US' },
  { code: 'zh-CN', name: 'CHINESE', nativeName: '中文', bcp47: 'zh-CN' },
  { code: 'ja-JP', name: 'JAPANESE', nativeName: '日本語', bcp47: 'ja-JP' },
  { code: 'ko-KR', name: 'KOREAN', nativeName: '한국어', bcp47: 'ko-KR' },
  { code: 'es-ES', name: 'SPANISH', nativeName: 'Español', bcp47: 'es-ES' },
  { code: 'fr-FR', name: 'FRENCH', nativeName: 'Français', bcp47: 'fr-FR' },
  { code: 'de-DE', name: 'GERMAN', nativeName: 'Deutsch', bcp47: 'de-DE' },
  { code: 'it-IT', name: 'ITALIAN', nativeName: 'Italiano', bcp47: 'it-IT' },
  { code: 'pt-BR', name: 'PORTUGUESE', nativeName: 'Português', bcp47: 'pt-BR' },
  { code: 'ru-RU', name: 'RUSSIAN', nativeName: 'Русский', bcp47: 'ru-RU' },
  { code: 'ar-SA', name: 'ARABIC', nativeName: 'العربية', bcp47: 'ar-SA' },
  { code: 'hi-IN', name: 'HINDI', nativeName: 'हिन्दी', bcp47: 'hi-IN' },

  // Southeast Asian
  { code: 'my-MM', name: 'BURMESE', nativeName: 'မြန်မာ', bcp47: 'my-MM' },
  { code: 'th-TH', name: 'THAI', nativeName: 'ไทย', bcp47: 'th-TH' },
  { code: 'vi-VN', name: 'VIETNAMESE', nativeName: 'Tiếng Việt', bcp47: 'vi-VN' },
  { code: 'id-ID', name: 'INDONESIAN', nativeName: 'Bahasa Indonesia', bcp47: 'id-ID' },
  { code: 'ms-MY', name: 'MALAY', nativeName: 'Bahasa Melayu', bcp47: 'ms-MY' },
  { code: 'fil-PH', name: 'FILIPINO', nativeName: 'Filipino', bcp47: 'fil-PH' },
  { code: 'km-KH', name: 'KHMER', nativeName: 'ភាសាខ្មែរ', bcp47: 'km-KH' },
  { code: 'lo-LA', name: 'LAO', nativeName: 'ລາວ', bcp47: 'lo-LA' },

  // South Asian
  { code: 'bn-IN', name: 'BENGALI', nativeName: 'বাংলা', bcp47: 'bn-IN' },
  { code: 'ta-IN', name: 'TAMIL', nativeName: 'தமிழ்', bcp47: 'ta-IN' },
  { code: 'te-IN', name: 'TELUGU', nativeName: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'mr-IN', name: 'MARATHI', nativeName: 'मराठी', bcp47: 'mr-IN' },
  { code: 'gu-IN', name: 'GUJARATI', nativeName: 'ગુજરાતી', bcp47: 'gu-IN' },
  { code: 'kn-IN', name: 'KANNADA', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  { code: 'ml-IN', name: 'MALAYALAM', nativeName: 'മലയാളം', bcp47: 'ml-IN' },
  { code: 'pa-IN', name: 'PUNJABI', nativeName: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN' },
  { code: 'ur-PK', name: 'URDU', nativeName: 'اردو', bcp47: 'ur-PK' },
  { code: 'ne-NP', name: 'NEPALI', nativeName: 'नेपाली', bcp47: 'ne-NP' },
  { code: 'si-LK', name: 'SINHALA', nativeName: 'සිංහල', bcp47: 'si-LK' },

  // European Languages
  { code: 'nl-NL', name: 'DUTCH', nativeName: 'Nederlands', bcp47: 'nl-NL' },
  { code: 'pl-PL', name: 'POLISH', nativeName: 'Polski', bcp47: 'pl-PL' },
  { code: 'uk-UA', name: 'UKRAINIAN', nativeName: 'Українська', bcp47: 'uk-UA' },
  { code: 'cs-CZ', name: 'CZECH', nativeName: 'Čeština', bcp47: 'cs-CZ' },
  { code: 'ro-RO', name: 'ROMANIAN', nativeName: 'Română', bcp47: 'ro-RO' },
  { code: 'hu-HU', name: 'HUNGARIAN', nativeName: 'Magyar', bcp47: 'hu-HU' },
  { code: 'el-GR', name: 'GREEK', nativeName: 'Ελληνικά', bcp47: 'el-GR' },
  { code: 'sv-SE', name: 'SWEDISH', nativeName: 'Svenska', bcp47: 'sv-SE' },
  { code: 'da-DK', name: 'DANISH', nativeName: 'Dansk', bcp47: 'da-DK' },
  { code: 'no-NO', name: 'NORWEGIAN', nativeName: 'Norsk', bcp47: 'nb-NO' },
  { code: 'fi-FI', name: 'FINNISH', nativeName: 'Suomi', bcp47: 'fi-FI' },
  { code: 'sk-SK', name: 'SLOVAK', nativeName: 'Slovenčina', bcp47: 'sk-SK' },
  { code: 'bg-BG', name: 'BULGARIAN', nativeName: 'Български', bcp47: 'bg-BG' },
  { code: 'hr-HR', name: 'CROATIAN', nativeName: 'Hrvatski', bcp47: 'hr-HR' },
  { code: 'sr-RS', name: 'SERBIAN', nativeName: 'Српски', bcp47: 'sr-RS' },
  { code: 'sl-SI', name: 'SLOVENIAN', nativeName: 'Slovenščina', bcp47: 'sl-SI' },
  { code: 'et-EE', name: 'ESTONIAN', nativeName: 'Eesti', bcp47: 'et-EE' },
  { code: 'lv-LV', name: 'LATVIAN', nativeName: 'Latviešu', bcp47: 'lv-LV' },
  { code: 'lt-LT', name: 'LITHUANIAN', nativeName: 'Lietuvių', bcp47: 'lt-LT' },
  { code: 'is-IS', name: 'ICELANDIC', nativeName: 'Íslenska', bcp47: 'is-IS' },
  { code: 'ga-IE', name: 'IRISH', nativeName: 'Gaeilge', bcp47: 'ga-IE' },
  { code: 'cy-GB', name: 'WELSH', nativeName: 'Cymraeg', bcp47: 'cy-GB' },
  { code: 'ca-ES', name: 'CATALAN', nativeName: 'Català', bcp47: 'ca-ES' },
  { code: 'eu-ES', name: 'BASQUE', nativeName: 'Euskara', bcp47: 'eu-ES' },
  { code: 'gl-ES', name: 'GALICIAN', nativeName: 'Galego', bcp47: 'gl-ES' },
  { code: 'sq-AL', name: 'ALBANIAN', nativeName: 'Shqip', bcp47: 'sq-AL' },
  { code: 'mk-MK', name: 'MACEDONIAN', nativeName: 'Македонски', bcp47: 'mk-MK' },
  { code: 'bs-BA', name: 'BOSNIAN', nativeName: 'Bosanski', bcp47: 'bs-BA' },
  { code: 'mt-MT', name: 'MALTESE', nativeName: 'Malti', bcp47: 'mt-MT' },
  { code: 'lb-LU', name: 'LUXEMBOURGISH', nativeName: 'Lëtzebuergesch', bcp47: 'lb-LU' },
  { code: 'be-BY', name: 'BELARUSIAN', nativeName: 'Беларуская', bcp47: 'be-BY' },

  // Middle Eastern
  { code: 'he-IL', name: 'HEBREW', nativeName: 'עברית', bcp47: 'he-IL' },
  { code: 'fa-IR', name: 'PERSIAN', nativeName: 'فارسی', bcp47: 'fa-IR' },
  { code: 'tr-TR', name: 'TURKISH', nativeName: 'Türkçe', bcp47: 'tr-TR' },
  { code: 'az-AZ', name: 'AZERBAIJANI', nativeName: 'Azərbaycan', bcp47: 'az-AZ' },
  { code: 'ka-GE', name: 'GEORGIAN', nativeName: 'ქართული', bcp47: 'ka-GE' },
  { code: 'hy-AM', name: 'ARMENIAN', nativeName: 'Հայերեն', bcp47: 'hy-AM' },
  { code: 'ku-TR', name: 'KURDISH', nativeName: 'Kurdî', bcp47: 'ku-TR' },

  // African Languages
  { code: 'sw-KE', name: 'SWAHILI', nativeName: 'Kiswahili', bcp47: 'sw-KE' },
  { code: 'af-ZA', name: 'AFRIKAANS', nativeName: 'Afrikaans', bcp47: 'af-ZA' },
  { code: 'zu-ZA', name: 'ZULU', nativeName: 'isiZulu', bcp47: 'zu-ZA' },
  { code: 'xh-ZA', name: 'XHOSA', nativeName: 'isiXhosa', bcp47: 'xh-ZA' },
  { code: 'am-ET', name: 'AMHARIC', nativeName: 'አማርኛ', bcp47: 'am-ET' },
  { code: 'ha-NG', name: 'HAUSA', nativeName: 'Hausa', bcp47: 'ha-NG' },
  { code: 'yo-NG', name: 'YORUBA', nativeName: 'Yorùbá', bcp47: 'yo-NG' },
  { code: 'ig-NG', name: 'IGBO', nativeName: 'Igbo', bcp47: 'ig-NG' },
  { code: 'so-SO', name: 'SOMALI', nativeName: 'Soomaali', bcp47: 'so-SO' },
  { code: 'rw-RW', name: 'KINYARWANDA', nativeName: 'Ikinyarwanda', bcp47: 'rw-RW' },

  // Central Asian
  { code: 'kk-KZ', name: 'KAZAKH', nativeName: 'Қазақ', bcp47: 'kk-KZ' },
  { code: 'uz-UZ', name: 'UZBEK', nativeName: 'Oʻzbek', bcp47: 'uz-UZ' },
  { code: 'mn-MN', name: 'MONGOLIAN', nativeName: 'Монгол', bcp47: 'mn-MN' },
  { code: 'tg-TJ', name: 'TAJIK', nativeName: 'Тоҷикӣ', bcp47: 'tg-TJ' },
  { code: 'ky-KG', name: 'KYRGYZ', nativeName: 'Кыргызча', bcp47: 'ky-KG' },
  { code: 'tk-TM', name: 'TURKMEN', nativeName: 'Türkmen', bcp47: 'tk-TM' },

  // Others
  { code: 'jv-ID', name: 'JAVANESE', nativeName: 'Basa Jawa', bcp47: 'jv-ID' },
  { code: 'su-ID', name: 'SUNDANESE', nativeName: 'Basa Sunda', bcp47: 'su-ID' },
  { code: 'eo', name: 'ESPERANTO', nativeName: 'Esperanto', bcp47: 'eo' },
  { code: 'la', name: 'LATIN', nativeName: 'Latina', bcp47: 'la' },
];

// Get default language based on browser
export function getDefaultLanguage(): string {
  const browserLang = navigator.language;
  const matched = languages.find(l => l.bcp47 === browserLang || l.code === browserLang);
  return matched?.code || 'en-US';
}
