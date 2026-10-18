
import "./fileSystem.js";

import * as fs from "fs";
import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { knownValueToLiteral, MemberObserver, PetMap } from "./value.js";
import { ModulePos, modulePosToString, getExcepReport } from "./exception.js";
import { Spinner } from "./scheduler.js";
import { ContextOptions, PetContext } from "./context.js";
import { getPathParent, VirtualFileSystem } from "./fileSystem.js";

export abstract class Logger {
    hasReportedProblem: boolean;
    
    constructor() {
        this.hasReportedProblem = false;
    }
    
    abstract print(message: string): void;
    
    abstract reportExceptionHelper(exception: PetMap): void;
    
    abstract reportObserverHelper(observer: MemberObserver): void;
    
    abstract reportSpinnerHelper(spinner: Spinner): void;
    
    reportException(exception: PetMap): void {
        this.reportExceptionHelper(exception);
        this.hasReportedProblem = true;
    }
    
    reportObserver(observer: MemberObserver): void {
        this.reportObserverHelper(observer);
        this.hasReportedProblem = true;
    }
    
    reportSpinner(spinner: Spinner): void {
        this.reportSpinnerHelper(spinner);
        this.hasReportedProblem = true;
    }
}

export class ConsoleLogger extends Logger {
    
    reportProblem(description: string): void {
        if (!this.hasReportedProblem) {
            console.log("");
        }
        console.log(description);
        console.log("");
    }
    
    print(message: string): void {
        console.log(message);
    }
    
    reportExceptionHelper(exception: PetMap): void {
        this.reportProblem(getExcepReport(exception));
    }
    
    reportObserverHelper(observer: MemberObserver): void {
        this.reportProblem(observer.getStuckReport());
    }
    
    reportSpinnerHelper(spinner: Spinner): void {
        this.reportProblem(spinner.getStuckReport());
    }
}

abstract class TestProblem {
    pos?: ModulePos;
    
    constructor(pos?: ModulePos) {
        this.pos = pos;
    }
    
    abstract toStringHelper(): string;
    
    toString(): string {
        let output = this.toStringHelper();
        if (typeof this.pos !== "undefined") {
            output += " on " + modulePosToString(this.pos, false);
        }
        return output;
    }
}

class TestException extends TestProblem {
    excepType: string;
    
    constructor(excepType: string, pos?: ModulePos) {
        super(pos);
        this.excepType = excepType;
    }
    
    toStringHelper(): string {
        return this.excepType + " exception";
    }
}

class TestError extends TestProblem {
    errorType: string;
    message: string;
    
    constructor(errorType: string, message: string, pos?: ModulePos) {
        super(pos);
        this.errorType = errorType;
        this.message = message;
    }
    
    toStringHelper(): string {
        return `${this.errorType} error "${this.message}"`;
    }
}

class TestSticker extends TestProblem {
    message: string;
    
    constructor(message: string, pos?: ModulePos) {
        super(pos);
        this.message = message;
    }
    
    toStringHelper(): string {
        return `stuck condition "${this.message}"`;
    }
}

export class TestLogger extends Logger {
    printMessages: string[];
    exceptions: TestException[];
    errors: TestError[];
    stickers: TestSticker[];
    
    constructor() {
        super();
        this.printMessages = [];
        this.exceptions = [];
        this.errors = [];
        this.stickers = [];
    }
    
    print(message: string): void {
        this.printMessages.push(message);
    }
    
    reportExceptionHelper(exception: PetMap): void {
        const stackTrace = exception.getMember(symbols.EVAL_STATE).getStackTrace();
        const pos = stackTrace.getTopEntry();
        const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
        if (excepType === symbols.ERROR_EXCEP) {
            const errorType = exception.getMember(symbols.ERROR_TYPE).toLiteral();
            const message = exception.getMember(symbols.MESSAGE).toMessage();
            const testError = new TestError(errorType, message, pos);
            this.errors.push(testError);
        } else {
            const testException = new TestException(knownValueToLiteral(excepType), pos);
            this.exceptions.push(testException);
        }
    }
    
