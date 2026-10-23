/** The figure generator met data it cannot build a figure from. */
export class FigureBuildError extends Error {
  override name = 'FigureBuildError';

  constructor(message: string) {
    super(message);
    console.error(message);
  }
}
