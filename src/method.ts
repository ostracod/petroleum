
import "./builtInFunc.js";

import { symbols } from "./symbol.js";
import { PetValue, PetMap } from "./value.js";
import { DefFunc } from "./builtInFunc.js";
import { Action, Task, prepStmtsTask, evalStmtsTask, prepExprsTask, evalExprsTask, prepWorkersTask, workersVarsTask, getFuncArgsComp, evalFuncTask, getScope, findVariable, getVarValue } from "./task.js";

export type CallPrepMethod = (task: Task, worker: PetMap) => Action;
export type CallEvalMethod = (task: Task, worker: PetMap, varSpace: PetMap) => Action;
export type CallVarsMethod = (task: Task, worker: PetMap, scope: PetMap) => Action;

export interface MethodDict {
    prep?: CallPrepMethod;
    eval?: CallEvalMethod;
    accessedVars?: CallVarsMethod;
}

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

class AccessedVarsMethod extends DefFunc {
    
    constructor(callMethod: CallVarsMethod) {
        super({
            name: null,
            argAmount: 2,
            call: (task, args) => {
                const worker = args[0].getMap();
                const scope = args[1].getMap();
                return callMethod(task, worker, scope);
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

export const defaultVarsMethod = new AccessedVarsMethod((task, worker, scope) => {
    const childWorkers = getChildWorkers(worker);
    return task.runTask(
        workersVarsTask, { workers: childWorkers, scope },
        (value) => task.returnValue(value),
    );
});

export const createMethodMap = (methodDict: MethodDict): PetMap => {
    const output = new PetMap([]);
    const { prep: callPrep, eval: callEval, accessedVars: callAccessedVars } = methodDict;
    if (typeof callPrep !== "undefined") {
        output.setMember(symbols.PREP, new PrepMethod(callPrep));
    }
    if (typeof callEval !== "undefined") {
        output.setMember(symbols.EVAL, new EvalMethod(callEval));
    }
    if (typeof callAccessedVars !== "undefined") {
        output.setMember(symbols.ACCESSED_VARS, new AccessedVarsMethod(callAccessedVars));
    }
    return output;
}

export const funcInvocationMethods = createMethodMap({
    prep: (task, invocNode) => {
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
    eval: (task, invocNode, varSpace) => task.runTask(
        evalFuncTask, { invocNode, varSpace },
        (value) => task.returnValue(value),
    ),
});

export const stmtsCompMethods = createMethodMap({
    prep: (task, stmtsComp) => task.runTask(
        prepStmtsTask, { stmtsComp },
        (value) => task.returnValue(null),
    ),
    eval: (task, stmtsComp, varSpace) => task.runTask(
        evalStmtsTask, { stmtsComp, varSpace },
        (value) => task.returnValue(null),
    ),
    accessedVars: (task, stmtsComp, scope) => {
        const stmtList = stmtsComp.getMember(symbols.STMTS).getList();
        const stmts = stmtList.elements.map((value) => value.getMap());
        return task.runTask(
            workersVarsTask, { workers: stmts, scope },
            (value) => task.returnValue(value),
        );
    },
});

export const exprsCompMethods = createMethodMap({
    prep: (task, exprsComp) => task.runTask(
        prepExprsTask, { exprsComp },
        (value) => task.returnValue(null),
    ),
    eval: (task, exprsComp, varSpace) => task.runTask(
        evalExprsTask, { exprsComp, varSpace },
        (value) => task.returnValue(value),
    ),
    accessedVars: (task, exprsComp, scope) => {
        const exprList = exprsComp.getMember(symbols.EXPRS).getList();
        const exprs = exprList.elements.map((value) => value.getMap());
        return task.runTask(
            workersVarsTask, { workers: exprs, scope },
            (value) => task.returnValue(value),
        );
    },
});

export const stringExprMethods = createMethodMap({
    prep: callNopPrep,
    eval: (task, expr, varSpace) => {
        const stringValue = expr.getMember(symbols.STR).getPetString();
        return task.returnValue(stringValue);
    },
});

export const identExprMethods = createMethodMap({
    prep: (task, expr) => {
        const scope = getScope(expr);
        const varName = expr.getMember(symbols.IDENT).getPetString();
        const variable = findVariable(scope, varName);
        expr.setMember(symbols.VAR, variable);
        return task.returnValue(null);
    },
    eval: (task, expr, varSpace) => {
        const varName = expr.getMember(symbols.IDENT).getPetString();
        const value = getVarValue(varSpace, varName);
        return task.returnValue(value);
    },
});


