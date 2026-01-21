// Comprehensive list of 80+ languages for TTS
export interface Language {
  code: string;
  name: string;
  nativeName: string;
  bcp47: string; // For Web Speech API
}

export const languages: Language[] = [
  // Major World Languages
  { code: 'en-US', name: 'English (US)', nativeName: 'English', bcp47: 'en-US' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English', bcp47: 'en-GB' },
  { code: 'en-AU', name: 'English (Australia)', nativeName: 'English', bcp47: 'en-AU' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '中文 (简体)', bcp47: 'zh-CN' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '中文 (繁體)', bcp47: 'zh-TW' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語', bcp47: 'ja-JP' },
  { code: 'ko-KR', name: 'Korean', nativeName: '한국어', bcp47: 'ko-KR' },
  { code: 'es-ES', name: 'Spanish (Spain)', nativeName: 'Español', bcp47: 'es-ES' },
  { code: 'es-MX', name: 'Spanish (Mexico)', nativeName: 'Español', bcp47: 'es-MX' },
  { code: 'fr-FR', name: 'French (France)', nativeName: 'Français', bcp47: 'fr-FR' },
  { code: 'fr-CA', name: 'French (Canada)', nativeName: 'Français', bcp47: 'fr-CA' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch', bcp47: 'de-DE' },
  { code: 'it-IT', name: 'Italian', nativeName: 'Italiano', bcp47: 'it-IT' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português', bcp47: 'pt-BR' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)', nativeName: 'Português', bcp47: 'pt-PT' },
  { code: 'ru-RU', name: 'Russian', nativeName: 'Русский', bcp47: 'ru-RU' },
  { code: 'ar-SA', name: 'Arabic (Saudi)', nativeName: 'العربية', bcp47: 'ar-SA' },
  { code: 'ar-EG', name: 'Arabic (Egypt)', nativeName: 'العربية', bcp47: 'ar-EG' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN' },
  
  // Southeast Asian
  { code: 'my-MM', name: 'Burmese (Myanmar)', nativeName: 'မြန်မာ', bcp47: 'my-MM' },
  { code: 'th-TH', name: 'Thai', nativeName: 'ไทย', bcp47: 'th-TH' },
  { code: 'vi-VN', name: 'Vietnamese', nativeName: 'Tiếng Việt', bcp47: 'vi-VN' },
  { code: 'id-ID', name: 'Indonesian', nativeName: 'Bahasa Indonesia', bcp47: 'id-ID' },
  { code: 'ms-MY', name: 'Malay', nativeName: 'Bahasa Melayu', bcp47: 'ms-MY' },
  { code: 'tl-PH', name: 'Filipino/Tagalog', nativeName: 'Filipino', bcp47: 'fil-PH' },
  { code: 'km-KH', name: 'Khmer', nativeName: 'ភាសាខ្មែរ', bcp47: 'km-KH' },
  { code: 'lo-LA', name: 'Lao', nativeName: 'ລາວ', bcp47: 'lo-LA' },
  
  // South Asian
  { code: 'bn-IN', name: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-IN' },
  { code: 'ta-IN', name: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN' },
  { code: 'te-IN', name: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'mr-IN', name: 'Marathi', nativeName: 'मराठी', bcp47: 'mr-IN' },
  { code: 'gu-IN', name: 'Gujarati', nativeName: 'ગુજરાતી', bcp47: 'gu-IN' },
  { code: 'kn-IN', name: 'Kannada', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  { code: 'ml-IN', name: 'Malayalam', nativeName: 'മലയാളം', bcp47: 'ml-IN' },
  { code: 'pa-IN', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN' },
  { code: 'ur-PK', name: 'Urdu', nativeName: 'اردو', bcp47: 'ur-PK' },
  { code: 'ne-NP', name: 'Nepali', nativeName: 'नेपाली', bcp47: 'ne-NP' },
  { code: 'si-LK', name: 'Sinhala', nativeName: 'සිංහල', bcp47: 'si-LK' },
  
  // European Languages
  { code: 'nl-NL', name: 'Dutch', nativeName: 'Nederlands', bcp47: 'nl-NL' },
  { code: 'pl-PL', name: 'Polish', nativeName: 'Polski', bcp47: 'pl-PL' },
  { code: 'uk-UA', name: 'Ukrainian', nativeName: 'Українська', bcp47: 'uk-UA' },
  { code: 'cs-CZ', name: 'Czech', nativeName: 'Čeština', bcp47: 'cs-CZ' },
  { code: 'ro-RO', name: 'Romanian', nativeName: 'Română', bcp47: 'ro-RO' },
  { code: 'hu-HU', name: 'Hungarian', nativeName: 'Magyar', bcp47: 'hu-HU' },
  { code: 'el-GR', name: 'Greek', nativeName: 'Ελληνικά', bcp47: 'el-GR' },
  { code: 'sv-SE', name: 'Swedish', nativeName: 'Svenska', bcp47: 'sv-SE' },
  { code: 'da-DK', name: 'Danish', nativeName: 'Dansk', bcp47: 'da-DK' },
  { code: 'no-NO', name: 'Norwegian', nativeName: 'Norsk', bcp47: 'nb-NO' },
  { code: 'fi-FI', name: 'Finnish', nativeName: 'Suomi', bcp47: 'fi-FI' },
  { code: 'sk-SK', name: 'Slovak', nativeName: 'Slovenčina', bcp47: 'sk-SK' },
  { code: 'bg-BG', name: 'Bulgarian', nativeName: 'Български', bcp47: 'bg-BG' },
  { code: 'hr-HR', name: 'Croatian', nativeName: 'Hrvatski', bcp47: 'hr-HR' },
  { code: 'sr-RS', name: 'Serbian', nativeName: 'Српски', bcp47: 'sr-RS' },
  { code: 'sl-SI', name: 'Slovenian', nativeName: 'Slovenščina', bcp47: 'sl-SI' },
  { code: 'et-EE', name: 'Estonian', nativeName: 'Eesti', bcp47: 'et-EE' },
  { code: 'lv-LV', name: 'Latvian', nativeName: 'Latviešu', bcp47: 'lv-LV' },
  { code: 'lt-LT', name: 'Lithuanian', nativeName: 'Lietuvių', bcp47: 'lt-LT' },
  { code: 'is-IS', name: 'Icelandic', nativeName: 'Íslenska', bcp47: 'is-IS' },
  { code: 'ga-IE', name: 'Irish', nativeName: 'Gaeilge', bcp47: 'ga-IE' },
  { code: 'cy-GB', name: 'Welsh', nativeName: 'Cymraeg', bcp47: 'cy-GB' },
  { code: 'ca-ES', name: 'Catalan', nativeName: 'Català', bcp47: 'ca-ES' },
  { code: 'eu-ES', name: 'Basque', nativeName: 'Euskara', bcp47: 'eu-ES' },
  { code: 'gl-ES', name: 'Galician', nativeName: 'Galego', bcp47: 'gl-ES' },
  
  // Middle Eastern
  { code: 'he-IL', name: 'Hebrew', nativeName: 'עברית', bcp47: 'he-IL' },
  { code: 'fa-IR', name: 'Persian (Farsi)', nativeName: 'فارسی', bcp47: 'fa-IR' },
  { code: 'tr-TR', name: 'Turkish', nativeName: 'Türkçe', bcp47: 'tr-TR' },
  { code: 'az-AZ', name: 'Azerbaijani', nativeName: 'Azərbaycan', bcp47: 'az-AZ' },
  { code: 'ka-GE', name: 'Georgian', nativeName: 'ქართული', bcp47: 'ka-GE' },
  { code: 'hy-AM', name: 'Armenian', nativeName: 'Հայdelays', bcp47: 'hy-AM' },
  
  // African Languages
  { code: 'sw-KE', name: 'Swahili', nativeName: 'Kiswahili', bcp47: 'sw-KE' },
  { code: 'af-ZA', name: 'Afrikaans', nativeName: 'Afrikaans', bcp47: 'af-ZA' },
  { code: 'zu-ZA', name: 'Zulu', nativeName: 'isiZulu', bcp47: 'zu-ZA' },
  { code: 'xh-ZA', name: 'Xhosa', nativeName: 'isiXhosa', bcp47: 'xh-ZA' },
  { code: 'am-ET', name: 'Amharic', nativeName: 'አማርኛ', bcp47: 'am-ET' },
  { code: 'ha-NG', name: 'Hausa', nativeName: 'Hausa', bcp47: 'ha-NG' },
  { code: 'yo-NG', name: 'Yoruba', nativeName: 'Yorùbá', bcp47: 'yo-NG' },
  { code: 'ig-NG', name: 'Igbo', nativeName: 'Igbo', bcp47: 'ig-NG' },
  
  // Central Asian
  { code: 'kk-KZ', name: 'Kazakh', nativeName: 'Қазақ', bcp47: 'kk-KZ' },
  { code: 'uz-UZ', name: 'Uzbek', nativeName: 'Oʻzbek', bcp47: 'uz-UZ' },
  { code: 'mn-MN', name: 'Mongolian', nativeName: 'Монгол', bcp47: 'mn-MN' },
  
  // Others
  { code: 'fil-PH', name: 'Filipino', nativeName: 'Filipino', bcp47: 'fil-PH' },
  { code: 'jv-ID', name: 'Javanese', nativeName: 'Basa Jawa', bcp47: 'jv-ID' },
  { code: 'su-ID', name: 'Sundanese', nativeName: 'Basa Sunda', bcp47: 'su-ID' },
];

// Get default language based on browser
export function getDefaultLanguage(): string {
  const browserLang = navigator.language;
  const matched = languages.find(l => l.bcp47 === browserLang || l.code === browserLang);
  return matched?.code || 'en-US';
}
