
import "./method.js";

import { symbols } from "./symbol.js";
import { PetValue, nullValue, PetMap, FuncSignature, UserFunc, handleRetExcep, EvalState } from "./value.js";
import { CallPrepMethod, CallEvalMethod, createMethodMap } from "./method.js";
import { Action, getScope, findVariable } from "./task.js";

interface ProcDef {
    name: string;
    prepMethod?: CallPrepMethod;
    evalMethod: CallEvalMethod;
}

export const createProcedure = (procDef: ProcDef): PetMap => {
    const methodMap = createMethodMap(procDef.prepMethod ?? null, procDef.evalMethod);
    return new PetMap([
        [symbols.IS_PROC, 1n],
        [symbols.METHODS, methodMap],
    ]);
};

interface SignatureVars {
    argVars?: PetMap[];
    argsVar?: PetMap;
}

const getSignatureVars = (stmtsComp: PetMap): SignatureVars => {
    const attrs = stmtsComp.getMember(symbols.ATTRS).getList();
    if (attrs.getLength() <= 0) {
        return { argVars: [] };
    }
    const attr = attrs.getMember(0).getMap();
    const comps = attr.getMember(symbols.COMPS).getList();
    const comp = comps.getMember(1).getMap();
    const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (compType === symbols.ATTRS_COMP) {
        const argAttrs = comp.getMember(symbols.ATTRS).getList();
        const argVars = argAttrs.elements.map((attrValue) => {
            const argAttr = attrValue.getMap();
            const argComps = argAttr.getMember(symbols.COMPS).getList();
            const declComp = argComps.getMember(0).getMap();
            return declComp.getMember(symbols.VAR).getMap();
        });
        return { argVars };
    } else if (compType === symbols.DECL_COMP) {
        const argsVar = comp.getMember(symbols.VAR).getMap();
        return { argsVar };
    } else {
        throw new Error("Invalid function arguments.");
    }
};

const getFuncSignature = (stmtsComp: PetMap): FuncSignature => {
    const { argVars, argsVar } = getSignatureVars(stmtsComp);
    if (typeof argVars === "undefined") {
        const argsName = argsVar.getMember(symbols.IDENT).getPetString();
        return { argsName };
    } else {
        const argNames = argVars.map((argVar) => (
            argVar.getMember(symbols.IDENT).getPetString()
        ));
        return { argNames };
    }
};

// TODO: Validate node structure.
export const globalProcDefs: ProcDef[] = [
    {
        name: "RUN",
        evalMethod: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            return task.callMethod(
                stmtsComp, symbols.EVAL, [varSpace],
                (value) => task.returnValue(null),
                handleRetExcep(task),
            );
        },
    },
    {
        name: "FUNC",
        prepMethod: (task, expr) => {
            const comps = expr.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const { argVars, argsVar } = getSignatureVars(stmtsComp);
            if (typeof argVars === "undefined") {
                argsVar.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
            } else {
                for (const argVar of argVars) {
                    argVar.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
                }
            }
            return task.callMethod(
                stmtsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
        evalMethod: (task, expr, varSpace) => {
            const comps = expr.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const signature = getFuncSignature(stmtsComp);
            const userFunc = new UserFunc(stmtsComp, varSpace, signature);
            return task.returnValue(userFunc);
        },
    },
    {
        name: "PREP_VAR",
        prepMethod: (task, stmt) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const declComp = comps.getMember(1).getMap();
            const variable = declComp.getMember(symbols.VAR).getMap();
            variable.setMember(symbols.VAR_TYPE, symbols.PREP_VAR);
            const exprsComp = comps.getMember(3).getMap();
            const scope = getScope(exprsComp);
            return task.callMethod(
                exprsComp, symbols.EVAL, [scope],
                (values) => {
                    const value = values.getList().getMember(0);
                    variable.setMember(symbols.VALUE, value);
                    return task.returnValue(null);
                }
            );
        },
        evalMethod: (task, stmt, varSpace) => task.returnValue(null),
    },
    {
        name: "WORK_VAR",
        prepMethod: (task, stmt) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const declComp = comps.getMember(1).getMap();
            const variable = declComp.getMember(symbols.VAR).getMap();
            variable.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
            if (comps.getLength() < 4) {
                return task.returnValue(null);
            }
            const exprsComp = comps.getMember(3).getMap();
            return task.callMethod(
                exprsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
        evalMethod: (task, stmt, varSpace) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            if (comps.getLength() < 4) {
                return task.returnValue(null);
            }
            const declComp = comps.getMember(1).getMap();
            const variable = declComp.getMember(symbols.VAR).getMap();
            const varName = variable.getMember(symbols.IDENT).getPetString();
            const frameEntry = findVariable(varSpace, varName);
            const exprsComp = comps.getMember(3).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const value = values.getList().getMember(0);
                    frameEntry.setMember(symbols.VALUE, value);
                    return task.returnValue(null);
                },
            );
        },
    },
    {
        name: "SET",
        // TODO: Allow specifying module of variable.
        evalMethod: (task, stmt, varSpace) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const identComp = comps.getMember(1).getMap();
            const varName = identComp.getMember(symbols.IDENT).getPetString();
            const frameEntry = findVariable(varSpace, varName);
            const exprsComp = comps.getMember(3).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const value = values.getList().getMember(0);
                    frameEntry.setMember(symbols.VALUE, value);
                    return task.returnValue(null);
                },
            );
        },
    },
    {
        name: "RET",
        evalMethod: (task, stmt, varSpace) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            let retValue: PetValue;
            let retLevel = 0n;
            const throwRetExcep = (): Action => {
                const evalState = new EvalState(task, task.returnValue(null));
                const exception = new PetMap([
                    [symbols.EXCEP_TYPE, symbols.RET_EXCEP],
                    [symbols.VALUE, retValue],
                    [symbols.RET_LEVEL, retLevel],
                    [symbols.EVAL_STATE, evalState],
                ]);
                return task.throwException(exception);
            };
            if (comps.getLength() <= 1) {
                retValue = nullValue;
                return throwRetExcep();
            }
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (listValue) => {
                    const values = listValue.getList();
                    retValue = values.getMember(0);
                    if (values.getLength() > 1) {
                        retLevel = values.getMember(1).getInt();
                    }
                    return throwRetExcep();
                },
            );
        },
    },
];


