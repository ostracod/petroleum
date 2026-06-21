
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { BuiltInFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask, prepExprsTask, evalExprsTask, getFuncArgsComp, evalFuncTask } from "./task.js";

abstract class PrepMethod extends BuiltInFunc {
    
    getArgAmount(): number | null {
        return 1;
    }
    
    abstract callMethod(task: Task, worker: PetMap): Action;
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        const worker = args[0].getMap();
        return this.callMethod(task, worker);
    }
}

abstract class EvalMethod extends BuiltInFunc {
    
    getArgAmount(): number | null {
        return 2;
    }
    
    abstract callMethod(task: Task, worker: PetMap, frame: PetMap): Action;
    
    callBuiltIn(task: Task, args: PetValue[]): Action {
        const worker = args[0].getMap();
        // TODO: Get the argument frame.
        //const frame = args[1].getMap();
        const frame = null
        return this.callMethod(task, worker, frame);
    }
}

class FuncPrepMethod extends PrepMethod {
    
    callMethod(task: Task, invocNode: PetMap): Action {
        const func = invocNode.getMember(symbols.INVOC).getFunc();
        const argsComp = getFuncArgsComp(invocNode);
        const argAmount = func.getArgAmount();
        if (argAmount !== null) {
            const argExprs = argsComp.getMember(symbols.EXPRS).getList();
            if (argExprs.getLength() !== argAmount) {
                // TODO: Throw a better type of error.
                throw new Error("Incorrect number of function arguments.");
            }
        }
        return task.callMethod(
            argsComp, symbols.PREP, [],
            (value) => task.returnValue(null),
        );
    }
}

class FuncEvalMethod extends EvalMethod {
    
    callMethod(task: Task, invocNode: PetMap, frame: PetMap): Action {
        return task.runTask(
            evalFuncTask, { invocNode },
            (value) => task.returnValue(value),
        );
    }
}

class StmtsPrepMethod extends PrepMethod {
    
    callMethod(task: Task, stmtsComp: PetMap): Action {
        return task.runTask(
            prepStmtsTask, { stmtsComp },
            (value) => task.returnValue(null),
        );
    }
}

class StmtsEvalMethod extends EvalMethod {
    
    callMethod(task: Task, stmtsComp: PetMap, frame: PetMap): Action {
        return task.runTask(
            evalStmtsTask, { stmtsComp },
            (value) => task.returnValue(null),
        );
    }
}

class ExprsPrepMethod extends PrepMethod {
    
    callMethod(task: Task, exprsComp: PetMap): Action {
        return task.runTask(
            prepExprsTask, { exprsComp },
            (value) => task.returnValue(null),
        );
    }
}

class ExprsEvalMethod extends EvalMethod {
    
    callMethod(task: Task, exprsComp: PetMap, frame: PetMap): Action {
        return task.runTask(
            evalExprsTask, { exprsComp },
            (value) => task.returnValue(value),
        );
    }
}

class NopPrepMethod extends PrepMethod {
    
    callMethod(task: Task, worker: PetMap): Action {
        return task.returnValue(null);
    }
}

class StringEvalMethod extends EvalMethod {
    
    callMethod(task: Task, expr: PetMap, frame: PetMap): Action {
        const stringValue = expr.getMember(symbols.STR).getPetString();
        return task.returnValue(stringValue);
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

export const exprsCompMethods = new PetMap([
    [symbols.PREP, new ExprsPrepMethod()],
    [symbols.EVAL, new ExprsEvalMethod()],
]);

export const stringExprMethods = new PetMap([
    [symbols.PREP, new NopPrepMethod()],
    [symbols.EVAL, new StringEvalMethod()],
]);


