
import "./moduleParser.js";

import * as fs from "fs";
import * as os from "os";
import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { PetString, PetMap } from "./value.js";
import { ModuleParser } from "./moduleParser.js";

const packageStorePath = pathUtils.join(pathUtils.resolve(os.homedir()), "petroleumPackages");

interface DependencyConfig {
    specifier: string;
    version: string;
}

// Stored in petroleumPackage.json.
interface PackageConfig {
    specifier: string;
    version: string;
    mainModule: string;
    dependencies: DependencyConfig[];
}

interface SpecifierParts {
    developerName: string;
    packageName: string;
}

const splitSpecifier = (specifier: string): SpecifierParts => {
    const parts = specifier.split(".");
    if (parts.length !== 2) {
        throw new Error(`Package specifier must have the format "$developerName.$packageName"; received "${specifier}"`);
    }
    return { developerName: parts[0], packageName: parts[1] };
};

const getSpecifierPath = (specifier: string): string => {
    const parts = splitSpecifier(specifier);
    return pathUtils.join(packageStorePath, parts.developerName, parts.packageName);
};

const getPackagePath = (specifier: string, version: Version): string => {
    const specifierPath = getSpecifierPath(specifier);
    return pathUtils.join(specifierPath, "v" + version.toString());
};

class Version {
    major: number;
    minor: number;
    patch: number;
    key: string;
    
    constructor(inputValue: string | number[]) {
        let parts: number[];
        if (typeof inputValue === "string") {
            parts = inputValue.split(".").map((term) => parseInt(term, 10));
        } else {
            parts = inputValue;
        }
        this.major = parts[0];
        this.minor = parts[1];
        this.patch = parts[2];
        this.key = `${this.major}.${this.minor}.${this.patch}`;
    }
    
    // Returns -1 if this < other, 0 if this == other, and 1 if this > other.
    compare(other: Version): number {
        if (this.major > other.major) {
            return 1;
        } else if (this.major < other.major) {
            return -1
        } else if (this.minor > other.minor) {
            return 1;
        } else if (this.minor < other.minor) {
            return -1
        } else if (this.patch > other.patch) {
            return 1;
        } else if (this.patch < other.patch) {
            return -1
        } else {
            return 0;
        }
    }
    
    equals(other: Version): boolean {
        return (this.compare(other) === 0);
    }
    
    toString(): string {
        return this.key;
    }
}

class VersionRange {
    minVersion: Version; // Inclusive.
    maxVersion: Version; // Exclusive.
    
    constructor(text: string) {
        const prefix = text.charAt(0);
        this.minVersion = new Version(text.substring(1));
        const parts = [this.minVersion.major, this.minVersion.minor, this.minVersion.patch];
        if (prefix === "^") {
            parts[0] += 1;
        } else if (prefix === "~") {
            parts[1] += 1;
        } else if (prefix === "=") {
            parts[2] += 1;
        } else {
            throw new Error(`Received package dependency version ${text}, but prefix must be "^", "~", or "=".`);
        }
        this.maxVersion = new Version(parts);
    }
    
    contains(version: Version): boolean {
        return (version.compare(this.minVersion) >= 0
            && version.compare(this.maxVersion) < 0);
    }
}

class Dependency {
    specifier: string;
    versionRange: VersionRange;
    
    constructor(config: DependencyConfig) {
        this.specifier = config.specifier;
        this.versionRange = new VersionRange(config.version);
    }
}

class PetPackage {
    dirPath: string;
    config: PackageConfig;
    specifier: string;
    version: Version;
    dependencies: Dependency[];
    key: string;
    
    // `dirPath` must be an absolute path.
    constructor(dirPath: string) {
        this.dirPath = dirPath;
        const configPath = pathUtils.join(this.dirPath, "petroleumPackage.json");
        this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        this.specifier = this.config.specifier;
        this.version = new Version(this.config.version);
        this.dependencies = this.config.dependencies.map(
            (depConfig) => new Dependency(depConfig),
        );
        this.key = this.specifier + "," + this.version.key;
    }
}

class VersionEntry<T> {
    version: Version;
    value: T;
    
    constructor(version: Version, value: T) {
        this.version = version;
        this.value = value;
    }
}

// `constructor` and look-up are efficient.
// `add` and `remove` are inefficient, so be careful.
class VersionMap<T> {
    // Sorted from oldest to newest.
    entries: VersionEntry<T>[];
    
    // `entries` will be sorted in-place.
    constructor(entries: VersionEntry<T>[] = []) {
        this.entries = entries;
        this.sortEntries();
    }
    
