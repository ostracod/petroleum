
import "./symbol.js";

import { PetSymbol, symbols } from "./symbol.js";
import { DeferralException, entityToModulePos, entityPosToString, PetTypeError, ValueError, stackTraceToString } from "./exception.js";
import { createFrame, FuncSignature, getFuncSignature, pruneFrames } from "./variable.js";
import { Action, Task, awaitCondTask, callUserFuncTask } from "./task.js";
import { Scheduler } from "./scheduler.js";

// PetValueAndKey contains types which can be used as both values and Map keys.
export type PetValueAndKey = null | bigint | PetSymbol | PetList | PetMap | PetFunc | EvalState;
export type KnownValue = PetString | PetValueAndKey;
export type MapKey = string | PetValueAndKey;

export const minIntValue = -(1n << 63n);
export const maxIntValue = (1n << 63n) - 1n;

const intMask = (1n << 63n) - 1n;
const signMask = 1n << 63n;

export const toSignedInt64 = (value: bigint): bigint => {
    if ((value & signMask) > 0n) {
        return -((~value & intMask) + 1n);
    } else {
        return value & intMask;
    }
};

export class PetValue {
    // Either `knownValue` is defined, or
    // `bunch` + `location` + `deferralMessage` are defined.
    knownValue?: KnownValue;
    bunch?: ObservableBunch;
    location?: KnownValue;
    deferralMessage?: string;
    
    constructor() {
        // Do nothing.
    }
    
    getKnownValue(): KnownValue {
        if (typeof this.knownValue === "undefined") {
            const value = this.bunch!.getOptionalMember(this.location!);
            if (typeof value === "undefined") {
                throw new DeferralException(
                    this.bunch!, this.location!, this.deferralMessage!,
                );
            }
            this.knownValue = value.getKnownValue();
            delete this.bunch;
            delete this.location;
            delete this.deferralMessage;
        }
        return this.knownValue;
    }
    
    tryKnownValue(): KnownValue | undefined {
        try {
            return this.getKnownValue();
        } catch (error) {
            if (error instanceof DeferralException) {
                return undefined;
            }
            throw error;
        }
    }
    
    getInt(): bigint {
        const value = this.getKnownValue();
        if (typeof value !== "bigint") {
            throw new PetTypeError("Expected integer.");
        }
        return value;
    }
    
    getInstance<T>(
        classConstructor: abstract new (...args: any[]) => T,
        displayName: string,
    ): T {
        const value = this.getKnownValue();
        if (!(value instanceof classConstructor)) {
            throw new PetTypeError(`Expected ${displayName}.`);
        }
        return value;
    }
    
    getSymbol(): PetSymbol {
        return this.getInstance(PetSymbol, "symbol");
    }
    
    getPetString(): PetString {
        return this.getInstance(PetString, "string");
    }
    
    getStringOrNull(): PetString | null {
        const value = this.getKnownValue();
        if (!(value === null || value instanceof PetString)) {
            throw new PetTypeError("Expected string or null.");
        }
        return value;
    }
    
    getList(): PetList {
        return this.getInstance(PetList, "list");
    }
    
    getMap(): PetMap {
        return this.getInstance(PetMap, "map");
    }
    
    getFunc(): PetFunc {
        return this.getInstance(PetFunc, "function");
    }
    
    getEvalState(): EvalState {
        return this.getInstance(EvalState, "evaluation state");
    }
    
    getSliceableBunch(): SliceableBunch {
        const value = this.getKnownValue();
        if (!(value instanceof PetString || value instanceof PetList)) {
            throw new PetTypeError("Expected string or list.");
        }
        return value;
    }
    
    getObservableBunch(): ObservableBunch {
        const value = this.getKnownValue();
        if (!(value instanceof PetList || value instanceof PetMap)) {
            throw new PetTypeError("Expected list or map.");
        }
        return value;
    }
    
    toNumber(): number {
        return Number(this.getInt());
    }
    
    toCharCode(): number {
        const result = this.toNumber();
        if (result < 0 || result > 255) {
            throw new ValueError("Character code must be between 0 and 255.");
        }
        return result;
    }
    
