import assert from "node:assert";

export interface Position {
    indexCu: number;
    line: number;
    column: number;
}

export interface Token {
    ch: string;       // grapheme string
    startCu: number;  // start UTF-16 code-unit index
    endCu: number;    // end UTF-16 code-unit index
    line: number;     // 1-based
    col: number;      // 1-based (graphemes)
}

export class GraphemeScanner {
    private segments: Array<{ segment: string; index: number }> = [];
    private segPos = 0;
    private buffered: Token | null = null;

    // Position of the next unread token
    private cu = 0;
    private line = 1;
    private col = 1;

    // Grapheme segmenter (locale-neutral)
    private readonly segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });

    constructor(private readonly str: string) {
        // Materialize segments so we have a stable index for CU boundaries.
        // Performance is fine per your constraints.
        for (const seg of this.segmenter.segment(str)) {
            this.segments.push({ segment: seg.segment, index: seg.index });
        }
    }

    public static get EOF() { return "<eof>"; }

    private static posFromToken(t: Token) {
        return { line: t.line, column: t.col, indexCu: t.startCu };
    }

    isEOF(ch: string): boolean {
        return ch === GraphemeScanner.EOF;
    }

    isNL(ch: string): boolean {
        return ch === "\n" || ch === "\r" || ch === "\r\n";
    }

    isWS(ch: string): boolean {
        return ch === " " || ch === "\t" || this.isNL(ch);
    }

    pos(t?: Token): Position {
        return GraphemeScanner.posFromToken(t ?? this.peek());
    }

    eof(t?: Token): boolean {
        return this.isEOF((t ?? this.peek()).ch);
    }

    nl(t?: Token): boolean {
        return this.isNL((t ?? this.peek()).ch);
    }

    ws(t?: Token): boolean {
        return this.isWS((t ?? this.peek()).ch);
    }

    peek(): Token {
        if (this.buffered) return this.buffered;
        if (this.segPos >= this.segments.length) {
            return {
                ch: GraphemeScanner.EOF,
                startCu: this.cu,
                endCu: this.cu,
                line: this.line,
                col: this.col,
            };
        }

        const { segment, index: startCu } = this.segments[this.segPos];
        const endCu =
            this.segPos + 1 < this.segments.length
                ? this.segments[this.segPos + 1].index
                : this.str.length;

        const token: Token = {
            ch: segment,
            startCu,
            endCu,
            line: this.line,
            col: this.col,
        };

        this.buffered = token;
        return token;
    }

    /**
     * Consume the next grapheme token and advance (line, col):
     * - '\n', '\r', or '\r\n' => newline
     * - Any other grapheme advances column by 1
     */
    next(): Token {
        const t = this.peek();
        if (t.ch === GraphemeScanner.EOF) return t;

        this.buffered = null;
        this.segPos++;
        this.cu = t.endCu;

        if (t.ch === "\n" || t.ch === "\r" || t.ch === "\r\n") {
            this.line++;
            this.col = 1;
            return t;
        }

        this.col++;
        return t;
    }
}

export interface RepairResultObject {
    json: string; // valid JSON text
    value: Record<string, string>; // parsed object
}

export interface RepairResultArray {
    json: string; // valid JSON text
    value: string[]; // parsed array
}

export type RepairResult = RepairResultObject | RepairResultArray;

export type JsonTopLevelKind = "object" | "array";

export class JsonRepairError extends Error {
    /** 0-based UTF-16 code-unit index */
    public readonly indexCu: number;
    /** 1-based line number */
    public readonly line: number;
    /** 1-based column number (in graphemes) */
    public readonly column: number;

    constructor(message: string, pos: Position) {
        super(`${ message } (line ${ pos.line }, col ${ pos.column })`);
        this.name = "JsonRepairError";
        this.line = pos.line;
        this.column = pos.column;
        this.indexCu = pos.indexCu;
    }
}

