# OpenAPI Simplifier

Little tools that simplifies the OpenPI schema to a simpler subset.

## Implemented Simplifications

* Get rid of `readOnly` & `writeOnly`

## Execution

```console
# Read Schema from STDIN and write to STDOUT
cat schema.yml | ./node_modules/openapi-simplifier -

# Read Schema from file and write to file
./node_modules/openapi-simplifier schema.yml --output simplified.yml
```
