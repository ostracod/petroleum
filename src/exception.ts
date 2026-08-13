
import "./procedure.js";

import { KnownValue, PetValue, ObservableBunch, PetFunc } from "./value.js";
import { ConstantFunc } from "./builtInFunc.js";

export class AwaitException extends Error {
    bunch: ObservableBunch;
    location: KnownValue;
    condition: PetFunc;
    
    constructor(bunch: ObservableBunch, location: KnownValue, condition: PetFunc) {
        super();
        this.bunch = bunch;
        this.location = location;
        this.condition = condition;
    }
}

export class DeferralException extends AwaitException {
    
    constructor(bunch: ObservableBunch, location: KnownValue) {
        super(bunch, location, new ConstantFunc(1n));
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


