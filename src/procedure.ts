
import "./method.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetValue, nullValue, PetString, PetList, PetMap, UserFunc, EvalState } from "./value.js";
import { MethodDict, createMethodMap } from "./method.js";
import { getModule } from "./node.js";
import { findVariable, findVarValue, getModuleFrameEntry, getScope, varIsInScope, getSignatureVars } from "./variable.js";
import { Action, setProcPrepTask } from "./task.js";

interface ProcDef extends MethodDict {
    name: string;
}

export const createProcedure = (procDef: ProcDef): PetMap => {
    const methodMap = createMethodMap(procDef);
    return new PetMap([
        [symbols.IS_PROC, 1n],
        [symbols.METHODS, methodMap],
    ]);
};

const readWorkVarComps = (stmt: PetMap): { variable: PetMap, exprsComp?: PetMap } => {
    const comps = stmt.getMember(symbols.COMPS).getList();
    const declComp = comps.getMember(1).getMap();
    const variable = declComp.getMember(symbols.VAR).getMap();
    if (comps.getLength() < 4) {
        return { variable };
    }
    const exprsComp = comps.getMember(3).getMap();
    return { variable, exprsComp };
};

export interface SetProcParts {
    varName: PetString,
    moduleComp?: PetMap,
    valueComp: PetMap,
}

const readSetComps = (stmt: PetMap): SetProcParts => {
    const comps = stmt.getMember(symbols.COMPS).getList();
    const secondComp = comps.getMember(1).getMap();
    let moduleComp: PetMap | null;
    let identComp: PetMap;
    if (secondComp.getMember(symbols.COMP_TYPE).getSymbol() === symbols.EXPRS_COMP) {
        moduleComp = secondComp;
        identComp = comps.getMember(2).getMap();
    } else {
        moduleComp = null;
        identComp = secondComp;
    }
    const varName = identComp.getMember(symbols.IDENT).getPetString();
    const valueComp = comps.getMember(comps.getLength() - 1).getMap();
    const output: SetProcParts = { varName, valueComp };
    if (moduleComp !== null) {
        output.moduleComp = moduleComp;
    }
    return output;
};

const setUpImportVar = (comps: PetList, moduleVars: PetMap): void => {
    const firstComp = comps.getMember(0).getMap();
    let externVarName: PetString;
    let internVar: PetMap;
    if (firstComp.getMember(symbols.COMP_TYPE).getSymbol() === symbols.DECL_COMP) {
        internVar = firstComp.getMember(symbols.VAR).getMap();
        externVarName = internVar.getMember(symbols.IDENT).getPetString();
    } else {
        externVarName = firstComp.getMember(symbols.IDENT).getPetString();
        // comps.getMember(1) should be "AS".
        const declComp = comps.getMember(2).getMap();
        internVar = declComp.getMember(symbols.VAR).getMap();
    }
    const externVar = moduleVars.getMember(externVarName);
    internVar.setMember(symbols.VAR_TYPE, symbols.IMPORT_VAR);
    internVar.setMember(symbols.IMPORT_VAR, externVar);
};

const setUpImportVars = (comps: PetList, module: PetMap): void => {
    const compAmount = comps.getLength();
    let compIndex = 2;
    if (compIndex >= compAmount) {
        return;
    }
    const comp = comps.getMember(compIndex).getMap();
    const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (compType === symbols.IDENT_COMP && comp.getMember(symbols.IDENT).toString() == "AS") {
        const declComp = comps.getMember(compIndex + 1).getMap();
        const variable = declComp.getMember(symbols.VAR).getMap();
        variable.setMember(symbols.VAR_TYPE, symbols.PREP_VAR);
        variable.setMember(symbols.VALUE, module);
        compIndex += 2;
    }
    if (compIndex >= compAmount) {
        return;
    }
    const moduleScope = module.getMember(symbols.SCOPE).getMap();
    const moduleVars = moduleScope.getMember(symbols.VARS).getMap();
    const attrsComp = comps.getMember(compIndex).getMap();
    const attrs = attrsComp.getMember(symbols.ATTRS).getList();
    for (const attr of attrs.elements) {
        const attrComps = attr.getMap().getMember(symbols.COMPS).getList();
        const firstComp = attrComps.getMember(0).getMap();
        const firstCompType = firstComp.getMember(symbols.COMP_TYPE).getSymbol();
        if (firstCompType === symbols.IDENT_COMP
                && firstComp.getMember(symbols.IDENT).toString() == "VARS") {
            const varAttrsComp = attrComps.getMember(1).getMap();
            const varAttrs = varAttrsComp.getMember(symbols.ATTRS).getList();
            for (const varAttr of varAttrs.elements) {
                const varAttrComps = varAttr.getMap().getMember(symbols.COMPS).getList();
                setUpImportVar(varAttrComps, moduleVars);
            }
        }
    }
};

