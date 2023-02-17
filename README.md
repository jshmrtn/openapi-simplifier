# OpenAPI Simplifier

[![.github/workflows/branch_main.yml](https://github.com/jshmrtn/openapi-simplifier/actions/workflows/branch_main.yml/badge.svg)](https://github.com/jshmrtn/openapi-simplifier/actions/workflows/branch_main.yml)
![NPM License](https://img.shields.io/npm/l/@jshmrtn/openapi-simplifier)
[![Last Updated](https://img.shields.io/github/last-commit/jshmrtn/openapi-simplifier.svg)](https://github.com/jshmrtn/openapi-simplifier/commits/main)


Little tools that simplifies the OpenPI schema to a simpler subset.

## Implemented Simplifications

- Get rid of `readOnly` & `writeOnly`

## Execution

```console
# Read Schema from STDIN and write to STDOUT
cat schema.yml | ./node_modules/openapi-simplifier -

# Read Schema from file and write to file
./node_modules/openapi-simplifier schema.yml --output simplified.yml
```
