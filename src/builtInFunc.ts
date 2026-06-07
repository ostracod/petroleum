
import "./value.js";

import { PetValue, FuncCaller, PetFunc, valuesAreEqual } from "./value.js";
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
    
    call(caller: FuncCaller, args: PetValue[]): Action {
        return caller.acceptReturnValue(this.constantValue);
    }
}

export class NotEqualFunc extends BuiltInFunc {
    comparisonValue: PetValue;
    
    constructor(comparisonValue: PetValue) {
        super();
        this.comparisonValue = comparisonValue;
    }
    
    call(caller: FuncCaller, args: PetValue[]): Action {
        const result = valuesAreEqual(args[0], this.comparisonValue) ? 0n : 1n;
        return caller.acceptReturnValue(result);
    }
}


