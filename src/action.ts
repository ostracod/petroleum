
import { PetValue, PetException } from "./value.js";
import { Task } from "./task.js";

declare const ActionBrand: unique symbol;

export abstract class Action {
    readonly [ActionBrand]!: typeof ActionBrand;
    
    constructor() {
        // Do nothing.
    }
}

export class TaskAction extends Action {
    nextTask: Task | null;
    
    constructor(nextTask: Task | null) {
        super();
        this.nextTask = nextTask;
    }
}

export class ReturnAction extends Action {
    returnValue: PetValue;
    
    constructor(returnValue: PetValue) {
        super();
        this.returnValue = returnValue;
    }
}

export class ExcepAction extends Action {
    exception: PetException;
    
    constructor(exception: PetException) {
        super();
        this.exception = exception;
    }
}


