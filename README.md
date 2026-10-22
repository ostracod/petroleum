
# Petroleum

A metaprogramming language by Jack Eisenmann

## Installation and Usage

Petroleum has the following system-wide dependencies:

* Node.js version ^22.14
* pnpm version ^12.10

I've only tested Petroleum on macOS. It probably works on Linux, but I'm less sure about Windows. Let me know what you find.

To set up Petroleum:

1. Clone this repository: `git clone https://github.com/ostracod/petroleum.git`
1. Enter the repo directory: `cd petroleum`
1. Install dependencies: `pnpm i`
1. Compile TypeScript code: `npm run build`

To run the Petroleum interpreter:

```
node ./dist/petroleum.js <packagePath> <args?>
```

For example:

```
node ./dist/petroleum.js ./examplePackage
```

## Design Goals

Petroleum has the following design goals:

* Allow defining custom static type validation.
* Allow defining how expressions are evaluated and/or compiled.
* Allow initialization of variables in a flexible order.
* Allow introspection of the syntax tree.
* Use simple syntax.

I plan to use Petroleum as an intermediate language for some of my personal projects, including:

* Tractor (Systems programming language to implement [WheatSystem](https://ostracodfiles.com/wheatsystem/menu.html))
* Ostracode (General-purpose programming language with feature-based objects)
* WheatBlossom (Programming language for WheatSystem bytecode applications)

## Language Documentation

For documentation on Petroleum, please consult these pages:

* [Data Types and Syntax](languageDocumentation/typesAndSyntax.md)
* [Workers and Phases](languageDocumentation/workersAndPhases.md)
* [Variables and Coroutines](languageDocumentation/varsAndCoroutines.md)
* [Module System and Module Attributes](languageDocumentation/moduleSystem.md)
* [Built-In Constants](languageDocumentation/builtInConstants.md)
* [Representation Schemas](languageDocumentation/representationSchemas.md)
* [Built-In Procedures](languageDocumentation/builtInProcs.md)
* [Built-In Functions](languageDocumentation/builtInFuncs.md)
* [Built-In Modules](languageDocumentation/builtInModules.md)
* [Example Code](languageDocumentation/exampleCode.md)

## Code Quality Tools

The following tools are available for development of the Petroleum interpreter:

* Run the linter: `npm run lint`
* Run the test suites: `node ./dist/petroleum.js --test ./testSuites`
    * For details, please see the [test harness documentation](testHarness.md).


