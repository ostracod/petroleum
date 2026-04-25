
import { BuiltInFunc } from "./builtInFunc.js";
import { PetValue, PetMap } from "./value.js";
import { symbols } from "./symbol.js";

import type { Action } from "./action.js";
import type { Task } from "./task.js";

class FuncPrepMethod extends BuiltInFunc {
    
    call(parentTask: Task, args: PetValue[]): Action {
        throw new Error("Not yet implemented");
    }
}

class FuncEvalMethod extends BuiltInFunc {
    
    call(parentTask: Task, args: PetValue[]): Action {
        throw new Error("Not yet implemented");
    }
}

export const funcInvocationMethods = new PetMap([
    [symbols.PREP, new FuncPrepMethod()],
    [symbols.EVAL, new FuncEvalMethod()],
    // TODO: Add #ACCESSED_VARS method.
]);


