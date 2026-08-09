
import "./package.js";

import { symbols } from "./symbol.js";
import { PetValue, PetString, PetMap } from "./value.js";

// parentVarSpace is either a scope or a frame.
export const createFrame = (scope: PetMap, parentFrame: PetMap | null): PetMap => {
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
    const output = new PetMap([
        [symbols.IS_FRAME, 1n],
        [symbols.SCOPE, scope],
        [symbols.FRAME_ENTRIES, new PetMap(frameEntries)],
    ]);
    if (parentFrame !== null) {
        output.setMember(symbols.PARENT, parentFrame);
    }
    return output;
};

export enum VarSpaceType { Scope, Frame };

export const getVarSpaceType = (varSpace: PetMap): VarSpaceType => {
    const isScope = varSpace.getMember(symbols.IS_SCOPE);
    if (typeof isScope !== "undefined" && isScope.getInt() !== 0n) {
        return VarSpaceType.Scope;
    }
    const isFrame = varSpace.getMember(symbols.IS_FRAME);
    if (typeof isFrame !== "undefined" && isFrame.getInt() !== 0n) {
        return VarSpaceType.Frame;
    }
    throw new Error("Invalid variable space.");
};

export const findVariable = (scope: PetMap, name: PetString): PetMap | null => {
    while (true) {
        const variables = scope.getMember(symbols.VARS).getMap();
        const variable = variables.getMember(name);
        if (typeof variable !== "undefined") {
            return variable.getMap();
        }
        const parentScope = scope.getMember(symbols.PARENT);
        if (typeof parentScope === "undefined") {
            break;
        }
        scope = parentScope.getMap();
    }
    return null;
};

const resolvePrepVar = (variable: PetMap): PetMap | null => {
    while (true) {
        const varType = variable.getMember(symbols.VAR_TYPE).getSymbol();
        if (varType === null) {
            // TODO: Throw an await exception.
            throw new Error("Variable type is not defined.");
        } else if (varType === symbols.PREP_VAR) {
            return variable;
        } else if (varType === symbols.IMPORT_VAR) {
            variable = variable.getMember(symbols.IMPORT_VAR).getMap();
        } else if (varType === symbols.WORK_VAR) {
            return null;
        } else {
            throw new Error(`Unknown variable type: ${varType.toString()}`);
        }
    }
}

// varSpace is either a frame or a scope.
// Returns a frame entry, prep-var, or null.
export const findVarValue = (varSpace: PetMap, name: PetString): PetMap | null => {
    let varSpaceIsFrame = (getVarSpaceType(varSpace) === VarSpaceType.Frame);
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
        if (frame !== null) {
            const frameEntries = frame.getMember(symbols.FRAME_ENTRIES).getMap();
            const frameEntry = frameEntries.getMember(name);
            if (typeof frameEntry !== "undefined") {
                return frameEntry.getMap();
            }
        }
        const variables = scope.getMember(symbols.VARS).getMap();
        const variable = variables.getMember(name);
        if (typeof variable !== "undefined") {
            return resolvePrepVar(variable.getMap());
        }
        const parentFrame = frame?.getMember(symbols.PARENT);
        if (typeof parentFrame === "undefined") {
            const parentScope = scope.getMember(symbols.PARENT);
            if (typeof parentScope === "undefined") {
                break;
            }
            varSpace = parentScope.getMap();
            varSpaceIsFrame = false;
        } else {
            varSpace = parentFrame.getMap();
            varSpaceIsFrame = true;
        }
    }
    return null;
};

// varSpace is either a frame or a scope.
export const getVarValue = (varSpace: PetMap, name: PetString): PetValue => {
    const result = findVarValue(varSpace, name);
    if (result === null) {
        throw new Error(`Could not find variable "${name.toString()}".`);
    }
    return result.deferMember(symbols.VALUE);
};

// `entity` is a node or a component.
export const getScope = (entity: PetMap): PetMap => {
    while (true) {
        const scope = entity.getMember(symbols.SCOPE);
        if (typeof scope !== "undefined") {
            return scope.getMap();
        }
        const parent = entity.getMember(symbols.PARENT);
        if (typeof parent === "undefined") {
            throw new Error("Could not get scope.");
        }
        entity = parent.getMap();
    }
};

export interface SignatureVars {
    argVars?: PetMap[];
    argsVar?: PetMap;
}

export const getSignatureVars = (stmtsComp: PetMap): SignatureVars => {
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

export const pruneFrames = (varSpace: PetMap, accessedVars: PetMap): {
    topFrame: PetMap | null,
    bottomFrame: PetMap | null,
    module: PetMap,
} => {
    const remainingVars = accessedVars.shallowCopy();
    let varSpaceIsFrame = (getVarSpaceType(varSpace) === VarSpaceType.Frame);
    let topFrame: PetMap | null = null;
    let bottomFrame: PetMap | null = null;
    let module: PetMap;
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
        const moduleValue = scope.getMember(symbols.MODULE);
        if (typeof moduleValue !== "undefined") {
            module = moduleValue.getMap();
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
        if (topFrame === null) {
            topFrame = prunedFrame;
            bottomFrame = prunedFrame;
        } else {
            bottomFrame.setMember(symbols.PARENT, prunedFrame);
            bottomFrame = prunedFrame;
        }
        const parentFrame = frame?.getMember(symbols.PARENT);
        if (typeof parentFrame === "undefined") {
            varSpace = scope.getMember(symbols.PARENT).getMap();
            varSpaceIsFrame = false;
        } else {
            varSpace = parentFrame.getMap();
            varSpaceIsFrame = true;
        }
    }
    return { topFrame, bottomFrame, module };
};


