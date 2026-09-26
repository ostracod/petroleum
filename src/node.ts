
import "./variable.js";

import { PetSymbol, symbols } from "./symbol.js";
import { PetList, PetMap, PetFunc } from "./value.js";
import { funcInvocationMethods, stmtsCompMethods, exprsCompMethods, stringExprMethods, identExprMethods } from "./method.js";
import { PetSyntaxError, PetTypeError, ValueError, createSyntaxError } from "./exception.js";

export const getChildWorkers = (node: PetMap): PetMap[] => {
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

export const nodeIsInvocation = (node: PetMap, nodeType: PetSymbol): boolean => {
    if (nodeType === symbols.STMT) {
        const stmtType = node.getMember(symbols.STMT_TYPE).getSymbol();
        return (stmtType === symbols.INVOC_STMT);
    } else if (nodeType === symbols.EXPR) {
        const exprType = node.getMember(symbols.EXPR_TYPE).getSymbol();
        return (exprType === symbols.INVOC_EXPR);
    }
    return false;
};

export const workerIsInvocation = (worker: PetMap): boolean => {
    const nodeTypeValue = worker.getOptionalMember(symbols.NODE_TYPE);
    if (typeof nodeTypeValue === "undefined") {
        return false;
    }
    const nodeType = nodeTypeValue.getSymbol();
    return nodeIsInvocation(worker, nodeType);
};

export const getWorkerMethodMap = (worker: PetMap): PetMap => {
    const nodeTypeValue = worker.getOptionalMember(symbols.NODE_TYPE);
    if (typeof nodeTypeValue !== "undefined") {
        const nodeType = nodeTypeValue.getSymbol();
        if (nodeIsInvocation(worker, nodeType)) {
            const invocable = worker.getMember(symbols.INVOC).getKnownValue();
            if (invocable instanceof PetFunc) {
                return funcInvocationMethods;
            } else if (invocable instanceof PetMap) {
                return invocable.getMember(symbols.METHODS).getMap();
            } else {
                throw new PetTypeError("Invocable must be function or procedure.");
            }
        } else if (nodeType === symbols.EXPR) {
            const exprType = worker.getMember(symbols.EXPR_TYPE).getSymbol();
            if (exprType === symbols.STR_EXPR) {
                return stringExprMethods;
            } else if (exprType === symbols.IDENT_EXPR) {
                return identExprMethods;
            }
            // TODO: Support calling methods on more types of expressions.
        }
        throw new Error("Not yet implemented");
    }
    const compTypeValue = worker.getOptionalMember(symbols.COMP_TYPE);
    if (typeof compTypeValue !== "undefined") {
        const compType = compTypeValue.getSymbol();
        if (compType === symbols.STMTS_COMP) {
            return stmtsCompMethods;
        } else if (compType === symbols.EXPRS_COMP) {
            return exprsCompMethods;
        }
        // TODO: Support calling methods on more types of components.
        throw new Error("Not yet implemented");
    }
    throw new PetTypeError("Expected worker.");
};

// `entity` is a node or a component.
export const getModule = (entity: PetMap): PetMap => {
    while (true) {
        const parent = entity.getOptionalMember(symbols.PARENT);
        if (typeof parent === "undefined") {
            throw new ValueError("Could not get module.");
        }
        entity = parent.getMap();
        const moduleType = entity.getOptionalMember(symbols.MODULE_TYPE);
        if (typeof moduleType !== "undefined") {
            return entity;
        }
    }
};

// `entity` is a node or a component.
export const getPackage = (entity: PetMap): PetMap => {
    const parentModule = getModule(entity);
    return parentModule.getMember(symbols.PACK).getMap();
}

export const getFuncArgsComp = (invocNode: PetMap): PetMap | null => {
    const comps = invocNode.getMember(symbols.COMPS).getList();
    return (comps.getLength() > 1) ? comps.getMember(1).getMap() : null;
};

export const assertCompAmount = (
    comps: PetList,
    expectedAmount: number,
    node?: PetMap
): void => {
    const actualAmount = comps.getLength();
    if (actualAmount > expectedAmount) {
        throw createSyntaxError("Node has too many components.", node);
    } else if (actualAmount < expectedAmount) {
        throw createSyntaxError("Node has too few components.", node);
    }
};

const getCompWithType = (
    comps: PetList,
    index: number,
    expectedType: PetSymbol,
    errorMessage: string,
): PetMap => {
    const comp = comps.getMember(index).getMap();
    const actualType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (actualType !== expectedType) {
        throw createSyntaxError(errorMessage, comp);
    }
    return comp;
}

export const getSmtsComp = (comps: PetList, index: number): PetMap => getCompWithType(
    comps, index, symbols.STMTS_COMP,
    "Expected statement sequence component.",
);

export const getExprsComp = (comps: PetList, index: number): PetMap => getCompWithType(
    comps, index, symbols.EXPRS_COMP,
    "Expected expression sequence component.",
);

export const getAttrsComp = (comps: PetList, index: number): PetMap => getCompWithType(
    comps, index, symbols.ATTRS_COMP,
    "Expected attribute sequence component.",
);

export const getDeclComp = (comps: PetList, index: number): PetMap => getCompWithType(
    comps, index, symbols.DECL_COMP,
    "Expected declaration component.",
);

export const assertStmtsComp = (comps: PetList, index: number): void => {
    getSmtsComp(comps, index);
};

export const assertExprsComp = (comps: PetList, index: number): void => {
    getExprsComp(comps, index);
};

export const assertAttrsComp = (comps: PetList, index: number): void => {
    getAttrsComp(comps, index);
};

export const assertIdentComp = (
    comps: PetList,
    index: number,
    expectedText: string,
): void => {
    const comp = comps.getMember(index).getMap();
    const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (compType !== symbols.IDENT_COMP
            || comp.getMember(symbols.IDENT).toString() !== expectedText) {
        throw createSyntaxError(`Expected "${expectedText}" identifier component.`, comp);
    }
};


