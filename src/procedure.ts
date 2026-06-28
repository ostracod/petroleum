
import "./method.js";

import { symbols } from "./symbol.js";
import { PetMap, FuncSignature } from "./value.js";
import { CallPrepMethod, CallEvalMethod, createMethodMap } from "./method.js";
import { getScope, findVariable } from "./task.js";

interface ProcDef {
    name: string;
    prepMethod: CallPrepMethod;
    evalMethod: CallEvalMethod;
}

export const createProcedure = (procDef: ProcDef): PetMap => {
    const methodMap = createMethodMap(procDef.prepMethod, procDef.evalMethod);
    return new PetMap([
        [symbols.IS_PROC, 1n],
        [symbols.METHODS, methodMap],
    ]);
};

const getSignature = (stmtsComp: PetMap): FuncSignature => {
    const attrs = stmtsComp.getMember(symbols.ATTRS).getList();
    if (attrs.getLength() <= 0) {
        return { argNames: [] };
    }
    const attr = attrs.getMember(0).getMap();
    const comps = attr.getMember(symbols.COMPS).getList();
    const comp = comps.getMember(1).getMap();
    const compType = comp.getMember(symbols.COMP_TYPE).getSymbol();
    if (compType === symbols.ATTRS_COMP) {
        const argAttrs = comp.getMember(symbols.ATTRS).getList();
        const argNames = argAttrs.elements.map((attrValue) => {
            const argAttr = attrValue.getMap();
            const argComps = argAttr.getMember(symbols.COMPS).getList();
            const declComp = argComps.getMember(0).getMap();
            const variable = declComp.getMember(symbols.VAR).getMap();
            return variable.getMember(symbols.IDENT).getPetString();
        });
        return { argNames };
    } else if (compType === symbols.DECL_COMP) {
        const variable = comp.getMember(symbols.VAR).getMap();
        const argsName = variable.getMember(symbols.IDENT).getPetString();
        return { argsName };
    } else {
        throw new Error("Invalid function arguments.");
    }
};

// TODO: Validate node structure.
export const globalProcDefs: ProcDef[] = [
    {
        name: "FUNC",
        prepMethod: (task, stmt) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            return task.callMethod(
                stmtsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
        evalMethod: (task, stmt, varSpace) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const stmtsComp = comps.getMember(1).getMap();
            const signature = getSignature(stmtsComp);
            // TODO: Create a user function.
            console.log(signature);
            
            return task.returnValue(null);
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
        prepMethod: (task, stmt) => {
            const comps = stmt.getMember(symbols.COMPS).getList();
            const exprsComp = comps.getMember(3).getMap();
            return task.callMethod(
                exprsComp, symbols.PREP, [],
                (value) => task.returnValue(null),
            );
        },
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
];