    reportObserverHelper(observer: MemberObserver): void {
        const message = observer.message?.toString() ?? "";
        const pos = observer.evalState.getTopEntry()!;
        const sticker = new TestSticker(message, pos);
        this.stickers.push(sticker);
    }
    
    reportSpinnerHelper(spinner: Spinner): void {
        const message = spinner.message.toString();
        const pos = spinner.evalState.getTopEntry()!;
        const sticker = new TestSticker(message, pos);
        this.stickers.push(sticker);
    }
    
    getPrintLines(): string[] {
        const output: string[] = [];
        for (const message of this.printMessages) {
            const lines = message.split("\n");
            output.push(...lines);
        }
        return output;
    }
}

const gatherTestSuites = (dirPath: string): string[] => {
    const output: string[] = [];
    for (const name of fs.readdirSync(dirPath)) {
        const path = pathUtils.join(dirPath, name);
        if (fs.statSync(path).isDirectory()) {
            output.push(...gatherTestSuites(path));
        } else if (name.endsWith(".test-suite")) {
            output.push(path);
        }
    }
    return output;
};

const parseFirstDirectiveLine = (line: string): { name: string, args: string[] } => {
    const parts: string[] = [];
    // First 4 characters are ">>> ".
    let index = 4;
    while (index < line.length) {
        const firstChar = line.charAt(index);
        let part: string;
        if (firstChar === "\"") {
            index += 1;
            const characters: string[] = [];
            while (index < line.length) {
                const character = line.charAt(index);
                index += 1;
                if (character === "\"") {
                    break;
                } else if (character === "\\") {
                    if (index >= line.length) {
                        throw new Error("Unexpected end of quoted string: " + line);
                    }
                    const escapedChar = line.charAt(index);
                    index += 1;
                    if (escapedChar === "\"" || escapedChar === "\\") {
                        characters.push(escapedChar);
                    } else {
                        throw new Error("Unsupported escape sequence: " + line);
                    }
                } else {
                    characters.push(character);
                }
            }
            part = characters.join("");
        } else {
            const startIndex = index;
            index += 1;
            let endIndex = index;
            while (endIndex < line.length) {
                const character = line.charAt(endIndex);
                if (character === "\"") {
                    throw new Error("Unexpected quotation mark: " + line);
                } else if (character === " ") {
                    break;
                }
                endIndex += 1;
            }
            part = line.substring(startIndex, endIndex);
            index = endIndex;
        }
        parts.push(part);
        if (index < line.length) {
            if (line.charAt(index) !== " ") {
                throw new Error("Missing space: " + line);
            }
            index += 1;
            if (index >= line.length) {
                throw new Error("Unexpected trailing space: " + line);
            }
        }
    }
    if (parts.length <= 0) {
        throw new Error("Missing directive name: " + line);
    }
    return { name: parts[0], args: parts.slice(1) };
};

class TestDirective {
    name: string;
    args: string[];
    dataLines: string[];
    
    constructor(lines: string[]) {
        const result = parseFirstDirectiveLine(lines[0]);
        this.name = result.name;
        this.args = result.args;
        this.dataLines = lines.slice(1);
    }
}

abstract class ExpectedProblem<T extends TestProblem> {
    path?: string;
    lineNumber?: string;
    
    constructor(path?: string, lineNumber?: string) {
        this.path = path;
        this.lineNumber = lineNumber;
    }
    
    abstract matchesHelper(actualProblem: T): boolean;
    
    matches(fileSystem: VirtualFileSystem, actualProblem: T): boolean {
        const { pos } = actualProblem;
        if (typeof this.path !== "undefined") {
            if (typeof pos === "undefined") {
                return false;
            }
            const expectedPath = fileSystem.getAbsolutePath(
                fileSystem.replacePathTilde(this.path),
            );
            // I'm not sure we can actually receive a relative or abnormal path here,
            // but just to be sure we will call getAbsolutePath.
            const actualPath = fileSystem.getAbsolutePath(pos.modulePath);
            if (expectedPath !== actualPath) {
                return false;
            }
        }
        if (typeof this.lineNumber !== "undefined") {
            if (typeof pos === "undefined" || pos.lineNumber.toString() !== this.lineNumber) {
                return false;
            }
        }
        return this.matchesHelper(actualProblem);
    }
    
