
import "./value.js";

import { KnownValue, PetValue, wrapKnownValue, minIntValue, PetString, PetList, PetMap, PetFunc, valuesAreEqual } from "./value.js";
import { PetTypeError, ValueError } from "./exception.js";
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

const intMask = (1n << 63n) - 1n;
const signMask = 1n << 63n;

const toSignedInt64 = (value: bigint): bigint => {
    if ((value & signMask) > 0n) {
        return -((~value & intMask) + 1n);
    } else {
        return value & intMask;
    }
};

export const globalFuncDefs: FuncDef[] = [
    {
        name: "NEG",
        argAmount: 1,
        call: (task, args) => {
            const result = -args[0].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "ADD",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() + args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "SUB",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() - args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "MUL",
        argAmount: 2,
        call: (task, args) => {
            const result = args[0].getInt() * args[1].getInt();
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "DIV",
        argAmount: 2,
        call: (task, args) => {
            const denominator = args[1].getInt();
            if (denominator === 0n) {
                throw new ValueError("Cannot divide by zero.");
            }
            const result = args[0].getInt() / denominator;
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "MOD",
        argAmount: 2,
        call: (task, args) => {
            const denominator = args[1].getInt();
            if (denominator === 0n) {
                throw new ValueError("Cannot divide by zero.");
            }
            const result = args[0].getInt() % denominator;
            return task.returnValue(toSignedInt64(result));
        },
    },
    {
        name: "NOT",
        argAmount: 1,
        call: (task, args) => {
            const result = !(args[0].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "OR",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() !== 0n || args[1].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "AND",
        argAmount: 2,
        call: (task, args) => {
            const result = (args[0].getInt() !== 0n && args[1].getInt() !== 0n);
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "XOR",
        argAmount: 2,
        call: (task, args) => {
            const result = ((args[0].getInt() !== 0n) !== (args[1].getInt() !== 0n));
            return task.returnValue(result ? 1n : 0n);
        },
    },
    {
        name: "MEMBER",
        argAmount: 2,
        call: (task, args) => {
            const bunch = args[0].getKnownValue();
            const location = args[1];
            let member: PetValue;
            if (bunch instanceof PetString) {
                const index = location.toNumber();
                const charCode = bunch.getCharCode(index);
                member = wrapKnownValue(BigInt(charCode));
            } else if (bunch instanceof PetList || bunch instanceof PetMap) {
                member = bunch.getMember(location);
            } else {
                throw new PetTypeError("Bunch must be a string, list, or map.");
            }
            return task.returnValue(member);
        },
    },
    {
        name: "CALL",
        argAmount: null,
        call: (task, args) => {
            if (args.length < 1 || args.length > 2) {
                throw new ValueError("Expected 1 or 2 arguments.");
            }
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


