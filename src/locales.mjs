export const locales = [
  ['en', 'English'], ['zh-Hans', '简体中文'], ['zh-Hant', '繁體中文'],
  ['ja', '日本語'], ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'],
  ['es', 'Español'], ['pt-BR', 'Português (Brasil)'], ['it', 'Italiano'],
  ['ru', 'Русский'], ['ar', 'العربية'], ['hi', 'हिन्दी'],
  ['id', 'Bahasa Indonesia'], ['tr', 'Türkçe'], ['vi', 'Tiếng Việt']
];

export function matchLocale(languages) {
  for (const language of languages) {
    const tag = language.toLowerCase();
    const exact = locales.find(([code]) => code.toLowerCase() === tag);
    if (exact) return exact[0];
    if (tag.startsWith('zh')) return /hant|tw|hk|mo/.test(tag) ? 'zh-Hant' : 'zh-Hans';
    if (tag.startsWith('pt')) return 'pt-BR';
    const base = locales.find(([code]) => code === tag.split('-')[0]);
    if (base) return base[0];
  }
  return 'en';
}
