// TypeScript 6.0.3 lib files do not yet declare the "JSON.parse source
// text access" features: the `context` argument passed to JSON.parse
// revivers, `JSON.rawJSON`, and `JSON.isRawJSON`. When we upgrade to a
// newer version of TypeScript, we can remove this shim.

// A frozen object containing JSON text for a primitive value,
// created by `JSON.rawJSON()`.
interface RawJSON {
    readonly rawJSON: string;
}

interface JSON {
    parse(
        text: string,
        reviver?: (this: any, key: string, value: any, context: { source?: string }) => any,
    ): any;
    rawJSON(text: string): RawJSON;
    isRawJSON(value: unknown): value is RawJSON;
}
