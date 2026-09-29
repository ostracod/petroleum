
import "./method.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetValue, nullValue, PetString, PetList, PetMap, UserFunc, EvalState } from "./value.js";
import { MethodDict, createMethodMap, callDefaultPrep } from "./method.js";
import { PetException, PetTypeError, createBreakExcep, createContExcep, createSyntaxError } from "./exception.js";
import { getPackage, assertCompAmount, assertMinCompAmount, assertMaxCompAmount, assertStmtsComp, assertWorkGradeExprs, assertIdentComp, getStmtsComp, getPrepGradeExprs, getWorkGradeExprs, getAttrsComp, getDeclComp, getIdentComp, getCompIdent } from "./node.js";
import { findVarValue, getVarValue, getModuleFrameEntry, getScope, varIsInScope, getSignatureVars } from "./variable.js";
import { Action, createMethodInvocation, callMethodTask, spinCondTask } from "./task.js";
import { setProcPrepTask, awaitProcEvalTask, MapFieldComps, mapProcEvalTask, IfProcClause, ifProcEvalTask, whileProcEvalTask, tryProcEvalTask, withCallerProcTask } from "./procTask.js";
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

const validateMapAttr = (attr: PetMap): void => {
    const comps = attr.getMember(symbols.COMPS).getList();
    assertCompAmount(comps, 2, attr);
    assertIdentComp(comps, 0, "FIELDS");
    const attrsComp = getAttrsComp(comps, 1);
    const fieldAttrs = attrsComp.getMember(symbols.ATTRS).getList();
    for (const fieldAttrValue of fieldAttrs.elements) {
        const fieldAttr = fieldAttrValue.getMap();
        const fieldComps = fieldAttr.getMember(symbols.COMPS).getList();
        assertCompAmount(fieldComps, 3, fieldAttr);
        assertWorkGradeExprs(fieldComps, 0, 1);
        assertIdentComp(fieldComps, 1, "=");
        assertWorkGradeExprs(fieldComps, 2, 1);
    }
};

