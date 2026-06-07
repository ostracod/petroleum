
import "./task.js";

import { symbols } from "./symbol.js";
import { PetException, PetFunc, EvalState, ObservableBunch } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { DeferralError } from "./error.js";
import { Action, ActionResult, TaskDef, TaskMembers, Task } from "./task.js";
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
    
    run(): PetException | null {
        while (true) {
            let result: ActionResult;
            try {
                result = this.action.run();
            } catch (error) {
                if (error instanceof DeferralError) {
                    const { deferredValue } = error;
                    const { task } = this.action;
                    result = task.throwAwaitExcep(
                        deferredValue.bunch,
                        deferredValue.location,
                        new ConstantFunc(1n),
                        new EvalState(task, this.action),
                    );
                } else {
                    throw error;
                }
            }
            if (result instanceof PetException || result === null) {
                return result as PetException | null;
            } else {
                this.action = result;
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
    
    scheduleTask<ParamsT, StateT>(
        taskDef: TaskDef<ParamsT, StateT>,
        params: ParamsT,
        highPriority: boolean = true,
    ): void {
        const members: TaskMembers<ParamsT, StateT> = {
            parentTask: null,
            stages: taskDef.stages,
        };
        const task = new Task<ParamsT, StateT>(
            this.context,
            members,
            params,
            taskDef.getInitState(params),
            0,
        );
        this.scheduleAction(task.getStageAction());
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


