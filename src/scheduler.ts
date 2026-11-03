
import "./procTask.js";

import { symbols, spinCountSymbol } from "./symbol.js";
import { MemberObserver, PetMap, PetFunc, EvalState } from "./value.js";
import { PetException, CoroEndException, TimeoutError } from "./exception.js";
import { Action, TaskDef, handleExcepTask, spinCondTask } from "./task.js";
import { PetContext } from "./context.js";

export class Spinner {
    exception: PetMap;
    
    constructor(exception: PetMap) {
        this.exception = exception;
    }
    
    getCondition(): PetFunc {
        return this.exception.getMember(symbols.COND).getFunc();
    }
    
    getEvalState(): EvalState {
        return this.exception.getMember(symbols.EVAL_STATE).getEvalState();
    }
    
    // When `Spinner` is held by a `Coroutine`, `spinCount` will always be defined.
    getSpinCount(): number | undefined {
        return this.exception.getOptionalMember(spinCountSymbol)?.toNumber();
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
        const { timeoutTimestamp } = this.context;
        while (true) {
            if (timeoutTimestamp !== null && Date.now() / 1000 > timeoutTimestamp) {
                throw new TimeoutError();
            }
            let nextAction: Action;
            try {
                nextAction = this.action.run();
            } catch (error) {
                if (error instanceof PetException) {
                    const { mapValue } = error;
                    const { task } = this.action;
                    const exception = mapValue.tryKnownValue();
                    if (typeof exception !== "undefined"
                            && exception instanceof PetMap
                            && !exception.hasKey(symbols.EVAL_STATE)) {
                        const evalState = error.createEvalState(this.action);
                        exception.setMember(symbols.EVAL_STATE, evalState);
                    }
                    // If `task` is null, the action can only throw `CoroEndException`.
                    nextAction = task!.throwException(mapValue);
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
    observersToReport: Set<MemberObserver>;
    stuckSpinningDelay: number;
    
    constructor(context: PetContext) {
        this.context = context;
        this.nonSpinCoros = new CoroQueue();
        this.spinCoros = new CoroQueue();
        this.observersToReport = new Set();
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
            if (coroutine.spinner!.getSpinCount()! < 3) {
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


