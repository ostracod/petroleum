
import "./value.js";

import { KnownValue, PetValue, PetList, PetFunc, valuesAreEqual } from "./value.js";
import { Action, Task } from "./task.js";

interface FuncDef {
    name: string | null;
    argAmount: number | null;
    call: (task: Task, args: PetValue[]) => Action;
}

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

export class DefFunc extends BuiltInFunc {
    def: FuncDef;
    
    constructor(def: FuncDef) {
        super();
        this.def = def;
    }
    
    getArgAmount(): number | null {
        return this.def.argAmount;
    }
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        return this.def.call(task, args);
    }
    
    toString(): string {
        return this.def.name ?? super.toString();
    }
}

export const globalFuncDefs: FuncDef[] = [
    {
        name: "CALL",
        argAmount: null,
        call: (task, args) => {
            const func = args[0].getFunc();
            const funcArgs = (args.length > 1) ? args[1].getList() : ([] as PetValue[]);
            return task.callFunction(
                func, funcArgs,
                (value) => task.returnValue(value),
            );
        },
    },
    {
        name: "PRINT",
        argAmount: 1,
        call: (task, args) => {
            console.log(args[0].toString());
            return task.returnValue(null);
        },
    },
];


