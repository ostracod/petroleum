
import * as valueModule from "./value.js";
import { symbols } from "./symbol.js";
import { Task } from "./task.js";
import { PetContext } from "./context.js";

type PetValue = valueModule.PetValue;
type PetException = valueModule.PetException;

declare const ActionBrand: unique symbol;

export type ActionResult = Action | PetException | null;

export abstract class Action {
    readonly [ActionBrand]!: typeof ActionBrand;
    task: Task | null;
    
    constructor() {
        // Do nothing.
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
        return this.runWithTask();
    }
    
    registerLastAction(lastAction: Action): void {
        // Do nothing.
    }
}

export class AdvanceAction extends Action {
    
    constructor(task: Task | null) {
        super();
        this.task = task;
    }
    
    runWithTask(): ActionResult {
        return this.task.advance();
    }
}

export class ReturnAction extends Action {
    returnValue: PetValue;
    
    constructor(returnValue: PetValue) {
        super();
        this.returnValue = returnValue;
    }
    
    runWithTask(): ActionResult {
        return this.task.acceptReturnValue(this.returnValue);
    }
    
    registerLastAction(lastAction: Action): void {
        super.registerLastAction(lastAction);
        this.task = lastAction.task.parentTask;
    }
}

export class ExcepAction extends Action {
    exception: PetException;
    
    constructor(exception: PetException) {
        super();
        this.exception = exception;
    }
    
    runWithoutTask(): ActionResult {
        return this.exception;
    }
    
    runWithTask(): ActionResult {
        return this.task.handleException(this.exception)
    }
    
    registerLastAction(lastAction: Action): void {
        super.registerLastAction(lastAction);
        this.task = lastAction.task.parentTask;
        let evalState = this.exception.getMember(symbols.EVAL_STATE);
        if (!(evalState instanceof valueModule.EvalState)) {
            evalState = new valueModule.EvalState(lastAction);
            this.exception.setMember(symbols.EVAL_STATE, evalState);
        }
    }
}


