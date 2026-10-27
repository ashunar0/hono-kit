/**
 * File responses. Declared under 200 in responses (`200: file()`) and returned with reply.success({ body, contentType }).
 * A file is sent as it is, so there is nothing to choose by Accept, and its type is known only from the file itself
 */

/** Marks a response declaration as a file */
export const FILE: unique symbol = Symbol("hnk.file");

export type FileResponse = {
  readonly [FILE]: true;
  readonly description: string;
};

/** What reply.success takes on a route that declares file(). contentType defaults to application/octet-stream */
export type FileBody = {
  body: string | ArrayBuffer | Blob | ReadableStream | Uint8Array<ArrayBuffer>;
  contentType?: string;
};

/** A file response, sent as it is. Put it under 200: `responses: { 200: file() }` */
export const file = (): FileResponse => ({ [FILE]: true, description: "A file" });

export const isFile = (entry: unknown): entry is FileResponse =>
  typeof entry === "object" && entry !== null && FILE in entry;
