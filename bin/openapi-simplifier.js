#!/usr/bin/env node

const { program } = require("commander");
const { version } = require("../package.json");
const { simplifySchemaString } = require("../dist/index");
const fs = require("fs");

program
  .name("openapi-simplifier")
  .description("CLI to simplify OpenAPI schemas to ease code generation")
  .version(version)
  .argument("<string>", "input file")
  .option("-o, --output <string>", "output file");

program.parse();

const [inputFile] = program.args;
const { output } = program.opts();
const outputWriter = output
  ? (content) => fs.writeFileSync(output, content)
  : (content) => process.stdout.write(content);

const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(content);

outputWriter(simplfiedContent);
