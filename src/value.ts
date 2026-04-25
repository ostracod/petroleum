
import type { Scheduler } from "./scheduler.js";
import type { Action } from "./action.js";
import type { PetSymbol } from "./symbol.js";
import { Task, AwaitCondTask } from "./task.js";
import { DeferralError, PetTypeError } from "./error.js";

// PetValueAndKey contains types which can be used as both values and Map keys.
export type PetValueAndKey = null | bigint | PetSymbol | PetList | PetMap | PetFunc | EvalState;
export type KnownValue = PetString | PetValueAndKey;
export type PetValue = DeferredValue | KnownValue;
export type MapKey = string | PetValueAndKey;

export const escapeChars: { [escape: string]: string } = {
    "\"": "\"",
    "n": "\n",
    "t": "\t",
    "\\": "\\",
};

const charEscapes: { [character: string]: string } = {};
for (const escape in escapeChars) {
    const character = escapeChars[escape];
    charEscapes[character] = escape;
}

export class PetString {
    text: string | null;
    buffer: Buffer | null;
    // `hexString` is used as a key in Maps.
    hexString: string | null;
    
    constructor(data: string | Buffer) {
        if (typeof data === "string") {
            this.buffer = null;
            this.text = data;
        } else {
            this.buffer = data;
            this.text = null;
        }
        this.hexString = null;
    }
    
    toString(): string {
        if (this.text === null) {
            this.text = this.buffer.toString("utf8");
        }
        return this.text;
    }
    
    toBuffer(): Buffer {
        if (this.buffer === null) {
            this.buffer = Buffer.from(this.text, "utf8");
        }
        return this.buffer;
    }
    
    toHexString(): string {
        if (this.hexString === null) {
            this.hexString = this.toBuffer().toString("hex");
        }
        return this.hexString;
    }
    
    toStringLiteral(): string {
        const text = this.toString();
        const literalParts: string[] = [];
        for (let index = 0; index < text.length; index++) {
            let character = text.charAt(index);
            let literalPart: string;
            const escape = charEscapes[character];
            if (typeof escape !== "undefined") {
                literalPart = "\\" + escape;
            } else {
                literalPart = character;
            }
            literalParts.push(literalPart);
        }
        return "\"" + literalParts.join("") + "\"";
    }
}

export const valueToString = (inputValue: PetValue, parents: KnownValue[] = []): string => {
    const value = unwrapValue(inputValue);
    if (value === null) {
        return "NULL";
    } else if (value instanceof PetString) {
        return (parents.length > 0) ? value.toStringLiteral() : value.toString();
    } else if (value instanceof PetList || value instanceof PetMap) {
        if (parents.some((parent) => (parent === value))) {
            return "...";
        } else {
            return value.toString(parents);
        }
    } else {
        return value.toString();
    }
};

const valueToMapKey = (inputValue: PetValue): MapKey => {
    const value = unwrapValue(inputValue);
    return (value instanceof PetString) ? value.toHexString() : value;
};

export const valuesAreEqual = (inputValue1: PetValue, inputValue2: PetValue): boolean => {
    const value1 = unwrapValue(inputValue1);
    const value2 = unwrapValue(inputValue2);
    if (value1 instanceof PetString && value2 instanceof PetString) {
        const buffer1 = value1.toBuffer();
        const buffer2 = value2.toBuffer();
        return buffer1.equals(buffer2);
    } else {
        return (value1 === value2);
    }
}

export const valueMayHaveChanged = (oldValue: PetValue, newValue: PetValue): boolean => {
    const oldValueIsDeferred = (oldValue instanceof DeferredValue);
    const newValueIsDeferred = (newValue instanceof DeferredValue);
    if (oldValueIsDeferred && newValueIsDeferred) {
        const oldDeferredValue = oldValue as DeferredValue;
        const newDeferredValue = newValue as DeferredValue;
        return (valuesAreEqual(oldDeferredValue.bunch, newDeferredValue.bunch)
            && valuesAreEqual(oldDeferredValue.location, newDeferredValue.location));
    } else if (oldValueIsDeferred || newValueIsDeferred) {
        return (oldValue !== newValue);
    } else {
        return !valuesAreEqual(oldValue, newValue);
    }
};

export interface ObservableBunchIface {
    observatory: MemberObservatory;
    getMember(location: PetValue): PetValue | undefined;
}

export type ObservableBunch = KnownValue & ObservableBunchIface;

const deferMember = (bunch: ObservableBunch, inputLocation: PetValue): PetValue => {
    const location = unwrapValue(inputLocation);
    const value = bunch.getMember(location);
    return (typeof value === "undefined") ? new DeferredValue(bunch, location) : value;
};

export class MemberObserver {
    bunch: ObservableBunch;
    location: KnownValue;
    condition: PetFunc;
    evalState: EvalState;
    
    constructor(
        bunch: ObservableBunch,
        location: KnownValue,
        condition: PetFunc,
        evalState: EvalState,
    ) {
        this.bunch = bunch;
        this.location = location;
        this.condition = condition;
        this.evalState = evalState;
    }
    
    getMemberValue(): PetValue | undefined {
        return this.bunch.getMember(this.location);
    }
}

class MemberObservatory {
    bunch: ObservableBunch;
    observers: Map<MapKey, Set<MemberObserver>>;
    scheduler: Scheduler;
    
