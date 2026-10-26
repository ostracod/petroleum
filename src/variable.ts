
import "./node.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetValue, PetString, PetMap } from "./value.js";
import { NotEqualFunc } from "./builtInFunc.js";
import { AwaitException, createSyntaxError, PetTypeError, ValueError, StateError } from "./exception.js";
import { assertMinCompAmount, assertCompAmount, assertIdentComp, getDeclComp, getAttrComps, getWorkGradeExprs } from "./node.js";

export const createFrame = (scope: PetMap, parentFrame: PetMap | null): PetMap => {
    const permaFrameValue = scope.getOptionalMember(symbols.PERMA_FRAME);
    const isPermaFrameScope = (typeof permaFrameValue !== "undefined");
    if (isPermaFrameScope && permaFrameValue.getKnownValue() !== null) {
        throw new StateError("Only one frame can be created for a perma-frame scope.");
    }
    const variables = scope.getMember(symbols.VARS).getMap();
    const frameEntries: [PetValue, PetMap][] = [];
    for (const field of variables.fields.values()) {
        const variable = field.value.getMap();
        const varType = variable.getMember(symbols.VAR_TYPE).getSymbol();
        if (varType === symbols.WORK_VAR) {
            const identifier = variable.getMember(symbols.IDENT);
            const frameEntry = new PetMap([
                [symbols.IS_FRAME_ENTRY, 1n],
                [symbols.VAR, variable],
                [symbols.VALUE, null],
            ]);
            frameEntries.push([identifier, frameEntry]);
        }
    }
    const frame = new PetMap([
        [symbols.IS_FRAME, 1n],
        [symbols.SCOPE, scope],
        [symbols.FRAME_ENTRIES, new PetMap(frameEntries)],
    ]);
    if (parentFrame !== null) {
        frame.setMember(symbols.PARENT, parentFrame);
    }
    if (isPermaFrameScope) {
        scope.setMember(symbols.PERMA_FRAME, frame);
    }
    return frame;
};

export enum VarSpaceType { Scope, Frame }

export const getVarSpaceType = (varSpace: PetMap): VarSpaceType => {
    const isScope = varSpace.getOptionalMember(symbols.IS_SCOPE);
    if (typeof isScope !== "undefined" && isScope.getInt() !== 0n) {
        return VarSpaceType.Scope;
    }
    const isFrame = varSpace.getOptionalMember(symbols.IS_FRAME);
    if (typeof isFrame !== "undefined" && isFrame.getInt() !== 0n) {
        return VarSpaceType.Frame;
    }
    throw new PetTypeError("Invalid variable space.");
};

export const findVariable = (scope: PetMap, name: PetString): PetMap | null => {
    while (true) {
        const variables = scope.getMember(symbols.VARS).getMap();
        const variable = variables.getOptionalMember(name);
        if (typeof variable !== "undefined") {
            return variable.getMap();
        }
        const parentScope = scope.getOptionalMember(symbols.PARENT);
        if (typeof parentScope === "undefined") {
            break;
        }
        scope = parentScope.getMap();
    }
    return null;
};

export const getVariable = (scope: PetMap, name: PetString): PetMap => {
    const result = findVariable(scope, name);
    if (result === null) {
        throw new ValueError(`Could not find variable with name "${name.toString()}".`);
    }
    return result;
};

const getVarType = (variable: PetMap): PetSymbol => {
    const varType = variable.getMember(symbols.VAR_TYPE).getKnownValue();
    if (varType === null) {
        const varName = variable.getMember(symbols.IDENT).toStringStrict();
        throw new AwaitException(
            variable,
            symbols.VAR_TYPE,
            new NotEqualFunc(null),
            `Waiting for type of variable "${varName}" to be assigned.`,
        );
    } else if (varType instanceof PetSymbol) {
        return varType;
    } else {
        throw new PetTypeError("Unexpected variable type.");
    }
};

// `variable` is a work-var at the top level of a module.
export const getModuleFrameEntry = (variable: PetMap): PetMap => {
    const scope = variable.getMember(symbols.SCOPE).getMap();
    const module = scope.getMember(symbols.MODULE).getMap();
    const frameValue = module.getOptionalMember(symbols.FRAME);
    if (typeof frameValue === "undefined") {
        throw new StateError("Cannot access work-var value without frame.");
    }
    const frame = frameValue.getMap();
    const frameEntries = frame.getMember(symbols.FRAME_ENTRIES).getMap();
    const varName = variable.getMember(symbols.IDENT).getPetString();
    return frameEntries.getMember(varName).getMap();
};

// Returns a work-var or prep-var.
const resolveVar = (variable: PetMap): PetMap => {
    while (true) {
        const varType = getVarType(variable);
        if (varType === symbols.PREP_VAR || varType === symbols.WORK_VAR) {
            return variable;
        } else if (varType === symbols.IMPORT_VAR) {
            variable = variable.getMember(symbols.IMPORT_VAR).getMap();
        } else {
            throw new PetTypeError(`Unknown variable type: ${varType.toString()}`);
        }
    }
};

