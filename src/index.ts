/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ContentObject,
  isReferenceObject,
  type MediaTypeObject,
  type OpenAPIObject,
  type OperationObject,
  type ParameterObject,
  type ReferenceObject,
  type RequestBodyObject,
  type ResponseObject,
  type SchemaObject,
} from "openapi3-ts/oas31";
import { parse, stringify } from "yaml";
import { extractSchemaVersion } from "./optimizations/extractSchemaVersion";
import {
  filterObjectProperties,
  isRequestBody,
  isRequestParameter,
  isResponseObject,
  isSpecifiedPath,
  traverseDefinition,
} from "./schemaUtils";

type SchemaEntry = SchemaObject | ReferenceObject;

export const availableOptimizations = {
  "duplicate-read-write-schema": duplicateReadWriteSchemas,
  "repoint-schema-refs": repointSchemaReferences,
  "remove-duplicate-json-content": removeDuplicateJsonContent,
  "filter-content-types": filterContentTypes,
  "extract-schema-version": extractSchemaVersion,
};

export type OptimizationKey = keyof typeof availableOptimizations;

export type OptimizationArgs = {
  allowedResponseContentTypes?: string[];
  schemaVersionMimeType?: string;
  schemaVersionMimeTypeFallback?: string[];
};

export function simplifySchemaString(
  content: string,
  optimizations: OptimizationKey[] = Object.keys(
    availableOptimizations
  ) as OptimizationKey[],
  optimizationArgs?: OptimizationArgs
): string {
  const parsedSchema = readSchema(content);
  const simplifiedSchema = simplifySchema(
    parsedSchema,
    optimizations,
    optimizationArgs
  );
  return stringify(simplifiedSchema, {
    indent: 2,
    aliasDuplicateObjects: false,
  });
}

export function simplifySchema(
  content: OpenAPIObject,
  optimizations: OptimizationKey[] = Object.keys(
    availableOptimizations
  ) as OptimizationKey[],
  optimizationArgs?: OptimizationArgs
): OpenAPIObject {
  let schema = content;
  for (const optKey of optimizations) {
    schema = availableOptimizations[optKey](schema, optimizationArgs);
  }
  return schema;
}

function readSchema(content: string): OpenAPIObject {
  return parse(content);
}

function duplicateReadWriteSchemas(schema: OpenAPIObject): OpenAPIObject {
  if (schema.components == null) return schema;
  if (schema.components.schemas == null) return schema;

  return {
    ...schema,
    components: {
      ...schema.components,
      schemas: Object.fromEntries(
        Object.entries(schema.components.schemas)
          .map(([schemaName, schemaDefinition]) => {
            return [
              [
                `${schemaName}Read`,
                traverseDefinition(
                  schemaDefinition,
                  compose(removeWriteOnly, updateDuplicatedSchemaRef("Read"))
                ),
              ],
              [
                `${schemaName}Write`,
                traverseDefinition(
                  schemaDefinition,
                  compose(removeReadOnly, updateDuplicatedSchemaRef("Write"))
                ),
              ],
            ];
          })
          .flat()
      ),
    },
  };
}

function repointSchemaReferences(schema: OpenAPIObject): OpenAPIObject {
  if (schema.paths == null) return schema;

  return {
    ...schema,
    paths: Object.fromEntries(
      Object.entries(schema.paths).map(([path, pathDefinition]) => {
        if (!isSpecifiedPath(pathDefinition)) return [path, pathDefinition];

        return [
          path,
          {
            ...pathDefinition,
            get: repointOperation(pathDefinition.get),
            put: repointOperation(pathDefinition.put),
            post: repointOperation(pathDefinition.post),
            delete: repointOperation(pathDefinition.delete),
            options: repointOperation(pathDefinition.options),
            head: repointOperation(pathDefinition.head),
            patch: repointOperation(pathDefinition.patch),
            trace: repointOperation(pathDefinition.trace),
          },
        ];
      })
    ),
  };
}

