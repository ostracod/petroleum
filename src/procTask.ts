
import "./task.js";

import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, SliceableBunch, getBunchElementValue, PetString, PetList, PetField, PetMap, ObservableBunch } from "./value.js";
import { UserModuleExistsFunc } from "./builtInFunc.js";
import { SetProcParts, IterProcParts, setUpImportVars } from "./procedure.js";
import { PetException, PetTypeError, createBreakExcep } from "./exception.js";
import { getPackage, assertMinCompAmount, getPrepGradeExprs, getLabeledAttrComps } from "./node.js";
import { getVariable, getResolvedVarType, findVarValue, getScope, createStmtsCompFrame, FuncSignature, getFuncSignature, setArgVarTypes } from "./variable.js";
import { TaskDef, Action, Task, prepWorkersTask, workersVarsTask, AccumulatorNode, getAccumulatorElements } from "./task.js";

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
    compsIndex: number;
    lastAccumNode?: AccumulatorNode<[KnownValue, PetValue]>;
}

export const mapProcEvalTask: TaskDef<MapProcEvalParams, MapProcEvalState> = {
    getInitState: (params) => ({ compsIndex: 0 }),
    stages: [
        (task) => {
            const { compsList, varSpace } = task.params;
            const { compsIndex, lastAccumNode } = task.state;
            if (compsIndex >= compsList.length) {
                const fieldEntries = getAccumulatorElements(lastAccumNode);
                const map = new PetMap(fieldEntries);
                return task.returnValue(map);
            }
            const comps = compsList[compsIndex];
            return task.runTask(
                mapFieldEvalTask, { comps, varSpace },
                (listValue) => {
                    const values = listValue.getList();
                    const fieldKey = values.getMember(0).getKnownValue();
                    const fieldValue = values.getMember(1);
                    const fieldEntry: [KnownValue, PetValue] = [fieldKey, fieldValue];
                    return task.repeatStage({
                        compsIndex: compsIndex + 1,
                        lastAccumNode: { element: fieldEntry, previousNode: lastAccumNode },
                    });
                },
            );
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
            const { stmt, parts: { valueComp } } = task.params;
            const destVar = stmt.getMember(symbols.DEST_VAR).getMap();
            if (getResolvedVarType(destVar) !== symbols.WORK_VAR) {
                throw new PetTypeError("SET destination must be work-var.");
            }
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

const handleIterExceps = (task: Task, nextIteration: () => Action) => (
    (excepValue: PetValue): Action => {
        const exception = excepValue.getMap();
        const excepType = exception.getMember(symbols.EXCEP_TYPE).getSymbol();
        if (excepType === symbols.BREAK_EXCEP) {
            return task.returnValue(null);
        } else if (excepType === symbols.CONT_EXCEP) {
            return nextIteration();
        } else {
            return task.throwException(excepValue);
        }
    }
);

export const whileProcEvalTask: TaskDef<WhileProcEvalParams, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => task.runTask(
            whileIterEvalTask, task.params,
            (value) => task.repeatStage(null),
            handleIterExceps(task, () => task.repeatStage(null)),
        ),
    ],
};

interface SliceableIterParams {
    parts: IterProcParts;
    varSpace: PetMap;
    bunch: SliceableBunch;
}

const sliceableIterTask: TaskDef<SliceableIterParams, { index: number }> = {
    getInitState: (params) => ({ index: 0 }),
    stages: [
        (task) => {
            const { parts, varSpace, bunch } = task.params;
            const { index } = task.state;
            if (index >= bunch.getLength()) {
                return task.returnValue(null);
            }
            const memberValue = getBunchElementValue(bunch, index);
            const { stmtsComp, locVar, memberVar } = parts;
            const frame = createStmtsCompFrame(stmtsComp, varSpace);
            if (typeof locVar !== "undefined") {
                const frameEntry = findVarValue(frame, locVar);
                frameEntry.setMember(symbols.VALUE, BigInt(index));
            }
            if (typeof memberVar !== "undefined") {
                const frameEntry = findVarValue(frame, memberVar);
                frameEntry.setMember(symbols.VALUE, memberValue);
            }
            const nextIteration = () => task.repeatStage({ index: index + 1 });
            return task.callMethod(
                stmtsComp, symbols.EVAL, [frame],
                (value) => nextIteration(),
                handleIterExceps(task, nextIteration),
            );
        },
    ],
};

interface MapIterParams {
    parts: IterProcParts;
    varSpace: PetMap;
    bunch: PetMap;
}

const mapIterTask: TaskDef<MapIterParams, { field: PetField | null }> = {
    getInitState: (params) => ({ field: params.bunch.firstField }),
    stages: [
        (task) => {
            const { parts, varSpace } = task.params;
            let { field } = task.state;
            if (field !== null && field.isDeleted) {
                field = field.getNextUndeletedField();
            }
            if (field === null) {
                return task.returnValue(null);
            }
            const { stmtsComp, locVar, memberVar } = parts;
            const frame = createStmtsCompFrame(stmtsComp, varSpace);
            if (typeof locVar !== "undefined") {
                const frameEntry = findVarValue(frame, locVar);
                frameEntry.setMember(symbols.VALUE, field.key);
            }
            if (typeof memberVar !== "undefined") {
                const frameEntry = findVarValue(frame, memberVar);
                frameEntry.setMember(symbols.VALUE, field.value);
            }
            const nextIteration = () => task.repeatStage({
                field: field.getNextUndeletedField(),
            });
            return task.callMethod(
                stmtsComp, symbols.EVAL, [frame],
                (value) => nextIteration(),
                handleIterExceps(task, nextIteration),
            );
        },
    ],
};

interface IterProcEvalParams {
    parts: IterProcParts;
    varSpace: PetMap;
}

export const iterProcEvalTask: TaskDef<IterProcEvalParams, { bunch: KnownValue }> = {
    getInitState: (params) => ({ bunch: null }),
    stages: [
        (task) => {
            const { parts, varSpace } = task.params;
            return task.callMethod(
                parts.bunchComp, symbols.EVAL, [varSpace],
                (values) => {
                    const bunch = values.getList().getMember(0).getKnownValue();
                    return task.advanceStage({ bunch });
                },
            );
        },
        (task) => {
            const { parts, varSpace } = task.params;
            const { bunch } = task.state;
            if (bunch instanceof PetString || bunch instanceof PetList) {
                return task.runTask(
                    sliceableIterTask, { parts, varSpace, bunch },
                    (value) => task.returnValue(null),
                );
            } else if (bunch instanceof PetMap) {
                return task.runTask(
                    mapIterTask, { parts, varSpace, bunch },
                    (value) => task.returnValue(null),
                );
            } else {
                throw new PetTypeError("Bunch must be string, list, or map.");
            }
        },
    ],
};

export const getFuncWorkers = (stmtsComp: PetMap, signature?: FuncSignature): PetMap[] => {
    // If the caller already has the signature, pass it in to avoid redundant work.
    if (typeof signature === "undefined") {
        signature = getFuncSignature(stmtsComp);
    }
    const output: PetMap[] = [stmtsComp];
    const { args } = signature;
    if (typeof args !== "undefined") {
        for (const { defaultValueExpr } of args) {
            if (defaultValueExpr !== null) {
                output.push(defaultValueExpr);
            }
        }
    }
    return output;
};

interface FuncProcPrepParams {
    expr: PetMap;
    stmtsComp: PetMap;
    signature: FuncSignature;
}

export const funcProcPrepTask: TaskDef<FuncProcPrepParams, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { stmtsComp, signature } = task.params;
            setArgVarTypes(signature);
            const workers = getFuncWorkers(stmtsComp, signature);
            return task.runTask(
                prepWorkersTask, { workers },
                (value) => task.advanceStage(null),
            );
        },
        (task) => {
            const { expr, stmtsComp, signature } = task.params;
            const workers = getFuncWorkers(stmtsComp, signature);
            const scope = getScope(expr);
            return task.runTask(
                workersVarsTask, { workers, scope },
                (resultValue) => {
                    expr.setMember(symbols.ACCESSED_VARS, resultValue);
                    return task.returnValue(null);
                },
            );
        },
    ],
};