    abstract toStringHelper(): string;
    
    toString(): string {
        let output = this.toStringHelper();
        if (typeof this.lineNumber !== "undefined") {
            output += " on line " + this.lineNumber;
            if (typeof this.path !== "undefined") {
                output += " of " + this.path;
            }
        } else if (typeof this.path !== "undefined") {
            output += " in " + this.path;
        }
        return output;
    }
}

class ExpectedException extends ExpectedProblem<TestException> {
    excepType?: string;
    
    constructor(excepType?: string, path?: string, lineNumber?: string) {
        super(path, lineNumber);
        this.excepType = excepType;
    }
    
    matchesHelper(actualProblem: TestException): boolean {
        if (typeof this.excepType !== "undefined" && this.excepType !== actualProblem.excepType) {
            return false;
        }
        return true;
    }
    
    toStringHelper(): string {
        return (typeof this.excepType === "undefined")
            ? "exception"
            : this.excepType + " exception";
    }
}

class ExpectedError extends ExpectedProblem<TestError> {
    errorType?: string;
    message?: string;
    
    constructor(
        errorType?: string,
        message?: string,
        path?: string,
        lineNumber?: string,
    ) {
        super(path, lineNumber);
        this.errorType = errorType;
        this.message = message;
    }
    
    matchesHelper(actualProblem: TestError): boolean {
        if (typeof this.errorType !== "undefined" && this.errorType !== actualProblem.errorType) {
            return false;
        }
        if (typeof this.message !== "undefined" && this.message !== actualProblem.message) {
            return false;
        }
        return true;
    }
    
    toStringHelper(): string {
        let output = "error";
        if (typeof this.errorType !== "undefined") {
            output = `${this.errorType} ${output}`;
        }
        if (typeof this.message !== "undefined") {
            output += ` "${this.message}"`;
        }
        return output;
    }
    
}

class ExpectedSticker extends ExpectedProblem<TestSticker> {
    message?: string;
    
    constructor(message?: string, path?: string, lineNumber?: string) {
        super(path, lineNumber);
        this.message = message;
    }
    
    matchesHelper(actualProblem: TestError): boolean {
        if (typeof this.message !== "undefined" && this.message !== actualProblem.message) {
            return false;
        }
        return true;
    }
    
    toStringHelper(): string {
        let output = "stuck condition";
        if (typeof this.message !== "undefined") {
            output += ` "${this.message}"`;
        }
        return output;
    }
}

const getLabeledArgs = (parts: string[], names: string[]): Map<string, string> => {
    if (parts.length % 2 !== 0) {
        throw new Error("Labelled arguments must have an even number of parts.");
    }
    const output = new Map<string, string>();
    for (let index = 0; index < parts.length; index += 2) {
        const labelPart = parts[index];
        const value = parts[index + 1];
        if (!labelPart.endsWith(":")) {
            throw new Error("Argument label must end with colon.");
        }
        const label = labelPart.substring(0, labelPart.length - 1);
        if (!names.includes(label)) {
            throw new Error(`Unrecognized argument label "${label}".`);
        }
        if (output.has(label)) {
            throw new Error(`Duplicate argument label "${label}".`);
        }
        output.set(label, value);
    }
    return output;
};

const addTestFile = (
    fileSystem: VirtualFileSystem,
    inputPath: string,
    contentLines: string[],
): void => {
    const path = fileSystem.replacePathTilde(inputPath);
    const parentPath = getPathParent(path);
    if (parentPath === null) {
        throw new Error("Cannot create file whose path is the root directory.");
    }
    fileSystem.createMissingDirs(parentPath);
    const buffer = Buffer.from(contentLines.join("\n"));
    fileSystem.writeFile(path, buffer);
};

const checkPrintLines = (
    actualPrintLines: string[],
    expectedPrintLines: string[],
): string[] => {
    let printLinesMatch: boolean;
    if (actualPrintLines.length !== expectedPrintLines.length) {
        printLinesMatch = false;
    } else {
        printLinesMatch = true;
        for (let index = 0; index < actualPrintLines.length; index++) {
            const actualLine = actualPrintLines[index];
            const expectedLine = expectedPrintLines[index];
            if (actualLine !== expectedLine) {
                printLinesMatch = false;
                break;
            }
        }
    }
    if (printLinesMatch) {
        return [];
    } else {
        return ["Printed lines do not match expected lines:\n" + actualPrintLines.join("\n")];
    }
};

