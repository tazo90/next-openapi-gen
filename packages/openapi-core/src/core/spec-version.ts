export type SpecVersionProcessor<TDocument> = {
  readonly id: string;
  readonly version: string;
  finalize(document: TDocument): TDocument;
};