    // If the known value is a PetString, returns the string content in quotes.
    toLiteral(parents: KnownValue[] = []): string {
        const value = this.getKnownValue();
        return knownValueToLiteral(value, parents);
    }
    
    // If the known value is a PetString, returns the unquoted string content.
    toMessage(): string {
        const value = this.getKnownValue();
        return knownValueToMessage(value);
    }
    
    toStringStrict(): string {
        return this.getPetString().toString();
    }
    
    toMapKey(): MapKey {
        const value = this.getKnownValue();
        return knownValueToMapKey(value);
    }
    
    deepCopy(copies: Map<KnownValue, KnownValue> = new Map()): KnownValue {
        const value = this.getKnownValue();
        return (value instanceof PetList || value instanceof PetMap)
            ? value.deepCopy(copies)
            : value;
    }
}

export const wrapKnownValue = (knownValue: KnownValue): PetValue => {
    const value = new PetValue();
    value.knownValue = knownValue;
    return value;
};

const wrapDeferredValue = (
    bunch: ObservableBunch,
    location: KnownValue,
    message: string,
): PetValue => {
    const value = new PetValue();
    value.bunch = bunch;
    value.location = location;
    value.deferralMessage = message;
    return value;
};

export const toPetValue = (value: KnownValue | PetValue): PetValue => (
    (value instanceof PetValue) ? value : wrapKnownValue(value)
);

export const toKnownValue = (value: KnownValue | PetValue): KnownValue => (
    (value instanceof PetValue) ? value.getKnownValue() : value
);

const toMapKey = (value: KnownValue | PetValue): MapKey => (
    (value instanceof PetValue) ? value.toMapKey() : knownValueToMapKey(value)
);

const toLiteral = (value: KnownValue | PetValue): string => (
    (value instanceof PetValue) ? value.toLiteral() : knownValueToLiteral(value)
);

export const toPetList = (values: (KnownValue | PetValue)[] | PetList): PetList => (
    (values instanceof PetList) ? values : new PetList(values)
);

export const nullValue = wrapKnownValue(null);

export const escapeChars: { [escape: string]: string } = {
    "\"": "\"",
    "'": "'",
    "n": "\n",
    "t": "\t",
    "\\": "\\",
};

const charEscapes: { [character: string]: string } = {};
for (const escape in escapeChars) {
    const character = escapeChars[escape];
    // Don't escape apostrophes in PetString.toLiteral.
    if (character !== "'") {
        charEscapes[character] = escape;
    }
}

const checkSliceIndexes = (
    bunchLength: number,
    startIndex: number,
    endIndex: number,
): void => {
    if (startIndex < 0 || startIndex > bunchLength) {
        throw new ValueError(`Start index ${startIndex} is invalid.`);
    }
    if (endIndex < 0 || endIndex > bunchLength) {
        throw new ValueError(`End index ${endIndex} is invalid.`);
    }
    if (startIndex > endIndex) {
        throw new ValueError("Start index cannot be greater than end index.");
    }
};

