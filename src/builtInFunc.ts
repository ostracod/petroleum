
import "./value.js";

import { KnownValue, PetValue, PetFunc, valuesAreEqual } from "./value.js";
import { Action, Task } from "./task.js";

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
}

export class ConstantFunc extends BuiltInFunc {
    constantValue: KnownValue;
    
    constructor(constantValue: KnownValue) {
        super();
        this.constantValue = constantValue;
    }
    
    call(task: Task, args: PetValue[]): Action {
        return task.returnValue(this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: KnownValue;
    
    constructor(comparisonValue: KnownValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    call(task: Task, args: PetValue[]): Action {
        const value = args[0].getKnownValue()
        const result = valuesAreEqual(value, this.comparisonValue) ? 0n : 1n;
        return task.returnValue(result);
    }
}

export class PrintFunc extends BuiltInFunc {
    
    call(task: Task, args: PetValue[]): Action {
        console.log(args[0].toString());
        return task.returnValue(null);
    }
    
    toString(): string {
        return "PRINT";
    }
}


