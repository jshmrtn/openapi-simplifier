import { parse, stringify } from "yaml";
import {
  isReferenceObject,
  isSchemaObject,
  MediaTypeObject,
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from "openapi3-ts";

type SchemaEntry = SchemaObject | ReferenceObject;

export function simplifySchema(content: string): string {
  return compose(
    compose(
      compose(readSchema, duplicateReadWriteSchemas),
      repointSchemaReferences
    ),
    (schema) => stringify(schema, { indent: 2, aliasDuplicateObjects: false })
  )(content);
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

function repointOperation(
  schema: OperationObject | undefined
): OperationObject | undefined {
  if (schema === undefined) return undefined;

  return {
    ...schema,
    responses: Object.fromEntries(
      Object.entries(schema.responses).map(([code, response]) => [
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
    schema: updateDuplicatedSchemaRef("Write")(schema.schema),
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
    schema: updateDuplicatedSchemaRef(append)(schema.schema),
  };
}

function isSpecifiedPath(path: PathItemObject | any): path is PathItemObject {
  return typeof path === "object";
}

function isResponseObject(
  response: ResponseObject | any
): response is ResponseObject {
  return "description" in response;
}

function isRequestBody(
  response: RequestBodyObject | any
): response is RequestBodyObject {
  return response !== undefined && "content" in response;
}

function isRequestParameter(
  parameter: ParameterObject | any
): parameter is ParameterObject {
  return parameter !== undefined && "in" in parameter;
}

function traverseDefinition(
  schema: SchemaEntry,
  callback: (schema: SchemaEntry) => SchemaEntry
): SchemaEntry {
  schema = callback(schema);

  if(!isSchemaObject(schema)) return schema;

  if ((schema.allOf ?? schema.anyOf ?? schema.oneOf) !== undefined) {
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
      discriminator: (schema.discriminator !== undefined) ? {
        ...schema.discriminator,
        mapping: (schema.discriminator.mapping !== undefined)
        ?  Object.fromEntries(Object.entries(schema.discriminator.mapping).map(([name, $ref]) => [name, traverseBareReference($ref, callback)]))
        : Object.fromEntries( ([...(schema.allOf ?? []), ...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].map((definition) => {
          if(!isReferenceObject(definition)) return [null, traverseDefinition(definition, callback)];

          return [definition.$ref.split('/').pop(), traverseBareReference(definition.$ref, callback)];
        }).filter(([name, $ref]) => name !== null)))
      } : undefined
    };
  } else if (schema.not !== undefined) {
    return {
      ...schema,
      not: traverseDefinition(schema.not, callback),
    };
  } else if (isSchemaObject(schema) &&
    schema.type === "array" &&
    schema.items !== undefined
  ) {
    return {
      ...schema,
      items: traverseDefinition(schema.items, callback),
    };
  } else if (isSchemaObject(schema) &&   schema.type === "object" &&
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

function traverseBareReference($ref: ReferenceObject["$ref"], callback: (schema: SchemaEntry) => SchemaEntry): ReferenceObject["$ref"] {
  const traversedDefinition =  traverseDefinition({$ref}, callback);
          if(!isReferenceObject(traversedDefinition)) throw new Error(`Invalid definition ${JSON.stringify(traversedDefinition)}`);

          return traversedDefinition.$ref
}

function filterObjectProperties(
  schema: SchemaEntry,
  condition: (field: SchemaEntry) => boolean
): SchemaEntry {
  if(!isSchemaObject(schema)) return schema;
  if (schema.properties === undefined) return schema;

  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(schema.properties).filter(([name, field]) =>
        condition(field)
      )
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
    if(!isReferenceObject(schema)) return schema;

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
