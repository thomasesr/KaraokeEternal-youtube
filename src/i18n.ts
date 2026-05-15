import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en_US from './locales/en_US.json'
import pt_BR from './locales/pt_BR.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en_US: { translation: en_US },
      pt_BR: { translation: pt_BR },
    },
    fallbackLng: 'en_US',
    interpolation: { escapeValue: false },
    detection: {
      order: ['navigator'],
      convertDetectedLanguage: (lng: string) => lng.replace('-', '_'),
    },
  })

export default i18n
