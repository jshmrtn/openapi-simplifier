#!/usr/bin/env node
'use strict';

var commander = require('commander');
var fs = require('fs');
var oas31 = require('openapi3-ts/oas31');
var yaml = require('yaml');

var version = "1.3.0-alpha.2";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
function isSpecifiedPath(path) {
    return typeof path === "object";
}
function isResponseObject(response) {
    return "description" in response;
}
function isRequestBody(response) {
    return response !== undefined && "content" in response;
}
function isRequestParameter(parameter) {
    return parameter !== undefined && "in" in parameter;
}
function traverseDefinition(schema, callback) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    schema = callback(schema);
    if (!oas31.isSchemaObject(schema))
        return schema;
    if (((_c = (_b = (_a = schema.allOf) !== null && _a !== void 0 ? _a : schema.anyOf) !== null && _b !== void 0 ? _b : schema.oneOf) !== null && _c !== void 0 ? _c : schema.discriminator) !==
        undefined) {
        return {
            ...schema,
            allOf: (_d = schema.allOf) === null || _d === void 0 ? void 0 : _d.map((subSchema) => traverseDefinition(subSchema, callback)),
            anyOf: (_e = schema.anyOf) === null || _e === void 0 ? void 0 : _e.map((subSchema) => traverseDefinition(subSchema, callback)),
            oneOf: (_f = schema.oneOf) === null || _f === void 0 ? void 0 : _f.map((subSchema) => traverseDefinition(subSchema, callback)),
            discriminator: schema.discriminator !== undefined
                ? {
                    ...schema.discriminator,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    mapping: schema.discriminator.mapping !== undefined
                        ? Object.fromEntries(Object.entries(schema.discriminator.mapping).map(([name, $ref]) => [
                            name,
                            traverseBareReference($ref, callback),
                        ]))
                        : Object.fromEntries([
                            ...((_g = schema.allOf) !== null && _g !== void 0 ? _g : []),
                            ...((_h = schema.anyOf) !== null && _h !== void 0 ? _h : []),
                            ...((_j = schema.oneOf) !== null && _j !== void 0 ? _j : []),
                        ]
                            .map((definition) => {
                            if (!oas31.isReferenceObject(definition))
                                return [
                                    null,
                                    traverseDefinition(definition, callback),
                                ];
                            return [
                                definition.$ref.split("/").pop(),
                                traverseBareReference(definition.$ref, callback),
                            ];
                        })
                            .filter(([name]) => name !== null)),
                }
                : undefined,
            properties: schema.properties !== undefined
                ? Object.fromEntries(Object.entries(schema.properties).map(([property, definition]) => [
                    property,
                    traverseDefinition(definition, callback),
                ]))
                : undefined,
        };
    }
    else if (schema.not !== undefined) {
        return {
            ...schema,
            not: traverseDefinition(schema.not, callback),
        };
    }
    else if (oas31.isSchemaObject(schema) &&
        schema.type === "array" &&
        schema.items !== undefined) {
        return {
            ...schema,
            items: traverseDefinition(schema.items, callback),
        };
    }
    else if (oas31.isSchemaObject(schema) &&
        schema.type === "object" &&
        schema.properties !== undefined) {
        return {
            ...schema,
            properties: Object.fromEntries(Object.entries(schema.properties).map(([property, definition]) => [
                property,
                traverseDefinition(definition, callback),
            ])),
        };
    }
    return schema;
}
function traverseBareReference($ref, callback) {
    const traversedDefinition = traverseDefinition({ $ref }, callback);
    if (!oas31.isReferenceObject(traversedDefinition))
        throw new Error(`Invalid definition ${JSON.stringify(traversedDefinition)}`);
    return traversedDefinition.$ref;
}
function filterObjectProperties(schema, condition) {
    var _a;
    if (!oas31.isSchemaObject(schema))
        return schema;
    if (schema.properties === undefined)
        return schema;
    const properties = Object.fromEntries(Object.entries(schema.properties).filter(([, field]) => condition(field)));
    const required = (_a = schema.required) === null || _a === void 0 ? void 0 : _a.filter((name) => name in properties);
    return { ...schema, properties, required };
}

