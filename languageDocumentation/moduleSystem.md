
## Module System

Every Petroleum code file is a "module". A module can import any variable defined in the top-level statement sequence of another module. Petroleum exposes "built-in modules" which are not Petroleum code files. Built-in modules enable special operations such as file manipulation. See the section on built-in modules for details.

A "package" is a directory containing a `petroleumPackage.json` file at the top level. Every Petroleum code file must be inside a package. Every package is identified by a "package specifier", which is a string with the format `"$developerName.$packageName"`. `$developerName` must be universally unique. Both `$developerName` and `$packageName` may only contain the following characters:

* Uppercase and lowercase letters
* Decimal digits
* Underscore and hyphen

The `petroleumPackage.json` file has this schema:

```
interface PetroleumPackageFile {
    specifier: string;
    version: string;
    mainModule: string;
    dependencies: {
        specifier: string,
        version: string,
    }[];
}
```

* `specifier` is the specifier of the package.
* `version` is the semantic version number of the package.
* `mainModule` is the path of the entry point module relative to the package directory. When a dependent imports the package, the dependent accesses the main module. When the package is run as an application, the main module runs first.
* `dependencies` defines all dependency packages and their compatible version numbers.
    * `specifier` is the specifier of the dependency.
    * `version` is a semantic version number with one of the following prefixes:
        * `^$major.$minor.$patch` matches major versions equal to `$major` and minor versions greater than or equal to `$minor`.
        * `~$major.$minor.$patch` matches major versions equal to `$major`, minor versions equal to `$minor`, and patch versions greater than or equal to `$patch`.
        * `=$major.$minor.$patch` matches identical version numbers.
    * In the future this dictionary may specify the repository from which to download the dependency, but this mechanism has not yet been defined.

Dependency packages must be installed in the "package store", which is the directory named `petroleumPackages` in the home directory of the user. Each version of package with the specifier `"$developerName.$packageName"` has the path `~/petroleumPackages/$developerName/$packageName/v$version`, where `$version` is the version number of the package.

## Module Attributes

A block attributes statement in the top-level statement sequence of a module contains "module attributes". For the time being, Petroleum only recognizes one module attribute:

```
INIT {$body}
```

Petroleum evaluates `$body` before invoking the `#PREP` method of any other workers in the module. `$body` will be evaluated in such a way that the module scope is not visible, but the scope containing built-in constants is still visible. The `INIT` attribute provides the user an opportunity to replace the parent scope of the module scope, thereby concealing built-in constants from the module.

The example below demonstrates usage of the `INIT` module attribute:

```
[INIT {
    COMMENT "This code is guaranteed to run before the initialization of `myVar2`."
    COMMENT "Note that `myVar2` is not visible in this scope because of the special"
    COMMENT "scoping rules of the `INIT` module attribute."
    WORK_VAR @myVar1 = (10)
    PRINT(myVar1)
}]
PREP_VAR @myVar2 = (20)
```


