
# Petroleum

A metaprogramming language by Jack Eisenmann

<img src="logo.png" alt="Petroleum logo" width="128" />

## Installation and Usage

Petroleum requires Node.js version 22 or later to run. To install Petroleum, enter this command:

```bash
npm i -g petroleum
```

After installing Petroleum, use the `petroleum` command to run the interpreter:

```bash
petroleum <packagePath> <args?>
```

Petroleum can also be installed as a dependency of a Node.js application. To run the interpreter in your script:

```js
import { Petroleum } from "petroleum";

const packagePath = "./yourPackage";
const args = ["your", "args"];
const petroleum = new Petroleum(packagePath, args);
petroleum.run();
if (petroleum.hasReportedProblem()) {
    console.log("Interpreter ran into a problem!");
} else {
    console.log("Interpreter ran successfully.");
}
```

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

## Local Development

To install Petroleum for local development, you will need these system-wide dependencies:

* Node.js version >=22
* pnpm version ^12.10

After installing system-wide dependencies, follow these steps:

1. Clone this repository: `git clone https://github.com/ostracod/petroleum.git`
1. Enter the repo directory: `cd petroleum`
1. Install dependencies: `pnpm i`
1. Compile TypeScript code: `npm run build`

To run the interpreter which you built locally:

```bash
node ./dist/petroleum.js <packagePath> <args?>
```

For example, to run the example package in this repo:

```bash
node ./dist/petroleum.js ./examplePackage
```

The following tools are available for local development:

* Run the linter: `npm run lint`
* Run the test suites: `node ./dist/petroleum.js --test ./testSuites`
    * For details, please see the [test harness documentation](testHarness.md).