// TODO: Validate node structure.
export const globalProcDefs: ProcDef[] = [
    {
        name: "RUN",
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            return task.callMethod(
                stmtsComp, symbols.EVAL, [varSpace],
                (value) => task.returnValue(null),
                (exception) => task.handleRetExcep(exception),
            );
        },
    },
    {
        name: "FUNC",
        prep: (task, expr) => {
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
        eval: (task, expr, varSpace) => {
            const comps = expr.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const fieldValue = expr.getMember(symbols.ACCESSED_VARS);
            const createFunc = (varsValue: PetValue): Action => {
                const accessedVars = varsValue.getMap();
                const userFunc = new UserFunc(stmtsComp, varSpace, accessedVars);
                return task.returnValue(userFunc);
            };
            if (typeof fieldValue !== "undefined") {
                return createFunc(fieldValue);
            }
            const scope = getScope(expr);
            return task.callMethod(
                stmtsComp, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    expr.setMember(symbols.ACCESSED_VARS, resultValue);
                    return createFunc(resultValue);
                }
            );
        },
    },
    {
        name: "PREP_VAR",
        prep: (task, stmt) => {
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
        accessedVars: (task, expr, scope) => task.returnValue(new PetMap()),
    },
    {
        name: "WORK_VAR",
        prep: (task, stmt) => {
            const { variable, exprsComp } = readWorkVarComps(stmt);
            variable.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
            if (typeof exprsComp === "undefined") {
                return task.returnValue(null);
            }
            return task.callMethod(
                exprsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
        eval: (task, stmt, varSpace) => {
            const { variable, exprsComp } = readWorkVarComps(stmt);
            if (typeof exprsComp === "undefined") {
                return task.returnValue(null);
            }
            const frameEntry = findVarValue(varSpace, variable);
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const value = values.getList().getMember(0);
                    frameEntry.setMember(symbols.VALUE, value);
                    return task.returnValue(null);
                },
            );
        },
        accessedVars: (task, stmt, scope) => {
            const { variable, exprsComp } = readWorkVarComps(stmt);
            const varMap = new PetMap();
            if (varIsInScope(variable, scope)) {
                const varName = variable.getMember(symbols.IDENT).getPetString();
                varMap.setMember(varName, variable);
            }
            if (typeof exprsComp === "undefined") {
                return task.returnValue(varMap);
            }
            return task.callMethod(
                exprsComp, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    const resultMap = resultValue.getMap();
                    const names = resultMap.getKeys();
                    for (const name of names) {
                        const accessedVar = resultMap.getMember(name);
                        varMap.setMember(name, accessedVar);
                    }
                    return task.returnValue(varMap);
                },
            );
        },
    },
    {
        name: "SET",
        prep: (task, stmt) => {
            const parts = readSetComps(stmt);
            return task.runTask(
                setProcPrepTask, { stmt, parts },
                (value) => task.returnValue(null),
            );
        },
        eval: (task, stmt, varSpace) => {
            const destVar = stmt.getMember(symbols.DEST_VAR).getMap();
            const { moduleComp, valueComp } = readSetComps(stmt);
            let frameEntry: PetMap;
            if (typeof moduleComp === "undefined") {
                frameEntry = findVarValue(varSpace, destVar);
            } else {
                frameEntry = getModuleFrameEntry(destVar);
            }
            return task.callMethod(
                valueComp, symbols.EVAL, [varSpace],
                (values) => {
                    const value = values.getList().getMember(0);
                    frameEntry.setMember(symbols.VALUE, value);
                    return task.returnValue(null);
                },
            );
        },
        accessedVars: (task, stmt, scope) => {
            const { valueComp } = readSetComps(stmt);
            const destVar = stmt.getMember(symbols.DEST_VAR).getMap();
            const varMap = new PetMap();
            if (varIsInScope(destVar, scope)) {
                const varName = destVar.getMember(symbols.IDENT).getPetString();
                varMap.setMember(varName, destVar);
            }
            return task.callMethod(
                valueComp, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    const resultMap = resultValue.getMap();
                    const names = resultMap.getKeys();
                    for (const name of names) {
                        const accessedVar = resultMap.getMember(name);
                        varMap.setMember(name, accessedVar);
                    }
                    return task.returnValue(varMap);
                },
            );
        },
    },
    {
        name: "IMPORT",
        prep: (task, stmt) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            const scope = getScope(exprsComp);
            return task.callMethod(
                exprsComp, symbols.EVAL, [scope],
                (values) => {
                    const specifier = values.getList().getMember(0).getKnownValue();
                    let module: PetMap;
                    if (specifier instanceof PetString) {
                        const path = specifier.toString();
                        const parentModule = getModule(stmt);
                        const parentPackage = parentModule.getMember(symbols.PACK).getMap();
                        module = task.context.loadUserModule(parentPackage, path);
                    } else if (specifier instanceof PetSymbol) {
                        throw new Error("Built-in modules are not yet supported.");
                    }
                    setUpImportVars(comps, module);
                    return task.returnValue(null);
                }
            );
        },
        accessedVars: (task, expr, scope) => task.returnValue(new PetMap()),
    },
    {
        name: "RET",
        eval: (task, stmt, varSpace) => {
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


