
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { BuiltInFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask } from "./task.js";

class FuncPrepMethod extends BuiltInFunc {
    
    call(task: Task, args: PetValue[]): Action {
        throw new Error("Not yet implemented");
    }
}

class FuncEvalMethod extends BuiltInFunc {
    
    call(task: Task, args: PetValue[]): Action {
        throw new Error("Not yet implemented");
    }
}

class StmtsPrepMethod extends BuiltInFunc {
    
    call(task: Task, args: PetValue[]): Action {
        const stmtsComp = args[0].getMap();
        return task.runTask(
            prepStmtsTask, { stmtsComp },
            (value) => task.returnValue(null),
        );
    }
}

class StmtsEvalMethod extends BuiltInFunc {
    
    call(task: Task, args: PetValue[]): Action {
        const stmtsComp = args[0].getMap();
        return task.runTask(
            evalStmtsTask, { stmtsComp },
            (value) => task.returnValue(null),
        );
    }
}

export const funcInvocationMethods = new PetMap([
    [symbols.PREP, new FuncPrepMethod()],
    [symbols.EVAL, new FuncEvalMethod()],
    // TODO: Add #ACCESSED_VARS method.
]);

export const stmtsCompMethods = new PetMap([
    [symbols.PREP, new StmtsPrepMethod()],
    [symbols.EVAL, new StmtsEvalMethod()],
]);


