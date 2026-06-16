
import "./methods.js";

import { KnownValue, PetValue, ObservableBunch } from "./value.js";

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
    unhandledExcep: PetValue | null;
    
    constructor(unhandledExcep: PetValue | null = null) {
        super();
        this.unhandledExcep = unhandledExcep;
    }
}

export class PetTypeError extends Error {
    
}


