// Deep imports of @dbml/core (CommonJS, no types for these paths). See erd/dbml.ts.
declare module "@dbml/core/lib/parse/dbmlParser" {
  const parser: { parse: (input: string) => unknown };
  export default parser;
}
declare module "@dbml/core/lib/model_structure/database" {
  const Database: new (raw: unknown) => unknown;
  export default Database;
}
