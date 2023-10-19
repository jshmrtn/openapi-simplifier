#!/usr/bin/env node
'use strict';

var commander = require('commander');
var yaml = require('yaml');
require('openapi3-ts/oas31');
var fs = require('fs');

var version = "1.1.3";

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-explicit-any */
function simplifySchemaString(content) {
    return compose(compose(readSchema, simplifySchema), (schema) => yaml.stringify(schema, { indent: 2, aliasDuplicateObjects: false }))(content);
}
function simplifySchema(content) {
    return removeDuplicateJsonContent(content);
}
function readSchema(content) {
    return yaml.parse(content);
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
function removeDuplicateJsonContentInOperation(schema) {
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
        responses: Object.fromEntries(Object.entries(schema.responses).map(([code, response]) => {
            if ("content" in response && response.content) {
                return [code, { ...response, content: removeDuplicateJsonContentInContent(response.content) }];
            }
            return [code, { response }];
        })),
    };
}
function removeDuplicateJsonContent(schema) {
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
function isSpecifiedPath(path) {
    return typeof path === "object";
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
