
import "./procedure.js";

import { PetSymbol, symbols, spinCountSymbol } from "./symbol.js";
import { KnownValue, PetValue, toPetValue, toPetString, knownValueToString, PetString, ObservableBunch, PetMap, PetFunc, EvalState } from "./value.js";
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
    message: PetString | string,
    evalState?: EvalState,
): PetMap => {
    const output = new PetMap([
        [symbols.EXCEP_TYPE, symbols.AWAIT_EXCEP],
        [symbols.BUNCH, bunch],
        [symbols.LOC, location],
        [symbols.COND, condition],
        [symbols.MESSAGE, toPetString(message)],
    ]);
    if (typeof evalState !== "undefined") {
        output.setMember(symbols.EVAL_STATE, evalState);
    }
    return output;
};

export const createSpinExcep = (
    condition: PetFunc,
    message: PetString,
    evalState?: EvalState,
    spinCount?: number | bigint,
): PetMap => {
    const output = new PetMap([
        [symbols.EXCEP_TYPE, symbols.SPIN_EXCEP],
        [symbols.COND, condition],
        [symbols.MESSAGE, toPetString(message)],
    ]);
    if (typeof evalState !== "undefined") {
        output.setMember(symbols.EVAL_STATE, evalState);
    }
    if (typeof spinCount !== "undefined") {
        output.setMember(spinCountSymbol, BigInt(spinCount));
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
        super(createAwaitExcep(bunch, location, condition, message));
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

export interface ModulePos {
    lineNumber: bigint;
    columnNumber: bigint;
    modulePath: string;
}

export class ErrorException extends PetException {
    pos?: ModulePos;
    
    constructor(errorType: PetSymbol, message: string, pos?: ModulePos) {
        super(new PetMap([
            [symbols.EXCEP_TYPE, symbols.ERROR_EXCEP],
            [symbols.ERROR_TYPE, errorType],
            [symbols.MESSAGE, new PetString(message)],
        ]));
        this.pos = pos;
    }
    
    override createEvalState(currentAction: Action): EvalState {
        const task = currentAction.task!;
        return new EvalState(task, task.returnValue(null), this.pos);
    }
}

export class PetSyntaxError extends ErrorException {
    
    constructor(message: string, pos?: ModulePos) {
        super(symbols.SYNTAX_ERROR, message, pos);
    }
}

// `entity` is a node or a component.
export const entityToModulePos = (entity: PetMap): ModulePos => {
    const lineNumber = entity.getMember(symbols.LINE_NUM).getInt();
    const columnNumber = entity.getMember(symbols.COL_NUM).getInt();
    const module = getModule(entity);
    const modulePath = module.getMember(symbols.FILE_PATH).toStringStrict();
    return { lineNumber, columnNumber, modulePath };
};

export const modulePosToString = (pos: ModulePos, includeColNum = true): string => {
    const columnText = includeColNum ? `, column ${pos.columnNumber}` : "";
    return `line ${pos.lineNumber}${columnText} of ${pos.modulePath}`;
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
    
    constructor(message: string, pos?: ModulePos) {
        super(symbols.TYPE_ERROR, message, pos);
    }
}

export class ValueError extends ErrorException {
    
    constructor(message: string, pos?: ModulePos) {
        super(symbols.VALUE_ERROR, message, pos);
    }
}

export class StateError extends ErrorException {
    
    constructor(message: string, pos?: ModulePos) {
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

export const getExcepReport = (exception: PetMap): string => {
    const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
    let output: string;
    if (excepType === symbols.ERROR_EXCEP) {
        const errorType = exception.getMember(symbols.ERROR_TYPE);
        const message = exception.getMember(symbols.MESSAGE).toString();
        output = `Encountered ${errorType.toString()} error: ` + message;
    } else {
        output = `Encountered ${knownValueToString(excepType)} exception.`;
    }
    const stackTrace = exception.getMember(symbols.EVAL_STATE).getStackTrace().toString();
    if (stackTrace.length > 0) {
        output += "\n" + stackTrace;
    }
    return output;
};


