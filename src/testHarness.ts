
import "./context.js";

import * as fs from "fs";
import * as os from "os";
import * as pathUtils from "path";
import { MemberObserver, PetMap } from "./value.js";
import { getExcepReport } from "./exception.js";
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
    path: string;
    lineNumber: string;
    errorType?: string;
    errorMessage?: string;
    
    constructor(
        excepType: string,
        path: string,
        lineNumber: string,
        errorType?: string,
        errorMessage?: string,
    ) {
        this.excepType = excepType;
        this.path = path;
        this.lineNumber = lineNumber;
        this.errorType = errorType;
        this.errorMessage = errorMessage;
    }
}

class TestSticker {
    message: string;
    path: string;
    lineNumber: string;
    
    constructor(message: string, path: string, lineNumber: string) {
        this.message = message;
        this.path = path;
        this.lineNumber = lineNumber;
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
        throw new Error("Not yet implemented");
    }
    
    reportObserverHelper(observer: MemberObserver): void {
        throw new Error("Not yet implemented");
    }
    
    reportSpinnerHelper(spinner: Spinner): void {
        throw new Error("Not yet implemented");
    }
}

export abstract class FileSystem {
    
    abstract entityExists(path: string): boolean;
    
    abstract entityIsDirectory(path: string): boolean;
    
    abstract readFile(path: string): Buffer;
    
    abstract writeFile(path: string, buffer: Buffer): void;
    
    abstract deleteFile(path: string): void;
    
    abstract readDirectory(path: string): string[];
    
    abstract createDirectory(path: string): void;
    
    abstract deleteDirectory(path: string): void;
    
    abstract getHomeDirectory(): string;
    
    abstract getAbsolutePath(path: string): string;
    
    abstract getRelativePath(refPath: string, targetPath: string): string;
}

export class HostFileSystem {
    
    entityExists(path: string): boolean {
        return fs.existsSync(path);
    }
    
    entityIsDirectory(path: string): boolean {
        return fs.statSync(path).isDirectory();
    }
    
    readFile(path: string): Buffer {
        return fs.readFileSync(path);
    }
    
    writeFile(path: string, buffer: Buffer): void {
        fs.writeFileSync(path, buffer);
    }
    
    deleteFile(path: string): void {
        fs.unlinkSync(path);
    }
    
    readDirectory(path: string): string[] {
        return fs.readdirSync(path);
    }
    
    createDirectory(path: string): void {
        fs.mkdirSync(path);
    }
    
    deleteDirectory(path: string): void {
        fs.rmSync(path, { recursive: true });
    }
    
    getHomeDirectory(): string {
        return pathUtils.resolve(os.homedir());
    }
    
    getAbsolutePath(path: string): string {
        return pathUtils.resolve(path);
    }
    
    getRelativePath(refPath: string, targetPath: string): string {
        return pathUtils.relative(refPath, targetPath);
    }
}


