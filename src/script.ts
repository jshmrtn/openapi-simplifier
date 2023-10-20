import { program } from "commander";
import fs from "fs";
import { version } from "../package.json" assert { type: "json" };
import { availableOptimizations, simplifySchemaString, type OptimizationKey } from "./index";

program
  .name("openapi-simplifier")
  .description("CLI to simplify OpenAPI schemas to ease code generation")
  .version(version)
  .argument("<string>", "input file")
  .option("-o, --output <string>", "output file")
  .option(
    "-i, --include [string...]",
    `apply only certain optimizations. available optimizations: ${Object.keys(availableOptimizations).join(", ")}`
  );

program.parse();

const [inputFile] = program.args;
const { output, include }: { output?: string; include?: string[] } = program.opts();

const wrongOpt = include?.find((o) => !(o in availableOptimizations));
if (wrongOpt) {
  program.error(`Unexpected optimization: "${wrongOpt}" is not defined.`, { exitCode: 2 });
}

const outputWriter = output
  ? (content: string) => fs.writeFileSync(output, content)
  : (content: string) => process.stdout.write(content);

const content = fs.readFileSync(inputFile === "-" ? 0 : inputFile).toString();
const simplfiedContent = simplifySchemaString(content, include as OptimizationKey[] | undefined);

outputWriter(simplfiedContent);
