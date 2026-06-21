
import "./value.js";

import { KnownValue, PetValue, PetList, PetFunc, valuesAreEqual } from "./value.js";
import { Action, Task } from "./task.js";

export abstract class BuiltInFunc extends PetFunc {
    
    toString(): string {
        return "<builtInFunc>";
    }
    
    abstract callBuiltIn(task: Task, args: PetValue[]): Action;
    
    call(task: Task, args: PetList): Action {
        return this.callBuiltIn(task, args.elements);
    }
}

export class ConstantFunc extends BuiltInFunc {
    constantValue: KnownValue;
    
    constructor(constantValue: KnownValue) {
        super();
        this.constantValue = constantValue;
    }
    
    getArgAmount(): number | null {
        return 0;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        return task.returnValue(this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: KnownValue;
    
    constructor(comparisonValue: KnownValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    getArgAmount(): number | null {
        return 1;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        const value = args[0].getKnownValue()
        const result = valuesAreEqual(value, this.comparisonValue) ? 0n : 1n;
        return task.returnValue(result);
    }
}

export class PrintFunc extends BuiltInFunc {
    
    getArgAmount(): number | null {
        return 1;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        console.log(args[0].toString());
        return task.returnValue(null);
    }
    
    toString(): string {
        return "PRINT";
    }
}


