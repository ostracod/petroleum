
import "./procedure.js";

import { PetSymbol, symbols } from "./symbol.js";
import { KnownValue, PetValue, toPetValue, knownValueToLiteral, knownValueToMessage, PetString, ObservableBunch, PetMap, PetFunc, EvalState } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { getModule } from "./node.js";
import { Action } from "./task.js";

export const pluralize = (amount: number, noun: string): string => (
    amount + " " + ((amount === 1) ? noun : noun + "s")
);

export class PetException extends Error {
    mapValue: PetValue;
    
    // If `#EVAL_STATE` is missing in `mapValue`, the field will be
    // populated when the exception is caught by `Coroutine.run`.
    constructor(mapValue: PetMap | PetValue) {
        super();
        this.mapValue = toPetValue(mapValue);
    }
    
    createEvalState(currentAction: Action): EvalState {
        const task = currentAction.task!;
        return new EvalState(task, task.returnValue(null));
    }
}

export const createAwaitExcep = (
    bunch: ObservableBunch,
    location: KnownValue,
    condition: PetFunc,
    message: PetString | null,
    evalState?: EvalState,
    workerNode?: PetMap,
): PetMap => {
    const output = new PetMap([
        [symbols.EXCEP_TYPE, symbols.AWAIT_EXCEP],
        [symbols.BUNCH, bunch],
        [symbols.LOC, location],
        [symbols.COND, condition],
        [symbols.MESSAGE, message],
    ]);
    if (typeof evalState !== "undefined") {
        output.setMember(symbols.EVAL_STATE, evalState);
    }
    if (typeof workerNode !== "undefined") {
        output.setMember(symbols.WORKER_NODE, workerNode);
    }
    return output;
};

export const createSpinExcep = (
    condition: PetFunc,
    message: PetString,
    evalState?: EvalState,
    workerNode?: PetMap,
): PetMap => {
    const output = new PetMap([
        [symbols.EXCEP_TYPE, symbols.SPIN_EXCEP],
        [symbols.COND, condition],
        [symbols.MESSAGE, message],
    ]);
    if (typeof evalState !== "undefined") {
        output.setMember(symbols.EVAL_STATE, evalState);
    }
    if (typeof workerNode !== "undefined") {
        output.setMember(symbols.WORKER_NODE, workerNode);
    }
    return output;
};

export class AwaitException extends PetException {
    
    constructor(
        bunch: ObservableBunch,
        location: KnownValue,
        condition: PetFunc,
        message: string,
    ) {
        super(createAwaitExcep(bunch, location, condition, new PetString(message)));
    }
    
    override createEvalState(currentAction: Action): EvalState {
        return new EvalState(currentAction.task!, currentAction);
    }
}

export class DeferralException extends AwaitException {
    
    constructor(bunch: ObservableBunch, location: KnownValue, message: string) {
        super(bunch, location, new ConstantFunc(1n), message);
    }
}

export const createBreakExcep = (): PetException => new PetException(
    new PetMap([[symbols.EXCEP_TYPE, symbols.BREAK_EXCEP]]),
);

export const createContExcep = (): PetException => new PetException(
    new PetMap([[symbols.EXCEP_TYPE, symbols.CONT_EXCEP]]),
);

export class ErrorException extends PetException {
    
    constructor(errorType: PetSymbol, message: string, pos?: PetMap) {
        const mapValue = new PetMap([
            [symbols.EXCEP_TYPE, symbols.ERROR_EXCEP],
            [symbols.ERROR_TYPE, errorType],
            [symbols.MESSAGE, new PetString(message)],
        ]);
        if (typeof pos !== "undefined") {
            mapValue.setMember(symbols.MODULE_POS, pos);
        }
        super(mapValue);
    }
}

export class PetSyntaxError extends ErrorException {
    
    constructor(message: string, pos?: PetMap) {
        super(symbols.SYNTAX_ERROR, message, pos);
    }
}

// `entity` is a node or a component.
export const entityToModulePos = (entity: PetMap): PetMap => {
    const module = getModule(entity);
    const modulePath = module.getMember(symbols.FILE_PATH);
    const lineNumber = entity.getMember(symbols.LINE_NUM);
    const columnNumber = entity.getMember(symbols.COL_NUM);
    return new PetMap([
        [symbols.MODULE_PATH, modulePath],
        [symbols.LINE_NUM, lineNumber],
        [symbols.COL_NUM, columnNumber],
    ]);
};

export const modulePosToString = (pos: PetMap, includeColNum = true): string => {
    const columnNumber = pos.getMember(symbols.COL_NUM).toNumber();
    const lineNumber = pos.getMember(symbols.LINE_NUM).toNumber();
    const modulePath = pos.getMember(symbols.MODULE_PATH).toStringStrict();
    const columnText = includeColNum ? `, column ${columnNumber}` : "";
    return `line ${lineNumber}${columnText} of ${modulePath}`;
};

export const entityPosToString = (entity: PetMap): string => {
    const pos = entityToModulePos(entity);
    return modulePosToString(pos);
};

