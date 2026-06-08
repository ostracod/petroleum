
import "./value.js";

import { PetValue, PetFunc, valuesAreEqual } from "./value.js";
import { Action, Task } from "./task.js";

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
    
    call(task: Task, args: PetValue[]): Action {
        return task.returnValue(this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: PetValue;
    
    constructor(comparisonValue: PetValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    call(task: Task, args: PetValue[]): Action {
        const result = valuesAreEqual(args[0], this.comparisonValue) ? 0n : 1n;
        return task.returnValue(result);
    }
}