const checkProblems = <T1 extends TestProblem, T2 extends ExpectedProblem<T1>>(
    fileSystem: VirtualFileSystem,
    actualProblems: T1[],
    expectedProblems: T2[],
): string[] => {
    const failures: string[] = [];
    const actualProblemsCopy = actualProblems.slice();
    for (const expectedProblem of expectedProblems) {
        const index = actualProblemsCopy.findIndex(
            (actualProblem) => expectedProblem.matches(fileSystem, actualProblem),
        );
        if (index < 0) {
            failures.push("Missing expected " + expectedProblem.toString());
        } else {
            actualProblemsCopy.splice(index, 1);
        }
    }
    for (const actualProblem of actualProblemsCopy) {
        failures.push("Found unexpected " + actualProblem.toString());
    }
    return failures;
};

class DirectivePool {
    directives: TestDirective[];
    
    constructor(lines: string[]) {
        let currentGroup: string[] | null = null;
        const lineGroups: string[][] = [];
        for (const line of lines) {
            if (line.startsWith(">>> ")) {
                currentGroup = [line];
                lineGroups.push(currentGroup);
            } else if (currentGroup === null) {
                throw new Error("Unexpected data line before directives.");
            } else {
                currentGroup.push(line);
            }
        }
        this.directives = lineGroups.map((lineGroup) => new TestDirective(lineGroup));
    }
    
    hasDirective(name: string): boolean {
        return this.directives.some((directive) => (directive.name === name));
    }
    
    consumeDirectivesByCond(condition: (name: string) => boolean): TestDirective[] {
        const output: TestDirective[] = [];
        const nextDirectives: TestDirective[] = [];
        for (const directive of this.directives) {
            if (condition(directive.name)) {
                output.push(directive);
            } else {
                nextDirectives.push(directive);
            }
        }
        this.directives = nextDirectives;
        return output;
    }
    
    consumeDirectives(name: string): TestDirective[] {
        return this.consumeDirectivesByCond((inputName) => (inputName === name));
    }
    
    consumeProblemDirectives(
        directiveName: string,
        argNames: string[],
    ): Map<string, string>[] {
        const problemDirectives = this.consumeDirectives(directiveName);
        return problemDirectives.map(
            (directive) => getLabeledArgs(directive.args, argNames),
        );
    }
    
    assertEmpty() {
        if (this.directives.length > 0) {
            throw new Error("Unexpected directive: " + this.directives[0].name);
        }
    }
}

class TestInit {
    // Map from path to file content.
    commonFiles: Map<string, string[]>;
    
    constructor(pool: DirectivePool) {
        this.commonFiles = new Map();
        const fileDirectives = pool.consumeDirectives("commonFile");
        for (const directive of fileDirectives) {
            if (directive.args.length !== 1) {
                throw new Error("commonFile directive expects exactly one argument.");
            }
            const path = directive.args[0];
            this.commonFiles.set(path, directive.dataLines);
        }
        pool.assertEmpty();
    }
    
    initFileSystem(fileSystem: VirtualFileSystem): void {
        for (const [path, contentLines] of this.commonFiles.entries()) {
            addTestFile(fileSystem, path, contentLines);
        }
    }
}

class TestCase {
    testSuite: TestSuite;
    name: string;
    setupDirectives: TestDirective[];
    appArgs: string[];
    expectedPrintLines: string[];
    expectedExceptions: ExpectedException[];
    expectedErrors: ExpectedError[];
    expectedStickers: ExpectedSticker[];
    
