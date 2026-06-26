
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { DefFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask, prepExprsTask, evalExprsTask, getFuncArgsComp, evalFuncTask } from "./task.js";

export type CallPrepMethod = (task: Task, worker: PetMap) => Action;
export type CallEvalMethod = (task: Task, worker: PetMap, varSpace: PetMap) => Action;

class PrepMethod extends DefFunc {
    
    constructor(callMethod: CallPrepMethod) {
        super({
            name: null,
            argAmount: 1,
            call: (task, args) => {
                const worker = args[0].getMap();
                return callMethod(task, worker);
            },
        });
    }
}

class EvalMethod extends DefFunc {
    
    constructor(callMethod: CallEvalMethod) {
        super({
            name: null,
            argAmount: 2,
            call: (task, args) => {
                const worker = args[0].getMap();
                const varSpace = args[1].getMap();
                return callMethod(task, worker, varSpace);
            },
        });
    }
}

const callFuncPrep: CallPrepMethod = (task, invocNode) => {
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

const callFuncEval: CallEvalMethod = (task, invocNode, varSpace) => task.runTask(
    evalFuncTask, { invocNode, varSpace },
    (value) => task.returnValue(value),
);

const callStmtsPrep: CallPrepMethod = (task, stmtsComp) => task.runTask(
    prepStmtsTask, { stmtsComp },
    (value) => task.returnValue(null),
);

const callStmtsEval: CallEvalMethod = (task, stmtsComp, varSpace) => task.runTask(
    evalStmtsTask, { stmtsComp, varSpace },
    (value) => task.returnValue(null),
);

const callExprsPrep: CallPrepMethod = (task, exprsComp) => task.runTask(
    prepExprsTask, { exprsComp },
    (value) => task.returnValue(null),
);

const callExprsEval: CallEvalMethod = (task, exprsComp, varSpace) => task.runTask(
    evalExprsTask, { exprsComp, varSpace },
    (value) => task.returnValue(value),
);

const callNopPrep: CallPrepMethod = (task, worker) => task.returnValue(null);

const callStringEval: CallEvalMethod = (task, expr, varSpace) => {
    const stringValue = expr.getMember(symbols.STR).getPetString();
    return task.returnValue(stringValue);
};

export const createMethodMap = (
    callPrepMethod: CallPrepMethod,
    callEvalMethod: CallEvalMethod,
): PetMap => new PetMap([
    [symbols.PREP, new PrepMethod(callPrepMethod)],
    [symbols.EVAL, new EvalMethod(callEvalMethod)],
    // TODO: Add #ACCESSED_VARS method.
]);

export const funcInvocationMethods = createMethodMap(callFuncPrep, callFuncEval);
export const stmtsCompMethods = createMethodMap(callStmtsPrep, callStmtsEval);
export const exprsCompMethods = createMethodMap(callExprsPrep, callExprsEval);
export const stringExprMethods = createMethodMap(callNopPrep, callStringEval);


