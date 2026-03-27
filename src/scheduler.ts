
import * as valueModule from "./value.js";
import { Task } from "./task.js";

type PetException = valueModule.PetException;

export class Coroutine {
    scheduler: Scheduler;
    task: Task | null;
    uncaughtExcep: PetException | null;
    nextCoro: Coroutine | null;
    
    constructor(scheduler: Scheduler, task: Task) {
        this.task = task;
        this.uncaughtExcep = null;
        this.nextCoro = null;
    }
    
    advance(): void {
        let task = this.task;
        if (task === null) {
            return;
        }
        let result = task.advance(this.scheduler);
        while (result instanceof valueModule.PetException) {
            task = task.parentTask;
            if (task === null) {
                this.uncaughtExcep = result;
                result = null;
                break;
            }
            result = task.handleException(result);
        }
        this.task = result as (Task | null);
    }
    
    hasFinished(): boolean {
        return (this.task === null);
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
    highPrioCoros: CoroQueue;
    lowPrioCoros: CoroQueue;
    
    constructor() {
        this.highPrioCoros = new CoroQueue();
        this.lowPrioCoros = new CoroQueue();
    }
    
    schedule(task: Task, highPriority: boolean): void {
        const coroutine = new Coroutine(this, task);
        const coroQueue = highPriority ? this.highPrioCoros : this.lowPrioCoros;
        coroQueue.pushRight(coroutine);
    }
    
    runNextCoroutine(): void {
        let coroutine = this.highPrioCoros.popLeft();
        if (coroutine === null) {
            coroutine = this.lowPrioCoros.popLeft();
        }
        if (coroutine === null) {
            return;
        }
        while (!coroutine.hasFinished()) {
            coroutine.advance();
        }
        const { uncaughtExcep } = coroutine;
        // TODO: Handle `uncaughtExcep`.
        
    }
    
    hasFinished(): boolean {
        return (this.highPrioCoros.isEmpty() && this.lowPrioCoros.isEmpty());
    }
}


