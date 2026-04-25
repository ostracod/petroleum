
import * as taskModule from "./task.js";
import * as actionModule from "./action.js";
import { BuiltInFunc } from "./builtInFunc.js";
import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";

type Action = actionModule.Action;
type Task = taskModule.Task;

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


