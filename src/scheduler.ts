
import "./task.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetString, MemberObserver, PetMap, PetFunc, EvalState } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { PetException, CoroEndException, createSpinExcep } from "./exception.js";
import { Action, TaskDef, handleExcepTask, spinCondTask } from "./task.js";
import { PetContext } from "./context.js";

export class Spinner {
    condition: PetFunc;
    message: PetString;
    evalState: EvalState;
    spinCount?: number;
    
    constructor(
        condition: PetFunc,
        message: PetString,
        evalState: EvalState,
        spinCount?: number,
    ) {
        this.condition = condition;
        this.message = message;
        this.evalState = evalState;
        this.spinCount = spinCount;
    }
    
    createSpinExcep(): PetMap {
        return createSpinExcep(this.condition, this.message, this.evalState, this.spinCount);
    }
    
    getStuckReport(): string {
        // TODO: Add stack trace.
        
        return "Stuck spinning: " + this.message.toString();
    }
}

export class Coroutine {
    context: PetContext;
    action: Action;
    spinner: Spinner | null;
    nextCoro: Coroutine | null;
    
    constructor(context: PetContext, action: Action, spinner: Spinner | null) {
        this.context = context;
        this.action = action;
        this.spinner = spinner;
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

export class Scheduler {
    context: PetContext;
    nonSpinCoros: CoroQueue;
    spinCoros: CoroQueue;
    waitingObservers: Set<MemberObserver>;
    stuckSpinningDelay: number;
    
    constructor(context: PetContext) {
        this.context = context;
        this.nonSpinCoros = new CoroQueue();
        this.spinCoros = new CoroQueue();
        this.waitingObservers = new Set();
        this.stuckSpinningDelay = 0;
    }
    
    scheduleAction(action: Action, spinner: Spinner | null = null): void {
        const coroutine = new Coroutine(this.context, action, spinner);
        const coroQueue = (spinner === null) ? this.nonSpinCoros : this.spinCoros;
        coroQueue.pushRight(coroutine);
    }
    
    scheduleTask<ParamsT, StateT>(
        taskDef: TaskDef<ParamsT, StateT>,
        params: ParamsT,
        spinner: Spinner | null = null,
    ): void {
        const action = this.context.runTask(taskDef, params);
        this.scheduleAction(action, spinner);
    }
    
    scheduleSpinner(spinner: Spinner): void {
        const action = this.context.runTask(spinCondTask, { spinner });
        this.scheduleAction(action, spinner);
    }
    
    runNextCoro(): boolean {
        let coroutine = this.nonSpinCoros.popLeft();
        if (coroutine === null) {
            coroutine = this.spinCoros.popLeft();
        }
        if (coroutine === null) {
            return false;
        }
        coroutine.run();
        return true;
    }
    
    allCorosAreDizzy(): boolean {
        if (this.spinCoros.length <= 0 || this.nonSpinCoros.length > 0) {
            return false;
        }
        let coroutine = this.spinCoros.firstCoro;
        while (coroutine !== null) {
            if (coroutine.spinner.spinCount < 3) {
                return false;
            }
            coroutine = coroutine.nextCoro;
        }
        return true;
    }
    
    isStuckSpinning(): boolean {
        if (this.allCorosAreDizzy()) {
            this.stuckSpinningDelay += 1;
            if (this.stuckSpinningDelay > this.spinCoros.length * 3) {
                return true;
            }
        } else {
            this.stuckSpinningDelay = 0;
        }
        return false;
    }
}


