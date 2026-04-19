
import { PetContext } from "./context.js";
import { Task } from "./task.js";
import { DeferralError } from "./error.js";
import * as funcModule from "./builtInFunc.js";
import * as valueModule from "./value.js";

type PetValue = valueModule.PetValue;
type PetException = valueModule.PetException;

export type ActionResult = Action | PetException | null;

export abstract class Action {
    task: Task | null;
    
    constructor(task: Task | null) {
        this.task = task;
    }
    
    runWithoutTask(): ActionResult {
        return null;
    }
    
    abstract runWithTask(): ActionResult;
    
    run(context: PetContext): ActionResult {
        if (this.task === null) {
            return this.runWithoutTask();
        }
        this.task.context = context;
        this.task.currentAction = this;
        try {
            return this.runWithTask();
        } catch (error) {
            if (error instanceof DeferralError) {
                const { deferredValue } = error;
                return this.task.createAwaitAction(
                    deferredValue.bunch,
                    deferredValue.location,
                    new funcModule.ConstantFunc(1n),
                    new valueModule.EvalState(this, this),
                );
            }
            throw error;
        }
    }
}

export class AdvanceAction extends Action {
    
    runWithTask(): ActionResult {
        return this.task.advance();
    }
}

export class ReturnAction extends Action {
    returnValue: PetValue;
    
    constructor(task: Task, returnValue: PetValue) {
        super(task);
        this.returnValue = returnValue;
    }
    
    runWithTask(): ActionResult {
        return this.task.acceptReturnValue(this.returnValue);
    }
}

export class ExcepAction extends Action {
    exception: PetException;
    
    constructor(task: Task, exception: PetException) {
        super(task);
        this.exception = exception;
    }
    
    runWithoutTask(): ActionResult {
        return this.exception;
    }
    
    runWithTask(): ActionResult {
        return this.task.handleException(this.exception);
    }
}


