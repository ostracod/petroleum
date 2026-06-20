
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { BuiltInFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask } from "./task.js";

abstract class PrepMethod extends BuiltInFunc {
    
    getArgAmount(): number | null {
        return 1;
    }
}

abstract class EvalMethod extends BuiltInFunc {
    
    getArgAmount(): number | null {
        return 2;
    }
}

const getFuncArgsComp = (invocNode: PetMap): PetMap => {
    const comps = invocNode.getMember(symbols.COMPS).getList();
    return comps.getMember(1).getMap();
};

class FuncPrepMethod extends PrepMethod {
    
    call(task: Task, args: PetValue[]): Action {
        const invocNode = args[0].getMap();
        const func = invocNode.getMember(symbols.INVOC).getFunc();
        const argAmount = func.getArgAmount();
        if (argAmount !== null) {
            const argsComp = getFuncArgsComp(invocNode);
            const argExprs = argsComp.getMember(symbols.EXPRS).getList();
            if (argExprs.getLength() !== argAmount) {
                // TODO: Throw a better type of error.
                throw new Error("Incorrect number of function arguments.");
            }
        }
        return task.returnValue(null);
    }
}

class FuncEvalMethod extends EvalMethod {
    
    call(task: Task, args: PetValue[]): Action {
        throw new Error("Not yet implemented");
    }
}

class StmtsPrepMethod extends PrepMethod {
    
    call(task: Task, args: PetValue[]): Action {
        const stmtsComp = args[0].getMap();
        return task.runTask(
            prepStmtsTask, { stmtsComp },
            (value) => task.returnValue(null),
        );
    }
}

class StmtsEvalMethod extends EvalMethod {
    
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


