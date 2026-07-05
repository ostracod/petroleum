
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { DefFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask, prepExprsTask, evalExprsTask, prepWorkersTask, getFuncArgsComp, evalFuncTask, getScope, findVariable, getVarValue } from "./task.js";

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

const callNopPrep: CallPrepMethod = (task, worker) => task.returnValue(null);

const getChildWorkers = (node: PetMap): PetMap[] => {
    const output: PetMap[] = [];
    const comps = node.getMember(symbols.COMPS).getList();
    for (const compValue of comps.elements) {
        const comp = compValue.getMap();
        const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
        if (compType === symbols.STMTS_COMP || compType === symbols.EXPRS_COMP) {
            output.push(comp);
        } else if (compType === symbols.ATTRS_COMP) {
            const attrs = comp.getMember(symbols.ATTRS).getList();
            for (const attrValue of attrs.elements) {
                const attr = attrValue.getMap();
                const workers = getChildWorkers(attr);
                output.push(...workers);
            }
        }
    }
    return output;
};

export const defaultPrepMethod = new PrepMethod((task, worker) => {
    const childWorkers = getChildWorkers(worker);
    return task.runTask(
        prepWorkersTask, { workers: childWorkers },
        (value) => task.returnValue(null),
    );
});

export const defaultEvalMethod = new EvalMethod(
    (task, worker, varSpace) => task.returnValue(null),
);

export const createMethodMap = (
    callPrepMethod: CallPrepMethod | null,
    callEvalMethod: CallEvalMethod,
): PetMap => {
    const output = new PetMap([
        [symbols.EVAL, new EvalMethod(callEvalMethod)],
    ]);
    if (callPrepMethod !== null) {
        output.setMember(symbols.PREP, new PrepMethod(callPrepMethod));
    }
    // TODO: Add #ACCESSED_VARS method.
    
    return output;
}

export const funcInvocationMethods = createMethodMap(
    (task, invocNode) => {
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
    },
    (task, invocNode, varSpace) => task.runTask(
        evalFuncTask, { invocNode, varSpace },
        (value) => task.returnValue(value),
    ),
);

export const stmtsCompMethods = createMethodMap(
    (task, stmtsComp) => task.runTask(
        prepStmtsTask, { stmtsComp },
        (value) => task.returnValue(null),
    ),
    (task, stmtsComp, varSpace) => task.runTask(
        evalStmtsTask, { stmtsComp, varSpace },
        (value) => task.returnValue(null),
    ),
);

export const exprsCompMethods = createMethodMap(
    (task, exprsComp) => task.runTask(
        prepExprsTask, { exprsComp },
        (value) => task.returnValue(null),
    ),
    (task, exprsComp, varSpace) => task.runTask(
        evalExprsTask, { exprsComp, varSpace },
        (value) => task.returnValue(value),
    ),
);

export const stringExprMethods = createMethodMap(
    callNopPrep,
    (task, expr, varSpace) => {
        const stringValue = expr.getMember(symbols.STR).getPetString();
        return task.returnValue(stringValue);
    },
);

export const identExprMethods = createMethodMap(
    (task, expr) => {
        const scope = getScope(expr);
        const varName = expr.getMember(symbols.IDENT).getPetString();
        const variable = findVariable(scope, varName);
        expr.setMember(symbols.VAR, variable);
        return task.returnValue(null);
    },
    (task, expr, varSpace) => {
        const varName = expr.getMember(symbols.IDENT).getPetString();
        const value = getVarValue(varSpace, varName);
        return task.returnValue(value);
    },
);


