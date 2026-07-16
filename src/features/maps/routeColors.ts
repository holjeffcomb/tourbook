// A palette of distinct, map-legible hues used to colour-code tour routes on the
// list maps (My Tours / Friends' Tours). Colours are assigned by the tour's
// position in the list, so each route stays visually tied to its list row.
export const ROUTE_PALETTE = [
  '#8FB9D9', // ice blue
  '#E39B8F', // salmon
  '#B4A7D6', // lavender
  '#9DC3A0', // sage
  '#E1C68A', // sand
  '#8FC2BA', // muted teal
  '#D3A0C1', // mauve
  '#A6AEDB', // periwinkle
  '#C9A18C', // terracotta
  '#93A7C7', // slate blue
] as const;

export function routeColorAt(index: number): string {
  const i = index < 0 ? 0 : index;
  return ROUTE_PALETTE[i % ROUTE_PALETTE.length];
}