    constructor(testSuite: TestSuite, pool: DirectivePool) {
        this.testSuite = testSuite;
        
        const caseDirectives = pool.consumeDirectives("testCase");
        if (caseDirectives.length !== 1) {
            throw new Error("Every test case must contain exactly one testCase directive.");
        }
        const caseDirective = caseDirectives[0];
        if (caseDirective.dataLines.length > 0) {
            throw new Error("Unexpected data lines in testCase directive.");
        }
        if (caseDirective.args.length !== 1) {
            throw new Error("testCase directive expects exactly one argument.");
        }
        this.name = caseDirective.args[0];
        
        this.setupDirectives = pool.consumeDirectivesByCond((name) => name.startsWith("setup"));
        
        const argsDirectives = pool.consumeDirectives("appArgs");
        if (argsDirectives.length > 1) {
            throw new Error("Test case cannot contain more than one appArgs directive.");
        }
        if (argsDirectives.length > 0) {
            const argsDirective = argsDirectives[0];
            if (argsDirective.dataLines.length > 0) {
                throw new Error("Unexpected data lines in appArgs directive.");
            }
            this.appArgs = argsDirective.args;
        } else {
            this.appArgs = [];
        }
        
        const printDirectives = pool.consumeDirectives("expectPrint");
        if (printDirectives.length > 1) {
            throw new Error("Test case cannot contain more than one expectPrint directive.");
        }
        if (printDirectives.length > 0) {
            const printDirective = printDirectives[0];
            if (printDirective.args.length > 0) {
                throw new Error("expectPrint directive does not expect any arguments.");
            }
            this.expectedPrintLines = printDirective.dataLines;
        } else {
            this.expectedPrintLines = [];
        }
        
        const exceptionMaps = pool.consumeProblemDirectives(
            "expectExcep", ["type", "path", "lineNumber"],
        );
        this.expectedExceptions = exceptionMaps.map((map) => new ExpectedException(
            map.get("type"), map.get("path"), map.get("lineNumber"),
        ));
        
        const errorMaps = pool.consumeProblemDirectives(
            "expectError", ["type", "message", "path", "lineNumber"],
        );
        this.expectedErrors = errorMaps.map((map) => new ExpectedError(
            map.get("type"), map.get("message"), map.get("path"), map.get("lineNumber"),
        ));
        
        const stickerMaps = pool.consumeProblemDirectives(
            "expectStuck", ["message", "path", "lineNumber"],
        );
        this.expectedStickers = stickerMaps.map((map) => new ExpectedSticker(
            map.get("message"), map.get("path"), map.get("lineNumber"),
        ));
        
        pool.assertEmpty();
    }
    
    createFileSystem(): VirtualFileSystem {
        const fileSystem = new VirtualFileSystem();
        const { testInit } = this.testSuite;
        if (testInit !== null) {
            testInit.initFileSystem(fileSystem);
        }
        for (const { name, args, dataLines } of this.setupDirectives) {
            if (name === "setupFile") {
                if (args.length !== 1) {
                    throw new Error("setupFile directive expects exactly one argument.");
                }
                addTestFile(fileSystem, args[0], dataLines);
            } else if (name === "setupDir") {
                if (args.length !== 1) {
                    throw new Error("setupDir directive expects exactly one argument.");
                }
                if (dataLines.length !== 0) {
                    throw new Error("setupDir directive does not expect any data lines.");
                }
                const path = fileSystem.replacePathTilde(args[0]);
                fileSystem.createMissingDirs(path);
            } else {
                throw new Error(`Unknown directive "${name}".`);
            }
        }
        return fileSystem;
    }
    
    run(): boolean {
        const logger = new TestLogger();
        const fileSystem = this.createFileSystem();
        const options: ContextOptions = { logger, fileSystem, timeout: 3 };
        const context = new PetContext(fileSystem.targetPackagePath, this.appArgs, options);
        context.run();
        const failures: string[] = [];
        const actualPrintLines = logger.getPrintLines();
        failures.push(...checkPrintLines(actualPrintLines, this.expectedPrintLines));
        failures.push(...checkProblems(fileSystem, logger.exceptions, this.expectedExceptions));
        failures.push(...checkProblems(fileSystem, logger.errors, this.expectedErrors));
        failures.push(...checkProblems(fileSystem, logger.stickers, this.expectedStickers));
        if (failures.length > 0) {
            console.log(`Test case "${this.name}" failed!`);
            console.log(failures.join("\n") + "\n");
            return false;
        } else {
            return true;
        }
    }
}