export const createSyntaxError = (message: string, entity?: PetMap): PetSyntaxError => {
    const modulePos = (typeof entity === "undefined")
        ? undefined
        : entityToModulePos(entity);
    return new PetSyntaxError(message, modulePos);
};

export class PetTypeError extends ErrorException {
    
    constructor(message: string, pos?: PetMap) {
        super(symbols.TYPE_ERROR, message, pos);
    }
}

export class ValueError extends ErrorException {
    
    constructor(message: string, pos?: PetMap) {
        super(symbols.VALUE_ERROR, message, pos);
    }
}

export class StateError extends ErrorException {
    
    constructor(message: string, pos?: PetMap) {
        super(symbols.STATE_ERROR, message, pos);
    }
}

export class CoroEndException extends Error {
    unhandledExcep: PetValue | null;
    
    constructor(unhandledExcep: PetValue | null = null) {
        super();
        this.unhandledExcep = unhandledExcep;
    }
}

export class TimeoutError extends Error {
    
}

const posLinesAreEqual = (pos1: PetMap, pos2: PetMap): boolean => {
    const modulePath1 = pos1.getMember(symbols.MODULE_PATH).getPetString();
    const modulePath2 = pos2.getMember(symbols.MODULE_PATH).getPetString();
    const lineNumber1 = pos1.getMember(symbols.LINE_NUM).getInt();
    const lineNumber2 = pos2.getMember(symbols.LINE_NUM).getInt();
    return (modulePath1.equals(modulePath2) && lineNumber1 === lineNumber2);
};

const getModulePosList = (entries: PetMap[]): PetMap[] => {
    const output: PetMap[] = [];
    let index: number;
    if (entries.length < 2) {
        index = 0;
    } else {
        const entry1 = entries[0];
        const entry2 = entries[1];
        const pos1 = entry1.getMember(symbols.MODULE_POS).getMap();
        const pos2 = entry2.getMember(symbols.MODULE_POS).getMap();
        const node1 = entry1.getOptionalMember(symbols.WORKER_NODE);
        const node2 = entry2.getOptionalMember(symbols.WORKER_NODE);
        output.push(pos1);
        // Special case: If the first entry has no node, the second entry has a node, and
        // both entries are on the same line, only report the position of the first entry.
        // This happens when a syntax error is on the same line as the worker.
        if (!(typeof node1 === "undefined" && typeof node2 !== "undefined"
                && posLinesAreEqual(pos1, pos2))) {
            output.push(pos2);
        }
        index = 2;
    }
    while (index < entries.length) {
        const pos = entries[index].getMember(symbols.MODULE_POS).getMap();
        output.push(pos);
        index += 1;
    }
    return output;
};

export const stackTraceToString = (entries: PetMap[]): string => {
    const posList = getModulePosList(entries);
    const lines = posList.map((pos, index) => {
        const isFirstEntry = (index === 0);
        const prefix = isFirstEntry ? "On " : "Called from ";
        return prefix + modulePosToString(pos, isFirstEntry);
    });
    return lines.join("\n");
};

export const getExcepStackTrace = (exception: PetMap): PetMap[] => {
    const entries: PetMap[] = [];
    const posValue = exception.getOptionalMember(symbols.MODULE_POS);
    if (typeof posValue !== "undefined") {
        const pos = posValue.getMap();
        entries.push(new PetMap([[symbols.MODULE_POS, pos]]));
    }
    const evalStateValue = exception.getOptionalMember(symbols.EVAL_STATE);
    // Package resolution can throw errors without an evaluation state.
    if (typeof evalStateValue !== "undefined") {
        const evalState = evalStateValue.getEvalState();
        const startNode = exception.getOptionalMember(symbols.WORKER_NODE)?.getMap();
        entries.push(...evalState.getStackTrace(startNode));
    }
    return entries;
};

export const getDefaultExcepReport = (exception: PetMap): string => {
    const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
    let output: string;
    if (excepType === symbols.ERROR_EXCEP) {
        const errorType = exception.getMember(symbols.ERROR_TYPE);
        const message = exception.getMember(symbols.MESSAGE).toMessage();
        output = `Encountered ${errorType.toLiteral()} error: ` + message;
    } else if (excepType === symbols.AWAIT_EXCEP) {
        output = "Stuck awaiting member";
        const message = exception.getMember(symbols.MESSAGE).getKnownValue();
        if (message !== null) {
            output += ": " + knownValueToMessage(message);
        }
    } else if (excepType === symbols.SPIN_EXCEP) {
        const message = exception.getMember(symbols.MESSAGE).toMessage();
        output = "Stuck spinning: " + message;
    } else {
        output = `Encountered ${knownValueToLiteral(excepType)} exception.`;
    }
    const stackTrace = getExcepStackTrace(exception);
    const stackTraceText = stackTraceToString(stackTrace);
    if (stackTraceText.length > 0) {
        output += "\n" + stackTraceText;
    }
    return output;
};