export const stringToLiteral = (text: string): string => {
    const literalParts: string[] = [];
    for (let index = 0; index < text.length; index++) {
        const character = text.charAt(index);
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
};

// Return -1 if value1 < value2, 1 if value1 > value2, and 0 if value1 === value2.
export const compareValues = (inputValue1: PetValue, inputValue2: PetValue): number => {
    const value1 = inputValue1.getKnownValue();
    const value2 = inputValue2.getKnownValue();
    if (typeof value1 === "bigint" && typeof value2 === "bigint") {
        if (value1 < value2) {
            return -1;
        } else if (value1 > value2) {
            return 1;
        } else {
            return 0;
        }
    } else if (value1 instanceof PetString && value2 instanceof PetString) {
        return value1.compare(value2);
    } else {
        throw new PetTypeError("Comparison values must both be integers or strings.");
    }
};

// Do not extend classes which implement SliceableBunchIface, because we cast
// the output of `slice`, `valueToSlice`, and `concatBunches` to `this`.
export interface SliceableBunchIface<T> {
    getLength(): number;
    getElement(index: number): T;
    valueToElement(value: PetValue): T;
    elementToValue(element: T): PetValue;
    elementsAreEqual(element1: T, element2: T): boolean;
    slice(startIndex: number, endIndex: number): this;
    valueToSlice(value: PetValue): this;
    sliceMatches(startIndex: number, slice: SliceableBunchIface<T>): boolean;
    concatBunches(bunches: SliceableBunchIface<T>[]): this;
}

// This type must be defined as `SliceableBunchIface & KnownValue` instead of
// `KnownValue & SliceableBunchIface`, because type intersection in TypeScript
// is not commutative...!
export type SliceableBunch<T = any> = SliceableBunchIface<T> & KnownValue;

export const getBunchElementValue = <T>(
    bunch: SliceableBunch<T>,
    index: number,
): PetValue => {
    const element = bunch.getElement(index);
    return bunch.elementToValue(element);
};

export class PetString implements SliceableBunchIface<number> {
    // Either `text` or `buffer` are non-null.
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
    
    getElement(index: number): number {
        const buffer = this.toBuffer();
        if (index < 0 || index >= buffer.length) {
            throw new ValueError(`Index ${index} is outside of string.`);
        }
        return buffer[index];
    }
    
    valueToElement(value: PetValue): number {
        return value.toCharCode();
    }
    
    elementToValue(element: number): PetValue {
        return wrapKnownValue(BigInt(element));
    }
    
    elementsAreEqual(element1: number, element2: number): boolean {
        return (element1 === element2);
    }
    
    getLength(): number {
        return this.toBuffer().length;
    }
    
    equals(otherString: PetString): boolean {
        const buffer1 = this.toBuffer();
        const buffer2 = otherString.toBuffer();
        return buffer1.equals(buffer2);
    }
    
    compare(otherString: PetString): number {
        const buffer1 = this.toBuffer();
        const buffer2 = otherString.toBuffer();
        for (let index = 0; index < buffer1.length; index++) {
            if (index >= buffer2.length) {
                return 1;
            }
            const value1 = buffer1[index];
            const value2 = buffer2[index];
            if (value1 < value2) {
                return -1;
            } else if (value1 > value2) {
                return 1;
            }
        }
        return (buffer2.length > buffer1.length) ? -1 : 0;
    }
    
    slice(startIndex: number, endIndex: number): this {
        const buffer = this.toBuffer();
        checkSliceIndexes(buffer.length, startIndex, endIndex);
        const subBuffer = buffer.subarray(startIndex, endIndex);
        return new PetString(subBuffer) as this;
    }
    
    valueToSlice(value: PetValue): this {
        return value.getPetString() as this;
    }
    
    sliceMatches(startIndex: number, slice: PetString): boolean {
        const sliceBuffer = slice.toBuffer();
        const endIndex = startIndex + sliceBuffer.length;
        return (sliceBuffer.compare(this.toBuffer(), startIndex, endIndex) === 0);
    }
    
    concatBunches(bunches: PetString[]): this {
        const buffers = bunches.map((bunch) => bunch.toBuffer());
        return new PetString(Buffer.concat(buffers)) as this;
    }
    
    toUppercase(): PetString {
        const buffer = this.toBuffer();
        const charCodes: number[] = [];
        for (let index = 0; index < buffer.length; index++) {
            let charCode = buffer[index];
            if (charCode >= 97 && charCode <= 122) {
                charCode -= 32;
            }
            charCodes.push(charCode);
        }
        return new PetString(Buffer.from(charCodes));
    }
    
    toLowercase(): PetString {
        const buffer = this.toBuffer();
        const charCodes: number[] = [];
        for (let index = 0; index < buffer.length; index++) {
            let charCode = buffer[index];
            if (charCode >= 65 && charCode <= 90) {
                charCode += 32;
            }
            charCodes.push(charCode);
        }
        return new PetString(Buffer.from(charCodes));
    }
    
    toString(): string {
        if (this.text === null) {
            this.text = this.buffer!.toString("utf8");
        }
        return this.text;
    }
    
    toBuffer(): Buffer {
        if (this.buffer === null) {
            this.buffer = Buffer.from(this.text!, "utf8");
        }
        return this.buffer;
    }
    
    toHexString(): string {
        if (this.hexString === null) {
            this.hexString = this.toBuffer().toString("hex");
        }
        return this.hexString;
    }
    
    toLiteral(): string {
        return stringToLiteral(this.toString());
    }
}

export const knownValueToLiteral = (value: KnownValue, parents: KnownValue[] = []): string => {
    if (value === null) {
        return "NULL";
    } else if (value instanceof PetString) {
        return value.toLiteral();
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

export const knownValueToMessage = (value: KnownValue): string => (
    (value instanceof PetString) ? value.toString() : knownValueToLiteral(value)
);

const knownValueToMapKey = (value: KnownValue): MapKey => (
    (value instanceof PetString) ? value.toHexString() : value
);

export const valuesAreEqual = (value1: KnownValue, value2: KnownValue): boolean => (
    (value1 instanceof PetString && value2 instanceof PetString)
        ? value1.equals(value2)
        : (value1 === value2)
);

export const valueMayHaveChanged = (oldValue: PetValue, newValue: PetValue): boolean => {
    const oldKnownValue = oldValue.tryKnownValue();
    const newKnownValue = newValue.tryKnownValue();
    const oldValueIsDeferred = (typeof oldKnownValue === "undefined");
    const newValueIsDeferred = (typeof newKnownValue === "undefined");
    if (oldValueIsDeferred && newValueIsDeferred) {
        return !(valuesAreEqual(oldValue.bunch!, newValue.bunch!)
            && valuesAreEqual(oldValue.location!, newValue.location!));
    } else if (oldValueIsDeferred || newValueIsDeferred) {
        return true;
    } else {
        return !valuesAreEqual(oldKnownValue, newKnownValue);
    }
};

export interface ObservableBunchIface {
    observatory: MemberObservatory;
    getOptionalMember(location: KnownValue | PetValue): PetValue | undefined;
    getMember(location: KnownValue | PetValue): PetValue;
    setMember(location: KnownValue | PetValue, value: KnownValue | PetValue): void;
    deferMember(location: KnownValue | PetValue, message: string): PetValue;
}

export type ObservableBunch = ObservableBunchIface & KnownValue;

const deferMember = (
    bunch: ObservableBunch,
    location: KnownValue,
    message: string,
): PetValue => {
    const value = bunch.getOptionalMember(location);
    return (typeof value === "undefined")
        ? wrapDeferredValue(bunch, location, message)
        : value;
};

export class MemberObserver {
    exception: PetMap;
    
    constructor(exception: PetMap) {
        this.exception = exception;
    }
    
    getBunch(): ObservableBunch {
        return this.exception.getMember(symbols.BUNCH).getObservableBunch();
    }
    
    getLocation(): KnownValue {
        return this.exception.getMember(symbols.LOC).getKnownValue();
    }
    
    getCondition(): PetFunc {
        return this.exception.getMember(symbols.COND).getFunc();
    }
    
    getEvalState(): EvalState {
        return this.exception.getMember(symbols.EVAL_STATE).getEvalState();
    }
    
    getMemberValue(): PetValue | undefined {
        return this.getBunch().getOptionalMember(this.getLocation());
    }
}

class MemberObservatory {
    bunch: ObservableBunch;
    observers: Map<MapKey, MemberObserver[]>;
    scheduler: Scheduler;
    
    constructor(bunch: ObservableBunch) {
        this.bunch = bunch;
        this.observers = new Map();
    }
    
    addObserver(scheduler: Scheduler, exception: PetMap): void {
        this.scheduler = scheduler;
        const location = exception.getMember(symbols.LOC).getKnownValue();
        const message = exception.getMember(symbols.MESSAGE).getStringOrNull();
        const mapKey = knownValueToMapKey(location);
        let observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            observers = [];
            this.observers.set(mapKey, observers);
        }
        const observer = new MemberObserver(exception);
        observers.push(observer);
        if (message !== null) {
            this.scheduler.observersToReport.add(observer);
        }
    }
    
    handleMemberChange(location: KnownValue): void {
        const mapKey = knownValueToMapKey(location);
        const observers = this.observers.get(mapKey);
        if (typeof observers === "undefined") {
            return;
        }
        this.observers.delete(mapKey);
        for (const observer of observers) {
            this.scheduler.observersToReport.delete(observer);
            this.scheduler.scheduleTask(awaitCondTask, { observer });
        }
    }
}

type ListIndex = number | KnownValue | PetValue;

const listIndexToNumber = (value: ListIndex): number => {
    if (typeof value === "number") {
        return value;
    } else if (typeof value === "bigint") {
        return Number(value);
    } else if (value instanceof PetValue) {
        return value.toNumber();
    } else {
        throw new PetTypeError("Expected integer.");
    }
};

const listIndexToBigInt = (value: ListIndex): bigint => {
    if (typeof value === "number") {
        return BigInt(value);
    } else if (typeof value === "bigint") {
        return value;
    } else if (value instanceof PetValue) {
        return value.getInt();
    } else {
        throw new PetTypeError("Expected integer.");
    }
};

export class PetList implements ObservableBunchIface, SliceableBunchIface<PetValue> {
    elements: PetValue[];
    observatory: MemberObservatory;
    
    constructor(elements: (KnownValue | PetValue)[] = []) {
        this.elements = elements.map((element) => toPetValue(element));
        this.observatory = new MemberObservatory(this);
    }
    
    getOptionalMember(index: ListIndex): PetValue | undefined {
        const numberIndex = listIndexToNumber(index);
        if (numberIndex < 0) {
            throw new ValueError("List index cannot be negative.");
        }
        return this.elements[numberIndex];
    }
    
    getMember(index: ListIndex): PetValue {
        const value = this.getOptionalMember(index);
        if (typeof value === "undefined") {
            const numberIndex = listIndexToNumber(index);
            throw new ValueError(`Index ${numberIndex} is outside of list.`);
        }
        return value;
    }
    
    getElement(index: number): PetValue {
        return this.getMember(index);
    }
    
    valueToElement(value: PetValue): PetValue {
        return value;
    }
    
    elementToValue(element: PetValue): PetValue {
        return element;
    }
    
    elementsAreEqual(element1: PetValue, element2: PetValue): boolean {
        return valuesAreEqual(element1.getKnownValue(), element2.getKnownValue());
    }
    
    setMemberHelper(index: number, value: PetValue): void {
        const lastValue = this.elements[index];
        this.elements[index] = value;
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(BigInt(index));
        }
    }
    
    setMember(index: ListIndex, inputValue: KnownValue | PetValue): void {
        const value = toPetValue(inputValue);
        const numberIndex = listIndexToNumber(index);
        if (numberIndex < 0 || numberIndex >= this.elements.length) {
            throw new ValueError(`Index ${numberIndex} is outside of list.`);
        }
        this.setMemberHelper(numberIndex, value);
    }
    
    deferMember(index: ListIndex, message: string): PetValue {
        return deferMember(this, listIndexToBigInt(index), message);
    }
    
    getLength(): number {
        return this.elements.length;
    }
    
    slice(startIndex: number, endIndex: number): this {
        checkSliceIndexes(this.elements.length, startIndex, endIndex);
        const subElements = this.elements.slice(startIndex, endIndex);
        return new PetList(subElements) as this;
    }
    
    valueToSlice(value: PetValue): this {
        return value.getList() as this;
    }
    
    sliceMatches(startIndex: number, slice: PetList): boolean {
        for (let offset = 0; offset < slice.getLength(); offset++) {
            const element1 = this.elements[startIndex + offset].getKnownValue();
            const element2 = slice.elements[offset].getKnownValue();
            if (!valuesAreEqual(element1, element2)) {
                return false;
            }
        }
        return true;
    }
    
    concatBunches(bunches: PetList[]): this {
        const elements: PetValue[] = [];
        for (const bunch of bunches) {
            for (const element of bunch.elements) {
                elements.push(element);
            }
        }
        return new PetList(elements) as this;
    }
    
    truncate(length: number): void {
        if (length < 0) {
            throw new ValueError("Truncation length cannot be negative.");
        }
        if (length > this.elements.length) {
            throw new ValueError("Truncation length cannot be greater than list length.");
        }
        this.elements.length = length;
    }
    
    addElements(inputValues: PetValue[], inputIndex?: number): void {
        // Guard against inserting a list into itself.
        const values = (inputValues === this.elements) ? inputValues.slice() : inputValues;
        const insertIndex = inputIndex ?? this.elements.length;
        if (insertIndex < 0 || insertIndex > this.elements.length) {
            throw new ValueError("Insertion index is out of bounds.");
        }
        for (let index = this.elements.length - 1; index >= insertIndex; index--) {
            const value = this.elements[index];
            this.setMemberHelper(index + values.length, value);
        }
        for (let offset = 0; offset < values.length; offset++) {
            const value = values[offset];
            this.setMemberHelper(insertIndex + offset, value);
        }
    }
    
    addElement(value: PetValue, index?: number): void {
        this.addElements([value], index);
    }
    
    deleteElements(amount: number, inputIndex?: number): void {
        if (amount < 0) {
            throw new ValueError("Cannot delete a negative number of elements.");
        }
        const deleteIndex = inputIndex ?? (this.elements.length - amount);
        if (deleteIndex < 0 || deleteIndex + amount > this.elements.length) {
            throw new ValueError("Cannot delete element which is out of bounds.");
        }
        for (let index = deleteIndex; index < this.elements.length - amount; index++) {
            const value = this.elements[index + amount];
            this.setMemberHelper(index, value);
        }
        this.elements.length -= amount;
    }
    
    deleteElement(index?: number): void {
        this.deleteElements(1, index);
    }
    
    reverse(): void {
        const elements = this.elements.slice();
        for (let srcIndex = 0; srcIndex < elements.length; srcIndex++) {
            const destIndex = elements.length - 1 - srcIndex;
            this.setMemberHelper(destIndex, elements[srcIndex]);
        }
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const element of this.elements) {
            textList.push(element.toLiteral(nextParents));
        }
        const elementsText = textList.join(", ");
        return `LIST (${elementsText})`;
    }
    
    shallowCopy(): PetList {
        return new PetList(this.elements.slice());
    }
    
    deepCopy(copies: Map<KnownValue, KnownValue> = new Map()): PetList {
        let copy = copies.get(this);
        if (typeof copy !== "undefined") {
            return copy as PetList;
        }
        copy = new PetList();
        copies.set(this, copy);
        for (const element of this.elements) {
            const elementCopy = wrapKnownValue(element.deepCopy(copies));
            copy.addElement(elementCopy);
        }
        return copy;
    }
}

