// noinspection DuplicatedCode

import { GraphemeScanner, JsonRepairError, parseHumanJsonArray, parseHumanJsonObject } from "../../src/lib/json.ts";

describe("Tests for GraphemeScanner", () => {
    test("Scans graphemes with UTF-16 indices and columns", () => {
        const scanner = new GraphemeScanner("a👍b");

        const first = scanner.peek();
        expect(first.ch).toBe("a");
        expect(first.startCu).toBe(0);
        expect(first.endCu).toBe(1);
        expect(first.line).toBe(1);
        expect(first.col).toBe(1);
        expect(scanner.pos()).toEqual({ line: 1, column: 1, indexCu: 0 });
        expect(scanner.eof()).toBe(false);

        const firstNext = scanner.next();
        expect(firstNext).toBe(first);

        const second = scanner.peek();
        expect(second.ch).toBe("👍");
        expect(second.startCu).toBe(1);
        expect(second.endCu).toBe(3);
        expect(second.line).toBe(1);
        expect(second.col).toBe(2);
        expect(scanner.pos()).toEqual({ line: 1, column: 2, indexCu: 1 });
        expect(scanner.eof()).toBe(false);

        const secondNext = scanner.next();
        expect(secondNext).toBe(second);

        const third = scanner.peek();
        expect(third.ch).toBe("b");
        expect(third.startCu).toBe(3);
        expect(third.endCu).toBe(4);
        expect(third.line).toBe(1);
        expect(third.col).toBe(3);
        expect(scanner.pos()).toEqual({ line: 1, column: 3, indexCu: 3 });
        expect(scanner.eof()).toBe(false);

        const thirdNext = scanner.next();
        expect(thirdNext).toBe(third);

        const eof = scanner.peek();
        expect(eof.ch).toBe(GraphemeScanner.EOF);
        expect(eof.startCu).toBe(4);
        expect(eof.endCu).toBe(4);
        expect(eof.line).toBe(1);
        expect(eof.col).toBe(4);
        expect(scanner.pos()).toEqual({ line: 1, column: 4, indexCu: 4 });
        expect(scanner.eof()).toBe(true);
    });

    test("Treats CRLF as single token", () => {
        const scanner = new GraphemeScanner("a\r\nb");

        const a = scanner.next();
        expect(a.ch).toBe("a");
        expect(a.startCu).toBe(0);
        expect(a.endCu).toBe(1);
        expect(a.line).toBe(1);
        expect(a.col).toBe(1);

        const crlf = scanner.next();
        expect(crlf.ch).toBe("\r\n");
        expect(crlf.startCu).toBe(1);
        expect(crlf.endCu).toBe(3);
        expect(crlf.line).toBe(1);
        expect(crlf.col).toBe(2);

        const b = scanner.next();
        expect(b.ch).toBe("b");
        expect(b.startCu).toBe(3);
        expect(b.endCu).toBe(4);
        expect(b.line).toBe(2);
        expect(b.col).toBe(1);

        expect(scanner.eof()).toBe(true);
    });

    test("Treats lone CR and LF as newlines", () => {
        const scanner = new GraphemeScanner("a\n b\rc");

        const a = scanner.next();
        expect(a.ch).toBe("a");
        expect(a.startCu).toBe(0);
        expect(a.endCu).toBe(1);
        expect(a.line).toBe(1);
        expect(a.col).toBe(1);

        const lf = scanner.next();
        expect(lf.ch).toBe("\n");
        expect(lf.startCu).toBe(1);
        expect(lf.endCu).toBe(2);
        expect(lf.line).toBe(1);
        expect(lf.col).toBe(2);
        expect(scanner.pos()).toEqual({ line: 2, column: 1, indexCu: 2 });

        const sp = scanner.next();
        expect(sp.ch).toBe(" ");
        expect(sp.startCu).toBe(2);
        expect(sp.endCu).toBe(3);
        expect(sp.line).toBe(2);
        expect(sp.col).toBe(1);

        const b = scanner.next();
        expect(b.ch).toBe("b");
        expect(b.startCu).toBe(3);
        expect(b.endCu).toBe(4);
        expect(b.line).toBe(2);
        expect(b.col).toBe(2);

        const cr = scanner.next();
        expect(cr.ch).toBe("\r");
        expect(cr.startCu).toBe(4);
        expect(cr.endCu).toBe(5);
        expect(cr.line).toBe(2);
        expect(cr.col).toBe(3);
        expect(scanner.pos()).toEqual({ line: 3, column: 1, indexCu: 5 });

        const c = scanner.next();
        expect(c.ch).toBe("c");
        expect(c.startCu).toBe(5);
        expect(c.endCu).toBe(6);
        expect(c.line).toBe(3);
        expect(c.col).toBe(1);

        const eof = scanner.next();
        expect(eof.ch).toBe(GraphemeScanner.EOF);
        expect(eof.startCu).toBe(6);
        expect(eof.endCu).toBe(6);
        expect(eof.line).toBe(3);
        expect(eof.col).toBe(2);
        expect(scanner.eof(eof)).toBe(true);
        expect(scanner.eof()).toBe(true);
        expect(scanner.pos()).toEqual({ line: 3, column: 2, indexCu: 6 });
    });

    test("Reports EOF position for empty input", () => {
        const scanner = new GraphemeScanner("");

        const eof = scanner.peek();
        expect(eof.ch).toBe(GraphemeScanner.EOF);
        expect(eof.startCu).toBe(0);
        expect(eof.endCu).toBe(0);
        expect(eof.line).toBe(1);
        expect(eof.col).toBe(1);
        expect(scanner.eof()).toBe(true);
    });
});