function removeDuplicateJsonContentInContent(
  content: ContentObject
): ContentObject {
  const resContent: ContentObject = {};
  Object.entries(content ?? {}).forEach(([newKey, newMediaObj]) => {
    const duplicateMediaObj = Object.entries(resContent).find(
      ([_, mediaObj]) =>
        JSON.stringify(mediaObj) === JSON.stringify(newMediaObj)
    );
    if (!duplicateMediaObj) {
      resContent[newKey] = newMediaObj;
      return;
    }
    if (newKey !== "application/json") {
      return;
    }
    delete resContent[duplicateMediaObj[0]];
    resContent[newKey] = newMediaObj;
  });
  return resContent;
}

function filterContentTypes(
  schema: OpenAPIObject,
  args?: OptimizationArgs
): OpenAPIObject {
  if (!schema.paths) return schema;

  const whitelist = args?.allowedResponseContentTypes ?? [];
  if (whitelist.length === 0) {
    return schema;
  }

  return {
    ...schema,
    paths: Object.fromEntries(
      Object.entries(schema.paths).map(([path, pathDefinition]) => {
        if (!isSpecifiedPath(pathDefinition)) return [path, pathDefinition];

        return [
          path,
          {
            ...pathDefinition,
            get: filterContentTypesInOperation(pathDefinition.get, whitelist),
            put: filterContentTypesInOperation(pathDefinition.put, whitelist),
            post: filterContentTypesInOperation(pathDefinition.post, whitelist),
            delete: filterContentTypesInOperation(
              pathDefinition.delete,
              whitelist
            ),
            options: filterContentTypesInOperation(
              pathDefinition.options,
              whitelist
            ),
            head: filterContentTypesInOperation(pathDefinition.head, whitelist),
            patch: filterContentTypesInOperation(
              pathDefinition.patch,
              whitelist
            ),
            trace: filterContentTypesInOperation(
              pathDefinition.trace,
              whitelist
            ),
          },
        ];
      })
    ),
  };
}

function filterContentTypesInOperation(
  schema: OperationObject | undefined,
  whitelist: string[]
): OperationObject | undefined {
  if (schema === undefined) return undefined;

  const getRequestBody = (
    requestBody: RequestBodyObject | ReferenceObject | undefined
  ): RequestBodyObject | ReferenceObject | undefined => {
    if (!requestBody || !("content" in requestBody)) {
      return requestBody;
    }
    const newRequestBody = { ...requestBody };
    newRequestBody.content = filterContentTypesInContent(
      newRequestBody.content,
      whitelist
    );
    return newRequestBody;
  };

  return {
    ...schema,
    requestBody: getRequestBody(schema.requestBody),
    responses: Object.fromEntries(
      Object.entries<ResponseObject | ReferenceObject>(
        schema.responses ?? {}
      ).map(([code, response]) => {
        if ("content" in response && response.content) {
          return [
            code,
            {
              ...response,
              content: filterContentTypesInContent(response.content, whitelist),
            },
          ];
        }

        return [code, { response }];
      })
    ),
  };
}

function filterContentTypesInContent(
  content: ContentObject,
  whitelist: string[]
): ContentObject {
  const resContent: ContentObject = {};
  Object.entries(content ?? {}).forEach(([newKey, newMediaObj]) => {
    if (whitelist.includes(newKey)) {
      resContent[newKey] = newMediaObj;
    }
  });
  return resContent;
}

function removeDuplicateJsonContentInOperation(
  schema: OperationObject | undefined
): OperationObject | undefined {
  if (schema === undefined) return undefined;

  const getRequestBody = (
    requestBody: RequestBodyObject | ReferenceObject | undefined
  ): RequestBodyObject | ReferenceObject | undefined => {
    if (!requestBody || !("content" in requestBody)) {
      return requestBody;
    }
    const newRequestBody = { ...requestBody };
    newRequestBody.content = removeDuplicateJsonContentInContent(
      newRequestBody.content
    );
    return newRequestBody;
  };

  return {
    ...schema,
    requestBody: getRequestBody(schema.requestBody),
    responses: Object.fromEntries(
      Object.entries<ResponseObject | ReferenceObject>(
        schema.responses ?? {}
      ).map(([code, response]) => {
        if ("content" in response && response.content) {
          return [
            code,
            {
              ...response,
              content: removeDuplicateJsonContentInContent(response.content),
            },
          ];
        }

        return [code, { response }];
      })
    ),
  };
}

