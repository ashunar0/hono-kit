/**
 * Types for Standard Schema (https://standardschema.dev). hono-kit does not pick a schema library;
 * it accepts anything that has this shape (zod, valibot, ...). Types only, so no added dependency
 */
export interface StandardSchema<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly types?:
      { readonly input: Input; readonly output: Output } | undefined;
    readonly validate: (
      value: unknown,
    ) => StandardResult<Output> | Promise<StandardResult<Output>>;
  };
}

export type StandardResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardIssue> };

/** One problem a schema found. path is where in the value (`["items", 0, "name"]`), missing for the value itself */
export type StandardIssue = {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
};

export type InferInput<S extends StandardSchema<any, any>> = NonNullable<
  S["~standard"]["types"]
>["input"];

export type InferOutput<S extends StandardSchema<any, any>> = NonNullable<
  S["~standard"]["types"]
>["output"];

/** A schema that can produce JSON Schema. Needed only for OpenAPI documents (Standard JSON Schema) */
export type JsonSchemaCapable = {
  readonly "~standard": {
    readonly jsonSchema: {
      readonly input: (options: JsonSchemaOptions) => Record<string, unknown>;
      readonly output: (options: JsonSchemaOptions) => Record<string, unknown>;
    };
  };
};

export type JsonSchemaOptions = {
  target: string;
  /** Library-specific options. Libraries that do not know them ignore them */
  libraryOptions?: Record<string, unknown>;
};

const canEmitJsonSchema = (
  schema: StandardSchema<any, any>,
): schema is StandardSchema<any, any> & JsonSchemaCapable =>
  "jsonSchema" in schema["~standard"];

/**
 * Converts a schema to JSON Schema. Throws, with what to use instead, if the schema cannot.
 * Drops each schema's `$schema`, since it is embedded in the document
 */
export const toJsonSchema = (
  schema: StandardSchema<any, any>,
  io: "input" | "output",
  options: JsonSchemaOptions,
): Record<string, unknown> => {
  if (!canEmitJsonSchema(schema))
    throw new Error(
      `This schema (${schema["~standard"].vendor}) cannot produce JSON Schema. For OpenAPI documents, use a schema that implements Standard JSON Schema`,
    );

  const { $schema: _, ...converted } =
    schema["~standard"].jsonSchema[io](options);

  return converted;
};

/**
 * Creates a schema owned by hono-kit. Validation and JSON Schema are written by hand, with no library dependency.
 * The caller decides the types (Input, Output) to match the validation
 */
export const hnkSchema = <Input, Output>(
  validate: (
    value: unknown,
  ) => StandardResult<Output> | Promise<StandardResult<Output>>,
  jsonSchema: (
    io: "input" | "output",
    options: JsonSchemaOptions,
  ) => Record<string, unknown>,
): StandardSchema<Input, Output> & JsonSchemaCapable => ({
  "~standard": {
    version: 1,
    vendor: "hnk",
    validate,
    jsonSchema: {
      input: (options) => jsonSchema("input", options),
      output: (options) => jsonSchema("output", options),
    },
  },
});

/** Returns a single validation issue */
export const issue = (message: string) => ({ issues: [{ message }] }) as const;
