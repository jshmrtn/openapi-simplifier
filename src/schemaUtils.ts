/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PathItemObject,
  isReferenceObject,
  isSchemaObject,
  type ParameterObject,
  type ReferenceObject,
  type RequestBodyObject,
  type ResponseObject,
  type SchemaObject,
} from "openapi3-ts/oas31";

export type SchemaEntry = SchemaObject | ReferenceObject;
export function isSpecifiedPath(
  path: PathItemObject | any
): path is PathItemObject {
  return typeof path === "object";
}

export function isResponseObject(
  response: ResponseObject | any
): response is ResponseObject {
  return "description" in response;
}

export function isRequestBody(
  response: RequestBodyObject | any
): response is RequestBodyObject {
  return response !== undefined && "content" in response;
}

export function isRequestParameter(
  parameter: ParameterObject | any
): parameter is ParameterObject {
  return parameter !== undefined && "in" in parameter;
}

export function traverseDefinition(
  schema: SchemaEntry,
  callback: (schema: SchemaEntry) => SchemaEntry
): SchemaEntry {
  schema = callback(schema);

  if (!isSchemaObject(schema)) return schema;

  if (
    (schema.allOf ?? schema.anyOf ?? schema.oneOf ?? schema.discriminator) !==
    undefined
  ) {
    return {
      ...schema,
      allOf: schema.allOf?.map((subSchema) =>
        traverseDefinition(subSchema, callback)
      ),
      anyOf: schema.anyOf?.map((subSchema) =>
        traverseDefinition(subSchema, callback)
      ),
      oneOf: schema.oneOf?.map((subSchema) =>
        traverseDefinition(subSchema, callback)
      ),
      discriminator:
        schema.discriminator !== undefined
          ? {
              ...schema.discriminator,
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              mapping:
                schema.discriminator.mapping !== undefined
                  ? Object.fromEntries(
                      Object.entries(schema.discriminator.mapping).map(
                        ([name, $ref]) => [
                          name,
                          traverseBareReference($ref, callback),
                        ]
                      )
                    )
                  : Object.fromEntries(
                      [
                        ...(schema.allOf ?? []),
                        ...(schema.anyOf ?? []),
                        ...(schema.oneOf ?? []),
                      ]
                        .map((definition) => {
                          if (!isReferenceObject(definition))
                            return [
                              null,
                              traverseDefinition(definition, callback),
                            ];

                          return [
                            definition.$ref.split("/").pop(),
                            traverseBareReference(definition.$ref, callback),
                          ];
                        })
                        .filter(([name]) => name !== null)
                    ),
            }
          : undefined,
      properties:
        schema.properties !== undefined
          ? Object.fromEntries(
              Object.entries(schema.properties).map(
                ([property, definition]) => [
                  property,
                  traverseDefinition(definition, callback),
                ]
              )
            )
          : undefined,
    };
  } else if (schema.not !== undefined) {
    return {
      ...schema,
      not: traverseDefinition(schema.not, callback),
    };
  } else if (
    isSchemaObject(schema) &&
    schema.type === "array" &&
    schema.items !== undefined
  ) {
    return {
      ...schema,
      items: traverseDefinition(schema.items, callback),
    };
  } else if (
    isSchemaObject(schema) &&
    schema.type === "object" &&
    schema.properties !== undefined
  ) {
    return {
      ...schema,
      properties: Object.fromEntries(
        Object.entries(schema.properties).map(([property, definition]) => [
          property,
          traverseDefinition(definition, callback),
        ])
      ),
    };
  }

  return schema;
}

export function traverseBareReference(
  $ref: ReferenceObject["$ref"],
  callback: (schema: SchemaEntry) => SchemaEntry
): ReferenceObject["$ref"] {
  const traversedDefinition = traverseDefinition({ $ref }, callback);
  if (!isReferenceObject(traversedDefinition))
    throw new Error(
      `Invalid definition ${JSON.stringify(traversedDefinition)}`
    );

  return traversedDefinition.$ref;
}

export function filterObjectProperties(
  schema: SchemaEntry,
  condition: (field: SchemaEntry) => boolean
): SchemaEntry {
  if (!isSchemaObject(schema)) return schema;
  if (schema.properties === undefined) return schema;

  const properties = Object.fromEntries(
    Object.entries(schema.properties).filter(([, field]) => condition(field))
  );

  const required = schema.required?.filter((name) => name in properties);

  return { ...schema, properties, required };
}
