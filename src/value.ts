
export class PetSymbol {
    displayName: string;
    
    constructor(displayName: string) {
        this.displayName = displayName;
    }
}

export class PetString {
    buffer: Buffer;
    // `hexString` is used as a key in maps.
    hexString: string | null;
    
    constructor(data: string | Buffer) {
        this.buffer = (typeof data === "string") ? Buffer.from(data) : data;
        this.hexString = null;
    }
}


