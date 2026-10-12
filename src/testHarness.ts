
import "./fileSystem.js";

import * as fs from "fs";
import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { knownValueToString, MemberObserver, PetMap } from "./value.js";
import { ModulePos, getExcepReport } from "./exception.js";
import { Spinner } from "./scheduler.js";

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

class TestException {
    excepType: string;
    pos?: ModulePos;
    errorType?: string;
    errorMessage?: string;
    
    constructor(
        excepType: string,
        pos?: ModulePos,
        errorType?: string,
        errorMessage?: string,
    ) {
        this.excepType = excepType;
        this.pos = pos;
        this.errorType = errorType;
        this.errorMessage = errorMessage;
    }
}

class TestSticker {
    message: string;
    pos: ModulePos;
    
    constructor(message: string, pos: ModulePos) {
        this.message = message;
        this.pos = pos;
    }
}

export class TestLogger extends Logger {
    printMessages: string[];
    exceptions: TestException[];
    stickers: TestSticker[];
    
    constructor() {
        super();
        this.printMessages = [];
    }
    
    print(message: string): void {
        this.printMessages.push(message);
    }
    
    reportExceptionHelper(exception: PetMap): void {
        const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
        let errorType: string | undefined;
        let errorMessage: string | undefined;
        if (excepType === symbols.ERROR_EXCEP) {
            errorType = exception.getMember(symbols.ERROR_TYPE).toString();
            errorMessage = exception.getMember(symbols.MESSAGE).toString();
        }
        const stackTrace = exception.getMember(symbols.EVAL_STATE).getStackTrace();
        const pos = stackTrace.getTopEntry();
        const testException = new TestException(
            knownValueToString(excepType), pos, errorType, errorMessage,
        );
        this.exceptions.push(testException);
    }
    
    reportObserverHelper(observer: MemberObserver): void {
        const message = observer.getStringMessage();
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
                    if (escapedChar === "\"") {
                        characters.push("\"");
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

class ExpectedProblem {
    path?: string;
    lineNumber?: string;
    
    constructor(path?: string, lineNumber?: string) {
        this.path = path;
        this.lineNumber = lineNumber;
    }
}

class ExpectedException extends ExpectedProblem {
    type?: string;
    
    constructor(type?: string, path?: string, lineNumber?: string) {
        super(path, lineNumber);
        this.type = type;
    }
}

class ExpectedError extends ExpectedProblem {
    type?: string;
    message?: string;
    
    constructor(
        type?: string,
        message?: string,
        path?: string,
        lineNumber?: string,
    ) {
        super(path, lineNumber);
        this.type = type;
        this.message = message;
    }
}

class ExpectedSticker extends ExpectedProblem {
    message?: string;
    
    constructor(message?: string, path?: string, lineNumber?: string) {
        super(path, lineNumber);
        this.message = message;
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

class TestCase {
    name: string;
    setupDirectives: TestDirective[];
    appArgs: string[];
    expectedPrintLines: string[];
    expectedExceptions: ExpectedException[];
    expectedErrors: ExpectedError[];
    expectedStickers: ExpectedSticker[];
    
    constructor(lines: string[]) {
        let currentGroup: string[] | null = null;
        const lineGroups: string[][] = [];
        for (const line of lines) {
            if (line.startsWith(">>> ")) {
                currentGroup = [line];
                lineGroups.push(currentGroup);
            } else if (currentGroup === null) {
                throw new Error("Unexpected data line before directives in test case.");
            } else {
                currentGroup.push(line);
            }
        }
        let directives = lineGroups.map((lineGroup) => new TestDirective(lineGroup));
        const consumeDirectivesByCond = (
            condition: (name: string) => boolean,
        ): TestDirective[] => {
            const output: TestDirective[] = [];
            const nextDirectives: TestDirective[] = [];
            for (const directive of directives) {
                if (condition(directive.name)) {
                    output.push(directive);
                } else {
                    nextDirectives.push(directive);
                }
            }
            directives = nextDirectives;
            return output;
        };
        const consumeDirectives = (name: string): TestDirective[] => (
            consumeDirectivesByCond((inputName) => (inputName === name))
        );
        
        const caseDirectives = consumeDirectives("testCase");
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
        
        this.setupDirectives = consumeDirectivesByCond((name) => name.startsWith("setup"));
        
        const argsDirectives = consumeDirectives("appArgs");
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
        
        const printDirectives = consumeDirectives("expectPrint");
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
        
        const consumeProblemDirectives = (
            directiveName: string,
            argNames: string[],
        ): Map<string, string>[] => {
            const problemDirectives = consumeDirectives(directiveName);
            return problemDirectives.map(
                (directive) => getLabeledArgs(directive.args, argNames),
            );
        };
        
        const exceptionMaps = consumeProblemDirectives(
            "expectExcep", ["type", "path", "lineNumber"],
        );
        this.expectedExceptions = exceptionMaps.map((map) => new ExpectedException(
            map.get("type"), map.get("path"), map.get("lineNumber"),
        ));
        
        const errorMaps = consumeProblemDirectives(
            "expectError", ["type", "message", "path", "lineNumber"],
        );
        this.expectedErrors = errorMaps.map((map) => new ExpectedError(
            map.get("type"), map.get("message"), map.get("path"), map.get("lineNumber"),
        ));
        
        const stickerMaps = consumeProblemDirectives(
            "expectStuck", ["message", "path", "lineNumber"],
        );
        this.expectedStickers = stickerMaps.map((map) => new ExpectedSticker(
            map.get("message"), map.get("path"), map.get("lineNumber"),
        ));
        
        if (directives.length > 0) {
            throw new Error("Unexpected directive: " + directives[0].name);
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

const splitLinesByTestCases = (lines: string[]): string[][] => {
    let currentGroup: string[] = [];
    const output = [currentGroup];
    for (const line of lines) {
        if (isSeparatorLine(line)) {
            currentGroup = [];
            output.push(currentGroup);
        } else {
            currentGroup.push(line);
        }
    }
    return output;
};

class TestSuite {
    path: string;
    testCases: TestCase[];
    
    constructor(path: string) {
        this.path = path;
        const lines = fs.readFileSync(path, "utf8").split("\n");
        const lineGroups = splitLinesByTestCases(lines);
        this.testCases = lineGroups.map((lineGroup) => new TestCase(lineGroup));
    }
}

export class TestHarness {
    testSuites: TestSuite[];
    
    constructor(testPath: string, testCaseName: string | null) {
        const testSuitePaths = fs.statSync(testPath).isDirectory()
            ? gatherTestSuites(testPath)
            : [testPath];
        this.testSuites = [];
        for (const path of testSuitePaths) {
            const testSuite = new TestSuite(path);
            this.testSuites.push(testSuite);
        }
    }
    
    run(): boolean {
        throw new Error("Not yet implemented");
    }
}