const getMapFieldComps = (attr: PetMap): MapFieldComps[] => {
    const comps = attr.getMember(symbols.COMPS).getList();
    const attrsComp = comps.getMember(1).getMap();
    const fieldAttrs = attrsComp.getMember(symbols.ATTRS).getList();
    const output: MapFieldComps[] = [];
    for (const fieldAttrValue of fieldAttrs.elements) {
        const fieldAttr = fieldAttrValue.getMap();
        const fieldComps = fieldAttr.getMember(symbols.COMPS).getList();
        output.push({
            keyComp: fieldComps.getMember(0).getMap(),
            valueComp: fieldComps.getMember(2).getMap(),
        });
    }
    return output;
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

const getIfProcClauses = (stmt: PetMap): IfProcClause[] => {
    const comps = stmt.getMember(symbols.COMPS).getList();
    const output: IfProcClause[] = [{
        exprsComp: comps.getMember(1).getMap(),
        stmtsComp: comps.getMember(2).getMap(),
    }];
    const compAmount = comps.getLength();
    let index = 3;
    while (index < compAmount) {
        const identComp = comps.getMember(index).getMap();
        index += 1;
        const text = identComp.getMember(symbols.IDENT).toString();
        let exprsComp: PetMap | null;
        if (text === "ELSE_IF") {
            exprsComp = comps.getMember(index).getMap();
            index += 1;
        } else {
            exprsComp = null;
        }
        const stmtsComp = comps.getMember(index).getMap();
        index += 1;
        output.push({ exprsComp, stmtsComp });
    }
    return output;
};

export const globalProcDefs: ProcDef[] = [
    {
        name: "LIST",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertWorkGradeExprs(comps, 1, null);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (value) => task.returnValue(value),
            );
        },
    },
    {
        name: "MAP",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            const attrs = getAttrsComp(comps, 1).getMember(symbols.ATTRS).getList();
            for (const attr of attrs.elements) {
                validateMapAttr(attr.getMap());
            }
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const attrsComp = comps.getMember(1).getMap();
            const attrs = attrsComp.getMember(symbols.ATTRS).getList();
            const compsList: MapFieldComps[] = [];
            for (const attr of attrs.elements) {
                compsList.push(...getMapFieldComps(attr.getMap()));
            }
            return task.runTask(
                mapProcEvalTask, { compsList, varSpace },
                (value) => task.returnValue(value),
            );
        },
    },
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
            const stmtsComp = getStmtsComp(comps, 1);
            const { argVars, argsVar } = getSignatureVars(stmtsComp);
            if (typeof argVars === "undefined") {
                argsVar!.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
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
        name: "PREP_SYMBOL",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            const declComp = getDeclComp(comps, 1);
            const variable = declComp.getMember(symbols.VAR).getMap();
            const varName = variable.getMember(symbols.IDENT).toString();
            const symbol = new PetSymbol(varName);
            variable.setMember(symbols.VAR_TYPE, symbols.PREP_VAR);
            variable.setMember(symbols.VALUE, symbol);
            return task.returnValue(null);
        },
    },
    {
        name: "GET",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 3);
            const moduleComp = getPrepGradeExprs(comps, 1, 1);
            const varName = getCompIdent(comps, 2);
            const scope = getScope(worker);
            return task.callMethod(
                moduleComp, symbols.EVAL, [scope],
                (listValue) => {
                    const module = listValue.getList().getMember(0).getMap();
                    const moduleScope = module.getMember(symbols.SCOPE).getMap();
                    const moduleVars = moduleScope.getMember(symbols.VARS).getMap();
                    const srcVar = moduleVars.getMember(varName);
                    worker.setMember(symbols.SRC_VAR, srcVar);
                    return task.returnValue(null);
                },
            );
        },
        eval: (task, worker, varSpace) => {
            const srcVar = worker.getMember(symbols.SRC_VAR).getMap();
            const value = getVarValue(varSpace, srcVar);
            return task.returnValue(value);
        },
        accessedVars: (task, worker, scope) => {
            const srcVar = worker.getMember(symbols.SRC_VAR).getMap();
            const varMap = new PetMap();
            if (varIsInScope(srcVar, scope)) {
                const varName = srcVar.getMember(symbols.IDENT).getPetString();
                varMap.setMember(varName, srcVar);
            }
            return task.returnValue(varMap);
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
            const varName = getCompIdent(comps, compAmount - 3);
            assertIdentComp(comps, compAmount - 2, "=");
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
                    } else {
                        throw new PetTypeError("Module specifier must be string or symbol.");
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
        name: "IF",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 3);
            assertWorkGradeExprs(comps, 1, 1);
            assertStmtsComp(comps, 2);
            const compAmount = comps.getLength();
            let index = 3;
            while (index < compAmount) {
                const identComp = getIdentComp(comps, index);
                const text = identComp.getMember(symbols.IDENT).toString();
                let nextIndex: number;
                if (text === "ELSE_IF") {
                    nextIndex = index + 3;
                    assertMinCompAmount(comps, nextIndex);
                    assertWorkGradeExprs(comps, index + 1, 1);
                    assertStmtsComp(comps, index + 2);
                } else if (text === "ELSE") {
                    nextIndex = index + 2;
                    assertMinCompAmount(comps, nextIndex);
                    assertStmtsComp(comps, index + 1);
                    break;
                } else {
                    throw createSyntaxError(
                        "Expected \"ELSE_IF\" or \"ELSE\" identifier component.", identComp,
                    );
                }
                index = nextIndex;
            }
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const clauses = getIfProcClauses(worker);
            return task.runTask(
                ifProcEvalTask, { clauses, varSpace },
                (value) => task.returnValue(null),
            );
        },
    },
    {
        name: "WHILE",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 3);
            assertWorkGradeExprs(comps, 1, 1);
            assertStmtsComp(comps, 2);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            const stmtsComp = comps.getMember(2).getMap();
            return task.runTask(
                whileProcEvalTask, { exprsComp, stmtsComp, varSpace },
                (value) => task.returnValue(null),
            );
        },
    },
    {
        name: "BREAK",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 1);
            return task.returnValue(null);
        },
        eval: (task, worker, varSpace) => {
            throw createBreakExcep();
        },
    },
    {
        name: "CONT",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 1);
            return task.returnValue(null);
        },
        eval: (task, worker, varSpace) => {
            throw createContExcep();
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
        name: "SCHED",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertStmtsComp(comps, 1);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const invocation = createMethodInvocation(
                stmtsComp, symbols.EVAL, [varSpace],
            );
            task.context.scheduler.scheduleTask(callMethodTask, invocation);
            return task.returnValue(null);
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
    {
        name: "THROW",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 2);
            assertWorkGradeExprs(comps, 1, 1);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const exception = values.getList().getMember(0);
                    throw new PetException(exception);
                },
            );
        },
    },
    {
        name: "TRY",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 4);
            assertStmtsComp(comps, 1);
            assertIdentComp(comps, 2, "CATCH");
            const catchBody = getStmtsComp(comps, 3);
            const attrs = catchBody.getMember(symbols.ATTRS).getList();
            const attrAmount = attrs.getLength();
            if (attrAmount > 1) {
                throw createSyntaxError(
                    "CATCH body cannot have more than one block attribute.", catchBody,
                );
            }
            if (attrAmount === 1) {
                const attr = attrs.getMember(0).getMap();
                const attrComps = attr.getMember(symbols.COMPS).getList();
                assertCompAmount(attrComps, 2, attr);
                assertIdentComp(attrComps, 0, "EXCEP");
                const declComp = getDeclComp(attrComps, 1);
                const variable = declComp.getMember(symbols.VAR).getMap();
                variable.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
            }
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const tryBody = comps.getMember(1).getMap();
            const catchBody = comps.getMember(3).getMap();
            return task.runTask(
                tryProcEvalTask, { tryBody, catchBody, varSpace },
                (value) => task.returnValue(null),
            );
        },
    },
    {
        name: "WITH_CALLER",
        prep: (task, worker) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            assertCompAmount(comps, 3);
            assertWorkGradeExprs(comps, 1, 1);
            assertStmtsComp(comps, 2);
            return callDefaultPrep(task, worker);
        },
        eval: (task, worker, varSpace) => {
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            const stmtsComp = comps.getMember(2).getMap();
            return task.runTask(
                withCallerProcTask, { exprsComp, stmtsComp, varSpace },
                (value) => task.returnValue(null),
            );
        },
    },
];


