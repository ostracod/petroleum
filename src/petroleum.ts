
import "./context.js";

import { PetContext } from "./context.js";

if (process.argv.length <= 2) {
    console.log("Usage: node ./dist/petroleum.js <packagePath> <args?>");
    process.exit(1);
}

const entryPackagePath = process.argv[2];
const applicationArgs = process.argv.slice(3);

const context = new PetContext(entryPackagePath, applicationArgs);
context.run();


