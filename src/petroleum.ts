
import { UserPackage } from "./package.js";

if (process.argv.length <= 2) {
    console.log("Usage: node ./dist/petroleum.js <packagePath> <args?>");
    process.exit(1);
}

const entryPackagePath = process.argv[2];
const applicationArgs = process.argv.slice(3);

const entryPackage = new UserPackage(entryPackagePath);
// TODO: Parse main module of entry package.
console.log(entryPackage);


