
import "./task.js";

import { EvalState } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { DeferralError, CoroEndError } from "./error.js";
import { Action, TaskDef, handleExcepTask } from "./task.js";
import { PetContext } from "./context.js";

export class Coroutine {
    context: PetContext;
    action: Action;
    nextCoro: Coroutine | null;
    
    constructor(context: PetContext, action: Action) {
        this.context = context;
        this.action = action;
        this.nextCoro = null;
    }
    
    run(): void {
        while (true) {
            let nextAction: Action;
            try {
                nextAction = this.action.run();
            } catch (error) {
                if (error instanceof CoroEndError) {
                    const exception = error.unhandledExcep;
                    if (exception === null) {
                        break;
                    } else {
                        nextAction = this.context.runTask(handleExcepTask, { exception });
                    }
                } else if (error instanceof DeferralError) {
                    const { task } = this.action;
                    nextAction = task.throwAwaitExcep(
                        error.bunch,
                        error.location,
                        new ConstantFunc(1n),
                        new EvalState(task, this.action),
                    );
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
    
    constructor() {
        this.firstCoro = null;
        this.lastCoro = null;
    }
    
    isEmpty(): boolean {
        return (this.firstCoro === null);
    }
    
    pushRight(coroutine: Coroutine): void {
        if (this.lastCoro === null) {
            this.firstCoro = coroutine;
            this.lastCoro = coroutine;
        } else {
            this.lastCoro.nextCoro = coroutine;
            this.lastCoro = coroutine;
        }
    }
    
    popLeft(): Coroutine | null {
        const poppedCoro = this.firstCoro;
        if (poppedCoro !== null) {
            this.firstCoro = poppedCoro.nextCoro;
            if (this.firstCoro === null) {
                this.lastCoro = null;
            }
        }
        return poppedCoro;
    }
}

export class Scheduler {
    context: PetContext;
    highPrioCoros: CoroQueue;
    lowPrioCoros: CoroQueue;
    
    constructor(context: PetContext) {
        this.context = context;
        this.highPrioCoros = new CoroQueue();
        this.lowPrioCoros = new CoroQueue();
    }
    
    scheduleAction(action: Action, highPriority: boolean = true): void {
        const coroutine = new Coroutine(this.context, action);
        const coroQueue = highPriority ? this.highPrioCoros : this.lowPrioCoros;
        coroQueue.pushRight(coroutine);
    }
    
    scheduleTask<ParamsT, StateT>(
        taskDef: TaskDef<ParamsT, StateT>,
        params: ParamsT,
        highPriority: boolean = true,
    ): void {
        const action = this.context.runTask(taskDef, params);
        this.scheduleAction(action, highPriority);
    }
    
    runNextCoro(): boolean {
        let coroutine = this.highPrioCoros.popLeft();
        if (coroutine === null) {
            coroutine = this.lowPrioCoros.popLeft();
        }
        if (coroutine === null) {
            return false;
        }
        coroutine.run();
        return true;
    }
}


