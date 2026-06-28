
import "./method.js";

import { symbols } from "./symbol.js";
import { PetMap } from "./value.js";
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

export const globalProcDefs: ProcDef[] = [
    {
        name: "PREP_VAR",
        prepMethod: (task, stmt) => {
            // TODO: Validate statement structure.
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


