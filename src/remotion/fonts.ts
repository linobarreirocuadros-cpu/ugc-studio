// Tipografías incluidas dentro del programa (paquetes @fontsource): funcionan sin internet
// en la vista previa y en la exportación. Se cargan solo las que usa el proyecto.
// El subconjunto "latin" incluye tildes, ñ, ¿ y ¡.
import { loadFont } from "@remotion/fonts";
import montserrat_400 from "@fontsource/montserrat/files/montserrat-latin-400-normal.woff2";
import montserrat_700 from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff2";
import montserrat_900 from "@fontsource/montserrat/files/montserrat-latin-900-normal.woff2";
import inter_400 from "@fontsource/inter/files/inter-latin-400-normal.woff2";
import inter_700 from "@fontsource/inter/files/inter-latin-700-normal.woff2";
import inter_900 from "@fontsource/inter/files/inter-latin-900-normal.woff2";
import poppins_400 from "@fontsource/poppins/files/poppins-latin-400-normal.woff2";
import poppins_700 from "@fontsource/poppins/files/poppins-latin-700-normal.woff2";
import poppins_900 from "@fontsource/poppins/files/poppins-latin-900-normal.woff2";
import dm_sans_400 from "@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff2";
import dm_sans_700 from "@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff2";
import dm_sans_900 from "@fontsource/dm-sans/files/dm-sans-latin-900-normal.woff2";
import roboto_400 from "@fontsource/roboto/files/roboto-latin-400-normal.woff2";
import roboto_700 from "@fontsource/roboto/files/roboto-latin-700-normal.woff2";
import roboto_900 from "@fontsource/roboto/files/roboto-latin-900-normal.woff2";
import lato_400 from "@fontsource/lato/files/lato-latin-400-normal.woff2";
import lato_700 from "@fontsource/lato/files/lato-latin-700-normal.woff2";
import lato_900 from "@fontsource/lato/files/lato-latin-900-normal.woff2";
import raleway_400 from "@fontsource/raleway/files/raleway-latin-400-normal.woff2";
import raleway_700 from "@fontsource/raleway/files/raleway-latin-700-normal.woff2";
import raleway_900 from "@fontsource/raleway/files/raleway-latin-900-normal.woff2";
import oswald_400 from "@fontsource/oswald/files/oswald-latin-400-normal.woff2";
import oswald_700 from "@fontsource/oswald/files/oswald-latin-700-normal.woff2";
import anton_400 from "@fontsource/anton/files/anton-latin-400-normal.woff2";
import bebas_neue_400 from "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2";
import archivo_black_400 from "@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff2";
import playfair_display_400 from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2";
import playfair_display_700 from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2";
import playfair_display_900 from "@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2";
import dm_serif_display_400 from "@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2";

/** Familia → { grosor: url del archivo .woff2 } */
const FONTS: Record<string, Record<number, string>> = {
  "Montserrat": { 400: montserrat_400, 700: montserrat_700, 900: montserrat_900 },
  "Inter": { 400: inter_400, 700: inter_700, 900: inter_900 },
  "Poppins": { 400: poppins_400, 700: poppins_700, 900: poppins_900 },
  "DM Sans": { 400: dm_sans_400, 700: dm_sans_700, 900: dm_sans_900 },
  "Roboto": { 400: roboto_400, 700: roboto_700, 900: roboto_900 },
  "Lato": { 400: lato_400, 700: lato_700, 900: lato_900 },
  "Raleway": { 400: raleway_400, 700: raleway_700, 900: raleway_900 },
  "Oswald": { 400: oswald_400, 700: oswald_700 },
  "Anton": { 400: anton_400 },
  "Bebas Neue": { 400: bebas_neue_400 },
  "Archivo Black": { 400: archivo_black_400 },
  "Playfair Display": { 400: playfair_display_400, 700: playfair_display_700, 900: playfair_display_900 },
  "DM Serif Display": { 400: dm_serif_display_400 },
};

export const FONT_FAMILIES = Object.keys(FONTS);

const loaded = new Set<string>();

const availableWeights = (family: string) =>
  Object.keys(FONTS[family] ?? {})
    .map(Number)
    .sort((a, b) => a - b);

/** Nombre de la familia principal (los proyectos viejos guardaban listas tipo "Montserrat, Arial"). */
export const primaryFamily = (fontFamily: string) => fontFamily.split(",")[0].replace(/["']/g, "").trim();

/** Carga la fuente si es una de las incluidas. Se puede llamar muchas veces sin costo. */
export const ensureFont = (fontFamily: string) => {
  const family = primaryFamily(fontFamily);
  const files = FONTS[family];
  if (!files || loaded.has(family)) return;
  loaded.add(family);
  for (const [weight, url] of Object.entries(files)) {
    loadFont({ family, url, weight, format: "woff2" });
  }
};

/** CSS font-family con respaldo. */
export const cssFont = (fontFamily: string) => `"${primaryFamily(fontFamily)}", Helvetica, Arial, sans-serif`;

/** El grosor más cercano al pedido que la fuente realmente tiene (evita negritas falsas). */
export const fontWeightFor = (fontFamily: string, desired: number) => {
  const weights = availableWeights(primaryFamily(fontFamily));
  if (weights.length === 0) return desired;
  return weights.reduce((best, w) => (Math.abs(w - desired) < Math.abs(best - desired) ? w : best));
};