export class PetField {
    parentMap: PetMap;
    key: KnownValue;
    value: PetValue;
    // If isDeleted is false, previousField and nextField are also undeleted fields
    // (as long as they are not null). If isDeleted is true, previousField and
    // nextField may also have been deleted.
    previousField: PetField | null;
    nextField: PetField | null;
    isDeleted: boolean;
    
    constructor(parentMap: PetMap, key: KnownValue, value: PetValue) {
        this.parentMap = parentMap;
        this.key = key;
        this.value = value;
        this.previousField = null;
        this.nextField = null;
        this.isDeleted = false;
    }
    
    getNextUndeletedField(): PetField | null {
        if (!this.isDeleted) {
            return this.nextField;
        }
        // We iterate backward to the first undeleted field, flatten the connections,
        // then return nextField of that field. This is more efficient than iterating
        // forward, because we might add and delete fields after `this` an arbitrarily
        // large number of times, but we will never add any fields before `this`.
        const fieldsToFlatten: PetField[] = [this];
        let field = this.previousField;
        while (true) {
            if (field === null) {
                // Every field before and including `this` has been deleted.
                return this.parentMap.firstField;
            }
            if (!field.isDeleted) {
                break;
            }
            fieldsToFlatten.push(field);
            field = field.previousField;
        }
        const undeletedField = field;
        for (const fieldToFlatten of fieldsToFlatten) {
            fieldToFlatten.previousField = undeletedField;
        }
        return undeletedField.nextField;
    }
}