/**
 * Repairs a "JSON-like" object string into valid JSON.
 *
 * - Object only: parses a single object; outer braces are optional (whitespace allowed).
 *   Empty/whitespace-only input yields `{}`.
 * - Keys/values: always strings.
 * - Quoted: accept any valid JSON string escaping; normalize via JSON.parse/stringify.
 * - Unquoted: read until delimiter (key ':'; value ',' or '}' or newline; EOF if no braces),
 *   allowing quotes inside; JSON.stringify handles quoting/escaping.
 * - Whitespace: allowed around tokens; unquoted tokens preserve internal whitespace but trim
 *   leading and trailing whitespaces. Newlines accepted as \n, \r, or \r\n; an unquoted
 *   value may terminate on a newline (treated like a comma separator).
 *
 * Error positions are reported in grapheme clusters (Intl.Segmenter).
 */
class HumanJsonParser {
    private readonly cur: GraphemeScanner;

    constructor(
        private readonly input: string
    ) {
        this.cur = new GraphemeScanner(this.input);
    }

    parseObject(): RepairResultObject {
        this.skipWS();

        const openingSymbol = "{";
        const closingSymbol = "}";
        const insideBrackets = this.cur.peek().ch === openingSymbol;
        const checkFinish = insideBrackets
            ? (what: "obj_key" | "obj_value" | "end", t?: Token) => this.checkFinishWithBrackets(what, closingSymbol, t)
            : (what: "obj_key" | "obj_value" | "end", t?: Token) => this.checkFinishNoBrackets(what, t);
        if (insideBrackets) {
            // Consume initial token
            this.cur.next();
        }

        const keyDelimiters = new Set([":"]);
        const valueConditionalDelimiters = insideBrackets ? [closingSymbol] : [GraphemeScanner.EOF];
        const valueDelimiters = new Set([",", ...valueConditionalDelimiters]);
        const valueDelimitersWithNL = new Set([...valueDelimiters, "\n", "\r", "\r\n"]);

        const obj: Record<string, string> = {};
        const parts: string[] = [];

        while (true) {
            this.skipWS();

            // key
            const pk = this.cur.peek();
            if (checkFinish("obj_key", pk)) {
                // Consume finishing token
                this.cur.next();
                break;
            }

            if (pk.ch === ",") {
                this.cur.next();
                continue;
            }

            const keyContent =
                pk.ch === '"' ? this.parseQuotedJsonContent(keyDelimiters, "obj_key") : this.parseUnquotedUntil(keyDelimiters, "obj_key");

            this.expectChar(":");
            this.skipWS();

            // value
            if (checkFinish("obj_value")) break;
            const pv = this.cur.peek();
            const valContent =
                pv.ch === '"' ? this.parseQuotedJsonContent(valueDelimiters, "obj_value") : this.parseUnquotedUntil(valueDelimitersWithNL, "obj_value");

            obj[keyContent] = valContent;
            parts.push(`${ JSON.stringify(keyContent) }:${ JSON.stringify(valContent) }`);

            if (checkFinish("end", this.cur.next())) break;
        }

        this.skipWS();
        if (!this.cur.eof()) this.err(`Unexpected characters after closing ${ this.getSymbolName(closingSymbol) } '${ closingSymbol }'`);

        const json = `{${ parts.join(",") }}`;
        return { json, value: obj };
    }

    parseArray(): RepairResultArray {
        this.skipWS();

        const openingSymbol = "[";
        const closingSymbol = "]";
        const insideBrackets = this.cur.peek().ch === openingSymbol;
        const checkFinish = insideBrackets
            ? (what: "arr_value" | "end", t?: Token) => this.checkFinishWithBrackets(what, closingSymbol, t)
            : (what: "arr_value" | "end", t?: Token) => this.checkFinishNoBrackets(what, t);
        if (insideBrackets) {
            // Consume initial token
            this.cur.next();
        }

        const valueConditionalDelimiters = insideBrackets ? [closingSymbol] : [GraphemeScanner.EOF];
        const valueDelimiters = new Set([",", ...valueConditionalDelimiters]);
        const valueDelimitersWithNL = new Set([...valueDelimiters, "\n", "\r", "\r\n"]);

        const arr: string[] = [];
        const parts: string[] = [];

        while (true) {
            this.skipWS();

            const pv = this.cur.peek();
            if (pv.ch === ",") {
                this.cur.next();
                continue;
            }

            if (checkFinish("arr_value", pv)) {
                // Consume finishing token
                this.cur.next();
                break;
            }

            const valContent =
                pv.ch === '"' ? this.parseQuotedJsonContent(valueDelimiters, "arr_value") : this.parseUnquotedUntil(valueDelimitersWithNL, "arr_value");

            arr.push(valContent);
            parts.push(`${ JSON.stringify(valContent) }`);

            if (checkFinish("end", this.cur.next())) break;
        }

        this.skipWS();
        if (!this.cur.eof()) this.err(`Unexpected characters after closing ${ this.getSymbolName(closingSymbol) } '${ closingSymbol }'`);

        const json = `[${ parts.join(",") }]`;
        return { json, value: arr };
    }

