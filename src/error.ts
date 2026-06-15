
import "./methods.js";

import { KnownValue, ObservableBunch, PetException } from "./value.js";

export class DeferralError extends Error {
    bunch: ObservableBunch;
    location: KnownValue;
    
    constructor(bunch: ObservableBunch, location: KnownValue) {
        super();
        this.bunch = bunch;
        this.location = location;
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


