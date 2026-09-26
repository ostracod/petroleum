
import "./method.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetValue, nullValue, PetString, PetList, PetMap, UserFunc, EvalState } from "./value.js";
import { MethodDict, createMethodMap, callDefaultPrep } from "./method.js";
import { PetException, createSyntaxError } from "./exception.js";
import { getPackage, assertCompAmount, assertMinCompAmount, assertMaxCompAmount, assertStmtsComp, assertWorkGradeExprs, assertIdentComp, getSmtsComp, getPrepGradeExprs, getWorkGradeExprs, getAttrsComp, getDeclComp, getIdentComp } from "./node.js";
import { findVariable, findVarValue, getModuleFrameEntry, getScope, varIsInScope, getSignatureVars } from "./variable.js";
import { Action, setProcPrepTask, awaitProcEvalTask, spinCondTask } from "./task.js";
import { Spinner } from "./scheduler.js";

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
    const compAmount = comps.getLength();
    const moduleComp = (compAmount === 4) ? null : comps.getMember(1).getMap();
    const varNameComp = comps.getMember(compAmount - 3).getMap();
    const varName = varNameComp.getMember(symbols.IDENT).getPetString();
    const valueComp = comps.getMember(compAmount - 1).getMap();
    const output: SetProcParts = { varName, valueComp };
    if (moduleComp !== null) {
        output.moduleComp = moduleComp;
    }
    return output;
};

