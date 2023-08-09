import { describe, expect, test } from "@jest/globals";
import { simplifySchema } from "../src";
import { type OpenAPIObject } from "openapi3-ts/oas31";

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

describe("simplifySchema", () => {
  test("duplicates components and removes readOnly / writeOnly respectively", () => {
    const input: OpenAPIObject = {
      ...baseSchema,
      components: {
        schemas: {
          Name: {
            type: "object",
            required: ["readOnly", "writeOnly"],
            properties: {
              readOnly: {
                type: "string",
                readOnly: true,
              },
              writeOnly: {
                type: "string",
                writeOnly: true,
              },
            },
          },
        },
      },
    };
    const expected: OptionalOpenAPIObject = {
      components: {
        schemas: {
          NameRead: {
            type: "object",
            required: ["readOnly"],
            properties: {
              readOnly: {
                type: "string",
              },
            },
          },
          NameWrite: {
            type: "object",
            required: ["writeOnly"],
            properties: {
              writeOnly: {
                type: "string",
              },
            },
          },
        },
      },
    };

    expect(simplifySchema(input)).toMatchObject(expected);
  });

  test("corrects schema names in schemas", () => {
    const input: OpenAPIObject = {
      ...baseSchema,
      components: {
        schemas: {
          Name: {
            type: "object",
          },
          References: {
            $ref: "#/components/schemas/Name",
          },
        },
      },
    };
    const expected: OptionalOpenAPIObject = {
      components: {
        schemas: {
          NameRead: {},
          NameWrite: {},
          ReferencesRead: {
            $ref: "#/components/schemas/NameRead",
          },
          ReferencesWrite: {
            $ref: "#/components/schemas/NameWrite",
          },
        },
      },
    };

    expect(simplifySchema(input)).toMatchObject(expected);
  });

  test("corrects schema names in paths", () => {
    const input: OpenAPIObject = {
      ...baseSchema,
      components: {
        schemas: {
          Name: {
            type: "object",
          },
        },
      },
      paths: {
        "/url": {
          get: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Name",
                  },
                },
              },
            },
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/Name",
                    },
                  },
                },
              },
              "201": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Name",
                      },
                    },
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
        "/url": {
          get: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/NameWrite",
                  },
                },
              },
            },
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/NameRead",
                    },
                  },
                },
              },
              "201": {
                description: "ok",
                content: {
                  "application/json": {
                    schema: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/NameRead",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    expect(simplifySchema(input)).toMatchObject(expected);
  });
});
