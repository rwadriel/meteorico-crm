export class MetaTemplateError extends Error {
  constructor(
    message: string,
    readonly httpStatus = 400,
    readonly metaCode?: number,
  ) {
    super(message);
  }
}
