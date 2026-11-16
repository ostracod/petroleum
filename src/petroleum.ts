#!/usr/bin/env node

import { PetContext } from "./context.js";
import { TestHarness } from "./testHarness.js";

const printUsage = (): void => {
    console.log([
        "Petroleum interpreter usage:",
        "    petroleum <packagePath> <args?>",
        "    petroleum --test <dirPath>",
        "    petroleum --test <testSuitePath> <testCaseName?>",
    ].join("\n"));
};

if (process.argv.length < 3) {
    printUsage();
    process.exit(1);
}
const firstArg = process.argv[2];

if (firstArg === "--test") {
    if (process.argv.length < 4 || process.argv.length > 5) {
        printUsage();
        process.exit(1);
    }
    const testPath = process.argv[3];
    const testCaseName = process.argv[4] ?? null;
    const testHarness = new TestHarness(testPath, testCaseName);
    const allTestsPassed = testHarness.run();
    if (!allTestsPassed) {
        process.exit(1);
    }
} else {
    const entryPackagePath = firstArg;
    const applicationArgs = process.argv.slice(3);
    const context = new PetContext(entryPackagePath, applicationArgs);
    context.run();
    if (context.hasReportedProblem()) {
        process.exit(1);
    }
}


