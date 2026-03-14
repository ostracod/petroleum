
import { UserPackage } from "./package.js";
import { ModuleParser } from "./moduleParser.js";

if (process.argv.length <= 2) {
    console.log("Usage: node ./dist/petroleum.js <packagePath> <args?>");
    process.exit(1);
}

const entryPackagePath = process.argv[2];
const applicationArgs = process.argv.slice(3);

const entryPackage = new UserPackage(entryPackagePath);
const parser = new ModuleParser(entryPackage.mainModulePath);
const mainModule = parser.parseModule();
console.log(mainModule.toString());


