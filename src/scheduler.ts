
import * as valueModule from "./value.js";
import { TaskAction, ReturnAction, ExcepAction } from "./action.js";
import { Task } from "./task.js";
import { PetContext } from "./context.js";

type PetException = valueModule.PetException;

export class Coroutine {
    context: PetContext;
    task: Task | null;
    uncaughtExcep: PetException | null;
    nextCoro: Coroutine | null;
    
    constructor(context: PetContext, task: Task) {
        this.context = context;
        this.task = task;
        this.uncaughtExcep = null;
        this.nextCoro = null;
    }
    
    run(): PetException | null {
        while (this.task !== null) {
            this.task.context = this.context;
            let action = this.task.advance();
            while (!(action instanceof TaskAction)) {
                if (action instanceof ReturnAction) {
                    this.task = this.task.parentTask;
                    if (this.task === null) {
                        return null;
                    }
                    action = this.task.acceptReturnValue(action.returnValue);
                } else if (action instanceof ExcepAction) {
                    const { exception } = action;
                    this.task = this.task.parentTask;
                    if (this.task === null) {
                        return exception;
                    }
                    action = this.task.handleException(exception);
                } else {
                    throw new Error(`Unexpected action type ${action.constructor.name}`);
                }
            }
            this.task = action.nextTask;
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
    
    schedule(task: Task, highPriority: boolean = true): void {
        const coroutine = new Coroutine(this.context, task);
        const coroQueue = highPriority ? this.highPrioCoros : this.lowPrioCoros;
        coroQueue.pushRight(coroutine);
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
        // TODO: Handle `uncaughtExcep`.
        
    }
    
    hasFinished(): boolean {
        return (this.highPrioCoros.isEmpty() && this.lowPrioCoros.isEmpty());
    }
}


