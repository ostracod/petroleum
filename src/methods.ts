
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap, FuncCaller } from "./value.js";
import { BuiltInFunc } from "./builtInFunc.js";
import { ActionResult, Task } from "./task.js";

class FuncPrepMethod extends BuiltInFunc {
    
    call(caller: FuncCaller, args: PetValue[]): ActionResult {
        throw new Error("Not yet implemented");
    }
}

class FuncEvalMethod extends BuiltInFunc {
    
    call(caller: FuncCaller, args: PetValue[]): ActionResult {
        throw new Error("Not yet implemented");
    }
}

export const funcInvocationMethods = new PetMap([
    [symbols.PREP, new FuncPrepMethod()],
    [symbols.EVAL, new FuncEvalMethod()],
    // TODO: Add #ACCESSED_VARS method.
]);