function removeDuplicateJsonContent(schema: OpenAPIObject): OpenAPIObject {
  if (!schema.paths) return schema;

  return {
    ...schema,
    paths: Object.fromEntries(
      Object.entries(schema.paths).map(([path, pathDefinition]) => {
        if (!isSpecifiedPath(pathDefinition)) return [path, pathDefinition];

        return [
          path,
          {
            ...pathDefinition,
            get: removeDuplicateJsonContentInOperation(pathDefinition.get),
            put: removeDuplicateJsonContentInOperation(pathDefinition.put),
            post: removeDuplicateJsonContentInOperation(pathDefinition.post),
            delete: removeDuplicateJsonContentInOperation(
              pathDefinition.delete
            ),
            options: removeDuplicateJsonContentInOperation(
              pathDefinition.options
            ),
            head: removeDuplicateJsonContentInOperation(pathDefinition.head),
            patch: removeDuplicateJsonContentInOperation(pathDefinition.patch),
            trace: removeDuplicateJsonContentInOperation(pathDefinition.trace),
          },
        ];
      })
    ),
  };
}

function repointOperation(
  schema: OperationObject | undefined
): OperationObject | undefined {
  if (schema === undefined) return undefined;

  return {
    ...schema,
    responses: Object.fromEntries(
      Object.entries(schema.responses ?? {}).map(([code, response]) => [
        code,
        repointResponse(response),
      ])
    ),
    requestBody: repointRequestBody(schema.requestBody),
    parameters: schema.parameters?.map(repointRequestparameter),
  };
}

function repointRequestparameter(
  schema: ParameterObject | ReferenceObject
): ParameterObject | ReferenceObject {
  if (!isRequestParameter(schema)) return schema;
  if (schema.schema === undefined) return schema;

  return {
    ...schema,
    schema: traverseDefinition(
      schema.schema,
      updateDuplicatedSchemaRef("Write")
    ),
  };
}

function repointRequestBody(
  schema: RequestBodyObject | ReferenceObject | any
): RequestBodyObject | ReferenceObject | any {
  if (!isRequestBody(schema)) return schema;

  return {
    ...schema,
    content: Object.fromEntries(
      Object.entries(schema.content).map(([mediaType, definition]) => [
        mediaType,
        repointMediaType(definition, "Write"),
      ])
    ),
  };
}

function repointResponse(
  schema: ResponseObject | ReferenceObject | any
): ResponseObject | ReferenceObject | any {
  if (!isResponseObject(schema)) return schema;
  if (!("content" in schema)) return schema;
  if (schema.content === undefined) return schema;
  return {
    ...schema,
    content: Object.fromEntries(
      Object.entries(schema.content).map(([mediaType, definition]) => [
        mediaType,
        repointMediaType(definition, "Read"),
      ])
    ),
  };
}

function repointMediaType(
  schema: MediaTypeObject,
  append: string
): MediaTypeObject {
  if (schema.schema == null) return schema;

  return {
    ...schema,
    schema: traverseDefinition(
      schema.schema,
      updateDuplicatedSchemaRef(append)
    ),
  };
}

function removeWriteOnly(schema: SchemaEntry): SchemaEntry {
  return filterObjectProperties(
    schema,
    (field) => !("writeOnly" in field) || field.writeOnly === false
  );
}

function removeReadOnly(schema: SchemaEntry): SchemaEntry {
  return filterObjectProperties(
    schema,
    (field) => !("readOnly" in field) || field.readOnly === false
  );
}

function updateDuplicatedSchemaRef(
  append: string
): (schema: SchemaEntry) => SchemaEntry {
  return (schema) => {
    if (!isReferenceObject(schema)) return schema;

    return {
      ...schema,
      $ref: `${schema.$ref}${append}`,
    };
  };
}

function compose<A, B, C>(
  one: (one: A) => B,
  two: (two: B) => C
): (one: A) => C {
  return (input) => two(one(input));
}