const isSeparatorLine = (line: string): boolean => {
    if (line.length < 3) {
        return false;
    }
    for (let index = 0; index < line.length; index++) {
        if (line.charAt(index) !== "=") {
            return false;
        }
    }
    return true;
};

const splitLinesBySections = (lines: string[]): string[][] => {
    let currentSection: string[] = [];
    const output = [currentSection];
    for (const line of lines) {
        if (isSeparatorLine(line)) {
            currentSection = [];
            output.push(currentSection);
        } else {
            currentSection.push(line);
        }
    }
    return output;
};

class TestSuite {
    path: string;
    testInit: TestInit | null;
    testCases: TestCase[];
    
    constructor(path: string) {
        this.path = path;
        const lines = fs.readFileSync(path, "utf8").split("\n");
        let truncIndex = lines.length;
        while (truncIndex > 1) {
            const nextTruncIndex = truncIndex - 1;
            const line = lines[nextTruncIndex];
            if (line.length > 0) {
                break;
            }
            truncIndex = nextTruncIndex;
        }
        lines.length = truncIndex;
        const sections = splitLinesBySections(lines);
        this.testInit = null;
        this.testCases = [];
        for (const sectionLines of sections) {
            const pool = new DirectivePool(sectionLines);
            if (pool.hasDirective("testCase")) {
                const testCase = new TestCase(this, pool);
                this.testCases.push(testCase);
            } else if (this.testInit === null) {
                this.testInit = new TestInit(pool);
            } else {
                throw new Error("Test suite cannot have more than one initialization section.");
            }
        }
        const names = new Set<string>();
        for (const { name } of this.testCases) {
            if (names.has(name)) {
                throw new Error(`Duplicate test case name "${name}".`);
            }
            names.add(name);
        }
    }
    
    run(): number {
        console.log(`Running test suite ${this.path}...`);
        let passCount = 0;
        for (const testCase of this.testCases) {
            const hasPassed = testCase.run();
            if (hasPassed) {
                passCount += 1;
            }
        }
        return passCount;
    }
}

export class TestHarness {
    testSuites: TestSuite[];
    testCaseName: string | null;
    
    constructor(testPath: string, testCaseName: string | null) {
        const testSuitePaths = fs.statSync(testPath).isDirectory()
            ? gatherTestSuites(testPath)
            : [testPath];
        if (testSuitePaths.length <= 0) {
            throw new Error("Could not find any test suites to run.");
        }
        this.testSuites = [];
        for (const path of testSuitePaths) {
            const testSuite = new TestSuite(path);
            this.testSuites.push(testSuite);
        }
        this.testCaseName = testCaseName;
    }
    
    run(): boolean {
        let passCount = 0;
        let totalCount = 0;
        if (this.testCaseName === null) {
            for (const testSuite of this.testSuites) {
                passCount += testSuite.run();
                totalCount += testSuite.testCases.length;
            }
            if (totalCount < 1) {
                throw new Error("No test cases ran.");
            }
        } else {
            let testCaseToRun: TestCase | null = null;
            for (const testSuite of this.testSuites) {
                const testCase = testSuite.testCases.find(
                    (inputTestCase) => (inputTestCase.name === this.testCaseName),
                );
                if (typeof testCase !== "undefined") {
                    if (testCaseToRun === null) {
                        testCaseToRun = testCase;
                    } else {
                        throw new Error(`Found more than one test case with name "${this.testCaseName}".`);
                    }
                }
            }
            if (testCaseToRun === null) {
                throw new Error(`Could not find test case with name "${this.testCaseName}".`);
            }
            console.log(`Running test case "${testCaseToRun.name}" in ${testCaseToRun.testSuite.path}...`);
            const hasPassed = testCaseToRun.run();
            if (hasPassed) {
                passCount += 1;
            }
            totalCount += 1;
        }
        if (passCount < totalCount) {
            const failCount = totalCount - passCount;
            if (totalCount > 1) {
                console.log(`${failCount} / ${totalCount} test cases failed`);
            } else {
                console.log("Test case failed");
            }
            return false;
        } else {
            if (totalCount > 1) {
                console.log(`All ${totalCount} test cases passed!`);
            } else {
                console.log("Test case passed!");
            }
            return true;
        }
    }
}