export class PetMap implements ObservableBunchIface {
    fields: Map<MapKey, PetField>;
    firstField: PetField | null;
    lastField: PetField | null;
    observatory: MemberObservatory;
    
    constructor(entries: [KnownValue | PetValue, KnownValue | PetValue][] = []) {
        this.fields = new Map();
        this.firstField = null;
        this.lastField = null;
        this.observatory = new MemberObservatory(this);
        for (const entry of entries) {
            const key = toKnownValue(entry[0]);
            this.addField(key, toPetValue(entry[1]));
        }
    }
    
    getOptionalMember(key: KnownValue | PetValue): PetValue | undefined {
        const mapKey = toMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    getMember(key: KnownValue | PetValue): PetValue {
        const value = this.getOptionalMember(key);
        if (typeof value === "undefined") {
            throw new ValueError(`Key ${toLiteral(key)} does not exist in map.`);
        }
        return value;
    }
    
    setMember(inputKey: KnownValue | PetValue, inputValue: KnownValue | PetValue): void {
        const key = toKnownValue(inputKey);
        const value = toPetValue(inputValue);
        const mapKey = knownValueToMapKey(key);
        let lastValue: PetValue | undefined;
        let field = this.fields.get(mapKey);
        if (typeof field === "undefined") {
            field = new PetField(this, key, value);
            this.fields.set(mapKey, field);
            if (this.lastField === null) {
                this.firstField = field;
                this.lastField = field;
            } else {
                this.lastField.nextField = field;
                field.previousField = this.lastField;
                this.lastField = field;
            }
        } else {
            lastValue = field.value;
            field.value = value;
        }
        if (typeof lastValue === "undefined" || valueMayHaveChanged(lastValue, value)) {
            this.observatory.handleMemberChange(key);
        }
    }
    
    deferMember(key: KnownValue | PetValue, message: string): PetValue {
        return deferMember(this, toKnownValue(key), message);
    }
    
    hasKey(key: KnownValue | PetValue): boolean {
        return (typeof this.getOptionalMember(key) !== "undefined");
    }
    
    addField(inputKey: KnownValue | PetValue, value: KnownValue | PetValue): void {
        const key = toKnownValue(inputKey);
        if (this.hasKey(key)) {
            throw new ValueError(`Duplicate map key ${knownValueToLiteral(key)}.`);
        }
        this.setMember(key, value);
    }
    
    deleteField(key: KnownValue | PetValue): void {
        const mapKey = toMapKey(key);
        const field = this.fields.get(mapKey);
        if (typeof field === "undefined") {
            throw new ValueError(`Key ${toLiteral(key)} does not exist in map.`);
        }
        const { previousField, nextField } = field;
        if (previousField === null) {
            this.firstField = nextField;
        } else {
            previousField.nextField = nextField;
        }
        if (nextField === null) {
            this.lastField = previousField;
        } else {
            nextField.previousField = previousField;
        }
        field.isDeleted = true;
        this.fields.delete(mapKey);
    }
    
    toString(parents: KnownValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            const keyString = knownValueToLiteral(key, nextParents);
            const valueString = value.toLiteral(nextParents);
            textList.push(`(${keyString}) = (${valueString})`);
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
    
    shallowCopy(): PetMap {
        const fields = Array.from(this.fields.values());
        return new PetMap(fields.map((field) => [field.key, field.value]));
    }
    
    deepCopy(copies: Map<KnownValue, KnownValue> = new Map()): PetMap {
        let copy = copies.get(this);
        if (typeof copy !== "undefined") {
            return copy as PetMap;
        }
        copy = new PetMap();
        copies.set(this, copy);
        for (const field of this.fields.values()) {
            copy.setMember(field.key, field.value.deepCopy(copies));
        }
        return copy;
    }
    
    getKeys(): KnownValue[] {
        return Array.from(this.fields.values()).map((field) => field.key);
    }
}

export abstract class PetFunc {
    
    constructor() {
        // Do nothing.
    }
    
    abstract getMinArgAmount(): number;
    
    // Should return null if the function has no maximum amount of arguments.
    abstract getMaxArgAmount(): number | null;
    
    abstract call(task: Task, args: PetList): Action;
    
    getModulePos(): PetMap | undefined {
        return undefined;
    }
    
    abstract toString(): string;
}

export class UserFunc extends PetFunc {
    // Statement sequence component which contains the function body.
    stmtsComp: PetMap;
    // Following the parents of `topFrame` leads to `bottomFrame`. All of the frames
    // from `topFrame` to `bottomFrame` are pruned to only contain necessary entries.
    topFrame: PetMap | null;
    bottomFrame: PetMap | null;
    // `bottomFrame` may be modified so its parent is the frame of `permaFrameScope`.
    permaFrameScope: PetMap | null;
    signature: FuncSignature;
    
    constructor(stmtsComp: PetMap, varSpace: PetMap, accessedVars: PetMap) {
        super();
        this.stmtsComp = stmtsComp;
        const { topFrame, bottomFrame, permaFrameScope } = pruneFrames(
            varSpace, accessedVars,
        );
        this.topFrame = topFrame;
        this.bottomFrame = bottomFrame;
        this.permaFrameScope = permaFrameScope;
        this.signature = getFuncSignature(this.stmtsComp);
    }
    
    getMinArgAmount(): number {
        return this.signature.minArgAmount;
    }
    
    getMaxArgAmount(): number | null {
        return this.signature.maxArgAmount;
    }
    
    call(task: Task, argValues: PetList): Action {
        const scope = this.stmtsComp.getMember(symbols.SCOPE).getMap();
        const bodyFrame = createFrame(scope, this.topFrame);
        if (this.permaFrameScope !== null) {
            const permaFrame = this.permaFrameScope.getMember(symbols.PERMA_FRAME).getKnownValue();
            if (permaFrame instanceof PetMap) {
                const bottomFrame = this.bottomFrame ?? bodyFrame;
                bottomFrame.setMember(symbols.PARENT, permaFrame);
            } else if (permaFrame !== null) {
                throw new PetTypeError("#PERMA_FRAME field must store a map or null.");
            }
        }
        return task.runTask(
            callUserFuncTask, { userFunc: this, argValues, bodyFrame },
            (value) => task.returnValue(value),
        );
    }
    
    override getModulePos(): PetMap | undefined {
        return entityToModulePos(this.stmtsComp);
    }
    
    toString(): string {
        const posText = entityPosToString(this.stmtsComp);
        return `<User function on ${posText}>`;
    }
}

export class EvalState {
    currentTask: Task;
    actionToResume: Action;
    
    constructor(currentTask: Task, actionToResume: Action) {
        this.currentTask = currentTask;
        this.actionToResume = actionToResume;
    }
    
    getStackTrace(startNode?: PetMap): PetMap[] {
        const entries: PetMap[] = [];
        let task: Task | null = this.currentTask;
        let topNode: PetMap | null = null;
        while (task !== null) {
            if (topNode === null) {
                const { taskNode } = task.members;
                if (typeof taskNode !== "undefined") {
                    topNode = taskNode;
                    const nodePos = entityToModulePos(taskNode);
                    entries.push(new PetMap([
                        [symbols.MODULE_POS, nodePos],
                        [symbols.WORKER_NODE, taskNode],
                    ]));
                }
            } else {
                const { callerNode } = task.members;
                if (typeof callerNode !== "undefined") {
                    const nodePos = entityToModulePos(callerNode);
                    entries.push(new PetMap([
                        [symbols.MODULE_POS, nodePos],
                        [symbols.WORKER_NODE, callerNode],
                    ]));
                }
            }
            task = task.members.parentTask;
        }
        if (typeof startNode === "undefined") {
            return entries;
        }
        const startIndex = entries.findIndex((entry) => (
            entry.getMember(symbols.WORKER_NODE).getMap() === startNode
        ));
        return (startIndex < 0) ? entries : entries.slice(startIndex);
    }
    
    toString(): string {
        return stackTraceToString(this.getStackTrace());
    }
}


