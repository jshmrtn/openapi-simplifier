import { program } from "commander";
import { version } from "../package.json" assert { type: "json" };
import { simplifySchemaString } from "./index";
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
  ? (content: string) => fs.writeFileSync(output, content)
  : (content: string) => process.stdout.write(content);

const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(content);

outputWriter(simplfiedContent);
