
import "./methods.js";

import { DeferredValue, PetException } from "./value.js";

export class DeferralError extends Error {
    deferredValue: DeferredValue;
    
    constructor(deferredValue: DeferredValue) {
        super();
        this.deferredValue = deferredValue;
    }
}

export class CoroEndError extends Error {
    unhandledExcep: PetException | null;
    
    constructor(unhandledExcep: PetException | null = null) {
        super();
        this.unhandledExcep = unhandledExcep;
    }
}

export class PetTypeError extends Error {
    
}


