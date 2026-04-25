
import { PetValue, PetFunc, valuesAreEqual } from "./value.js";

import type { Task } from "./task.js";
import { Action, ReturnAction } from "./action.js";

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
}

export class ConstantFunc extends BuiltInFunc {
    constantValue: PetValue;
    
    constructor(constantValue: PetValue) {
        super();
        this.constantValue = constantValue;
    }
    
    call(parentTask: Task, args: PetValue[]): Action {
        return new ReturnAction(parentTask, this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: PetValue;
    
    constructor(comparisonValue: PetValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    call(parentTask: Task, args: PetValue[]): Action {
        const result = valuesAreEqual(args[0], this.comparisonValue) ? 0n : 1n;
        return new ReturnAction(parentTask, result);
    }
}


