import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
    globalIgnores(["dist/"]),
    {
        files: ["**/*.ts"],
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
        ],
        plugins: {
            "@stylistic": stylistic,
        },
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "array-callback-return": "error",
            "arrow-body-style": "warn",
            "camelcase": "warn",
            "curly": "error",
            "eqeqeq": "error",
            "func-style": "warn",
            "new-cap": ["warn", {
                "newIsCap": false,
                "capIsNew": true,
            }],
            "no-constant-condition": "off",
            "no-multi-assign": "warn",
            "object-shorthand": "warn",
            "one-var": ["warn", "never"],
            "prefer-arrow-callback": "warn",
            "prefer-destructuring": ["warn", {
                "VariableDeclarator": {
                    "array": false,
                    "object": true,
                },
                "AssignmentExpression": {
                    "array": false,
                    "object": false,
                },
            }],
            "radix": "warn",

            "@stylistic/array-bracket-newline": ["warn", "consistent"],
            "@stylistic/array-bracket-spacing": "warn",
            "@stylistic/arrow-parens": "warn",
            "@stylistic/arrow-spacing": "warn",
            "@stylistic/brace-style": "warn",
            "@stylistic/comma-dangle": ["warn", {
                "arrays": "always-multiline",
                "objects": "always-multiline",
                "imports": "always-multiline",
                "exports": "always-multiline",
                "functions": "always-multiline",
            }],
            "@stylistic/comma-spacing": "warn",
            "@stylistic/comma-style": "warn",
            "@stylistic/eol-last": "warn",
            "@stylistic/function-call-spacing": "warn",
            "@stylistic/function-paren-newline": ["warn", "consistent"],
            "@stylistic/implicit-arrow-linebreak": "warn",
            "@stylistic/indent": ["warn", 4],
            "@stylistic/key-spacing": ["warn", {
                "beforeColon": false,
                "afterColon": true,
            }],
            "@stylistic/keyword-spacing": ["warn", {
                "before": true,
                "after": true,
            }],
            "@stylistic/lines-between-class-members": ["warn", "always", { "exceptAfterSingleLine": true }],
            "@stylistic/member-delimiter-style": ["warn", {
                "multiline": { "delimiter": "semi" },
                "singleline": { "delimiter": "comma", "requireLast": false },
            }],
            "@stylistic/no-extra-semi": "warn",
            "@stylistic/no-multi-spaces": "warn",
            "@stylistic/no-multiple-empty-lines": "warn",
            "@stylistic/no-trailing-spaces": ["warn", { "skipBlankLines": true }],
            "@stylistic/no-whitespace-before-property": "warn",
            "@stylistic/object-curly-newline": ["warn", { "consistent": true }],
            "@stylistic/object-curly-spacing": ["warn", "always"],
            "@stylistic/operator-linebreak": ["warn", "before"],
            "@stylistic/quote-props": ["warn", "consistent-as-needed"],
            "@stylistic/quotes": ["warn", "double"],
            "@stylistic/semi": ["warn", "always"],
            "@stylistic/space-before-blocks": "warn",
            "@stylistic/space-before-function-paren": ["warn", { "anonymous": "never", "named": "never", "asyncArrow": "always" }],
            "@stylistic/space-in-parens": "warn",
            "@stylistic/space-infix-ops": "warn",
            "@stylistic/spaced-comment": "warn",
            "@stylistic/type-annotation-spacing": "warn",

            "@typescript-eslint/no-empty-object-type": "off",
            "@typescript-eslint/no-wrapper-object-types": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-inferrable-types": "off",
            "@typescript-eslint/no-unused-vars": ["warn", {
                "vars": "all",
                "args": "none",
            }],
            
            "@typescript-eslint/no-unsafe-function-type": "warn",
            "@typescript-eslint/no-unsafe-argument": "warn",
            "@typescript-eslint/no-unsafe-assignment": "warn",
            "@typescript-eslint/no-unsafe-call": "warn",
            "@typescript-eslint/no-unsafe-member-access": "warn",
            "@typescript-eslint/no-unsafe-return": "warn",
            "@typescript-eslint/no-shadow": "warn",
            "@typescript-eslint/unbound-method": "warn",
            "@typescript-eslint/no-unnecessary-type-assertion": "warn",
            "@typescript-eslint/consistent-type-definitions": ["warn", "interface"],
            "@typescript-eslint/array-type": "warn",
            "@typescript-eslint/no-floating-promises": "error",
        },
    },
);
