
import { DeferredValue } from "./value.js";

export class DeferralError extends Error {
    deferredValue: DeferredValue;
    
    constructor(deferredValue: DeferredValue) {
        super();
        this.deferredValue = deferredValue;
    }
}

export class PetTypeError extends Error {
    
}


