
import "./task.js";

import * as pathUtils from "path";
import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, PetString, PetList, PetMap, ObservableBunch } from "./value.js";
import { FileExistsFunc } from "./builtInFunc.js";
import { SetProcParts, setUpImportVars } from "./procedure.js";
import { PetTypeError, createBreakExcep } from "./exception.js";
import { getPackage, assertCompAmount, assertMinCompAmount, getPrepGradeExprs, getStmtsComp } from "./node.js";
import { getVariable, findVarValue, getScope, VarSpaceType, getVarSpaceType, createFrame, getSignatureVars } from "./variable.js";
import { TaskDef } from "./task.js";

export interface MapFieldComps {
    keyComp: PetMap;
    valueComp: PetMap;
}

interface MapFieldEvalParams {
    comps: MapFieldComps;
    varSpace: PetMap;
}

const mapFieldEvalTask: TaskDef<MapFieldEvalParams, { key: PetValue | null }> = {
    getInitState: (params) => ({ key: null }),
    stages: [
        (task) => {
            const { comps, varSpace } = task.params;
            return task.callMethod(
                comps.keyComp, symbols.EVAL, [varSpace],
                (listValue) => {
                    const key = listValue.getList().getMember(0);
                    return task.advanceStage({ key });
                },
            );
        },
        (task) => {
            const { comps, varSpace } = task.params;
            return task.callMethod(
                comps.valueComp, symbols.EVAL, [varSpace],
                (listValue) => {
                    const value = listValue.getList().getMember(0);
                    const fieldParts = new PetList([task.state.key, value]);
                    return task.returnValue(fieldParts);
                },
            );
        },
    ],
};

interface MapProcEvalParams {
    compsList: MapFieldComps[];
    varSpace: PetMap;
}

interface MapProcEvalState {
    map: PetMap;
    compsIndex: number;
}

export const mapProcEvalTask: TaskDef<MapProcEvalParams, MapProcEvalState> = {
    getInitState: (params) => ({ map: new PetMap(), compsIndex: 0 }),
    stages: [
        (task) => {
            const { compsList, varSpace } = task.params;
            const { map, compsIndex } = task.state;
            if (compsIndex < compsList.length) {
                const comps = compsList[compsIndex];
                return task.runTask(
                    mapFieldEvalTask, { comps, varSpace },
                    (listValue) => {
                        const values = listValue.getList();
                        const fieldKey = values.getMember(0);
                        const fieldValue = values.getMember(1);
                        // Something something quadratic time complexity whatever who cares
                        const nextMap = map.shallowCopy();
                        nextMap.setMember(fieldKey, fieldValue);
                        return task.repeatStage({ map: nextMap, compsIndex: compsIndex + 1 });
                    },
                );
            } else {
                return task.returnValue(map);
            }
        },
    ],
};

export const setProcPrepTask: TaskDef<{ stmt: PetMap, parts: SetProcParts }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { stmt, parts } = task.params;
            const { varName, moduleComp } = parts;
            const scope = getScope(stmt);
            if (typeof moduleComp === "undefined") {
                const destVar = getVariable(scope, varName);
                stmt.setMember(symbols.DEST_VAR, destVar);
                return task.advanceStage(null);
            }
            return task.callMethod(
                moduleComp, symbols.EVAL, [scope],
                (listValue) => {
                    const module = listValue.getList().getMember(0).getMap();
                    const moduleScope = module.getMember(symbols.SCOPE).getMap();
                    const moduleVars = moduleScope.getMember(symbols.VARS).getMap();
                    const destVar = moduleVars.getMember(varName);
                    stmt.setMember(symbols.DEST_VAR, destVar);
                    return task.advanceStage(null);
                },
            );
        },
        (task) => {
            const { parts: { valueComp } } = task.params;
            return task.callMethod(
                valueComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
    ],
};

export interface IfProcClause {
    exprsComp: PetMap | null;
    stmtsComp: PetMap;
}

interface IfClauseEvalParams {
    clause: IfProcClause;
    varSpace: PetMap;
}

const ifClauseEvalTask: TaskDef<IfClauseEvalParams, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { clause: { exprsComp }, varSpace } = task.params;
            if (exprsComp === null) {
                return task.advanceStage(null);
            }
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (listValue) => {
                    const shouldRun = listValue.getList().getMember(0).getInt();
                    if (shouldRun === 0n) {
                        return task.returnValue(0n);
                    } else {
                        return task.advanceStage(null);
                    }
                },
            );
        },
        (task) => {
            const { clause: { stmtsComp }, varSpace } = task.params;
            return task.callMethod(
                stmtsComp, symbols.EVAL, [varSpace],
                (value) => task.returnValue(1n),
            );
        },
    ],
};

