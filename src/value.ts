
// PetValueAndKey contains types which can be used as both values and Map keys.
// TODO: Add PetFunc and EvalState to PetValueAndKey.
export type PetValueAndKey = null | BigInt | PetSymbol | PetList | PetMap;
export type PetValue = PetString | PetValueAndKey;
export type MapKey = string | PetValueAndKey;

export class PetSymbol {
    displayName: string;
    
    constructor(displayName: string) {
        this.displayName = displayName;
    }
    
    toString() {
        return this.displayName;
    }
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
            if (character === "\"") {
                literalPart = "\\\"";
            } else if (character === "\n") {
                literalPart = "\\n";
            } else if (character === "\t") {
                literalPart = "\\t";
            } else {
                literalPart = character;
            }
            literalParts.push(literalPart);
        }
        return "\"" + literalParts.join("") + "\"";
    }
}

export const valueToString = (value: PetValue, parents: PetValue[] = []): string => {
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

const valueToMapKey = (value: PetValue): MapKey => (
    (value instanceof PetString) ? value.toHexString() : value
);

class PetElement {
    value: PetValue;
    // TODO: Add observers.
    
    constructor(value: PetValue) {
        this.value = value;
    }
}

export class PetList {
    elements: PetElement[];
    // TODO: Add observers beyond length of `elements`.
    
    constructor(values: PetValue[] = []) {
        this.elements = values.map((value) => new PetElement(value));
    }
    
    getMember(index: number): PetValue {
        return this.elements[index].value;
    }
    
    setMember(index: number, value: PetValue): void {
        this.elements[index].value = value;
    }
    
    toString(parents: PetValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        for (const { value } of this.elements) {
            textList.push(valueToString(value, nextParents));
        }
        const elementsText = textList.join(", ");
        return `LIST (${elementsText})`;
    }
}

class PetField {
    key: PetValue;
    value?: PetValue;
    // TODO: Add observers.
    
    constructor(key: PetValue, value?: PetValue) {
        this.key = key;
        this.value = value;
    }
}

export class PetMap {
    fields: Map<MapKey, PetField>;
    
    constructor(entries: [PetValue, PetValue][] = []) {
        this.fields = new Map();
        for (const entry of entries) {
            this.setMember(entry[0], entry[1]);
        }
    }
    
    getMember(key: PetValue): PetValue | undefined {
        const mapKey = valueToMapKey(key);
        const field = this.fields.get(mapKey);
        return field?.value;
    }
    
    setMember(key: PetValue, value: PetValue): void {
        const mapKey = valueToMapKey(key);
        let field = this.fields.get(mapKey);
        if (typeof field === "undefined") {
            field = new PetField(key, value);
            this.fields.set(mapKey, field);
        } else {
            field.value = value;
        }
    }
    
    toString(parents: PetValue[] = []): string {
        const nextParents = [...parents, this];
        const textList: string[] = [];
        this.fields.forEach(({ key, value }) => {
            if (typeof value !== "undefined") {
                const keyString = valueToString(key, nextParents);
                const valueString = valueToString(value, nextParents);
                textList.push(`(${keyString}) = (${valueString})`);
            }
        });
        const fieldsText = textList.join(", ");
        return `MAP [FIELDS [${fieldsText}]]`;
    }
}