interface ExcepProcEvalParams {
    exprsComp: PetMap;
    workerNodeComp?: PetMap;
    varSpace: PetMap;
}

export const spinProcEvalTask: TaskDef<ExcepProcEvalParams, { workerNode?: PetMap }> = {
    getInitState: (params) => ({}),
    stages: [
        (task) => {
            const { workerNodeComp, varSpace } = task.params;
            if (typeof workerNodeComp === "undefined") {
                return task.advanceStage({});
            }
            return task.callMethod(
                workerNodeComp, symbols.EVAL, [varSpace],
                (values) => {
                    const workerNode = values.getList().getMember(0).getMap();
                    return task.advanceStage({ workerNode });
                },
            );
        },
        (task) => {
            const { exprsComp, varSpace } = task.params;
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const condition = valueList.getMember(0).getFunc();
                    const message = valueList.getMember(1).getPetString();
                    const nextAction = task.returnValue(null);
                    return task.spin(condition, message, nextAction, task.state.workerNode);
                },
            );
        },
    ],
};

interface AwaitProcEvalState {
    bunch?: ObservableBunch;
    location?: KnownValue;
    workerNode?: PetMap;
}

export const awaitProcEvalTask: TaskDef<ExcepProcEvalParams, AwaitProcEvalState> = {
    getInitState: (params) => ({}),
    stages: [
        (task) => {
            const { workerNodeComp, varSpace } = task.params;
            if (typeof workerNodeComp === "undefined") {
                return task.advanceStage({});
            }
            return task.callMethod(
                workerNodeComp, symbols.EVAL, [varSpace],
                (values) => {
                    const workerNode = values.getList().getMember(0).getMap();
                    return task.advanceStage({ workerNode });
                },
            );
        },
        (task) => {
            const { exprsComp, varSpace } = task.params;
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const bunch = valueList.getMember(0).getObservableBunch();
                    const location = valueList.getMember(1).getKnownValue();
                    const condition = valueList.getMember(2).getFunc();
                    const message = valueList.getMember(3).getStringOrNull();
                    return task.awaitMember(
                        bunch, location, condition, message,
                        task.advanceStage({ bunch, location }),
                        task.state.workerNode,
                    );
                },
            );
        },
        (task) => {
            const { bunch, location } = task.state;
            return task.returnValue(bunch!.getMember(location!));
        },
    ],
};

