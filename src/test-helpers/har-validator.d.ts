declare module "har-validator" {
  const validator: {
    /** Resolves with the data if it's a valid HAR, and rejects with the schema's errors otherwise */
    har: (data: unknown) => Promise<unknown>;
  };
  export default validator;
}
