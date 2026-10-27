/**
 * Builds an OpenAPI document from the registered route declarations. The core of hono-kit does not know OpenAPI,
 * so this is an opt-in part. Conversion to JSON Schema belongs to the schema library itself (Standard JSON Schema)
 */
import type { Hono } from "hono";
import { type ContentMap, isContentMap } from "./content.js";
import { type FileResponse, isFile } from "./file.js";
import { isRedirect, type RedirectResponse } from "./redirect.js";
import { ROUTE } from "./router.js";
import type { AnySchema, ResponseEntry, RouteConfig } from "./route-types.js";
import { toJsonSchema } from "./standard-schema.js";

const TARGET = "draft-2020-12";

/** Options for building the document. libraryOptions are passed through to the schema library as is */
export type OpenapiOptions = { libraryOptions?: Record<string, unknown> };

type Io = "input" | "output";

const jsonSchemaOf = (schema: AnySchema, io: Io, options: OpenapiOptions) =>
  // Types that cannot be expressed become "anything" in the document instead of stopping generation. Explicit options win
  toJsonSchema(schema, io, {
    target: TARGET,
    libraryOptions: { unrepresentable: "any", ...options.libraryOptions },
  });

/** `/users/:id` → `/users/{id}` */
const openapiPath = (path: string) =>
  path.replace(/:([A-Za-z0-9_]+)(\{[^}]*\})?/g, "{$1}");

const parametersOf = (
  schema: AnySchema,
  where: "path" | "query" | "header" | "cookie",
  options: OpenapiOptions,
) => {
  const object = jsonSchemaOf(schema, "input", options) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return Object.entries(object.properties ?? {}).map(([name, property]) => ({
    name,
    in: where,
    required: where === "path" || (object.required ?? []).includes(name),
    schema: property,
  }));
};

const jsonContent = (schema: AnySchema, io: Io, options: OpenapiOptions) => ({
  "application/json": { schema: jsonSchemaOf(schema, io, options) },
});

/** Takes the schema and description from a response declaration (no description for a bare schema) */
const responseOf = (
  entry: Exclude<ResponseEntry, RedirectResponse | FileResponse | ContentMap>,
) =>
  "~standard" in entry ? { schema: entry, description: "" } : entry;

/** Every declared format: JSON with its schema, the rendered ones as strings */
const formatsOf = (formats: ContentMap, options: OpenapiOptions) =>
  Object.fromEntries(
    Object.entries(formats).map(([media, entry]) => [
      media,
      typeof entry === "function"
        ? { schema: { type: "string" } }
        : { schema: jsonSchemaOf(entry, "output", options) },
    ]),
  );

/** A file's type is known only from the file, so it is any binary */
const fileOf = (entry: FileResponse) => ({
  description: entry.description,
  content: {
    "application/octet-stream": { schema: { type: "string", format: "binary" } },
  },
});

/** A redirect has no body, only the Location header */
const redirectOf = (entry: RedirectResponse) => ({
  description: entry.description,
  headers: { Location: { schema: { type: "string" } } },
});

const operationOf = (route: RouteConfig, options: OpenapiOptions) => {
  const { param, query, header, cookie, json } = route.request ?? {};

  return {
    parameters: [
      ...(param ? parametersOf(param, "path", options) : []),
      ...(query ? parametersOf(query, "query", options) : []),
      ...(header ? parametersOf(header, "header", options) : []),
      ...(cookie ? parametersOf(cookie, "cookie", options) : []),
    ],
    ...(json && {
      requestBody: {
        required: true,
        content: jsonContent(json, "input", options),
      },
    }),
    responses: Object.fromEntries(
      Object.entries(route.responses).map(([status, entry]) => {
        if (isRedirect(entry)) return [status, redirectOf(entry)];
        if (isFile(entry)) return [status, fileOf(entry)];
        if (isContentMap(entry))
          return [status, { description: "", content: formatsOf(entry, options) }];
        const { schema, description } = responseOf(entry);

        return [
          status,
          { description, content: jsonContent(schema, "output", options) },
        ];
      }),
    ),
  };
};

/** Builds the document from the routes registered on app.`app.get("/openapi.json", (c) => c.json(openapiDocument(app, info)))` */
export const openapiDocument = (
  app: Hono<any, any, any>,
  info: { title: string; version: string },
  options: OpenapiOptions = {},
) => {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const registered of app.routes) {
    const route = (registered.handler as unknown as { [ROUTE]?: RouteConfig })[
      ROUTE
    ];
    if (!route) continue;

    const path = openapiPath(registered.path);
    // The method of the registration, since createEndpoint declarations do not carry one
    (paths[path] ??= {})[registered.method.toLowerCase()] = operationOf(
      route,
      options,
    );
  }

  return { openapi: "3.1.0", info, paths };
};