    sortEntries(): void {
        this.entries.sort((entry1, entry2) => entry1.version.compare(entry2.version));
    }
    
    getLength(): number {
        return this.entries.length;
    }
    
    getValues(): T[] {
        return this.entries.map((entry) => entry.value);
    }
    
    findSmallestAtLeast(version: Version): number {
        // Both minIndex and maxIndex are inclusive.
        let minIndex = 0;
        let maxIndex = this.entries.length;
        while (maxIndex > minIndex) {
            const middleIndex = Math.floor((minIndex + maxIndex) / 2);
            const middleVersion = this.entries[middleIndex].version;
            const comparison = middleVersion.compare(version);
            if (comparison > 0) {
                maxIndex = middleIndex;
            } else if (comparison < 0) {
                minIndex = middleIndex + 1;
            } else {
                return middleIndex
            }
        }
        return minIndex;
    }
    
    findEqual(version: Version): number {
        const index = this.findSmallestAtLeast(version);
        const entryVersion = this.entries[index]?.version
        if (typeof entryVersion !== "undefined" && entryVersion.equals(version)) {
            return index;
        } else {
            return -1;
        }
    }
    
    findBiggestUnder(version: Version): number {
        return this.findSmallestAtLeast(version) - 1;
    }
    
    add(version: Version, value: T): void {
        const entry = new VersionEntry(version, value);
        this.entries.push(entry);
        this.sortEntries();
    }
    
    remove(version: Version): void {
        const index = this.findEqual(version);
        if (index >= 0) {
            this.entries.splice(index, 1);
        }
    }
}

class SelectionDependency {
    specifier: string;
    versionRange: VersionRange;
    parentSel: PackageSelection;
    compatibleSels: VersionMap<PackageSelection>;
    
    constructor(dependency: Dependency, parentSel: PackageSelection) {
        this.specifier = dependency.specifier;
        this.versionRange = dependency.versionRange;
        this.parentSel = parentSel;
        this.compatibleSels = new VersionMap();
    }
    
    isCompatibleWith(version: Version): boolean {
        return this.versionRange.contains(version);
    }
    
    addIfCompatible(selection: PackageSelection): void {
        const { version } = selection.pack;
        const { key } = this.parentSel.pack;
        if (!this.isCompatibleWith(version) || selection.dependents.has(key)) {
            return;
        }
        this.compatibleSels.add(version, selection);
        selection.dependents.set(key, this.parentSel);
    }
}

class PackageSelection {
    pack: PetPackage;
    resolver: PackageResolver;
    // Map from specifier to SelectionDependency.
    dependencies: Map<string, SelectionDependency>;
    // Map from package key to PackageSelection.
    dependents: Map<string, PackageSelection>;
    isMarked: boolean;
    
    constructor(pack: PetPackage, resolver: PackageResolver) {
        this.pack = pack;
        this.resolver = resolver;
        this.dependencies = new Map();
        for (const dependency of pack.dependencies) {
            const selectionDep = new SelectionDependency(dependency, this);
            this.dependencies.set(selectionDep.specifier, selectionDep);
        }
        this.dependents = new Map();
    }
    
    getUnsatisfiedDep(): SelectionDependency | null {
        for (const dependency of this.dependencies.values()) {
            if (dependency.compatibleSels.getLength() <= 0) {
                return dependency;
            }
        }
        return null
    }
    
    isSatisfied(): boolean {
        return (this.getUnsatisfiedDep() === null);
    }
    
    toMap(): PetMap {
        const { dirPath } = this.pack;
        const mainModulePath = pathUtils.normalize(
            pathUtils.join(dirPath, this.pack.config.mainModule),
        );
        const packageAsMap = new PetMap([
            [symbols.SPECIFIER, new PetString(this.pack.specifier)],
            [symbols.VER, new PetString(this.pack.version.toString())],
            // TODO: Put the actual map of dependencies here.
            [symbols.DEPS, new PetMap()],
            [symbols.DIR_PATH, new PetString(dirPath)],
        ]);
        const { globalScope } = this.resolver;
        const moduleParser = new ModuleParser(packageAsMap, mainModulePath, globalScope);
        const mainModule = moduleParser.parseModule();
        packageAsMap.setMember(symbols.MAIN_MODULE, mainModule);
        return packageAsMap;
    }
}

