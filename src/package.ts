
import "./moduleParser.js";

import * as fs from "fs";
import * as pathUtils from "path";
import { symbols } from "./symbol.js";
import { PetString, PetMap } from "./value.js";
import { ModuleParser } from "./moduleParser.js";

// Stored in petroleumPackage.json.
interface PackageConfig {
    specifier: string;
    version: string;
    mainModule: string;
    dependencies: {
        specifier: string,
        version: string,
    }[];
}

class PetPackage {
    dirPath: string;
    config: PackageConfig;
    
    // `dirPath` must be an absolute path.
    constructor(dirPath: string) {
        this.dirPath = dirPath;
        const configPath = pathUtils.join(this.dirPath, "petroleumPackage.json");
        this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }
    
    toMap(globalScope: PetMap): PetMap {
        const mainModulePath = pathUtils.normalize(
            pathUtils.join(this.dirPath, this.config.mainModule),
        );
        const packageAsMap = new PetMap([
            [symbols.SPECIFIER, new PetString(this.config.specifier)],
            [symbols.VER, new PetString(this.config.version)],
            // TODO: Put the actual map of dependencies here.
            [symbols.DEPS, new PetMap()],
            [symbols.DIR_PATH, new PetString(this.dirPath)],
        ]);
        const moduleParser = new ModuleParser(packageAsMap, mainModulePath, globalScope);
        const mainModule = moduleParser.parseModule();
        packageAsMap.setMember(symbols.MAIN_MODULE, mainModule);
        return packageAsMap;
    }
}

// Returns the map representation of the entry package.
export const resolvePackages = (entryPackagePath: string, globalScope: PetMap): PetMap => {
    const entryPackage = new PetPackage(pathUtils.resolve(entryPackagePath));
    // TODO: Resolve dependency packages.
    
    return entryPackage.toMap(globalScope);
};


