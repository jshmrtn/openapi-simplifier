import { program } from "commander";
import fs from "fs";
import { version } from "../package.json" assert { type: "json" };
import {
  OptimizationArgs,
  availableOptimizations,
  simplifySchemaString,
  type OptimizationKey,
} from "./index";

program
  .name("openapi-simplifier")
  .description("CLI to simplify OpenAPI schemas to ease code generation")
  .version(version)
  .argument("<string>", "input file")
  .option("-o, --output <string>", "output file")
  .option(
    "-i, --include [string...]",
    `apply only certain optimizations. available optimizations: ${Object.keys(availableOptimizations).join(", ")}`
  )
  .option(
    "--allowed-response-content-types [string]",
    "allowed content types in responses, works only if filter-content-types optimization is enabled"
  )
  .option(
    "--schema-version-mime-type <string>",
    "a mime type of a request content or response type to extract, works only if extract-schema-version optimization is enabled"
  )
  .option(
    "--schema-version-mime-type-fallback [string]",
    "fallback mime types if `schema-version-mime-type` is not available, works only if extract-schema-version optimization is enabled"
  );

program.parse();

const [inputFile] = program.args;
const {
  output,
  include,
  allowedResponseContentTypes,
  schemaVersionMimeType,
  schemaVersionMimeTypeFallback,
}: {
  output?: string;
  include?: string[];
  allowedResponseContentTypes: string[];
  schemaVersionMimeType: string;
  schemaVersionMimeTypeFallback: string[];
} = program.opts();

const wrongOpt = include?.find((o) => !(o in availableOptimizations));
if (wrongOpt) {
  program.error(`Unexpected optimization: "${wrongOpt}" is not defined.`, {
    exitCode: 2,
  });
}

const outputWriter = output
  ? (content: string) => fs.writeFileSync(output, content)
  : (content: string) => process.stdout.write(content);

const optimizationArgs: OptimizationArgs = {
  allowedResponseContentTypes,
  schemaVersionMimeType,
  schemaVersionMimeTypeFallback,
};

const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(
  content,
  include as OptimizationKey[] | undefined,
  optimizationArgs
);

outputWriter(simplfiedContent);