// Returns #PREP_VAR or #WORK_VAR.
export const getResolvedVarType = (variable: PetMap): PetSymbol => {
    const resolvedVar = resolveVar(variable);
    return getVarType(resolvedVar);
};

// `variable` is a variable at the top level of a module OR an imported variable.
// Returns a frame entry or prep-var.
export const findModuleVarValue = (variable: PetMap): PetMap => {
    const resolvedVar = resolveVar(variable);
    const varType = getVarType(resolvedVar);
    if (varType === symbols.PREP_VAR) {
        return resolvedVar;
    } else {
        // `resolvedVar` is a work-var.
        return getModuleFrameEntry(resolvedVar);
    }
};

const getFrameEntry = (frame: PetMap, workVar: PetMap): PetMap => {
    const varName = workVar.getMember(symbols.IDENT).getPetString();
    const varScope = workVar.getMember(symbols.SCOPE).getMap();
    while (true) {
        const scope = frame.getMember(symbols.SCOPE).getMap();
        if (scope === varScope) {
            const frameEntries = frame.getMember(symbols.FRAME_ENTRIES).getMap();
            const frameEntry = frameEntries.getOptionalMember(varName);
            if (typeof frameEntry === "undefined") {
                throw new ValueError(`Frame entry does not exist for "${varName.toString()}".`);
            }
            return frameEntry.getMap();
        }
        const parentFrame = frame.getOptionalMember(symbols.PARENT);
        if (typeof parentFrame === "undefined") {
            throw new ValueError(`Could not find frame for "${varName.toString()}".`);
        } else {
            frame = parentFrame.getMap();
        }
    }
};

// varSpace is either a frame or a scope.
// Returns a frame entry or prep-var.
export const findVarValue = (varSpace: PetMap, variable: PetMap): PetMap => {
    const varType = getVarType(variable);
    if (varType === symbols.PREP_VAR) {
        return variable;
    } else if (varType === symbols.IMPORT_VAR) {
        return findModuleVarValue(variable);
    } else if (varType === symbols.WORK_VAR) {
        if (getVarSpaceType(varSpace) === VarSpaceType.Frame) {
            return getFrameEntry(varSpace, variable);
        } else {
            throw new StateError("Cannot access work-var value without frame.");
        }
    } else {
        throw new PetTypeError(`Unknown variable type: ${varType.toString()}`);
    }
};

// valueContainer is either a frame entry or a prep-var.
const deferVarValue = (variable: PetMap, valueContainer: PetMap): PetValue => {
    const varName = variable.getMember(symbols.IDENT).toStringStrict();
    return valueContainer.deferMember(
        symbols.VALUE, `Waiting for value of variable "${varName}" to be assigned.`,
    );
};

// varSpace is either a frame or a scope.
export const getVarValue = (varSpace: PetMap, variable: PetMap): PetValue => {
    const valueContainer = findVarValue(varSpace, variable);
    return deferVarValue(variable, valueContainer);
};

// `variable` is a variable at the top level of a module or an imported variable.
export const getModuleVarValue = (variable: PetMap): PetValue => {
    const valueContainer = findModuleVarValue(variable);
    return deferVarValue(variable, valueContainer);
};

// `entity` is a node or a component.
export const getScope = (entity: PetMap): PetMap => {
    while (true) {
        const scope = entity.getOptionalMember(symbols.SCOPE);
        if (typeof scope !== "undefined") {
            return scope.getMap();
        }
        const parent = entity.getOptionalMember(symbols.PARENT);
        if (typeof parent === "undefined") {
            throw new ValueError("Could not get scope.");
        }
        entity = parent.getMap();
    }
};

export const varIsInScope = (variable: PetMap, scope: PetMap): boolean => {
    const varScope = variable.getMember(symbols.SCOPE).getMap();
    while (true) {
        if (scope === varScope) {
            return true;
        }
        const parentScope = scope.getOptionalMember(symbols.PARENT);
        if (typeof parentScope === "undefined") {
            break;
        }
        scope = parentScope.getMap();
    }
    return false;
};

export interface FuncArg {
    variable: PetMap;
    defaultValueExpr: PetMap | null;
}

export interface FuncSignature {
    // Either `args` or `argsVar` is defined.
    args?: FuncArg[];
    argsVar?: PetMap;
    minArgAmount: number;
    maxArgAmount: number | null;
}

const getFuncArgs = (attrsComp: PetMap): FuncArg[] => {
    const argAttrs = attrsComp.getMember(symbols.ATTRS).getList();
    return argAttrs.elements.map((attrValue) => {
        const argAttr = attrValue.getMap();
        const argComps = argAttr.getMember(symbols.COMPS).getList();
        assertMinCompAmount(argComps, 1, argAttr);
        const declComp = getDeclComp(argComps, 0);
        const variable = declComp.getMember(symbols.VAR).getMap();
        let defaultValueExpr: PetMap | null;
        if (argComps.getLength() > 1) {
            assertCompAmount(argComps, 3, argAttr);
            assertIdentComp(argComps, 1, "=");
            defaultValueExpr = getWorkGradeExprs(argComps, 2, 1);
        } else {
            defaultValueExpr = null;
        }
        return { variable, defaultValueExpr };
    });
};

