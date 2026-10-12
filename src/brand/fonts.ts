/**
 * Notch brand fonts, self-hosted through @fontsource (no Google Fonts requests).
 * Only the Latin subset of the brand faces is bundled, plus the Arabic subset of IBM Plex Sans Arabic:
 * Unbounded / Manrope / JetBrains Mono have no Arabic, so Arabic glyphs fall through to IBM Plex Sans Arabic
 * (see the stacks in tokens.css). Every face uses font-display: swap.
 *
 *   Unbounded 500 / 700   display: headlines, product names, big numbers
 *   Manrope 400-700       text and UI
 *   JetBrains Mono 400/500  specs, SKU, labels, section indices
 *   IBM Plex Sans Arabic 400-700  Arabic headings and text
 */
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css';