export class PackageResolver {
    entryPackage: PetPackage;
    globalScope: PetMap;
    // Map from specifier to VersionMap. A null value in the VersionMap
    // indicates that the version exists in the package store, but
    // has not been read yet.
    packageStoreCache: Map<string, VersionMap<PetPackage | null>>;
    // Map from specifier to VersionMap.
    selections: Map<string, VersionMap<PackageSelection>>;
    // Map from specifier to Set.
    dependencies: Map<string, Set<SelectionDependency>>;
    unsatisfiedSelections: Set<PackageSelection>;
    entrySelection: PackageSelection;
    // Set of sorted keys of all selected packages concatenated together.
    previousStates: Set<string>;
    
    constructor(entryPackagePath: string, globalScope: PetMap) {
        this.entryPackage = new PetPackage(pathUtils.resolve(entryPackagePath));
        this.globalScope = globalScope;
        this.packageStoreCache = new Map();
    }
    
    getStoreVersions(specifier: string): VersionMap<PetPackage | null> {
        let versionMap = this.packageStoreCache.get(specifier);
        if (typeof versionMap !== "undefined") {
            return versionMap;
        }
        versionMap = new VersionMap();
        this.packageStoreCache.set(specifier, versionMap);
        const specifierPath = getSpecifierPath(specifier);
        if (!fs.existsSync(specifierPath)) {
            return versionMap;
        }
        const dirNames = fs.readdirSync(specifierPath);
        for (const dirName of dirNames) {
            if (dirName.startsWith("v")) {
                const version = new Version(dirName.substring(1));
                versionMap.add(version, null);
            }
        }
        return versionMap;
    }
    
    addSelection(pack: PetPackage): PackageSelection {
        const selection = new PackageSelection(pack, this);
        
        // Add `selection` to this.selections.
        let versionMap = this.selections.get(pack.specifier);
        if (typeof versionMap === "undefined") {
            versionMap = new VersionMap<PackageSelection>();
            this.selections.set(pack.specifier, versionMap);
        }
        versionMap.add(pack.version, selection);
        
        // Add dependencies of `selection` to this.dependencies.
        for (const dependency of selection.dependencies.values()) {
            let dependencySet = this.dependencies.get(dependency.specifier);
            if (typeof dependencySet === "undefined") {
                dependencySet = new Set<SelectionDependency>();
                this.dependencies.set(dependency.specifier, dependencySet);
            }
            dependencySet.add(dependency);
        }
        
        // Add `selection` to dependencies of other selections.
        const dependencySet = this.dependencies.get(pack.specifier);
        if (typeof dependencySet !== "undefined") {
            for (const dependency of dependencySet) {
                dependency.addIfCompatible(selection);
            }
        }
        
        // Add other selections to dependencies of `selection`.
        for (const dependency of selection.dependencies.values()) {
            const versionMap = this.selections.get(dependency.specifier);
            if (typeof versionMap !== "undefined") {
                for (const depSelection of versionMap.getValues()) {
                    dependency.addIfCompatible(depSelection);
                }
            }
        }
        
        // Add `selection` to this.unsatisfiedSelections if necessary.
        if (!selection.isSatisfied()) {
            this.unsatisfiedSelections.add(selection);
        }
        
        return selection;
    }
    
    getStorePackage(
        versionMap: VersionMap<PetPackage | null>,
        dependency: SelectionDependency,
    ): PetPackage | null {
        const index = versionMap.findBiggestUnder(dependency.versionRange.maxVersion);
        const entry = versionMap.entries[index];
        if (!dependency.isCompatibleWith(entry.version)) {
            return null;
        }
        if (entry.value === null) {
            const packagePath = getPackagePath(dependency.specifier, entry.version);
            entry.value = new PetPackage(packagePath);
        }
        return entry.value;
    }
    
    // Returns the map representation of the entry package.
    resolvePackages(): PetMap {
        this.selections = new Map();
        this.dependencies = new Map();
        this.unsatisfiedSelections = new Set();
        this.entrySelection = this.addSelection(this.entryPackage);
        while (true) {
            const selection = this.unsatisfiedSelections.values().next().value;
            if (typeof selection === "undefined") {
                break;
            }
            const dependency = selection.getUnsatisfiedDep();
            if (dependency === null) {
                throw new Error("Unsatisfied package must have unsatisfied dependency!");
            }
            const versionMap = this.getStoreVersions(dependency.specifier);
            const pack = this.getStorePackage(versionMap, dependency);
            if (pack === null) {
                throw new Error(`Could not find ${dependency.specifier} package in store which satisfies dependency of ${selection.pack.specifier}!`);
            }
            // TODO: Finish implementation.
            
            break;
        }
        return this.entrySelection.toMap();
    }
}