    private err(msg: string, posOverride?: Position): never {
        throw new JsonRepairError(msg, posOverride ?? this.cur.pos());
    }

    private skipWS() {
        while (true) {
            if (this.cur.eof() || !this.cur.ws()) break;
            this.cur.next();
        }
    }

    private expectChar(expected: string) {
        const t = this.cur.next();
        if (this.cur.eof(t)) this.err(`Expected '${ expected }' but reached end of input`, this.cur.pos(t));
        if (t.ch !== expected) this.err(`Expected '${ expected }' but found '${ t.ch }'`, this.cur.pos(t));
    }

    /**
     * Parse a JSON string token starting at `"`.
     * Quoted strings accept any valid JSON escapes. We scan until the closing quote
     * while ensuring unescaped control characters don't appear.
     * Then JSON.parse validates the escaping.
     */
    private parseQuotedJsonContent(delimiters: Set<string>, what: "obj_key" | "obj_value" | "arr_value"): string {
        const first = this.cur.peek();
        assert(first.ch === '"', "Quoted JSON string does not start with quote");

        const startCu = first.startCu;
        const startPos = this.cur.pos();

        this.expectChar('"');

        let escaped = false;

        while (true) {
            const t = this.cur.next();
            if (this.cur.eof(t)) this.err("Unterminated JSON string", startPos);

            if (!escaped) {
                if (t.ch === '"') break;
                if (t.ch === "\\") {
                    escaped = true;
                    continue;
                }
                // JSON forbids unescaped control chars (includes raw \n and \r)
                // Here, control chars are necessarily single-code-unit graphemes.
                if (this.cur.nl(t)) {
                    this.err("Unescaped newline character inside JSON string", this.cur.pos(t));
                } else if (t.ch.length === 1 && t.ch.charCodeAt(0) < 0x20) {
                    this.err("Unescaped control character inside JSON string", this.cur.pos(t));
                }
            } else {
                escaped = false;
            }
        }

        const endCu = this.cur.pos().indexCu; // after closing quote
        const token = this.input.slice(startCu, endCu);

        let parsed: string;
        try {
            parsed = JSON.parse(token) as string;
        } catch {
            this.err("Invalid JSON string escaping", startPos);
        }

        // After closing the quote, allow whitespace until a delimiter
        while (true) {
            const p = this.cur.peek();
            if (delimiters.has(p.ch)) {
                break;
            } else if (this.cur.eof(p)) {
                this.err(`Reached end of input while parsing ${ this.getItemName(what) }`, startPos);
            } else if (!this.cur.ws(p)) {
                this.err(`Expected ${ Array.from(delimiters.values().filter((value) => !this.cur.isWS(value)))
                    .join(" or ") } after ${ this.getItemName(what) } but found '${ p.ch }'`, this.cur.pos(p));
            }
            this.cur.next();
        }

        // Return the parsed string value (no surrounding quotes); caller uses JSON.stringify.
        return parsed;
    }

