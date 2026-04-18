
import { PetContext } from "./context.js";
import { Task } from "./task.js";
import { Action, AdvanceAction } from "./action.js";
import { symbols } from "./symbol.js";
import * as valueModule from "./value.js";

type PetException = valueModule.PetException;
type PetFunc = valueModule.PetFunc;
type EvalState = valueModule.EvalState;
type ObservableBunch = valueModule.ObservableBunch;

export class Coroutine {
    context: PetContext;
    action: Action;
    nextCoro: Coroutine | null;
    
    constructor(context: PetContext, action: Action) {
        this.context = context;
        this.action = action;
        this.nextCoro = null;
    }
    
    run(): PetException | null {
        while (true) {
            const result = this.action.run(this.context);
            if (result instanceof Action) {
                this.action = result;
            } else {
                return result;
            }
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
    
    scheduleTask(task: Task, highPriority: boolean = true): void {
        const action = new AdvanceAction(task);
        this.scheduleAction(action, highPriority);
    }
    
    runNextCoro(): void {
        let coroutine = this.highPrioCoros.popLeft();
        if (coroutine === null) {
            coroutine = this.lowPrioCoros.popLeft();
        }
        if (coroutine === null) {
            return;
        }
        const uncaughtExcep = coroutine.run();
        if (uncaughtExcep === null) {
            return;
        }
        const excepType = uncaughtExcep.getMember(symbols.EXCEP_TYPE);
        const evalState = uncaughtExcep.getMember(symbols.EVAL_STATE) as EvalState;
        if (excepType === symbols.PASS_EXCEP) {
            this.scheduleAction(evalState.actionToResume, false);
        } else if (excepType === symbols.AWAIT_EXCEP) {
            const bunch = uncaughtExcep.getMember(symbols.BUNCH) as ObservableBunch;
            const location = uncaughtExcep.getMember(symbols.LOC);
            const condition = uncaughtExcep.getMember(symbols.COND) as PetFunc;
            bunch.observatory.addObserver(this, location, condition, evalState);
        } else {
            // TODO: Handle unexpected exception.
            
        }
    }
    
    hasFinished(): boolean {
        return (this.highPrioCoros.isEmpty() && this.lowPrioCoros.isEmpty());
    }
}