interface IfProcEvalParams {
    clauses: IfProcClause[];
    varSpace: PetMap;
}

export const ifProcEvalTask: TaskDef<IfProcEvalParams, { clauseIndex: number }> = {
    getInitState: (params) => ({ clauseIndex: 0 }),
    stages: [
        (task) => {
            const { clauses, varSpace } = task.params;
            const { clauseIndex } = task.state;
            if (clauseIndex < clauses.length) {
                const clause = clauses[clauseIndex];
                return task.runTask(
                    ifClauseEvalTask, { clause, varSpace },
                    (value) => {
                        const hasRun = value.getInt();
                        if (hasRun === 0n) {
                            return task.repeatStage({ clauseIndex: clauseIndex + 1 });
                        } else {
                            return task.returnValue(null);
                        }
                    },
                );
            } else {
                return task.returnValue(null);
            }
        },
    ],
};

interface WhileProcEvalParams {
    exprsComp: PetMap;
    stmtsComp: PetMap;
    varSpace: PetMap;
}

export const whileIterEvalTask: TaskDef<WhileProcEvalParams, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => task.callMethod(
            task.params.exprsComp, symbols.EVAL, [task.params.varSpace],
            (listValue) => {
                const shouldRun = listValue.getList().getMember(0).getInt();
                if (shouldRun === 0n) {
                    throw createBreakExcep();
                } else {
                    return task.advanceStage(null);
                }
            },
        ),
        (task) => task.callMethod(
            task.params.stmtsComp, symbols.EVAL, [task.params.varSpace],
            (value) => task.returnValue(null),
        ),
    ],
};

export const whileProcEvalTask: TaskDef<WhileProcEvalParams, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => task.runTask(
            whileIterEvalTask, task.params,
            (value) => task.repeatStage(null),
            (excepValue) => {
                const exception = excepValue.getMap();
                const excepType = exception.getMember(symbols.EXCEP_TYPE).getSymbol();
                if (excepType === symbols.BREAK_EXCEP) {
                    return task.returnValue(null);
                } else if (excepType === symbols.CONT_EXCEP) {
                    return task.repeatStage(null);
                } else {
                    return task.throwException(excepValue);
                }
            },
        ),
    ],
};

export const funcProcPrepTask: TaskDef<{ expr: PetMap }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { expr } = task.params;
            const comps = expr.getMember(symbols.COMPS).getList();
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
                (value) => task.advanceStage(null),
            );
        },
        (task) => {
            const { expr } = task.params;
            const comps = expr.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const scope = getScope(expr);
            return task.callMethod(
                stmtsComp, symbols.ACCESSED_VARS, [scope],
                (resultValue) => {
                    expr.setMember(symbols.ACCESSED_VARS, resultValue);
                    return task.returnValue(null);
                },
            );
        },
    ],
};

interface AwaitProcEvalParams {
    worker: PetMap;
    varSpace: PetMap;
}

interface AwaitProcEvalState {
    bunch: ObservableBunch | null;
    location: KnownValue | null;
}

export const awaitProcEvalTask: TaskDef<AwaitProcEvalParams, AwaitProcEvalState> = {
    getInitState: (params) => ({ bunch: null, location: null }),
    stages: [
        (task) => {
            const { worker, varSpace } = task.params;
            const comps = worker.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const bunch = valueList.getMember(0).getObservableBunch();
                    const location = valueList.getMember(1).getKnownValue();
                    const condition = valueList.getMember(2).getFunc();
                    const message = valueList.getMember(3).getPetString();
                    return task.awaitMember(
                        bunch, location, condition, message,
                        task.advanceStage({ bunch, location }),
                    );
                },
            );
        },
        (task) => {
            const { bunch, location } = task.state;
            return task.returnValue(bunch!.getMember(location));
        },
    ],
};

interface TryProcEvalParams {
    tryBody: PetMap;
    catchBody: PetMap;
    varSpace: PetMap;
}