    /**
     * Parse an unquoted token until a delimiter.
     */
    private parseUnquotedUntil(delimiters: Set<string>, what: "obj_key" | "obj_value" | "arr_value"): string {
        if (this.cur.eof()) this.err(`Reached end of input while parsing ${ this.getItemName(what) }`);
        assert(!this.cur.ws(), `Unquoted ${ this.getItemName(what) } must not start with whitespace`);

        const startPos = this.cur.pos();
        const startCu = startPos.indexCu;

        let lastNonWsEndCu = -1;

        while (true) {
            const p = this.cur.peek();
            if (delimiters.has(p.ch)) break;
            if (this.cur.eof(p)) this.err(`Reached end of input while parsing ${ this.getItemName(what) }`, startPos);

            if (this.cur.ws(p)) {
                const wsPos = this.cur.pos();

                // consume whitespaces
                while (true) {
                    const w = this.cur.peek();
                    if (delimiters.has(w.ch)) {
                        break;
                    } else if (this.cur.eof(w)) {
                        this.err(`Reached end of input while parsing ${ this.getItemName(what) }`, startPos);
                    } else if (this.cur.nl(w)) {
                        this.err(`Expected ${ Array.from(delimiters.values().filter((value) => !this.cur.isWS(value)))
                            .join(" or ") } after ${ this.getItemName(what) }, but found a newline`, wsPos);
                    } else if (!this.cur.ws(w)) {
                        break;
                    }
                    this.cur.next();
                }

                const after = this.cur.peek();
                if (delimiters.has(after.ch)) {
                    break;
                }
            }

            lastNonWsEndCu = (this.cur.next()).endCu;
        }

        if (lastNonWsEndCu < 0) this.err(`Empty unquoted ${ this.getItemName(what) }`, startPos);

        const raw = this.input.slice(startCu, lastNonWsEndCu);
        const delim = this.cur.peek();
        if (!delim || !delimiters.has(delim.ch)) this.err(`Reached end of input while parsing ${ this.getItemName(what) }`, startPos);
        return raw;
    }

    private checkFinishNoBrackets(what: "obj_key" | "obj_value" | "arr_value" | "end", t?: Token) {
        if (this.cur.eof(t)) {
            if (what === "obj_key" || what === "arr_value" || what === "end") {
                return true;
            } else {
                this.err("Reached end of input while expecting a value");
            }
        } else {
            return false;
        }
    }

    private getItemName(item: "obj_key" | "obj_value" | "arr_value"): string {
        switch (item) {
            case "obj_key":
                return "key";
            case "obj_value":
                return "value";
            case "arr_value":
                return "value";
        }
    }

    private getSymbolName(symbol: "}" | "]"): string {
        switch (symbol) {
            case "}":
                return "brace";
            case "]":
                return "bracket";
        }
    }

    private checkFinishWithBrackets(what: "obj_key" | "obj_value" | "arr_value" | "end", closeChar: "}" | "]", t?: Token) {
        if (this.cur.eof(t)) {
            if (what === "end") {
                this.err(`Reached end of input while expecting a closing ${ this.getSymbolName(closeChar) } '${ closeChar }'`);
            } else {
                this.err(`Reached end of input while expecting a ${ this.getItemName(what) }`);
            }
        } else if ((t ?? this.cur.peek()).ch === closeChar) {
            if (what === "obj_key" || what === "arr_value" || what === "end") {
                return true;
            } else {
                this.err(`Unexpected '${ closeChar }' instead of a ${ this.getItemName(what) }`);
            }
        } else {
            return false;
        }
    }
}

function parseHumanJsonCore(input: string, kind: JsonTopLevelKind): RepairResult {
    const parser = new HumanJsonParser(input);
    switch (kind) {
        case "object":
            return parser.parseObject();
        case "array":
            return parser.parseArray();
    }
}

export function parseHumanJson(input: string, kind: "object"): RepairResultObject;
export function parseHumanJson(input: string, kind: "array"): RepairResultArray;
export function parseHumanJson(input: string, kind: JsonTopLevelKind): RepairResult;
export function parseHumanJson(input: string, kind: JsonTopLevelKind): RepairResult {
    return parseHumanJsonCore(input, kind);
}

export function parseHumanJsonObject(input: string): RepairResultObject {
    return parseHumanJson(input, "object");
}

export function parseHumanJsonArray(input: string): RepairResultArray {
    return parseHumanJson(input, "array");
}
