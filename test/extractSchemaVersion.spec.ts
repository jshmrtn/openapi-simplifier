import { describe, expect, test } from "@jest/globals";
import { type OpenAPIObject } from "openapi3-ts/oas31";
import { extractSchemaVersion } from "../src/optimizations/extractSchemaVersion";

type RecursivePartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U>
    ? Array<RecursivePartial<U>>
    : T[P] extends object
      ? RecursivePartial<T[P]>
      : T[P];
};

type OptionalOpenAPIObject = RecursivePartial<OpenAPIObject>;

const baseSchema: OpenAPIObject = {
  openapi: "3.0.0",
  info: {
    title: "test",
    version: "0",
  },
  paths: {},
};

describe("extract schema versions", () => {
  test("no fallbacks", () => {
    const input: OpenAPIObject = {
      ...baseSchema,
      paths: {
        "/api/myRequest": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/vnd.mycompany.v1+json": {
                    schema: { type: "string" },
                  },
                  "application/vnd.mycompany.v2+json": {
                    schema: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const expected: OptionalOpenAPIObject = {
      paths: {
        "/api/myRequest": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "integer" },
                  },
                },
              },
            },
          },
          head: undefined,
          options: undefined,
          patch: undefined,
          post: undefined,
          put: undefined,
          trace: undefined,
          delete: undefined,
        },
      },
    };

    expect(
      extractSchemaVersion(input, {
        schemaVersionMimeType: "application/vnd.mycompany.v2+json",
      })
    ).toMatchObject(expected);
  });

  test("fallback", () => {
    const input: OpenAPIObject = {
      ...baseSchema,
      paths: {
        "/api/myRequest": {
          post: {
            requestBody: {
              content: {
                "application/vnd.mycompany.v1+json": {
                  schema: { type: "string" },
                },
                "application/vnd.mycompany.v2+json": {
                  schema: { type: "integer" },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/vnd.mycompany.v1+json": {
                    schema: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    };
    const expected: OptionalOpenAPIObject = {
      paths: {
        "/api/myRequest": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "integer" },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "string" },
                  },
                },
              },
            },
          },
          head: undefined,
          options: undefined,
          patch: undefined,
          get: undefined,
          put: undefined,
          trace: undefined,
          delete: undefined,
        },
      },
    };

    expect(
      extractSchemaVersion(input, {
        schemaVersionMimeType: "application/vnd.mycompany.v2+json",
        schemaVersionMimeTypeFallback: ["application/vnd.mycompany.v1+json"],
      })
    ).toMatchObject(expected);
  });
});
