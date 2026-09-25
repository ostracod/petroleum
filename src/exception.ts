
import "./procedure.js";

import { PetSymbol, symbols, spinCountSymbol } from "./symbol.js";
import { KnownValue, PetValue, toPetValue, toPetString, valueToString, PetString, ObservableBunch, PetMap, PetFunc, EvalState } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";
import { Action } from "./task.js";

export class PetException extends Error {
    mapValue: PetValue;
    
    // If `#EVAL_STATE` is missing in `mapValue`, the field will be
    // populated when the exception is caught by `Coroutine.run`.
    constructor(mapValue: PetMap | PetValue) {
        super();
        this.mapValue = toPetValue(mapValue);
    }
    
    createEvalState(currentAction: Action): EvalState {
        const { task } = currentAction;
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
    
    createEvalState(currentAction: Action): EvalState {
        return new EvalState(currentAction.task, currentAction);
    }
}

export class DeferralException extends AwaitException {
    
    constructor(bunch: ObservableBunch, location: KnownValue, message: string) {
        super(bunch, location, new ConstantFunc(1n), message);
    }
}

export class ErrorException extends PetException {
    
    constructor(errorType: PetSymbol, message: string) {
        super(new PetMap([
            [symbols.EXCEP_TYPE, symbols.ERROR_EXCEP],
            [symbols.ERROR_TYPE, errorType],
            [symbols.MESSAGE, new PetString(message)],
        ]));
    }
}

export class CoroEndException extends Error {
    unhandledExcep: PetValue | null;
    
    constructor(unhandledExcep: PetValue | null = null) {
        super();
        this.unhandledExcep = unhandledExcep;
    }
}

export class PetTypeError extends Error {
    
}

export const getExcepReport = (exception: PetMap): string => {
    const excepType = exception.getMember(symbols.EXCEP_TYPE).getKnownValue();
    let header: string;
    if (excepType === symbols.ERROR_EXCEP) {
        const errorType = exception.getMember(symbols.ERROR_TYPE);
        const message = exception.getMember(symbols.MESSAGE).toString();
        header = `Encountered ${errorType.toString()} error: ` + message;
    } else {
        header = `Encountered ${valueToString(excepType)} exception.`;
    }
    const evalStateValue = exception.getMember(symbols.EVAL_STATE);
    if (typeof evalStateValue === "undefined") {
        // Eval state is missing if there is a syntax error in
        // the main module of any package.
        return header;
    }
    const stackTrace = evalStateValue.getEvalState().toString();
    return header + "\n" + stackTrace;
};


