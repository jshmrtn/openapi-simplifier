import {
  ContentObject,
  OpenAPIObject,
  OperationObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
} from "openapi3-ts/oas31";
import { isSpecifiedPath } from "../schemaUtils";
import { OptimizationArgs } from "..";

type Options = {
  mimeTypes: string[];
};

export function extractSchemaVersion(
  schema: OpenAPIObject,
  optimizationArgs?: OptimizationArgs
): OpenAPIObject {
  if (!schema.paths) return schema;

  if (!optimizationArgs?.schemaVersionMimeType) {
    throw new Error("Missing option schema-version-mime-type");
  }

  const options: Options = {
    mimeTypes: [
      optimizationArgs.schemaVersionMimeType,
      ...(optimizationArgs.schemaVersionMimeTypeFallback ?? []),
      "application/json",
    ],
  };

  return {
    ...schema,
    paths: Object.fromEntries(
      Object.entries(schema.paths).map(([path, pathDefinition]) => {
        if (!isSpecifiedPath(pathDefinition)) return [path, pathDefinition];

        return [
          path,
          {
            ...pathDefinition,
            get: extractInOperation(pathDefinition.get, options),
            put: extractInOperation(pathDefinition.put, options),
            post: extractInOperation(pathDefinition.post, options),
            delete: extractInOperation(pathDefinition.delete, options),
            options: extractInOperation(pathDefinition.options, options),
            head: extractInOperation(pathDefinition.head, options),
            patch: extractInOperation(pathDefinition.patch, options),
            trace: extractInOperation(pathDefinition.trace, options),
          },
        ];
      })
    ),
  };
}

function extractInOperation(
  schema: OperationObject | undefined,
  options: Options
): OperationObject | undefined {
  if (schema === undefined) return undefined;

  const getRequestBody = (
    requestBody: RequestBodyObject | ReferenceObject | undefined
  ): RequestBodyObject | ReferenceObject | undefined => {
    if (!requestBody || !("content" in requestBody)) {
      return requestBody;
    }
    const newRequestBody = { ...requestBody };
    newRequestBody.content = extractInContent(newRequestBody.content, options);
    return newRequestBody;
  };

  return {
    ...schema,
    requestBody: getRequestBody(schema.requestBody),
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    responses: Object.fromEntries(
      Object.entries<ResponseObject | ReferenceObject>(
        schema.responses ?? {}
      ).map(([code, response]) => {
        if ("content" in response && response.content) {
          return [
            code,
            {
              ...response,
              content: extractInContent(response.content, options),
            },
          ];
        }

        return [code, { response }];
      })
    ),
  };
}

function extractInContent(
  content: ContentObject,
  options: Options
): ContentObject {
  for (const mimeType of options.mimeTypes) {
    if (mimeType in content) {
      return {
        "application/json": content[mimeType],
      };
    }
  }
  return content;
}