    constructor(bunch: ObservableBunch) {
        this.bunch = bunch;
        this.observers = new Map();
    }
    
    addObserver(
        scheduler: Scheduler,
        inputLocation: PetValue,
        condition: PetFunc,
        evalState: EvalState,
    ): void {
        this.scheduler = scheduler;
        const location = unwrapValue(inputLocation);
        const mapKey = valueToMapKey(location);
        let observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            observers = new Set();
            this.observers.set(mapKey, observers);
        }
        const observer = new MemberObserver(this.bunch, location, condition, evalState);
        observers.add(observer);
    }
    
    handleMemberChange(location: KnownValue): void {
        const mapKey = valueToMapKey(location);
        const observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            return;
        }
        this.observers.delete(mapKey);
        for (const observer of observers) {
            const condTask = new AwaitCondTask(observer);
            this.scheduler.scheduleTask(condTask);
        }
    }
}

const valueToNumber = (value: number | PetValue): number => {
    if (typeof value === "number") {
        return value;
    }
    const knownValue = unwrapValue(value);
    if (typeof knownValue === "bigint") {
        return Number(knownValue);
    } else {
        throw new PetTypeError("Expected number");
    }
};

const valueToBigInt = (value: number | PetValue): bigint => {
    if (typeof value === "number") {
        return BigInt(value);
    }
    const knownValue = unwrapValue(value);
    if (typeof knownValue === "bigint") {
        return knownValue;
    } else {
        throw new PetTypeError("Expected integer");
    }
};

export class PetList implements ObservableBunchIface {
    elements: PetValue[];
    observatory: MemberObservatory;
    
    constructor(elements: PetValue[] = []) {
        this.elements = elements;
        this.observatory = new MemberObservatory(this);
    }
    
    getMember(index: number | PetValue): PetValue | undefined {
        return this.elements[valueToNumber(index)];
    }
    
    setMember(index: number | PetValue, value: PetValue): void {
        const numberIndex = valueToNumber(index);
        const lastValue = this.elements[numberIndex];
        this.elements[numberIndex] = value;
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(valueToBigInt(index));
        }
    }
    
    deferMember(index: number | PetValue): PetValue {
        return deferMember(this, valueToBigInt(index));
    }
    
    getLength(): number {
        return this.elements.length;
    }
    
    addElement(value: PetValue): void {
        const index = this.elements.length;
        this.elements.push(value);
        this.observatory.handleMemberChange(valueToBigInt(index));
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const element of this.elements) {
            textList.push(valueToString(element, nextParents));
        }
        const elementsText = textList.join(", ");
        return `LIST (${elementsText})`;
    }
}

class PetField {
    key: KnownValue;
    value: PetValue;
    
    constructor(key: KnownValue, value: PetValue) {
        this.key = key;
        this.value = value;
    }
}

export class PetMap implements ObservableBunchIface {
    fields: Map<MapKey, PetField>;
    observatory: MemberObservatory;
    
    constructor(entries: [PetValue, PetValue][] = []) {
        this.fields = new Map();
        this.observatory = new MemberObservatory(this);
        for (const entry of entries) {
            this.setMember(unwrapValue(entry[0]), entry[1]);
        }
    }
    
    getMember(key: PetValue): PetValue | undefined {
        const mapKey = valueToMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    setMember(inputKey: PetValue, value: PetValue): void {
        const key = unwrapValue(inputKey);
        const mapKey = valueToMapKey(key);
        let lastValue: PetValue | undefined;
        let field = this.fields.get(mapKey);
        if (typeof field === "undefined") {
            field = new PetField(key, value);
            this.fields.set(mapKey, field);
        } else {
            lastValue = field.value;
            field.value = value;
        }
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(key);
        }
    }
    
    deferMember(key: PetValue): PetValue {
        return deferMember(this, key);
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            const keyString = valueToString(key, nextParents);
            const valueString = valueToString(value, nextParents);
            textList.push(`(${keyString}) = (${valueString})`);
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
}

// PetExceptions have #EXCEP_TYPE and #EVAL_STATE fields.
export type PetException = PetMap;
export const PetException = PetMap;

export abstract class PetFunc {
    
    constructor() {
        // Do nothing.
    }
    
    abstract call(parentTask: Task, args: PetValue[]): Action;
    
    abstract toString(): string;
}

export class EvalState {
    currentAction: Action;
    actionToResume: Action;
    
    constructor(currentAction: Action, actionToResume: Action) {
        this.currentAction = currentAction;
        this.actionToResume = actionToResume;
    }
    
    toString(): string {
        throw new Error("Not yet implemented");
    }
}

export class DeferredValue {
    bunch: ObservableBunch;
    location: KnownValue;
    
    constructor(bunch: ObservableBunch, location: KnownValue) {
        this.bunch = bunch;
        this.location = location;
    }
    
    unwrap(): KnownValue {
        const value = this.bunch.getMember(this.location);
        if (typeof value === "undefined") {
            throw new DeferralError(this);
        }
        return (value instanceof DeferredValue) ? value.unwrap() : value;
    }
}

export const unwrapValue = (value: PetValue): KnownValue => (
    (value instanceof DeferredValue) ? value.unwrap() : value
);


