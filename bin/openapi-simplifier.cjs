#!/usr/bin/env node
'use strict';

var commander = require('commander');
var yaml = require('yaml');
var oas31 = require('openapi3-ts/oas31');
var fs = require('fs');

var version = "1.1.3-beta.1";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
function simplifySchemaString(content) {
    return compose(compose(readSchema, simplifySchema), (schema) => yaml.stringify(schema, { indent: 2, aliasDuplicateObjects: false }))(content);
}
function simplifySchema(content) {
    return compose(duplicateReadWriteSchemas, repointSchemaReferences)(content);
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
function repointOperation(schema) {
    var _a;
    if (schema === undefined)
        return undefined;
    return {
        ...schema,
        responses: Object.fromEntries(Object.entries(schema.responses).map(([code, response]) => [code, repointResponse(response)])),
        requestBody: repointRequestBody(schema.requestBody),
        parameters: (_a = schema.parameters) === null || _a === void 0 ? void 0 : _a.map(repointRequestparameter),
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
        content: Object.fromEntries(Object.entries(schema.content).map(([mediaType, definition]) => [mediaType, repointMediaType(definition, "Read")])),
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
    if (((_c = (_b = (_a = schema.allOf) !== null && _a !== void 0 ? _a : schema.anyOf) !== null && _b !== void 0 ? _b : schema.oneOf) !== null && _c !== void 0 ? _c : schema.discriminator) !== undefined) {
        return {
            ...schema,
            allOf: (_d = schema.allOf) === null || _d === void 0 ? void 0 : _d.map((subSchema) => traverseDefinition(subSchema, callback)),
            anyOf: (_e = schema.anyOf) === null || _e === void 0 ? void 0 : _e.map((subSchema) => traverseDefinition(subSchema, callback)),
            oneOf: (_f = schema.oneOf) === null || _f === void 0 ? void 0 : _f.map((subSchema) => traverseDefinition(subSchema, callback)),
            discriminator: schema.discriminator !== undefined
                ? {
                    ...schema.discriminator,
                    mapping: schema.discriminator.mapping !== undefined
                        ? Object.fromEntries(Object.entries(schema.discriminator.mapping).map(([name, $ref]) => [
                            name,
                            traverseBareReference($ref, callback),
                        ]))
                        : Object.fromEntries([...((_g = schema.allOf) !== null && _g !== void 0 ? _g : []), ...((_h = schema.anyOf) !== null && _h !== void 0 ? _h : []), ...((_j = schema.oneOf) !== null && _j !== void 0 ? _j : [])]
                            .map((definition) => {
                            if (!oas31.isReferenceObject(definition))
                                return [null, traverseDefinition(definition, callback)];
                            return [definition.$ref.split("/").pop(), traverseBareReference(definition.$ref, callback)];
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
    else if (oas31.isSchemaObject(schema) && schema.type === "array" && schema.items !== undefined) {
        return {
            ...schema,
            items: traverseDefinition(schema.items, callback),
        };
    }
    else if (oas31.isSchemaObject(schema) && schema.type === "object" && schema.properties !== undefined) {
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
    .option("-o, --output <string>", "output file");
commander.program.parse();
const [inputFile] = commander.program.args;
const { output } = commander.program.opts();
const outputWriter = output
    ? (content) => fs.writeFileSync(output, content)
    : (content) => process.stdout.write(content);
const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(content);
outputWriter(simplfiedContent);