describe("Tests for repairInvalidJsonObject", () => {
    test("Repairs quoted JSON and normalizes output", () => {
        const result = parseHumanJsonObject('{ "a": "b", "c": "d" }');
        expect(result.json).toBe("{\"a\":\"b\",\"c\":\"d\"}");
        expect(result.value).toEqual({ a: "b", c: "d" });
    });

    test("Repairs unquoted input with optional braces and trims trailing whitespace", () => {
        const input = "a: hello world   \r\n  b: spaced   value  ";
        const result = parseHumanJsonObject(input);
        expect(result.json).toBe("{\"a\":\"hello world\",\"b\":\"spaced   value\"}");
        expect(result.value).toEqual({ a: "hello world", b: "spaced   value" });
    });

    test("Repairs mixed quoted/unquoted keys and values with commas", () => {
        const result = parseHumanJsonObject("{a: 1, \"b\": two}");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"two\"}");
        expect(result.value).toEqual({ a: "1", b: "two" });
    });

    test("Repairs unquoted keys and values with internal spaces", () => {
        const result = parseHumanJsonObject("{a 1: this one, b 2: that two}");
        expect(result.json).toBe("{\"a 1\":\"this one\",\"b 2\":\"that two\"}");
        expect(result.value).toEqual({ "a 1": "this one", "b 2": "that two" });
    })

    test("Ignores newlines everywhere with quoted keys and values", () => {
        const result = parseHumanJsonObject("\n{\n\"a\"\n:\n\"b\"\n}\n");
        expect(result.json).toBe("{\"a\":\"b\"}");
        expect(result.value).toEqual({ a: "b" });
    });

    test("Ignores trailing commas", () => {
        const result = parseHumanJsonObject("{a: 1, b: 2,}");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores trailing commas without braces", () => {
        const result = parseHumanJsonObject("a: 1, b: 2,");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores trailing commas and newlines without braces", () => {
        const result = parseHumanJsonObject("a: 1,\n b: 2,\n");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores trailing commas with quoted keys and values", () => {
        const result = parseHumanJsonObject("{\"a\": \"1\", \"b\": \"2\",}");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores trailing commas with quoted keys and values without braces", () => {
        const result = parseHumanJsonObject("\"a\": \"1\", \"b\": \"2\",");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores leading commas", () => {
        const result = parseHumanJsonObject("{,a: 1, b: 2}");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores leading commas without braces", () => {
        const result = parseHumanJsonObject(",a: 1, b: 2");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores multiple leading and trailing commas", () => {
        const result = parseHumanJsonObject("{,,a: 1, b: 2,,}");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    })

    test("Ignores multiple leading and trailing commas without braces", () => {
        const result = parseHumanJsonObject(",,a: 1, b: 2,,");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Treats newlines as separators between entries", () => {
        const result = parseHumanJsonObject("a: 1\nb:2\n");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Ignores newlines after colon", () => {
        const result = parseHumanJsonObject("a: \n 1\nb:\n2\n");
        expect(result.json).toBe("{\"a\":\"1\",\"b\":\"2\"}");
        expect(result.value).toEqual({ a: "1", b: "2" });
    });

    test("Handles special characters in unquoted keys and values", () => {
        const result = parseHumanJsonObject("key\\\"\\r\\n'\\'`\": value\\\"\\r\\n'\\'`\"");
        expect(result.json).toBe("{\"key\\\\\\\"\\\\r\\\\n'\\\\'`\\\"\":\"value\\\\\\\"\\\\r\\\\n'\\\\'`\\\"\"}");
        expect(result.value).toEqual({ "key\\\"\\r\\n'\\'`\"": "value\\\"\\r\\n'\\'`\"" });
    });

    test("Reports position for missing colon after unquoted key", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonObject("a\nb: 1");
        } catch (error) {
            err = error as JsonRepairError;
        }

        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(2);
    });

    test("Returns empty object for empty input", () => {
        const result = parseHumanJsonObject("");
        expect(result.json).toBe("{}");
        expect(result.value).toEqual({});
    });

    test("Returns empty object for empty braces", () => {
        const result = parseHumanJsonObject("{}");
        expect(result.json).toBe("{}");
        expect(result.value).toEqual({});
    });

    test("Returns empty object for empty braces with white-spaces around", () => {
        const result = parseHumanJsonObject(" {} ");
        expect(result.json).toBe("{}");
        expect(result.value).toEqual({});
    });

    test("Returns empty object for empty braces with white-spaces everywhere", () => {
        const result = parseHumanJsonObject(" { } ");
        expect(result.json).toBe("{}");
        expect(result.value).toEqual({});
    });

    test("Returns empty object for white-spaces-only input", () => {
        const result = parseHumanJsonObject("   ");
        expect(result.json).toBe("{}");
        expect(result.value).toEqual({});
    });

    test("Reports position for unexpected text after closing brace", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonObject("{a: 1} b");
        } catch (error) {
            err = error as JsonRepairError;
        }
        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(8);
    });

    test("Reports error for key without a value", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonObject("{a:}");
        } catch (error) {
            err = error as JsonRepairError;
        }
        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(4);
    });

    test("Reports error for characters after quoted value", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonObject("{a:\"b\"c}");
        } catch (error) {
            err = error as JsonRepairError;
        }
        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(7);
    });

    test.each([
        {
            index: 1,
            test: "upload:my-secret-password",
            expected: { upload: "my-secret-password" }
        }, {
            index: 2,
            test: "user 1: his-secret, user 2: password with \\ and \"",
            expected: { "user 1": "his-secret", "user 2": "password with \\ and \"" }
        }, {
            index: 3,
            test: "{\"upload\":\"my \\\"secret:,password\\\\;\", \"upload 2\":\"other password\"}",
            expected: { upload: "my \"secret:,password\\;", "upload 2": "other password" }
        },
    ])("Check that env.example value $index is correctly parsed", ({ test, expected }) => {
        const result = parseHumanJsonObject(test);
        expect(result.json).toBe(JSON.stringify(expected));
        expect(result.value).toEqual(expected);
    });
});

