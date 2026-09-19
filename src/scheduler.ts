
import "./task.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetString, MemberObserver, EvalState } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { PetException, CoroEndException } from "./exception.js";
import { Action, TaskDef, handleExcepTask } from "./task.js";
import { PetContext } from "./context.js";

export class Coroutine {
    context: PetContext;
    action: Action;
    passSymbol: PetSymbol | null;
    passMessage: PetString | null;
    nextCoro: Coroutine | null;
    
    constructor(
        context: PetContext,
        action: Action,
        passSymbol: PetSymbol | null,
        passMessage: PetString | null,
    ) {
        this.context = context;
        this.action = action;
        this.passSymbol = passSymbol;
        this.passMessage = passMessage;
        this.nextCoro = null;
    }
    
    run(): void {
        while (true) {
            let nextAction: Action;
            try {
                nextAction = this.action.run();
            } catch (error) {
                if (error instanceof PetException) {
                    const { mapValue } = error;
                    const { task } = this.action;
                    const exception = mapValue.tryMap();
                    if (typeof exception !== "undefined"
                            && !exception.hasKey(symbols.EVAL_STATE)) {
                        const evalState = error.createEvalState(this.action);
                        exception.setMember(symbols.EVAL_STATE, evalState);
                    }
                    nextAction = task.throwException(mapValue);
                } else if (error instanceof CoroEndException) {
                    const exception = error.unhandledExcep;
                    if (exception === null) {
                        break;
                    } else {
                        nextAction = this.context.runTask(handleExcepTask, { exception });
                    }
                } else {
                    throw error;
                }
            }
            this.action = nextAction;
        }
    }
    
    getStuckReport(): string {
        // TODO: Add stack trace.
        
        return "Stuck passing: " + this.passMessage.toString();
    }
}

class CoroQueue {
    firstCoro: Coroutine | null;
    lastCoro: Coroutine | null;
    length: number;
    
    constructor() {
        this.firstCoro = null;
        this.lastCoro = null;
        this.length = 0;
    }
    
    pushRight(coroutine: Coroutine): void {
        if (this.lastCoro === null) {
            this.firstCoro = coroutine;
        } else {
            this.lastCoro.nextCoro = coroutine;
        }
        this.lastCoro = coroutine;
        this.length += 1;
    }
    
    popLeft(): Coroutine | null {
        const poppedCoro = this.firstCoro;
        if (poppedCoro !== null) {
            this.firstCoro = poppedCoro.nextCoro;
            if (this.firstCoro === null) {
                this.lastCoro = null;
            }
            this.length -= 1;
        }
        return poppedCoro;
    }
}

class PassEntry {
    passSymbol: PetSymbol;
    passCount: number;
    previousEntry: PassEntry | null;
    nextEntry: PassEntry | null;
    
    constructor(passSymbol: PetSymbol) {
        this.passSymbol = passSymbol;
        this.passCount = 1;
        this.previousEntry = null;
        this.nextEntry = null;
    }
}

export class Scheduler {
    context: PetContext;
    nonPassCoros: CoroQueue;
    passCoros: CoroQueue;
    waitingObservers: Set<MemberObserver>;
    passEntries: Map<PetSymbol, PassEntry>;
    firstPassEntry: PassEntry | null;
    lastPassEntry: PassEntry | null;
    
    constructor(context: PetContext) {
        this.context = context;
        this.nonPassCoros = new CoroQueue();
        this.passCoros = new CoroQueue();
        this.waitingObservers = new Set();
        this.passEntries = new Map();
        this.firstPassEntry = null;
        this.lastPassEntry = null;
    }
    
    registerPassSymbol(passSymbol: PetSymbol): void {
        // If you call it a "heuristic", it makes you sound smarter.
        const maxEntryAmount = (this.nonPassCoros.length + this.passCoros.length) * 3 + 50;
        while (this.passEntries.size > maxEntryAmount) {
            this.passEntries.delete(this.firstPassEntry.passSymbol);
            this.firstPassEntry = this.firstPassEntry.nextEntry;
            this.firstPassEntry.previousEntry = null;
        }
        let passEntry = this.passEntries.get(passSymbol);
        if (typeof passEntry === "undefined") {
            passEntry = new PassEntry(passSymbol);
            this.passEntries.set(passSymbol, passEntry);
        } else {
            passEntry.passCount += 1;
            if (passEntry.previousEntry !== null) {
                passEntry.previousEntry.nextEntry = passEntry.nextEntry;
            }
            if (passEntry.nextEntry !== null) {
                passEntry.nextEntry.previousEntry = passEntry.previousEntry;
            }
            if (this.firstPassEntry === passEntry) {
                this.firstPassEntry = passEntry.nextEntry;
            }
            if (this.lastPassEntry === passEntry) {
                this.lastPassEntry = passEntry.previousEntry;
            }
            passEntry.previousEntry = null;
            passEntry.nextEntry = null;
        }
        if (this.lastPassEntry === null) {
            this.firstPassEntry = passEntry;
        } else {
            passEntry.previousEntry = this.lastPassEntry;
            this.lastPassEntry.nextEntry = passEntry;
        }
        this.lastPassEntry = passEntry;
    }
    
    scheduleAction(
        action: Action,
        passSymbol: PetSymbol | null = null,
        passMessage: PetString | null = null,
    ): void {
        if (passSymbol !== null) {
            this.registerPassSymbol(passSymbol);
        }
        const coroutine = new Coroutine(this.context, action, passSymbol, passMessage);
        const coroQueue = (passSymbol === null) ? this.nonPassCoros : this.passCoros;
        coroQueue.pushRight(coroutine);
    }
    
    scheduleTask<ParamsT, StateT>(
        taskDef: TaskDef<ParamsT, StateT>,
        params: ParamsT,
        passSymbol: PetSymbol | null = null,
        passMessage: PetString | null = null,
    ): void {
        const action = this.context.runTask(taskDef, params);
        this.scheduleAction(action, passSymbol, passMessage);
    }
    
    runNextCoro(): boolean {
        let coroutine = this.nonPassCoros.popLeft();
        if (coroutine === null) {
            coroutine = this.passCoros.popLeft();
        }
        if (coroutine === null) {
            return false;
        }
        coroutine.run();
        return true;
    }
    
    isStuckPassing(): boolean {
        if (this.passCoros.length <= 0 || this.nonPassCoros.length > 0) {
            return false;
        }
        let coroutine = this.passCoros.firstCoro;
        while (coroutine !== null) {
            const passEntry = this.passEntries.get(coroutine.passSymbol);
            if ((passEntry?.passCount ?? 0) < 3) {
                return false;
            }
            coroutine = coroutine.nextCoro;
        }
        return true;
    }
}