export const tryProcEvalTask: TaskDef<TryProcEvalParams, { exception: PetValue | null }> = {
    getInitState: (params) => ({ exception: null }),
    stages: [
        (task) => {
            const { tryBody, varSpace } = task.params;
            return task.callMethod(
                tryBody, symbols.EVAL, [varSpace],
                (value) => task.returnValue(null),
                (exception) => task.advanceStage({ exception }),
            );
        },
        (task) => {
            const { catchBody, varSpace } = task.params;
            const attrs = catchBody.getMember(symbols.ATTRS).getList();
            let excepVar: PetMap | null;
            if (attrs.getLength() === 1) {
                const attr = attrs.getMember(0).getMap();
                const attrComps = attr.getMember(symbols.COMPS).getList();
                const declComp = attrComps.getMember(1).getMap();
                excepVar = declComp.getMember(symbols.VAR).getMap();
            } else {
                excepVar = null;
            }
            const scope = catchBody.getMember(symbols.SCOPE).getMap();
            const varSpaceType = getVarSpaceType(varSpace);
            const parentFrame = (varSpaceType === VarSpaceType.Frame) ? varSpace : null;
            const frame = createFrame(scope, parentFrame);
            if (excepVar !== null) {
                const frameEntry = findVarValue(frame, excepVar);
                frameEntry.setMember(symbols.VALUE, task.state.exception);
            }
            return task.callMethod(
                catchBody, symbols.EVAL, [frame],
                (value) => task.returnValue(null),
            );
        },
    ],
};

interface WithCallerParams {
    callerNode: PetMap;
    stmtsComp: PetMap;
    varSpace: PetMap;
}

const withCallerTask: TaskDef<WithCallerParams, null> = {
    getInitState: (params) => null,
    getNodes: (params) => ({ callerNode: params.callerNode }),
    stages: [
        (task) => task.callMethod(
            task.params.stmtsComp, symbols.EVAL, [task.params.varSpace],
            (value) => task.returnValue(null),
        ),
    ],
};

interface WithCallerProcParams {
    exprsComp: PetMap;
    stmtsComp: PetMap;
    varSpace: PetMap;
}

export const withCallerProcTask: TaskDef<WithCallerProcParams, { node: PetMap | null }> = {
    getInitState: (params) => ({ node: null }),
    stages: [
        (task) => task.callMethod(
            task.params.exprsComp, symbols.EVAL, [task.params.varSpace],
            (listValue) => {
                const node = listValue.getList().getMember(0).getMap();
                return task.advanceStage({ node });
            },
        ),
        (task) => task.runTask(
            withCallerTask,
            {
                callerNode: task.state.node!,
                stmtsComp: task.params.stmtsComp,
                varSpace: task.params.varSpace,
            },
            (value) => task.returnValue(null),
        ),
    ],
};

const importUserModuleTask: TaskDef<{ pack: PetMap, absPath: string }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { absPath } = task.params;
            const condition = new FileExistsFunc(absPath);
            const message = new PetString(`Waiting for ${absPath} to exist`);
            const nextAction = task.advanceStage(null);
            return task.spin(condition, message, nextAction);
        },
        (task) => {
            const { pack, absPath } = task.params;
            const module = task.context.loadUserModule(pack, absPath);
            return task.returnValue(module);
        },
    ],
};

interface ImportProcPrepState {
    specifier: KnownValue;
    module: PetMap | null;
}

export const importProcPrepTask: TaskDef<{ stmt: PetMap }, ImportProcPrepState> = {
    getInitState: (params) => ({ specifier: null, module: null }),
    stages: [
        (task) => {
            const { stmt } = task.params;
            const comps = stmt.getMember(symbols.COMPS).getList();
            assertMinCompAmount(comps, 2);
            const exprsComp = getPrepGradeExprs(comps, 1, 1);
            const scope = getScope(exprsComp);
            return task.callMethod(
                exprsComp, symbols.EVAL, [scope],
                (values) => {
                    const specifier = values.getList().getMember(0).getKnownValue();
                    return task.advanceStage({ specifier, module: null });
                },
            );
        },
        (task) => {
            const { specifier } = task.state;
            if (specifier instanceof PetString) {
                const relPath = specifier.toString();
                const pack = getPackage(task.params.stmt);
                const packPath = pack.getMember(symbols.DIR_PATH).toStringStrict();
                const absPath = pathUtils.resolve(pathUtils.join(packPath, relPath));
                return task.runTask(
                    importUserModuleTask, { pack, absPath },
                    (value) => {
                        const module = value.getMap();
                        return task.advanceStage({ specifier, module });
                    },
                );
            } else if (specifier instanceof PetSymbol) {
                const module = task.context.getBuiltInModule(specifier);
                return task.advanceStage({ specifier, module });
            } else {
                throw new PetTypeError("Module specifier must be string or symbol.");
            }
        },
        (task) => {
            const { stmt } = task.params;
            const comps = stmt.getMember(symbols.COMPS).getList();
            setUpImportVars(comps, task.state.module!);
            return task.returnValue(null);
        },
    ],
};


