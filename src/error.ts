
import "./methods.js";

import { PetValue, PetException } from "./value.js";

export class DeferralError extends Error {
    value: PetValue;
    
    constructor(value: PetValue) {
        super();
        this.value = value;
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