describe("Tests for repairInvalidJsonArray", () => {
    test("Repairs quoted JSON array and normalizes output", () => {
        const result = parseHumanJsonArray("[ \"a\", \"b\" ]");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Repairs unquoted array without brackets", () => {
        const result = parseHumanJsonArray("a, b,  c ,d ,e");
        expect(result.json).toBe("[\"a\",\"b\",\"c\",\"d\",\"e\"]");
        expect(result.value).toEqual(["a", "b", "c", "d", "e"]);
    });

    test("Repairs mixed quoted/unquoted values with commas", () => {
        const result = parseHumanJsonArray("[\"a\", b]");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Repairs unquoted values with internal spaces", () => {
        const result = parseHumanJsonArray("[a 1, b 2]");
        expect(result.json).toBe("[\"a 1\",\"b 2\"]");
        expect(result.value).toEqual(["a 1", "b 2"]);
    });

    test("Ignores newlines everywhere with quoted values", () => {
        const result = parseHumanJsonArray("\n[\n\"a\"\n,\n\"b\"\n]\n");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores trailing command without brackets", () => {
        const result = parseHumanJsonArray("a, b,");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores trailing commas and newlines without brackets", () => {
        const result = parseHumanJsonArray("a, b,\n");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores trailing commas with quoted values", () => {
        const result = parseHumanJsonArray("[\"a\", \"b\",]");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores trailing commas with quoted values without brackets", () => {
        const result = parseHumanJsonArray("\"a\", \"b\",");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores leading commas", () => {
        const result = parseHumanJsonArray("[,a, b]");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores leading commas without brackets", () => {
        const result = parseHumanJsonArray(",a, b");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    })

    test("Ignores multiple leading and trailing commas", () => {
        const result = parseHumanJsonArray("[,,a, b,,]");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Ignores multiple leading and trailing commas without brackets", () => {
        const result = parseHumanJsonArray(",,a, b,,");
        expect(result.json).toBe("[\"a\",\"b\"]");
        expect(result.value).toEqual(["a", "b"]);
    });

    test("Treats newlines as separators between entries", () => {
        const result = parseHumanJsonArray("a,b\nc,d\n");
        expect(result.json).toBe("[\"a\",\"b\",\"c\",\"d\"]");
        expect(result.value).toEqual(["a", "b", "c", "d"]);
    });

    test("Ignores newlines after comma", () => {
        const result = parseHumanJsonArray("a, \nb,\nc,\nd\n");
        expect(result.json).toBe("[\"a\",\"b\",\"c\",\"d\"]");
        expect(result.value).toEqual(["a", "b", "c", "d"]);
    });

    test("Handles special characters in unquoted values", () => {
        const result = parseHumanJsonArray("value\\\"\\r\\n'\\'`");
        expect(result.json).toBe("[\"value\\\\\\\"\\\\r\\\\n'\\\\'`\"]");
        expect(result.value).toEqual(["value\\\"\\r\\n'\\'`"]);
    });

    test("Keeps bracketed content when quoted", () => {
        const result = parseHumanJsonArray("[\"[b]\", \"{c: d}\"]");
        expect(result.json).toBe("[\"[b]\",\"{c: d}\"]");
        expect(result.value).toEqual(["[b]", "{c: d}"]);
    });

    test("Returns empty array for empty input", () => {
        const result = parseHumanJsonArray("");
        expect(result.json).toBe("[]");
        expect(result.value).toEqual([]);
    });

    test("Returns empty array for empty brackets", () => {
        const result = parseHumanJsonArray("[]");
        expect(result.json).toBe("[]");
        expect(result.value).toEqual([]);
    });

    test("Returns empty array for empty brackets with white-spaces around", () => {
        const result = parseHumanJsonArray(" [] ");
        expect(result.json).toBe("[]");
        expect(result.value).toEqual([]);
    });

    test("Returns empty array for empty brackets with white-spaces everywhere", () => {
        const result = parseHumanJsonArray(" [ ] ");
        expect(result.json).toBe("[]");
        expect(result.value).toEqual([]);
    });

    test("Returns empty array for white-spaces-only input", () => {
        const result = parseHumanJsonArray("   ");
        expect(result.json).toBe("[]");
        expect(result.value).toEqual([]);
    });

    test("Reports error for unexpected text after closing bracket", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonArray("[a] b");
        } catch (error) {
            err = error as JsonRepairError;
        }
        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(5);
    })

    test("Reports error for characters after quoted value", () => {
        let err: JsonRepairError | null = null;
        try {
            parseHumanJsonArray("[\"a\"b]");
        } catch (error) {
            err = error as JsonRepairError;
        }
        expect(err).toBeInstanceOf(JsonRepairError);
        expect(err?.line).toBe(1);
        expect(err?.column).toBe(5);
    })

    test.each([
        {
            index: 1,
            test: "generate-a-secure-string",
            expected: ["generate-a-secure-string"]
        }, {
            index: 2,
            test: "[new key, old-key, very-old-key]",
            expected: ["new key", "old-key", "very-old-key"]
        }, {
            index: 3,
            test: "[\" ^key*, with \\\"special\\\" @characters$ \"]",
            expected: [" ^key*, with \"special\" @characters$ "]
        }
    ])("Check that env.example value $index is correctly parsed", ({ test, expected }) => {
        const result = parseHumanJsonArray(test);
        expect(result.json).toBe(JSON.stringify(expected));
        expect(result.value).toEqual(expected);
    })
});
