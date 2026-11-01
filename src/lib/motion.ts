/**
 * `prefers-reduced-motion` only applies to *decorative* movement here.
 *
 * The step animations of the visualizations are not decoration: the travelling
 * badge, the layout shifts and the fades are the explanation of the algorithm
 * (and the speed slider / "Krokovat" exist precisely to control them). Zeroing
 * them would make nodes teleport, i.e. remove the content. So only incidental
 * motion — the automatic zoom/pan of the viewport — is switched off.
 */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
