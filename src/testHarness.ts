
import "./fileSystem.js";

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


