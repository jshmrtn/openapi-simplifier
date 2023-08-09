#!/usr/bin/env node

import { program } from "commander";
import { version } from "../package.json";
import { simplifySchemaString } from "../dist/index";
import fs from "fs";

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