export const abortProcEvalTask: TaskDef<ExcepProcEvalParams, { workerNode?: PetMap }> = {
    getInitState: (params) => ({}),
    stages: [
        (task) => {
            const { workerNodeComp, varSpace } = task.params;
            if (typeof workerNodeComp === "undefined") {
                return task.advanceStage({});
            }
            return task.callMethod(
                workerNodeComp, symbols.EVAL, [varSpace],
                (values) => {
                    const workerNode = values.getList().getMember(0).getMap();
                    return task.advanceStage({ workerNode });
                },
            );
        },
        (task) => {
            const { exprsComp, varSpace } = task.params;
            const { workerNode } = task.state;
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const valueList = values.getList();
                    const errorType = valueList.getMember(0);
                    const message = valueList.getMember(1);
                    const exception = new PetMap([
                        [symbols.EXCEP_TYPE, symbols.ERROR_EXCEP],
                        [symbols.ERROR_TYPE, errorType],
                        [symbols.MESSAGE, message],
                    ]);
                    if (typeof workerNode !== "undefined") {
                        exception.setMember(symbols.WORKER_NODE, workerNode);
                    }
                    throw new PetException(exception);
                },
            );
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
            const attrComps = getLabeledAttrComps(attrs, "EXCEP");
            let excepVar: PetMap | null;
            if (typeof attrComps !== "undefined") {
                const declComp = attrComps.getMember(1).getMap();
                excepVar = declComp.getMember(symbols.VAR).getMap();
            } else {
                excepVar = null;
            }
            const frame = createStmtsCompFrame(catchBody, varSpace);
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

const importUserModuleTask: TaskDef<{ pack: PetMap, absPath: string }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { absPath } = task.params;
            const condition = new UserModuleExistsFunc(absPath);
            const message = new PetString(`Waiting for module at ${absPath} to exist`);
            const nextAction = task.advanceStage(null);
            return task.spin(condition, message, nextAction);
        },
        (task) => {
            const { pack, absPath } = task.params;
            let module = task.context.getUserModule(absPath);
            if (module !== null) {
                // This happens when a virtual module exists at absPath.
                return task.returnValue(module);
            }
            const moduleContent = task.context.fileSystem.readFile(absPath).toString();
            module = task.context.loadUserModule(moduleContent, pack, absPath);
            return task.returnValue(module);
        },
    ],
};

export const importModuleTask: TaskDef<{ pack: PetMap, specifier: KnownValue }, null> = {
    getInitState: (params) => null,
    stages: [
        (task) => {
            const { pack, specifier } = task.params;
            if (specifier instanceof PetString) {
                const absPath = task.context.getUserModuleAbsPath(pack, specifier.toString());
                return task.runTask(
                    importUserModuleTask, { pack, absPath },
                    (value) => {
                        const module = value.getMap();
                        return task.returnValue(module);
                    },
                );
            } else if (specifier instanceof PetSymbol) {
                const module = task.context.getBuiltInModule(specifier);
                return task.returnValue(module);
            } else {
                throw new PetTypeError("Module specifier must be string or symbol.");
            }
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
            const pack = getPackage(task.params.stmt);
            return task.runTask(
                importModuleTask, { pack, specifier },
                (value) => task.advanceStage({ specifier, module: value.getMap() }),
            );
        },
        (task) => {
            const { stmt } = task.params;
            const comps = stmt.getMember(symbols.COMPS).getList();
            setUpImportVars(comps, task.state.module!);
            return task.returnValue(null);
        },
    ],
};

interface LoadModuleProcParams {
    expr: PetMap;
    varSpace: PetMap;
}

export const loadModuleProcTask: TaskDef<LoadModuleProcParams, { specifier: KnownValue }> = {
    getInitState: (params) => ({ specifier: null }),
    stages: [
        (task) => {
            const { expr, varSpace } = task.params;
            const comps = expr.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(1).getMap();
            return task.callMethod(
                exprsComp, symbols.EVAL, [varSpace],
                (values) => {
                    const specifier = values.getList().getMember(0).getKnownValue();
                    return task.advanceStage({ specifier });
                },
            );
        },
        (task) => {
            const { specifier } = task.state;
            const pack = getPackage(task.params.expr);
            return task.runTask(
                importModuleTask, { pack, specifier },
                (value) => task.returnValue(value),
            );
        },
    ],
};