function extractSchemaVersion(schema, optimizationArgs) {
    var _a;
    if (!schema.paths)
        return schema;
    if (!(optimizationArgs === null || optimizationArgs === void 0 ? void 0 : optimizationArgs.schemaVersionMimeType)) {
        throw new Error("Missing option schema-version-mime-type");
    }
    const options = {
        mimeTypes: [
            optimizationArgs.schemaVersionMimeType,
            ...((_a = optimizationArgs.schemaVersionMimeTypeFallback) !== null && _a !== void 0 ? _a : []),
            "application/json",
        ],
    };
    return {
        ...schema,
        paths: Object.fromEntries(Object.entries(schema.paths).map(([path, pathDefinition]) => {
            if (!isSpecifiedPath(pathDefinition))
                return [path, pathDefinition];
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
        })),
    };
}
function extractInOperation(schema, options) {
    var _a;
    if (schema === undefined)
        return undefined;
    const getRequestBody = (requestBody) => {
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
        responses: Object.fromEntries(Object.entries((_a = schema.responses) !== null && _a !== void 0 ? _a : {}).map(([code, response]) => {
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
        })),
    };
}
function extractInContent(content, options) {
    for (const mimeType of options.mimeTypes) {
        if (mimeType in content) {
            return {
                "application/json": content[mimeType],
            };
        }
    }
    return content;
}

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
const availableOptimizations = {
    "duplicate-read-write-schema": duplicateReadWriteSchemas,
    "repoint-schema-refs": repointSchemaReferences,
    "remove-duplicate-json-content": removeDuplicateJsonContent,
    "filter-content-types": filterContentTypes,
    "extract-schema-version": extractSchemaVersion,
};
function simplifySchemaString(content, optimizations = Object.keys(availableOptimizations), optimizationArgs) {
    const parsedSchema = readSchema(content);
    const simplifiedSchema = simplifySchema(parsedSchema, optimizations, optimizationArgs);
    return yaml.stringify(simplifiedSchema, {
        indent: 2,
        aliasDuplicateObjects: false,
    });
}
function simplifySchema(content, optimizations = Object.keys(availableOptimizations), optimizationArgs) {
    let schema = content;
    for (const optKey of optimizations) {
        schema = availableOptimizations[optKey](schema, optimizationArgs);
    }
    return schema;
}
function readSchema(content) {
    return yaml.parse(content);
}
function duplicateReadWriteSchemas(schema) {
    if (schema.components == null)
        return schema;
    if (schema.components.schemas == null)
        return schema;
    return {
        ...schema,
        components: {
            ...schema.components,
            schemas: Object.fromEntries(Object.entries(schema.components.schemas)
                .map(([schemaName, schemaDefinition]) => {
                return [
                    [
                        `${schemaName}Read`,
                        traverseDefinition(schemaDefinition, compose(removeWriteOnly, updateDuplicatedSchemaRef("Read"))),
                    ],
                    [
                        `${schemaName}Write`,
                        traverseDefinition(schemaDefinition, compose(removeReadOnly, updateDuplicatedSchemaRef("Write"))),
                    ],
                ];
            })
                .flat()),
        },
    };
}
function repointSchemaReferences(schema) {
    if (schema.paths == null)
        return schema;
    return {
        ...schema,
        paths: Object.fromEntries(Object.entries(schema.paths).map(([path, pathDefinition]) => {
            if (!isSpecifiedPath(pathDefinition))
                return [path, pathDefinition];
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
        })),
    };
}
function removeDuplicateJsonContentInContent(content) {
    const resContent = {};
    Object.entries(content !== null && content !== void 0 ? content : {}).forEach(([newKey, newMediaObj]) => {
        const duplicateMediaObj = Object.entries(resContent).find(([_, mediaObj]) => JSON.stringify(mediaObj) === JSON.stringify(newMediaObj));
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
function filterContentTypes(schema, args) {
    var _a;
    if (!schema.paths)
        return schema;
    const whitelist = (_a = args === null || args === void 0 ? void 0 : args.allowedResponseContentTypes) !== null && _a !== void 0 ? _a : [];
    if (whitelist.length === 0) {
        return schema;
    }
    return {
        ...schema,
        paths: Object.fromEntries(Object.entries(schema.paths).map(([path, pathDefinition]) => {
            if (!isSpecifiedPath(pathDefinition))
                return [path, pathDefinition];
            return [
                path,
                {
                    ...pathDefinition,
                    get: filterContentTypesInOperation(pathDefinition.get, whitelist),
                    put: filterContentTypesInOperation(pathDefinition.put, whitelist),
                    post: filterContentTypesInOperation(pathDefinition.post, whitelist),
                    delete: filterContentTypesInOperation(pathDefinition.delete, whitelist),
                    options: filterContentTypesInOperation(pathDefinition.options, whitelist),
                    head: filterContentTypesInOperation(pathDefinition.head, whitelist),
                    patch: filterContentTypesInOperation(pathDefinition.patch, whitelist),
                    trace: filterContentTypesInOperation(pathDefinition.trace, whitelist),
                },
            ];
        })),
    };
}
function filterContentTypesInOperation(schema, whitelist) {
    var _a;
    if (schema === undefined)
        return undefined;
    const getRequestBody = (requestBody) => {
        if (!requestBody || !("content" in requestBody)) {
            return requestBody;
        }
        const newRequestBody = { ...requestBody };
        newRequestBody.content = filterContentTypesInContent(newRequestBody.content, whitelist);
        return newRequestBody;
    };
    return {
        ...schema,
        requestBody: getRequestBody(schema.requestBody),
        responses: Object.fromEntries(Object.entries((_a = schema.responses) !== null && _a !== void 0 ? _a : {}).map(([code, response]) => {
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
        })),
    };
}
function filterContentTypesInContent(content, whitelist) {
    const resContent = {};
    Object.entries(content !== null && content !== void 0 ? content : {}).forEach(([newKey, newMediaObj]) => {
        if (whitelist.includes(newKey)) {
            resContent[newKey] = newMediaObj;
        }
    });
    return resContent;
}
function removeDuplicateJsonContentInOperation(schema) {
    var _a;
    if (schema === undefined)
        return undefined;
    const getRequestBody = (requestBody) => {
        if (!requestBody || !("content" in requestBody)) {
            return requestBody;
        }
        const newRequestBody = { ...requestBody };
        newRequestBody.content = removeDuplicateJsonContentInContent(newRequestBody.content);
        return newRequestBody;
    };
    return {
        ...schema,
        requestBody: getRequestBody(schema.requestBody),
        responses: Object.fromEntries(Object.entries((_a = schema.responses) !== null && _a !== void 0 ? _a : {}).map(([code, response]) => {
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
        })),
    };
}
function removeDuplicateJsonContent(schema) {
    if (!schema.paths)
        return schema;
    return {
        ...schema,
        paths: Object.fromEntries(Object.entries(schema.paths).map(([path, pathDefinition]) => {
            if (!isSpecifiedPath(pathDefinition))
                return [path, pathDefinition];
            return [
                path,
                {
                    ...pathDefinition,
                    get: removeDuplicateJsonContentInOperation(pathDefinition.get),
                    put: removeDuplicateJsonContentInOperation(pathDefinition.put),
                    post: removeDuplicateJsonContentInOperation(pathDefinition.post),
                    delete: removeDuplicateJsonContentInOperation(pathDefinition.delete),
                    options: removeDuplicateJsonContentInOperation(pathDefinition.options),
                    head: removeDuplicateJsonContentInOperation(pathDefinition.head),
                    patch: removeDuplicateJsonContentInOperation(pathDefinition.patch),
                    trace: removeDuplicateJsonContentInOperation(pathDefinition.trace),
                },
            ];
        })),
    };
}
function repointOperation(schema) {
    var _a, _b;
    if (schema === undefined)
        return undefined;
    return {
        ...schema,
        responses: Object.fromEntries(Object.entries((_a = schema.responses) !== null && _a !== void 0 ? _a : {}).map(([code, response]) => [
            code,
            repointResponse(response),
        ])),
        requestBody: repointRequestBody(schema.requestBody),
        parameters: (_b = schema.parameters) === null || _b === void 0 ? void 0 : _b.map(repointRequestparameter),
    };
}
function repointRequestparameter(schema) {
    if (!isRequestParameter(schema))
        return schema;
    if (schema.schema === undefined)
        return schema;
    return {
        ...schema,
        schema: traverseDefinition(schema.schema, updateDuplicatedSchemaRef("Write")),
    };
}
function repointRequestBody(schema) {
    if (!isRequestBody(schema))
        return schema;
    return {
        ...schema,
        content: Object.fromEntries(Object.entries(schema.content).map(([mediaType, definition]) => [
            mediaType,
            repointMediaType(definition, "Write"),
        ])),
    };
}
function repointResponse(schema) {
    if (!isResponseObject(schema))
        return schema;
    if (!("content" in schema))
        return schema;
    if (schema.content === undefined)
        return schema;
    return {
        ...schema,
        content: Object.fromEntries(Object.entries(schema.content).map(([mediaType, definition]) => [
            mediaType,
            repointMediaType(definition, "Read"),
        ])),
    };
}
function repointMediaType(schema, append) {
    if (schema.schema == null)
        return schema;
    return {
        ...schema,
        schema: traverseDefinition(schema.schema, updateDuplicatedSchemaRef(append)),
    };
}
function removeWriteOnly(schema) {
    return filterObjectProperties(schema, (field) => !("writeOnly" in field) || field.writeOnly === false);
}
function removeReadOnly(schema) {
    return filterObjectProperties(schema, (field) => !("readOnly" in field) || field.readOnly === false);
}
function updateDuplicatedSchemaRef(append) {
    return (schema) => {
        if (!oas31.isReferenceObject(schema))
            return schema;
        return {
            ...schema,
            $ref: `${schema.$ref}${append}`,
        };
    };
}
function compose(one, two) {
    return (input) => two(one(input));
}

commander.program
    .name("openapi-simplifier")
    .description("CLI to simplify OpenAPI schemas to ease code generation")
    .version(version)
    .argument("<string>", "input file")
    .option("-o, --output <string>", "output file")
    .option("-i, --include [string...]", `apply only certain optimizations. available optimizations: ${Object.keys(availableOptimizations).join(", ")}`)
    .option("--allowed-response-content-types [string]", "allowed content types in responses, works only if filter-content-types optimization is enabled")
    .option("--schema-version-mime-type <string>", "a mime type of a request content or response type to extract, works only if extract-schema-version optimization is enabled")
    .option("--schema-version-mime-type-fallback [string]", "fallback mime types if `schema-version-mime-type` is not available, works only if extract-schema-version optimization is enabled");
commander.program.parse();
const [inputFile] = commander.program.args;
const { output, include, allowedResponseContentTypes, schemaVersionMimeType, schemaVersionMimeTypeFallback, } = commander.program.opts();
const wrongOpt = include === null || include === void 0 ? void 0 : include.find((o) => !(o in availableOptimizations));
if (wrongOpt) {
    commander.program.error(`Unexpected optimization: "${wrongOpt}" is not defined.`, {
        exitCode: 2,
    });
}
const outputWriter = output
    ? (content) => fs.writeFileSync(output, content)
    : (content) => process.stdout.write(content);
const optimizationArgs = {
    allowedResponseContentTypes,
    schemaVersionMimeType,
    schemaVersionMimeTypeFallback,
};
const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(content, include, optimizationArgs);
outputWriter(simplfiedContent);
