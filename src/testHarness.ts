
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

class TestCase {
    directives: TestDirective[];
    
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
        this.directives = lineGroups.map((lineGroup) => new TestDirective(lineGroup));
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