const setUpImportVar = (varAttr: PetMap, moduleVars: PetMap): void => {
    const comps = varAttr.getMember(symbols.COMPS).getList();
    const firstComp = comps.getMember(0).getMap();
    const firstCompType = firstComp.getMember(symbols.COMP_TYPE).getSymbol();
    let externVarName: PetString;
    let internVar: PetMap;
    if (firstCompType === symbols.DECL_COMP) {
        assertCompAmount(comps, 1, varAttr);
        internVar = firstComp.getMember(symbols.VAR).getMap();
        externVarName = internVar.getMember(symbols.IDENT).getPetString();
    } else if (firstCompType === symbols.IDENT_COMP) {
        assertCompAmount(comps, 3, varAttr);
        externVarName = firstComp.getMember(symbols.IDENT).getPetString();
        assertIdentComp(comps, 1, "AS");
        const declComp = getDeclComp(comps, 2);
        internVar = declComp.getMember(symbols.VAR).getMap();
    } else {
        throw createSyntaxError(
            "Expected declaration component or identifier component.", firstComp,
        );
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
    if (compType === symbols.IDENT_COMP) {
        if (comp.getMember(symbols.IDENT).toString() !== "AS") {
            throw createSyntaxError("Expected \"AS\" identifier component.", comp);
        }
        const nextCompIndex = compIndex + 2;
        assertMinCompAmount(comps, nextCompIndex);
        const declComp = getDeclComp(comps, compIndex + 1);
        const variable = declComp.getMember(symbols.VAR).getMap();
        variable.setMember(symbols.VAR_TYPE, symbols.PREP_VAR);
        variable.setMember(symbols.VALUE, module);
        compIndex = nextCompIndex;
    }
    if (compIndex >= compAmount) {
        return;
    }
    assertMaxCompAmount(comps, compIndex + 1);
    const moduleScope = module.getMember(symbols.SCOPE).getMap();
    const moduleVars = moduleScope.getMember(symbols.VARS).getMap();
    const attrsComp = getAttrsComp(comps, compIndex);
    const attrs = attrsComp.getMember(symbols.ATTRS).getList();
    for (const attr of attrs.elements) {
        const attrComps = attr.getMap().getMember(symbols.COMPS).getList();
        assertCompAmount(attrComps, 2);
        assertIdentComp(attrComps, 0, "VARS");
        const varAttrsComp = getAttrsComp(attrComps, 1);
        const varAttrs = varAttrsComp.getMember(symbols.ATTRS).getList();
        for (const varAttrValue of varAttrs.elements) {
            setUpImportVar(varAttrValue.getMap(), moduleVars);
        }
    }
};

export const globalProcDefs: ProcDef[] = [
    {
        name: "RUN",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertStmtsComp(comps, 1);
            return callDefaultPrep(task, worker);
        },
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
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            const stmtsComp = getSmtsComp(comps, 1);
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
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const fieldValue = worker.getOptionalMember(symbols.ACCESSED_VARS);
            const createFunc = (varsValue: PetValue): Action => {
                const accessedVars = varsValue.getMap();
                const userFunc = new UserFunc(stmtsComp, varSpace, accessedVars);
                return task.returnValue(userFunc);
            };
            if (typeof fieldValue !== "undefined") {
                return createFunc(fieldValue);
            }
            const scope = getScope(worker);
            return task.callMethod(
                stmtsComp, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    worker.setMember(symbols.ACCESSED_VARS, resultValue);
                    return createFunc(resultValue);
                }
            );
        },
    },
    {
        name: "PREP_VAR",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 4);
            const declComp = getDeclComp(comps, 1);
            const variable = declComp.getMember(symbols.VAR).getMap();
            variable.setMember(symbols.VAR_TYPE, symbols.PREP_VAR);
            assertIdentComp(comps, 2, "=");
            const exprsComp = getPrepGradeExprs(comps, 3, 1);
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
    },
    {
        name: "WORK_VAR",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 2);
            const declComp = getDeclComp(comps, 1);
            const variable = declComp.getMember(symbols.VAR).getMap();
            variable.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
            if (comps.getLength() > 2) {
                assertCompAmount(comps, 4);
                assertIdentComp(comps, 2, "=");
                const exprsComp = getWorkGradeExprs(comps, 3, 1);
                return task.callMethod(
                    exprsComp, symbols.PREP, [],
                    (value) => task.returnValue(null),
                );
            } else {
                return task.returnValue(null);
            }
        },
        eval: (task, worker, varSpace) => {
            const { variable, exprsComp } = readWorkVarComps(worker);
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
        accessedVars: (task, worker, scope) => {
            const { variable, exprsComp } = readWorkVarComps(worker);
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
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 4);
            assertMaxCompAmount(comps, 5);
            const compAmount = comps.getLength();
            const moduleComp = (compAmount === 4) ? null : getPrepGradeExprs(comps, 1, 1);
            const varNameComp = getIdentComp(comps, compAmount - 3);
            const varName = varNameComp.getMember(symbols.IDENT).getPetString();
            assertIdentComp(comps, compAmount - 2, "=")
            const valueComp = getWorkGradeExprs(comps, compAmount - 1, 1);
            const parts: SetProcParts = { varName, valueComp };
            if (moduleComp !== null) {
                parts.moduleComp = moduleComp;
            }
            return task.runTask(
                setProcPrepTask, { stmt: worker, parts },
                (value) => task.returnValue(null),
            );
        },
        eval: (task, worker, varSpace) => {
            const destVar = worker.getMember(symbols.DEST_VAR).getMap();
            const { moduleComp, valueComp } = readSetComps(worker);
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
        accessedVars: (task, worker, scope) => {
            const { valueComp } = readSetComps(worker);
            const destVar = worker.getMember(symbols.DEST_VAR).getMap();
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
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 2);
            const exprsComp = getPrepGradeExprs(comps, 1, 1);
            const scope = getScope(exprsComp);
            return task.callMethod(
                exprsComp, symbols.EVAL, [scope],
                (values) => {
                    const specifier = values.getList().getMember(0).getKnownValue();
                    let module: PetMap;
                    if (specifier instanceof PetString) {
                        const path = specifier.toString();
                        const parentPackage = getPackage(worker);
                        module = task.context.loadUserModule(parentPackage, path);
                    } else if (specifier instanceof PetSymbol) {
                        throw new Error("Built-in modules are not yet supported.");
                    }
                    setUpImportVars(comps, module);
                    return task.returnValue(null);
                }
            );
        },
    },
    {
        name: "IMPORT_PACK",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 2);
            const exprsComp = getPrepGradeExprs(comps, 1, 1);
            const scope = getScope(exprsComp);
            return task.callMethod(
                exprsComp, symbols.EVAL, [scope],
                (values) => {
                    const specifier = values.getList().getMember(0);
                    const parentPackage = getPackage(worker);
                    const depMap = parentPackage.getMember(symbols.DEPS).getMap();
                    const depPackage = depMap.getMember(specifier).getMap();
                    const mainModule = depPackage.getMember(symbols.MAIN_MODULE).getMap();
                    const modulePath = mainModule.getMember(symbols.FILE_PATH).toString();
                    if (!task.context.hasUserModule(modulePath)) {
                        task.context.addUserModule(mainModule);
                    }
                    setUpImportVars(comps, mainModule);
                    return task.returnValue(null);
                }
            );
        },
    },
    {
        name: "RET",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMaxCompAmount(comps, 2);
            if (comps.getLength() === 2) {
                const exprsComp = getWorkGradeExprs(comps, 1, null);
                const exprs = exprsComp.getMember(symbols.EXPRS).getList();
                const exprAmount = exprs.getLength();
                if (exprAmount < 1 || exprAmount > 2) {
                    throw createSyntaxError(
                        "Expected 1 or 2 expressions in sequence.", exprsComp,
                    );
                }
            }
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            let retValue: PetValue;
            let retLevel = 0n;
            const createRetExcep = (): PetException => new PetException(new PetMap([
                [symbols.EXCEP_TYPE, symbols.RET_EXCEP],
                [symbols.VALUE, retValue],
                [symbols.RET_LEVEL, retLevel],
            ]));
            if (comps.getLength() <= 1) {
                retValue = nullValue;
                throw createRetExcep();
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
                    throw createRetExcep();
                },
            );
        },
    },
    {
        name: "SPIN",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertWorkGradeExprs(comps, 1, 2);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const condition = valueList.getMember(0).getFunc();
                    const message = valueList.getMember(1).getPetString();
                    const nextAction = task.returnValue(null);
                    const evalState = new EvalState(task, nextAction);
                    const spinner = new Spinner(condition, message, evalState);
                    return task.runTask(
                        spinCondTask, { spinner },
                        (value) => nextAction,
                    );
                },
            );
        },
    },
    {
        name: "AWAIT",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertWorkGradeExprs(comps, 1, 4);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => task.runTask(
            awaitProcEvalTask, { worker, varSpace },
            (value) => task.returnValue(value),
        ),
    },
    {
        name: "ABORT",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertWorkGradeExprs(comps, 1, 2);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const errorType = valueList.getMember(0);
                    const message = valueList.getMember(1);
                    throw new PetException(new PetMap([
                        [symbols.EXCEP_TYPE, symbols.ERROR_EXCEP],
                        [symbols.ERROR_TYPE, errorType],
                        [symbols.MESSAGE, message],
                    ]));
                },
            );
        },
    },
];