export const getFuncSignature = (stmtsComp: PetMap): FuncSignature => {
    const attrs = stmtsComp.getMember(symbols.ATTRS).getList();
    const attrAmount = attrs.getLength();
    if (attrAmount <= 0) {
        return { args: [], minArgAmount: 0, maxArgAmount: 0 };
    }
    if (attrAmount > 1) {
        throw createSyntaxError(
            "Function procedure cannot have more than one block attribute.",
            attrs.getMember(1).getMap(),
        );
    }
    const attr = attrs.getMember(0).getMap();
    const comps = getAttrComps(attr, "ARGS", 2);
    const comp = comps.getMember(1).getMap();
    const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (compType === symbols.ATTRS_COMP) {
        const args = getFuncArgs(comp);
        let minArgAmount = 0;
        while (minArgAmount < args.length) {
            const arg = args[minArgAmount];
            if (arg.defaultValueExpr !== null) {
                break;
            }
            minArgAmount += 1;
        }
        for (let index = minArgAmount; index < args.length; index++) {
            if (args[index].defaultValueExpr === null) {
                throw createSyntaxError(
                    "Optional arguments must be after required arguments.",
                    comp,
                );
            }
        }
        return { args, minArgAmount, maxArgAmount: args.length };
    } else if (compType === symbols.DECL_COMP) {
        const argsVar = comp.getMember(symbols.VAR).getMap();
        return { argsVar, minArgAmount: 0, maxArgAmount: null };
    } else {
        throw createSyntaxError("Invalid function arguments.", comp);
    }
};

export const setArgVarTypes = (signature: FuncSignature): void => {
    const { args, argsVar } = signature;
    if (typeof args === "undefined") {
        argsVar!.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
    } else {
        for (const arg of args) {
            arg.variable.setMember(symbols.VAR_TYPE, symbols.WORK_VAR);
        }
    }
};

const pruneFrameEntries = (frame: PetMap, scope: PetMap, remainingVars: PetMap): PetMap => {
    const frameEntries = frame.getMember(symbols.FRAME_ENTRIES).getMap();
    const variables = scope.getMember(symbols.VARS).getMap();
    const output = new PetMap();
    for (const name of frameEntries.getKeys()) {
        if (remainingVars.hasKey(name)) {
            const frameEntry = frameEntries.getMember(name);
            output.setMember(name, frameEntry);
            remainingVars.deleteField(name);
        }
    }
    for (const name of variables.getKeys()) {
        if (remainingVars.hasKey(name)) {
            remainingVars.deleteField(name);
        }
    }
    return output;
};

interface PrunedFrames {
    topFrame: PetMap | null;
    bottomFrame: PetMap | null;
    permaFrameScope: PetMap | null;
}

export const pruneFrames = (varSpace: PetMap, accessedVars: PetMap): PrunedFrames => {
    const remainingVars = accessedVars.shallowCopy();
    let varSpaceIsFrame = (getVarSpaceType(varSpace) === VarSpaceType.Frame);
    const output: PrunedFrames = { topFrame: null, bottomFrame: null, permaFrameScope: null };
    while (true) {
        let frame: PetMap | null;
        let scope: PetMap;
        if (varSpaceIsFrame) {
            frame = varSpace;
            scope = frame.getMember(symbols.SCOPE).getMap();
        } else {
            frame = null;
            scope = varSpace;
        }
        const permaFrame = scope.getOptionalMember(symbols.PERMA_FRAME);
        if (typeof permaFrame !== "undefined") {
            output.permaFrameScope = scope;
            break;
        }
        let prunedEntries: PetMap;
        if (frame === null) {
            prunedEntries = new PetMap();
        } else {
            prunedEntries = pruneFrameEntries(frame, scope, remainingVars);
        }
        const prunedFrame = new PetMap([
            [symbols.IS_FRAME, 1n],
            [symbols.SCOPE, scope],
            [symbols.FRAME_ENTRIES, prunedEntries],
        ]);
        if (output.topFrame === null) {
            output.topFrame = prunedFrame;
            output.bottomFrame = prunedFrame;
        } else {
            output.bottomFrame!.setMember(symbols.PARENT, prunedFrame);
            output.bottomFrame = prunedFrame;
        }
        const parentFrame = frame?.getOptionalMember(symbols.PARENT);
        if (typeof parentFrame === "undefined") {
            varSpace = scope.getMember(symbols.PARENT).getMap();
            varSpaceIsFrame = false;
        } else {
            varSpace = parentFrame.getMap();
            varSpaceIsFrame = true;
        }
    }
    return output;
};


